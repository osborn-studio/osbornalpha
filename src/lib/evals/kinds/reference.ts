// src/lib/evals/kinds/reference.ts
// reference_regression (spec §5.4, §3.3 reference rows, §14). Samples are ChaosAI page captures; they are
// never truth. The kind only gets ReadDeps (a value reader, the clock, the evaluator version) — no
// service-role key, no write method: evaluateReference refuses deps exposing insert/update/upsert/store/
// delete/rpc-like members (EvalError reference_write_attempt). Comparison: ours (left) vs theirs (right) at
// REFERENCE_REL = 0.01 → within; otherwise beyond_explained only with a ledger entry for the sample whose
// reason_code ≠ unknown, approved_by ≠ added_by, approval_ref present and their_value / our_value equal (as
// decimals) to the two compared values; else beyond_unexplained. No parsed value on the sample side (LPR, asset
// prices) → skipped(unavailable); a sample with a value but nothing on OUR side → missing (coverage: the system
// failed to produce it — Codex plan round 1 P1-1; ReferenceResult therefore carries `missing`, an integration
// deviation from §5.4's five keys). The canary (canary: true, series __canary__, parsed_value
// 918273645.5) goes through the same path and stays in cases[] (report JSON only) but is excluded from
// countedCases, ReferenceResult and the summary. ReferenceResult is validated strictly at runtime (exact
// key set, non-negative safe integers, total = sum); the only write path is
// referenceSummaryWriter(sink).writeReferenceSummary(run_id, result) → finishRun with the §3.2 summary.
import {canonicalDecimal} from '../../facts/json-numbers';
import {compareWithinTolerance} from '../compare';
import {EvalError} from '../errors';
import type {EvalStore} from '../store';
import {gateOf,statusOfGate} from '../summary';
import type {CaseOutcome,CaseReport,Summary,Thresholds} from '../types';
import {assertReadOnly} from './read-only';

export const REFERENCE_REL='0.01';
export const CANARY_SERIES='__canary__';
export const CANARY_VALUE='918273645.5';
export interface OurTarget{series_id:string;period_end:string;which:'latest'|'previous'}
export interface ReferenceSample{
 sample_id:string;doc:string;doc_sha256:string;line:number;page_url:string;page_sha256:string;captured_at:string;
 as_displayed:string;parsed_value:string|null;parsed_unit:string|null;their_declared_source:string|null;our_target:OurTarget;canary:boolean;
}
export interface ReferenceSampleFile{schema_version:1;samples:ReferenceSample[]}
export const REFERENCE_REASONS=['membership_pointintime','aggregation_method','restatement','unit_or_basis','their_placeholder','their_proxy','their_stale_snapshot','unknown'] as const;
export type ReferenceReason=typeof REFERENCE_REASONS[number];
export interface ReferenceLedgerEntry{sample_id:string;their_value:string;our_value:string;our_run_id:string;reason_code:ReferenceReason;evidence:{type:'computation'|'document';ref:string};added_by:string;approved_by:string;approval_ref:string}
export interface ReferenceResult{total:number;within:number;beyond_explained:number;beyond_unexplained:number;unavailable:number;missing:number}
/** reference_regression thresholds (§5.4: beyond_unexplained = 0 → pass); also used by reduce.ts and the manifest validator. */
export const REFERENCE_THRESHOLDS:Thresholds={max_fail:0,min_coverage_optional:'0.95'};
export interface ReferenceReader{value(target:OurTarget):Promise<{value_text:string;unit:string|null;run_id:string|null}|null>}
export interface ReferenceReadDeps{reader:ReferenceReader;today:string;evaluatorCodeVersion:string}
export interface ReferenceEvaluation{cases:CaseReport[];countedCases:CaseReport[];result:ReferenceResult}

const RESULT_KEYS=['beyond_explained','beyond_unexplained','missing','total','unavailable','within'];
const HEX64=/^[0-9a-f]{64}$/,DAY=/^\d{4}-\d{2}-\d{2}$/;
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const nonEmpty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const isDecimal=(v:unknown):v is string=>{if(typeof v!=='string')return false;try{canonicalDecimal(v);return true;}catch{return false;}};

