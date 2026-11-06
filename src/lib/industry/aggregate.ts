// src/lib/industry/aggregate.ts
// One (code, period_end) group of industry cells, pure (spec §5.1–§5.2). Input: the group's members
// (issuer ids, point-in-time at period_end known by facts_as_of), the unresolved count, the financial
// flag, and per member ONE IssuerFacts = the issuer's single readFacts envelope of this run plus
// deriveMetrics(envelope.rows, {market:'CN', asOf: facts_as_of, basedOnRev: envelope.stateRev}) (V5/V6).
// Output: every cell of cellSpecs(period_end) (ok or missing + reason), one role per member per cell
// (included / excluded + reason), and the facts and derived rows actually used (the manifest's inputs).
// Rules ("missing stays missing"; never 0, never a proxy):
//  - inputs match exactly (period_start, period_end, duration, unit 'CNY', consolidated, current
//    disclosure); a non-unique match counts as absent; another unit → excluded:unit_excluded;
//  - a truncated envelope excludes the issuer from every value cell (read_truncated), never partially;
//  - 3M values are plan-2 q_single_* rows; when the YTD pair exists but derive produced no quarter the
//    reason is version_inconsistent (derive refuses incompatible disclosure versions), else missing_concept;
//  - yoy uses the comparable set: members with both the current and the prior-year value; a member
//    with only the current value is excluded:not_in_comparable_set;
//  - gross_margin of a financial industry is missing:financial_excluded (all members excluded);
//  - status precedence: no members → missing (unresolved_over_limit when every constituent is
//    unresolved, else no_members) → member_count ok → financial_excluded → empty_set → arithmetic
//    (zero or, for roe, non-positive denominator → zero_denominator).
// pickInputs / finalizeCell are shared with replay.ts so a manifest replays through the same code.
import type {FactRow,MetricRow} from '../facts/types';
import {addDays} from '../facts/derive';
import {canonicalDecimal} from '../facts/json-numbers';
import {decAbs,decAdd,decCmp,decDiv,decMul,decSub,decSum} from './decimal';
import {AGG_CURRENCY,cellSpecs,shiftYears} from './method';
import type {CellSpec} from './method';
import type {AggMetric,ManifestCell,ManifestRole,MissingReason,RoleReason} from './types';

export interface IssuerFacts{issuer_id:string;stateRev:number;truncated:boolean;rows:FactRow[];derived:MetricRow[]}
export interface AggregateCellInput{code:string;period_end:string;financial:boolean;members:readonly string[];nUnresolved:number;issuers:ReadonlyMap<string,IssuerFacts>}
export interface AggregateCellResult{cells:ManifestCell[];roles:ManifestRole[];facts:FactRow[];derived:MetricRow[];warnings:string[]}

