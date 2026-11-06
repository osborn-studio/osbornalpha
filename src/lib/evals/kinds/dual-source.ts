// src/lib/evals/kinds/dual-source.ts
// dual_source (spec §5.5, §0 R5-10, §3.3). Registrations and per-key observations come from plan 3's
// reconciliation pairs/results through an injected, read-only PairSource (the adapter lands with plan 3);
// F6 never reuses plan 3's passed or rel_diff: it recompares both value_text with compareWithinTolerance at
// the registration's tolerance (D1 default rel 0.005). Observation key = (issuer, concept, period_start,
// period_end, duration, consolidation, unit); detail.as_of = the later of the two sides' available_date (the
// adapter reads each side's current value at that asOf). upstream_outcome other than 'compared' never
// passes: left_missing / right_missing / incomplete_gold → missing; left_unlinked →
// read_error(filing_not_linked); *_ambiguous, unsupported, legacy, anything unknown → read_error(read_failed).
// A 'compared' observation missing a side, or with a non-decimal value, is read_error(read_failed); two
// observations of one key are fail(ambiguous); a truncated observation read adds one
// read_error(truncated) case. A fail counts as handled (→ pass, detail.compared='fail',
// detail.disposition.handled=true) only when its disposition has natural_key = observationKeyString(key),
// status resolved_accept | resolved_reject and, when chosen_fact_ids is present, one of the two compared
// fact_ids in it. same_feed pairs are evidence_class adapter_check (not release evidence). trend counts raw
// comparisons (report only; the 95% line of spec 1 §9 is an alert, not a gate).
import {compareWithinTolerance} from '../compare';
import {EvalError} from '../errors';
import type {CaseOutcome,CaseReport,EvalModule,EvidenceClass,SummaryContext} from '../types';
import {writeLikeProperties} from './read-only';

export type Independence='independent_publication'|'same_upstream_independent_extraction'|'same_feed';
export interface PairRegistration{pair_id:string;module:EvalModule;left:{source:string;upstream:string};right:{source:string;upstream:string};independence:Independence;tolerance:{rel:string}}
export interface ObservationKey{issuer:string;concept:string;period_start:string|null;period_end:string;duration:string;consolidation:string;unit:string}
export interface ObservationSide{fact_id:string;value_text:string;source_ref:string;raw_hash:string;available_date:string}
export interface Disposition{quarantine_id:string;natural_key:string;status:string;chosen_fact_ids?:string[]}
export interface PairObservation{key:ObservationKey;left:ObservationSide|null;right:ObservationSide|null;upstream_outcome:string;disposition?:Disposition}
/** Read-only by contract: runDualSource refuses a source exposing insert/update/upsert/store/delete/rpc-like members. */
export interface PairSource{
 registration(pairId:string):Promise<PairRegistration|null>;
 observations(pairId:string):Promise<{rows:PairObservation[];truncated:boolean}>;
}
export interface DualSourceResult{cases:CaseReport[];evidenceClass:EvidenceClass;trend:{pass:number;fail:number}}

export const DUAL_SOURCE_REL='0.005';
/** Plan 3 decimal.ts::relDiff rounds half away from zero at 10 places; F6 compareWithinTolerance truncates. Text from one side is never compared with the other. */
export const RELDIFF_CONFORMANCE=[
 {left:'1',right:'3',plan3:'0.6666666667',f6:'0.6666666666'},
 {left:'100',right:'101',plan3:'0.0099009901',f6:'0.00990099'},
 {left:'0',right:'0.00000000005',plan3:'0.0000000001',f6:'0'},
] as const;

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const INDEPENDENCE=new Set<string>(['independent_publication','same_upstream_independent_extraction','same_feed']);
export const observationKeyString=(k:ObservationKey)=>[k.issuer,k.concept,k.period_start??'',k.period_end,k.duration,k.consolidation,k.unit].join(':');

export function upstreamOutcomeOf(outcome:string):CaseOutcome|null{
 switch(outcome){
  case 'compared':return null;
  case 'left_missing':case 'right_missing':case 'incomplete_gold':return {result:'missing'};
  case 'left_unlinked':return {result:'read_error',reason:'filing_not_linked'};
  default:return {result:'read_error',reason:'read_failed'};
 }
}
export function dispositionHandles(d:Disposition|undefined,key:ObservationKey,used:string[]):{handled:boolean;why?:string}{
 if(!d)return {handled:false,why:'no_disposition'};
 if(d.natural_key!==observationKeyString(key))return {handled:false,why:'natural_key'};
 if(d.status!=='resolved_accept'&&d.status!=='resolved_reject')return {handled:false,why:'status'};
 if(d.chosen_fact_ids!==undefined&&!d.chosen_fact_ids.some(id=>used.includes(id)))return {handled:false,why:'chosen_fact_ids'};
 return {handled:true};
}
function validateRegistration(r:PairRegistration):void{
 const bad=(field:string):never=>{throw new EvalError('gold_invalid',`pair registration ${r.pair_id||'?'}: ${field}`,{pair_id:r.pair_id,field});};
 if(typeof r.pair_id!=='string'||r.pair_id.length===0)bad('pair_id');
 if(!INDEPENDENCE.has(r.independence))bad('independence');
 if(typeof r.tolerance?.rel!=='string'||!/^0(\.\d+)?$/.test(r.tolerance.rel))bad('tolerance.rel');   // 0 ≤ rel < 1
 for(const s of [r.left,r.right])if(!s||typeof s.source!=='string'||!s.source||typeof s.upstream!=='string'||!s.upstream)bad('left/right');
}
const sideDetail=(s:ObservationSide|null)=>s?{fact_id:s.fact_id,source_ref:s.source_ref,raw_hash:s.raw_hash,available_date:s.available_date}:null;