export function parseReferenceResult(v:unknown):ReferenceResult{
 const bad=(why:string):never=>{throw new EvalError('reference_result_schema',`ReferenceResult: ${why}`,{why});};
 if(!isObj(v)||Object.getPrototypeOf(v)!==Object.prototype)return bad('not a plain object');
 const keys=Object.keys(v).sort();
 if(keys.length!==RESULT_KEYS.length||keys.some((k,i)=>k!==RESULT_KEYS[i]))return bad(`keys ${keys.join(',')}`);
 for(const k of RESULT_KEYS){const x=v[k];if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0)return bad(`${k} is not a non-negative integer`);}
 const r=v as unknown as ReferenceResult;
 if(r.total!==r.within+r.beyond_explained+r.beyond_unexplained+r.unavailable+r.missing)return bad('total ≠ sum');
 return {total:r.total,within:r.within,beyond_explained:r.beyond_explained,beyond_unexplained:r.beyond_unexplained,unavailable:r.unavailable,missing:r.missing};
}

export function parseReferenceSamples(raw:unknown):ReferenceSampleFile{
 const top=(f:string):never=>{throw new EvalError('gold_invalid',`reference samples: ${f}`,{field:f});};
 if(!isObj(raw)||raw.schema_version!==1||!Array.isArray(raw.samples))return top('schema_version/samples');
 const seen=new Set<string>();let canaries=0;
 const samples=raw.samples.map((s,i):ReferenceSample=>{
  const bad=(f:string):never=>{throw new EvalError('gold_invalid',`reference samples[${i}]: ${f}`,{index:i,field:f});};
  if(!isObj(s)||!nonEmpty(s.sample_id))return bad('sample_id');
  if(seen.has(s.sample_id))return bad('sample_id_duplicate');seen.add(s.sample_id);
  if(!nonEmpty(s.doc)||typeof s.doc_sha256!=='string'||!HEX64.test(s.doc_sha256))return bad('doc/doc_sha256');
  if(typeof s.line!=='number'||!Number.isSafeInteger(s.line)||s.line<1)return bad('line');
  if(!nonEmpty(s.page_url)||typeof s.page_sha256!=='string'||!HEX64.test(s.page_sha256))return bad('page_url/page_sha256');
  if(typeof s.captured_at!=='string'||Number.isNaN(Date.parse(s.captured_at)))return bad('captured_at');
  if(typeof s.as_displayed!=='string')return bad('as_displayed');
  if(s.parsed_value!==null&&!isDecimal(s.parsed_value))return bad('parsed_value');
  if(s.parsed_unit!==null&&typeof s.parsed_unit!=='string')return bad('parsed_unit');
  if(s.their_declared_source!==null&&typeof s.their_declared_source!=='string')return bad('their_declared_source');
  const t=s.our_target;
  if(!isObj(t)||!nonEmpty(t.series_id)||typeof t.period_end!=='string'||!DAY.test(t.period_end)||(t.which!=='latest'&&t.which!=='previous'))return bad('our_target');
  if(typeof s.canary!=='boolean')return bad('canary');
  if(s.canary){canaries++;if(t.series_id!==CANARY_SERIES)return bad('canary_series');}
  else if(t.series_id===CANARY_SERIES)return bad('canary_series_without_flag');
  return s as unknown as ReferenceSample;
 });
 if(canaries>1)return top('more than one canary');
 return {schema_version:1,samples};
}

export function parseReferenceLedger(raw:unknown):ReferenceLedgerEntry[]{
 if(!Array.isArray(raw))throw new EvalError('gold_invalid','reference explanations: expected an array');
 return raw.map((e,i)=>{
  const bad=(f:string):never=>{throw new EvalError('gold_invalid',`reference explanations[${i}]: ${f}`,{index:i,field:f});};
  if(!isObj(e)||!nonEmpty(e.sample_id))return bad('sample_id');
  if(!isDecimal(e.their_value))return bad('their_value');
  if(!isDecimal(e.our_value))return bad('our_value');
  if(!nonEmpty(e.our_run_id))return bad('our_run_id');
  if(!(REFERENCE_REASONS as readonly unknown[]).includes(e.reason_code))return bad('reason_code');
  if(!isObj(e.evidence)||(e.evidence.type!=='computation'&&e.evidence.type!=='document')||!nonEmpty(e.evidence.ref))return bad('evidence');
  if(!nonEmpty(e.added_by)||!nonEmpty(e.approved_by)||!nonEmpty(e.approval_ref))return bad('added_by/approved_by/approval_ref');
  return e as unknown as ReferenceLedgerEntry;
 });
}