// ---- input pool shared with replay ----
export interface PoolFact{issuer_id:string;concept:string;period_start:string|null;period_end:string;duration:string;unit:string;value:string}
export interface PoolDerived{issuer_id:string;metric:string;period_start:string;period_end:string;duration:string;unit:string;value:string}
interface Req{kind:'fact'|'derived';name:string;duration:string;ps:string|null;pe:string;prior:boolean}
const k=(kind:string,issuer:string,name:string,duration:string,ps:string|null,pe:string,unit:string|null)=>[kind,issuer,name,duration,ps??'',pe,unit??'*'].join('\u0000');
/** Index of facts and derived rows by exact (issuer, name, duration, period, unit) and by the same key without unit. */
export class InputIndex<F extends PoolFact,D extends PoolDerived>{
 private exact=new Map<string,(F|D)[]>();private anyUnit=new Map<string,(F|D)[]>();
 constructor(facts:readonly F[],derived:readonly D[]){
  const put=(m:Map<string,(F|D)[]>,key:string,x:F|D)=>{const l=m.get(key);if(l)l.push(x);else m.set(key,[x]);};
  for(const f of facts){put(this.exact,k('fact',f.issuer_id,f.concept,f.duration,f.period_start,f.period_end,f.unit),f);put(this.anyUnit,k('fact',f.issuer_id,f.concept,f.duration,f.period_start,f.period_end,null),f);}
  for(const d of derived){put(this.exact,k('derived',d.issuer_id,d.metric,d.duration,d.period_start,d.period_end,d.unit),d);put(this.anyUnit,k('derived',d.issuer_id,d.metric,d.duration,d.period_start,d.period_end,null),d);}
 }
 get(r:Req,issuer:string,unit:string|null):(F|D)[]{return (unit===null?this.anyUnit:this.exact).get(k(r.kind,issuer,r.name,r.duration,r.ps,r.pe,unit))??[];}
}
const CONCEPT:Partial<Record<AggMetric,string>>={revenue_sum:'revenue',net_income_parent_sum:'net_income_parent',revenue_yoy:'revenue',net_income_yoy:'net_income_parent'};
/** The exact inputs one issuer must have for one cell (empty for member_count). */
function requirements(spec:CellSpec):Req[]{
 const {metric,duration,period_start:ps,period_end:pe}=spec;
 const c=CONCEPT[metric];
 const fact=(name:string,dur:string,s:string|null,e:string,prior=false):Req=>({kind:'fact',name,duration:dur,ps:s,pe:e,prior});
 const der=(name:string,dur:string,s:string,e:string,prior=false):Req=>({kind:'derived',name,duration:dur,ps:s,pe:e,prior});
 switch(metric){
  case 'revenue_sum':case 'net_income_parent_sum':return duration==='12M'?[fact(c!,'12M',ps,pe)]:[der(`q_single_${c}`,'3M',ps,pe)];
  case 'gross_margin':return [fact('revenue_operating','12M',ps,pe),fact('cost_of_revenue','12M',ps,pe)];
  case 'roe':return [der('ttm_net_income_parent','TTM',ps,pe),fact('equity_parent','INSTANT',null,addDays(ps,-1)),fact('equity_parent','INSTANT',null,pe)];
  case 'revenue_yoy':case 'net_income_yoy':{
   const py=(d:string)=>shiftYears(d,-1);
   return duration==='12M'?[fact(c!,'12M',ps,pe),fact(c!,'12M',py(ps),py(pe),true)]:[der(`q_single_${c}`,'3M',ps,pe),der(`q_single_${c}`,'3M',py(ps),py(pe),true)];
  }
  case 'member_count':return [];
 }
}
export type Picked<F,D>={ok:true;values:string[];facts:F[];derived:D[]}|{ok:false;failed:Req};
/** The issuer's unique CNY inputs for the cell, or the first requirement that is absent or ambiguous. */
export function pickInputs<F extends PoolFact,D extends PoolDerived>(spec:CellSpec,issuer:string,idx:InputIndex<F,D>):Picked<F,D>{
 const values:string[]=[];const facts:F[]=[];const derived:D[]=[];
 for(const r of requirements(spec)){
  const hits=idx.get(r,issuer,AGG_CURRENCY);
  if(hits.length!==1)return {ok:false,failed:r};
  values.push(hits[0].value);
  if(r.kind==='fact')facts.push(hits[0] as F);else derived.push(hits[0] as D);
 }
 return {ok:true,values,facts,derived};
}
/** Combines the included issuers' input tuples (pickInputs order) into a value or a missing reason. */
function combine(metric:AggMetric,inc:readonly string[][]):{value:string}|{missing:MissingReason}{
 const col=(i:number)=>inc.map(v=>v[i]);
 switch(metric){
  case 'revenue_sum':case 'net_income_parent_sum':return {value:decSum(col(0))};
  case 'gross_margin':{const ro=decSum(col(0)),cor=decSum(col(1));const v=decDiv(decSub(ro,cor),ro);return v===null?{missing:'zero_denominator'}:{value:v};}
  case 'roe':{
   // Σ ttm / Σ avg(e0,e1) = 2·Σ ttm / Σ (e0+e1); a non-positive denominator is not meaningful
   const den=decSum(inc.map(v=>decAdd(v[1],v[2])));
   if(decCmp(den,'0')<=0)return {missing:'zero_denominator'};
   return {value:decDiv(decMul('2',decSum(col(0))),den)!};
  }
  case 'revenue_yoy':case 'net_income_yoy':{const cur=decSum(col(0)),prior=decSum(col(1));const v=decDiv(decSub(cur,prior),decAbs(prior));return v===null?{missing:'zero_denominator'}:{value:v};}
  case 'member_count':throw new Error('combine_member_count');
 }
}
/**
 * The cell from structural counts and the included inputs (shared by aggregate and replay).
 * included = input tuples of included issuers; financial = gross_margin of a financial industry.
 */
export function finalizeCell(spec:CellSpec,nMembers:number,nUnresolved:number,financial:boolean,included:readonly string[][]):ManifestCell{
 const base={metric:spec.metric,duration:spec.duration,period_start:spec.period_start,n_members:nMembers,n_unresolved:nUnresolved,unit:spec.unit};
 const missing=(reason:MissingReason,nWith=0):ManifestCell=>({...base,status:'missing',missing_reason:reason,n_with_data:nWith});
 if(nMembers===0)return missing(nUnresolved>0?'unresolved_over_limit':'no_members');
 if(spec.metric==='member_count')return {...base,status:'ok',value_text:String(nMembers),n_with_data:nMembers};
 if(financial&&spec.metric==='gross_margin')return missing('financial_excluded');
 if(included.length===0)return missing('empty_set');
 const r=combine(spec.metric,included);
 return 'missing' in r?missing(r.missing,included.length):{...base,status:'ok',value_text:canonicalDecimal(r.value),n_with_data:included.length};
}

