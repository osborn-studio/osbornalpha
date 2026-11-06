// src/lib/evals/store.ts
// F6 run store (spec §6.2–§6.3): dq_eval_runs + dq_eval_case_results over TableClient, and persistRun —
// the no-transaction persistence order: (2) insert the 'running' row, (3) insert each non-pass case row
// (23505 → read back and compare every field), (4) terminal update guarded by status='running'
// (0 hits → read back; same terminal status + summary = success), (5) --resume authenticates the local
// report file by sha256 before repeating 3–4. Case rows exist only for public official/dual_source runs,
// at most CASE_ROW_LIMIT per run in report order; the report file keeps every case.
// The caller computes summary.reconciliations_truncated with caseRowsTruncated() BEFORE writing the report
// file; persistRun receives the final report and refuses (before any write) when the flag disagrees.
import {TableError} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {canonicalJson,sha256Hex} from './canonical-json';
import {EvalError} from './errors';
import {statusOfGate} from './summary';
import type {ArtifactClass,CaseReport,CaseResultKind,EvalCaseResultRow,EvalKind,EvalReport,EvalRunRow,EvalRunStatus,Summary} from './types';

export const RUNS='dq_eval_runs';
export const CASES='dq_eval_case_results';
export const CASE_ROW_LIMIT=100;
const RESULT_KINDS:ReadonlySet<string>=new Set<CaseResultKind>(['fail','unit_mismatch','provenance_incomplete','missing','not_visible','read_error','unexplained_diff']);

export interface EvalStore{
 insertRun(r:EvalRunRow):Promise<void>;
 insertCaseResult(r:EvalCaseResultRow):Promise<void>;
 finishRun(runId:string,status:EvalRunStatus,summary:Summary,finishedAt:string):Promise<void>;
 getRun(runId:string):Promise<EvalRunRow|null>;
 getCaseResult(runId:string,caseId:string):Promise<EvalCaseResultRow|null>;
}

const toRow=(v:object):Row=>({...v});
const str=(v:unknown)=>v===null||v===undefined?null:String(v);
function runOf(r:Row):EvalRunRow{
 return {
  run_id:String(r.run_id),kind:r.kind as EvalKind,module:r.module as EvalRunRow['module'],mode:r.mode as EvalRunRow['mode'],privileged:r.privileged===true,
  artifact_class:r.artifact_class as ArtifactClass,set_id:String(r.set_id),set_version:Number(r.set_version),set_sha256:String(r.set_sha256),
  evaluator_code_version:String(r.evaluator_code_version),started_at:String(r.started_at),finished_at:str(r.finished_at),status:r.status as EvalRunStatus,
  summary:(r.summary??{}) as EvalRunRow['summary'],report_ref:String(r.report_ref),report_sha256:String(r.report_sha256),triggered_by:r.triggered_by as EvalRunRow['triggered_by'],
 };
}
function caseOf(r:Row):EvalCaseResultRow{
 return {
  eval_run_id:String(r.eval_run_id),case_id:String(r.case_id),result:r.result as CaseResultKind,reason:str(r.reason),
  left_text:str(r.left_text),right_text:str(r.right_text),abs_diff:str(r.abs_diff),rel_diff:str(r.rel_diff),tolerance:String(r.tolerance),
  detail:(r.detail??{}) as Record<string,unknown>,
 };
}

export function evalStore(tables:TableClient):EvalStore{
 const getRun=async(runId:string)=>{const rows=await tables.select(RUNS,{run_id:runId},{limit:1});return rows[0]?runOf(rows[0]):null;};
 return {
  async insertRun(r){await tables.insert(RUNS,toRow(r));},
  async insertCaseResult(r){await tables.insert(CASES,toRow(r));},
  async finishRun(runId,status,summary,finishedAt){
   const n=await tables.update(RUNS,{run_id:runId,status:'running'},{status,summary:toRow(summary),finished_at:finishedAt});
   if(n===1)return;
   const row=n===0?await getRun(runId):null;
   if(row&&row.status===status&&canonicalJson(row.summary)===canonicalJson(summary))return;
   throw new EvalError('store_conflict',`dq_eval_runs ${runId}: terminal update hit ${n} rows; stored status ${row?.status??'absent'}`,{run_id:runId,hits:n,stored_status:row?.status??null});
  },
  getRun,
  async getCaseResult(runId,caseId){const rows=await tables.select(CASES,{eval_run_id:runId,case_id:caseId},{limit:1});return rows[0]?caseOf(rows[0]):null;},
 };
}