const explains=(e:ReferenceLedgerEntry,ours:string,theirs:string)=>e.reason_code!=='unknown'&&e.approved_by!==e.added_by&&e.approval_ref.trim().length>0
 &&canonicalDecimal(e.our_value)===canonicalDecimal(ours)&&canonicalDecimal(e.their_value)===canonicalDecimal(theirs);

export async function evaluateReference(samples:ReferenceSample[],ledger:ReferenceLedgerEntry[],deps:ReferenceReadDeps):Promise<ReferenceEvaluation>{
 assertReadOnly(deps,'reference_write_attempt','reference_regression ReadDeps');
 const cases:CaseReport[]=[];const counted:CaseReport[]=[];
 const result:ReferenceResult={total:0,within:0,beyond_explained:0,beyond_unexplained:0,unavailable:0,missing:0};
 for(const s of samples){
  const rep=(outcome:CaseOutcome,left:string|null,abs:string|null,rel:string|null,detail:Record<string,unknown>):CaseReport=>
   ({case_id:s.sample_id,required:true,outcome,left,right:s.parsed_value,abs_diff:abs,rel_diff:rel,tolerance:REFERENCE_REL,provenance:null,detail:{our_target:s.our_target,parsed_unit:s.parsed_unit,canary:s.canary,...detail}});
  const ours=s.parsed_value===null?null:await deps.reader.value(s.our_target);
  let c:CaseReport;
  if(s.parsed_value===null){c=rep({result:'skipped',reason:'unavailable'},null,null,null,{});if(!s.canary)result.unavailable++;}
  else if(ours===null){c=rep(s.canary?{result:'skipped',reason:'unavailable'}:{result:'missing'},null,null,null,{});if(!s.canary)result.missing++;}
  else{
   const cmpRes=compareWithinTolerance(ours.value_text,s.parsed_value,REFERENCE_REL);
   const detail={our_unit:ours.unit,our_run_id:ours.run_id};
   if(cmpRes.passed){c=rep({result:'within'},ours.value_text,cmpRes.absDiff,cmpRes.relDiff,detail);if(!s.canary)result.within++;}
   else if(!s.canary&&ledger.some(e=>e.sample_id===s.sample_id&&explains(e,ours.value_text,s.parsed_value!))){c=rep({result:'beyond_explained',ledger_ids:[s.sample_id]},ours.value_text,cmpRes.absDiff,cmpRes.relDiff,detail);result.beyond_explained++;}
   else{c=rep({result:'beyond_unexplained'},ours.value_text,cmpRes.absDiff,cmpRes.relDiff,detail);if(!s.canary)result.beyond_unexplained++;}
  }
  cases.push(c);
  if(!s.canary){counted.push(c);result.total++;}
 }
 return {cases,countedCases:counted,result:parseReferenceResult(result)};
}

/** §3.2 summary from validated counts: within + beyond_explained → pass, beyond_unexplained → unexplained_diff, unavailable → skipped,
 *  missing → coverage.missing_required. Equals reduce.ts::reduceForKind over the same cases (reduce.test.ts). */
export function referenceSummary(raw:unknown,thresholds:Thresholds):Summary{
 const r=parseReferenceResult(raw);
 const base:Omit<Summary,'gate'>={population:r.total,required:r.total,
  correctness:{pass:r.within+r.beyond_explained,fail:0,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:r.beyond_unexplained},
  coverage:{evaluated:r.within+r.beyond_explained+r.beyond_unexplained,evaluated_optional:0,missing_required:r.missing,missing_optional:0,not_visible:0,skipped:r.unavailable},
  execution:{read_error:0,truncated:0,subset:false},thresholds,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},evidence_class:'comparison',reconciliations_truncated:false};
 return {...base,gate:gateOf(base)};
}

export type ReferenceSummarySink=Pick<EvalStore,'finishRun'>;
/** The only write path of reference_regression: validate, build the counts-only summary, finish the run. */
export function referenceSummaryWriter(sink:ReferenceSummarySink,opts:{thresholds:Thresholds;now():Date}){
 return {
  async writeReferenceSummary(run_id:string,result:unknown):Promise<Summary>{
   const summary=referenceSummary(result,opts.thresholds);
   await sink.finishRun(run_id,statusOfGate(summary.gate),summary,opts.now().toISOString());
   return summary;
  },
 };
}
