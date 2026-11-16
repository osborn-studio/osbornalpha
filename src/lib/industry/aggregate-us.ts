// US fiscal bucket picks (§19.4). Run and offline replay share these picks and CN's decimal/finalize
// implementation. Only included facts are needed for replay; exclusions are frozen in manifest roles.
import type {FactRow} from '../facts/types';
import {finalizeCell} from './aggregate';
import type {AggregateCellResult,IssuerFacts,PoolFact} from './aggregate';
import {decSub} from './decimal';
import type {CellSpec} from './method';
import {cellSpecsUs,isFinancialCodeUs} from './method-us';
import type {ManifestCell,ManifestRole,RoleReason} from './types';
export interface AggregateCellInputUs{code:string;period_end:string;members:readonly string[];issuers:ReadonlyMap<string,IssuerFacts>}
type PickUs<F>={ok:true;facts:F[];values:string[]}|{ok:false;reason:RoleReason};
export function pickInputsUs<F extends PoolFact>(spec:CellSpec,id:string,facts:readonly F[]):PickUs<F>{
 const year=Number(spec.period_end.slice(0,4));
 const pick=(concept:string,y:number):PickUs<F>=>{
  const candidates=facts.filter(f=>f.issuer_id===id&&f.concept===concept&&f.duration==='12M'&&f.period_end>=`${y}-01-01`&&f.period_end<=`${y}-12-31`);
  const usd=candidates.filter(f=>f.unit==='USD');
  if(usd.length>1)return {ok:false,reason:'ambiguous_period'};
  if(!usd.length)return {ok:false,reason:candidates.length?'unit_excluded':'missing_concept'};
  return {ok:true,facts:usd,values:[usd[0].value]};
 };
 if(spec.metric==='member_count')return {ok:true,facts:[],values:[]};
 const concept=spec.metric==='gross_margin'?'gross_profit':spec.metric==='net_margin'||spec.metric==='net_income_parent_sum'||spec.metric==='net_income_yoy'?'net_income_parent':'revenue';
 const current=pick(concept,year);if(!current.ok)return current;
 if(spec.metric==='gross_margin'||spec.metric==='net_margin'){
  const revenue=pick('revenue',year);if(!revenue.ok)return revenue;
  const a=current.facts[0],b=revenue.facts[0];
  if(a.period_start!==b.period_start||a.period_end!==b.period_end)return {ok:false,reason:'period_mismatch'};
  return {ok:true,facts:[a,b],values:[a.value,b.value]};
 }
 if(spec.metric==='revenue_yoy'||spec.metric==='net_income_yoy'){
  const prior=pick(concept,year-1);if(!prior.ok)return {ok:false,reason:'not_in_comparable_set'};
  return {ok:true,facts:[...current.facts,...prior.facts],values:[...current.values,...prior.values]};
 }
 return current;
}
/** CN gross-margin finalize takes revenue/cost; transform the US numerator/revenue tuple exactly. */
export function finalizeCellUs(spec:CellSpec,nMembers:number,financial:boolean,included:readonly string[][]):ManifestCell{
 return finalizeCell(spec,nMembers,0,financial,spec.metric==='gross_margin'?included.map(([profit,revenue])=>[revenue,decSub(revenue,profit)]):included);
}
export function computeAggregateCellUs(input:AggregateCellInputUs):AggregateCellResult{
 const members=[...new Set(input.members)].sort(),roles:ManifestRole[]=[],cells:ManifestCell[]=[],used=new Map<string,FactRow>(),warnings:string[]=[];
 const envelopes=members.map(id=>{const e=input.issuers.get(id);if(!e||e.issuer_id!==id)throw new Error(`missing_envelope:${id}`);return e;});
 const pool=new Map(envelopes.map(e=>[e.issuer_id,e.rows.filter(f=>f.is_current===true&&f.status==='ok'&&f.consolidation==='consolidated'&&f.duration==='12M')]));
 const financial=isFinancialCodeUs(input.code);
 for(const spec of cellSpecsUs(input.period_end)){
  const included:string[][]=[];
  for(const e of envelopes){
   let reason:RoleReason|undefined;
   if(spec.metric!=='member_count'){
    if(financial&&spec.metric==='gross_margin')reason='financial_excluded';
    else if(e.truncated)reason='read_truncated';
    else{const p=pickInputsUs(spec,e.issuer_id,pool.get(e.issuer_id)!);if(!p.ok)reason=p.reason;else{included.push(p.values);for(const f of p.facts)used.set(f.fact_id,f);}}
   }
   roles.push(reason?{issuer_id:e.issuer_id,metric:spec.metric,duration:spec.duration,role:'excluded',reason}:{issuer_id:e.issuer_id,metric:spec.metric,duration:spec.duration,role:'included'});
  }
  cells.push(finalizeCellUs(spec,members.length,financial,included));
 }
 for(const e of envelopes)if(e.truncated)warnings.push(`read_truncated:${e.issuer_id}`);
 return {cells,roles,facts:[...used.values()],derived:[],warnings};
}