const reasonOf=(c:CaseReport):string|null=>{
 const o=c.outcome as {reason?:unknown};
 return typeof o.reason==='string'&&o.reason.length>0?Array.from(o.reason).slice(0,64).join(''):null;
};
/** Every case row the run would store (untruncated): public official/dual_source runs, non-pass results only, report order. */
export function caseRowCandidates(report:Pick<EvalReport,'run_id'|'kind'|'artifact_class'|'cases'>):EvalCaseResultRow[]{
 if(report.artifact_class!=='public'||(report.kind!=='official_reconciliation'&&report.kind!=='dual_source'))return [];
 return report.cases.filter(c=>RESULT_KINDS.has(c.outcome.result)).map(c=>({
  eval_run_id:report.run_id,case_id:c.case_id,result:c.outcome.result as CaseResultKind,reason:reasonOf(c),
  left_text:c.left,right_text:c.right,abs_diff:c.abs_diff,rel_diff:c.rel_diff,tolerance:c.tolerance,
  detail:JSON.parse(JSON.stringify(c.detail??{})) as Record<string,unknown>,
 }));
}
/** The rows persistRun writes: the first CASE_ROW_LIMIT candidates. */
export const caseRowsOf=(report:Pick<EvalReport,'run_id'|'kind'|'artifact_class'|'cases'>):EvalCaseResultRow[]=>caseRowCandidates(report).slice(0,CASE_ROW_LIMIT);
/** summary.reconciliations_truncated for this run; pass it as SummaryContext.reconciliationsTruncated. */
export const caseRowsTruncated=(report:Pick<EvalReport,'run_id'|'kind'|'artifact_class'|'cases'>):boolean=>caseRowCandidates(report).length>CASE_ROW_LIMIT;

export function runRowOf(report:EvalReport,files:{ref:string;sha256:string},triggeredBy:EvalRunRow['triggered_by']):EvalRunRow{
 return {
  run_id:report.run_id,kind:report.kind,module:report.module,mode:report.mode,privileged:report.privileged,artifact_class:report.artifact_class,
  set_id:report.set.id,set_version:report.set.version,set_sha256:report.set.sha256,evaluator_code_version:report.evaluator_code_version,
  started_at:report.started_at,finished_at:null,status:'running',summary:{},report_ref:files.ref,report_sha256:files.sha256,triggered_by:triggeredBy,
 };
}

const sameCase=(a:EvalCaseResultRow,b:EvalCaseResultRow)=>
 a.eval_run_id===b.eval_run_id&&a.case_id===b.case_id&&a.result===b.result&&a.reason===b.reason&&a.left_text===b.left_text&&a.right_text===b.right_text
 &&a.abs_diff===b.abs_diff&&a.rel_diff===b.rel_diff&&a.tolerance===b.tolerance&&canonicalJson(a.detail)===canonicalJson(b.detail);
const partial=(report:EvalReport,step:string,e:unknown)=>e instanceof EvalError?e:new EvalError('store_partial',`run ${report.run_id} left 'running' at ${step}: ${(e as Error)?.message??String(e)}; rerun with --resume ${report.run_id}`,{run_id:report.run_id,step});

/** Spec §6.3 steps 2–5. The report file is already written (step 1); `files` is its repo-relative ref and sha256. */
export async function persistRun(store:EvalStore,report:EvalReport,files:{ref:string;sha256:string},opts:{triggeredBy:'manual'|'script'|'ci';resume?:boolean}):Promise<void>{
 if(report.summary.reconciliations_truncated!==caseRowsTruncated(report))
  throw new EvalError('store_write_failed',`run ${report.run_id}: summary.reconciliations_truncated does not match the case rows`,{run_id:report.run_id});
 if(sha256Hex(`${canonicalJson(report)}\n`)!==files.sha256){
  if(opts.resume)throw new EvalError('resume_mismatch',`run ${report.run_id}: files.sha256 is not the sha256 of the report bytes`,{run_id:report.run_id});
  throw new EvalError('store_write_failed',`run ${report.run_id}: files.sha256 is not the sha256 of the report bytes`,{run_id:report.run_id,reason:'report_sha_mismatch'});
 }
 if(opts.resume){
  let existing:EvalRunRow|null;
  try{existing=await store.getRun(report.run_id);}catch(e){throw partial(report,'resume read',e);}
  if(!existing)throw new EvalError('resume_mismatch',`run ${report.run_id} not found`,{run_id:report.run_id});
  if(existing.report_sha256!==files.sha256||existing.report_ref!==files.ref)
   throw new EvalError('resume_mismatch',`run ${report.run_id}: local report does not match dq_eval_runs.report_sha256/report_ref`,{run_id:report.run_id});
  if(existing.status!=='running'){
   if(existing.status===statusOfGate(report.summary.gate)&&canonicalJson(existing.summary)===canonicalJson(report.summary))return;
   throw new EvalError('store_conflict',`run ${report.run_id} is already ${existing.status} with a different outcome`,{run_id:report.run_id,stored_status:existing.status});
  }
 }else{
  try{await store.insertRun(runRowOf(report,files,opts.triggeredBy));}
  catch(e){throw new EvalError('store_write_failed',`dq_eval_runs insert failed for ${report.run_id}: ${(e as Error)?.message??String(e)}`,{run_id:report.run_id});}
 }
 for(const row of caseRowsOf(report)){
  try{await store.insertCaseResult(row);}
  catch(e){
   if(!(e instanceof TableError&&e.code==='23505'))throw partial(report,`case ${row.case_id}`,e);
   let stored:EvalCaseResultRow|null;
   try{stored=await store.getCaseResult(row.eval_run_id,row.case_id);}catch(e2){throw partial(report,`case ${row.case_id} read-back`,e2);}
   if(!stored||!sameCase(stored,row))throw new EvalError('store_conflict',`dq_eval_case_results (${row.eval_run_id}, ${row.case_id}) already holds a different row`,{run_id:row.eval_run_id,case_id:row.case_id});
  }
 }
 try{await store.finishRun(report.run_id,statusOfGate(report.summary.gate),report.summary,report.finished_at);}
 catch(e){throw partial(report,'finish',e);}
}