export function evaluateDualSource(reg:PairRegistration,rows:PairObservation[],opts:{truncated:boolean}={truncated:false}):DualSourceResult{
 validateRegistration(reg);
 const rep=(case_id:string,outcome:CaseOutcome,left:string|null,right:string|null,abs:string|null,rel:string|null,detail:Record<string,unknown>):CaseReport=>
  ({case_id,required:true,outcome,left,right,abs_diff:abs,rel_diff:rel,tolerance:reg.tolerance.rel,provenance:null,detail});
 const groups=new Map<string,PairObservation[]>();
 for(const o of rows){const k=observationKeyString(o.key);const g=groups.get(k)??[];g.push(o);groups.set(k,g);}
 const cases:CaseReport[]=[];const trend={pass:0,fail:0};
 for(const [k,g] of [...groups.entries()].sort((a,b)=>cmp(a[0],b[0]))){
  const id=`${reg.pair_id}:${k}`;const o=g[0];
  const detail:Record<string,unknown>={pair_id:reg.pair_id,key:o.key,upstream_outcome:o.upstream_outcome,left:sideDetail(o.left),right:sideDetail(o.right)};
  if(g.length>1){cases.push(rep(id,{result:'fail',reason:'ambiguous'},null,null,null,null,{...detail,observations:g.length}));continue;}
  const mapped=upstreamOutcomeOf(o.upstream_outcome);
  if(mapped){cases.push(rep(id,mapped,o.left?.value_text??null,o.right?.value_text??null,null,null,detail));continue;}
  if(!o.left||!o.right){cases.push(rep(id,{result:'read_error',reason:'read_failed'},o.left?.value_text??null,o.right?.value_text??null,null,null,{...detail,error:'compared_without_side'}));continue;}
  let c:{passed:boolean;absDiff:string;relDiff:string};
  try{c=compareWithinTolerance(o.left.value_text,o.right.value_text,reg.tolerance.rel);}
  catch{cases.push(rep(id,{result:'read_error',reason:'read_failed'},null,null,null,null,{...detail,error:'invalid_decimal'}));continue;}
  const base={...detail,as_of:o.left.available_date>o.right.available_date?o.left.available_date:o.right.available_date};
  if(c.passed){trend.pass++;cases.push(rep(id,{result:'pass'},o.left.value_text,o.right.value_text,c.absDiff,c.relDiff,{...base,compared:'pass'}));continue;}
  trend.fail++;
  const h=dispositionHandles(o.disposition,o.key,[o.left.fact_id,o.right.fact_id]);
  if(h.handled){cases.push(rep(id,{result:'pass'},o.left.value_text,o.right.value_text,c.absDiff,c.relDiff,{...base,compared:'fail',disposition:{...o.disposition,handled:true}}));continue;}
  cases.push(rep(id,{result:'fail',reason:'value'},o.left.value_text,o.right.value_text,c.absDiff,c.relDiff,{...base,compared:'fail',...(o.disposition?{disposition:{...o.disposition,handled:false,why:h.why}}:{})}));
 }
 if(opts.truncated)cases.push(rep(`${reg.pair_id}:__truncated__`,{result:'read_error',reason:'truncated'},null,null,null,null,{pair_id:reg.pair_id}));
 return {cases,evidenceClass:reg.independence==='same_feed'?'adapter_check':'truth',trend};
}

export async function runDualSource(source:PairSource,pairId:string):Promise<DualSourceResult>{
 const w=writeLikeProperties(source);
 if(w.length>0)throw new Error(`pair_source_write_capable: ${w.join(', ')}`);
 const reg=await source.registration(pairId);
 if(!reg)throw new EvalError('gold_invalid',`pair not registered: ${pairId}`,{pair_id:pairId});
 const {rows,truncated}=await source.observations(pairId);
 return evaluateDualSource(reg,rows,{truncated});
}

export const dualSourceSummaryContext=(r:Pick<DualSourceResult,'evidenceClass'>):SummaryContext=>({
 thresholds:{max_fail:0,min_coverage_optional:'0.95'},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:r.evidenceClass});
