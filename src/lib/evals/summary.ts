// src/lib/evals/summary.ts
// The one reduction of the F6 framework (spec §3.2 three-dimensional summary and gate, §3.3 reduction
// table, §0 R5-1 gold block). Kinds produce CaseReport[]; only this file turns them into a Summary.
// Input contract: exactly one CaseReport per case of the set, retracted / subset / pending cases
// included as skipped(…) — summarize never sees the set itself.
// - population = cases whose outcome is not skipped(retracted); required = those with required=true.
// - Retracted cases still count in coverage.skipped (§3.3 row "skipped(retracted | subset)").
// - evaluated / evaluated_optional = population cases (all / required=false) whose outcome lands in any
//   correctness counter (pass, fail, unit_mismatch, provenance_incomplete, unexplained_diff).
// - read_error(truncated) increments execution.read_error AND execution.truncated.
// - data_drift with ≥ 1 ledger id → pass, with none → unexplained_diff; an explained_diff or
//   beyond_explained without a ledger id is treated as unexplained (an explanation needs an entry).
// - The gold block is NOT derived from the cases: ctx.gold is copied verbatim; goldBlockOf(set) is the
//   one place that computes it (pending = non-retracted cases with pending=true, provenance_gaps =
//   non-retracted cases with ≥ 1 gap). skipped(pending) itself only counts in coverage.skipped.
import {parseDecimalParts} from './compare';
import type {CaseOutcome,CaseReport,Gate,GoldSet,Summary,SummaryContext} from './types';

export type Bucket='pass'|'fail'|'unit_mismatch'|'provenance_incomplete'|'unexplained_diff'|'missing'|'not_visible'|'skipped'|'read_error';
const CORRECTNESS:ReadonlySet<Bucket>=new Set(['pass','fail','unit_mismatch','provenance_incomplete','unexplained_diff']);

/** §3.3: the counter one case outcome lands in (missing is split by `required` in summarize). */
export function bucketOf(o:CaseOutcome):Bucket{
 switch(o.result){
  case 'pass':case 'expected_absent':case 'identical':case 'within':return 'pass';
  case 'explained_diff':case 'beyond_explained':case 'data_drift':return o.ledger_ids.length>0?'pass':'unexplained_diff';
  case 'fail':return 'fail';
  case 'unit_mismatch':return 'unit_mismatch';
  case 'provenance_incomplete':return 'provenance_incomplete';
  case 'unexplained_diff':case 'beyond_unexplained':return 'unexplained_diff';
  case 'missing':return 'missing';
  case 'not_visible':return 'not_visible';
  case 'skipped':return 'skipped';
  case 'read_error':return 'read_error';
 }
}
export const isPassOutcome=(o:CaseOutcome):boolean=>bucketOf(o)==='pass';
const isRetracted=(o:CaseOutcome)=>o.result==='skipped'&&o.reason==='retracted';

/** §0 R5-1 gold block of a loaded set (the runner passes it as SummaryContext.gold). */
export function goldBlockOf(set:GoldSet):Summary['gold']{
 const live=set.cases.filter(c=>c.retracted===null);
 return {format:set.format,ready:set.ready,pending:live.filter(c=>c.pending).length,provenance_gaps:live.filter(c=>c.provenance_gaps.length>0).length};
}

export function summarize(cases:CaseReport[],ctx:SummaryContext):Summary{
 const seen=new Set<string>();
 for(const c of cases){if(seen.has(c.case_id))throw new RangeError(`duplicate_case_id:${c.case_id}`);seen.add(c.case_id);}
 const correctness={pass:0,fail:0,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0};
 const coverage={evaluated:0,evaluated_optional:0,missing_required:0,missing_optional:0,not_visible:0,skipped:0};
 const execution={read_error:0,truncated:0,subset:ctx.subset};
 let population=0,required=0;
 for(const c of cases){
  const b=bucketOf(c.outcome);
  if(!isRetracted(c.outcome)){population++;if(c.required)required++;}
  if(CORRECTNESS.has(b)){
   correctness[b as keyof typeof correctness]++;
   coverage.evaluated++;
   if(!c.required)coverage.evaluated_optional++;
  }else if(b==='missing'){if(c.required)coverage.missing_required++;else coverage.missing_optional++;}
  else if(b==='not_visible')coverage.not_visible++;
  else if(b==='skipped')coverage.skipped++;
  else{
   execution.read_error++;
   if(c.outcome.result==='read_error'&&c.outcome.reason==='truncated')execution.truncated++;
  }
 }
 const s:Omit<Summary,'gate'>={
  population,required,correctness,coverage,execution,thresholds:ctx.thresholds,gold:ctx.gold,
  evidence_class:ctx.evidenceClass,reconciliations_truncated:ctx.reconciliationsTruncated??false,
 };
 return {...s,gate:gateOf(s)};
}

/** §3.2 gate rules, in order: 1 incomplete, 2 fail, 3 optional coverage, 4 pass. Rule 1 also fires when nothing
 *  was evaluated (coverage.evaluated = the sum of the correctness counters = 0; Codex plan round 1 P1-1): a run whose
 *  population is entirely skipped(unavailable|zero_support|ineligible|…) is never a pass. */
export function gateOf(s:Omit<Summary,'gate'>):Gate{
 if(!Number.isSafeInteger(s.thresholds.max_fail)||s.thresholds.max_fail<0)throw new RangeError('max_fail');
 const min=parseDecimalParts(s.thresholds.min_coverage_optional);
 if(min.unscaled<0n||min.unscaled>10n**BigInt(min.scale))throw new RangeError('invalid_threshold:min_coverage_optional');
 if(s.population===0||s.coverage.evaluated===0||s.execution.read_error>0||s.execution.subset||s.coverage.missing_required>0||s.coverage.not_visible>0
  ||!s.gold.ready||s.gold.pending>0||s.gold.provenance_gaps>0)return 'incomplete';
 const failures=s.correctness.fail+s.correctness.unit_mismatch+s.correctness.provenance_incomplete+s.correctness.unexplained_diff;
 if(failures>s.thresholds.max_fail)return 'fail';
 const optional=s.population-s.required;
 if(optional>0){
  // evaluated_optional / optional < min  ⇔  evaluated_optional·10^scale < unscaled·optional
  if(BigInt(s.coverage.evaluated_optional)*10n**BigInt(min.scale)<min.unscaled*BigInt(optional))return 'incomplete';
 }
 return 'pass';
}
export const exitCodeOf=(g:Gate):0|1|3=>g==='pass'?0:g==='fail'?1:3;
export const statusOfGate=(g:Gate):'passed'|'failed'|'incomplete'=>g==='pass'?'passed':g==='fail'?'failed':'incomplete';