// ---- aggregate (run side) ----
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const STEP:Record<string,string>={'6M':'3M','9M':'6M','12M':'9M'};
const YTD_BY_MONTH:Record<string,string>={'03':'3M','06':'6M','09':'9M','12':'12M'};
interface Indexed{idx:InputIndex<PoolFact&{row:FactRow},PoolDerived&{row:MetricRow}>;byId:Map<string,FactRow>}
const cache=new WeakMap<IssuerFacts,Indexed>();
function indexOf(f:IssuerFacts):Indexed{
 let x=cache.get(f);if(x)return x;
 // current ok consolidated disclosures only (one per natural key under readFacts history=true)
 const cur=f.rows.filter(r=>r.is_current===true&&r.status==='ok'&&r.consolidation==='consolidated');
 const facts=cur.map(r=>({issuer_id:r.issuer_id,concept:r.concept,period_start:r.period_start,period_end:r.period_end,duration:r.duration,unit:r.unit,value:r.value,row:r}));
 const derived=f.derived.map(m=>({issuer_id:m.issuer_id,metric:m.metric,period_start:m.period_start,period_end:m.period_end,duration:m.duration,unit:m.unit,value:m.value,row:m}));
 x={idx:new InputIndex(facts,derived),byId:new Map(f.rows.map(r=>[r.fact_id,r]))};
 cache.set(f,x);return x;
}
/** Why an issuer has no value for the cell (run side only; replay reads roles from the manifest). */
function reasonOf(failed:Req,issuer:string,ix:Indexed):RoleReason{
 if(failed.prior)return 'not_in_comparable_set';
 if(ix.idx.get(failed,issuer,null).length>0&&ix.idx.get(failed,issuer,AGG_CURRENCY).length===0)return 'unit_excluded';
 if(failed.kind==='derived'&&failed.name.startsWith('q_single_')){
  // the YTD pair derive would difference: a = YTD ending pe, b = the previous YTD step
  const concept=failed.name.slice('q_single_'.length),pe=failed.pe,ys=`${pe.slice(0,4)}-01-01`;
  const aDur=YTD_BY_MONTH[pe.slice(5,7)],bDur=STEP[aDur];
  if(bDur){
   const one=(dur:string,end:string)=>ix.idx.get({kind:'fact',name:concept,duration:dur,ps:ys,pe:end,prior:false},issuer,AGG_CURRENCY).length===1;
   if(one(aDur,pe)&&one(bDur,addDays(failed.ps!,-1)))return 'version_inconsistent';
  }
 }
 return 'missing_concept';
}
export function computeAggregateCell(input:AggregateCellInput):AggregateCellResult{
 const members=[...new Set(input.members)].sort(cmp);
 const warnings:string[]=[];
 const usedFacts=new Map<string,FactRow>();const usedDerived=new Map<string,MetricRow>();
 const roles:ManifestRole[]=[];const cells:ManifestCell[]=[];
 const facts=(id:string)=>{const f=input.issuers.get(id);if(!f)throw new Error(`missing_envelope:${id}`);if(f.issuer_id!==id)throw new Error(`envelope_issuer_mismatch:${id}`);return f;};
 for(const spec of cellSpecs(input.period_end)){
  const included:string[][]=[];
  const role=(issuer_id:string,r:RoleReason|null)=>roles.push(r===null?{issuer_id,metric:spec.metric,duration:spec.duration,role:'included'}:{issuer_id,metric:spec.metric,duration:spec.duration,role:'excluded',reason:r});
  for(const id of members){
   if(spec.metric==='member_count'){role(id,null);continue;}
   if(spec.metric==='gross_margin'&&input.financial){role(id,'financial_excluded');continue;}
   const f=facts(id);
   if(f.truncated){role(id,'read_truncated');continue;}
   const ix=indexOf(f);
   const p=pickInputs(spec,id,ix.idx);
   if(!p.ok){role(id,reasonOf(p.failed,id,ix));continue;}
   role(id,null);included.push(p.values);
   for(const x of p.facts)usedFacts.set(x.row.fact_id,x.row);
   for(const d of p.derived){
    usedDerived.set([d.issuer_id,d.metric,d.period_start,d.period_end,d.duration,d.unit,d.row.basis].join('|'),d.row);
    for(const i of d.row.inputs){const r=ix.byId.get(i.fact_id);if(r)usedFacts.set(r.fact_id,r);else warnings.push(`derived_input_not_in_envelope:${i.fact_id}`);}
   }
  }
  cells.push(finalizeCell(spec,members.length,input.nUnresolved,input.financial,included));
 }
 for(const id of members)if(facts(id).truncated)warnings.push(`read_truncated:${id}`);
 return {cells,roles,facts:[...usedFacts.values()],derived:[...usedDerived.values()],warnings:[...new Set(warnings)].sort(cmp)};
}
