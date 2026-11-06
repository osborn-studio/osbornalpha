// src/lib/evals/admin.ts
// Admin read model of the F6 tables (spec §12, §0 R5-11, §5.2(b)). Every response field comes from a
// whitelist: the dq_eval_runs columns; the §3.2 summary keys, type-checked one by one (any other key in
// the jsonb — debug fields, a canary — is dropped; a summary that is not a complete §3.2 object, e.g. the
// '{}' of a running row, is null); the dq_eval_case_results text columns plus detail.locator (flat
// string/number values kept as stored; the whole object is capped at 4 KB defensively) and detail.document_id ({kind, value}) — nothing else of detail. At most
// EVAL_CASE_ROWS_MAX case rows per run (ordered by case_id) with the stored count (cases_stored) and cases_truncated (more stored than returned, or
// summary.reconciliations_truncated); only public official_reconciliation/dual_source runs have case rows, others get []. gate_failing_30d counts
// runs with status failed | incomplete | error started in the last 30 days, globally (not filtered by the
// list query), like the /admin/dq KPI tiles; TableClient has no IN filter, so it is three counts.
import type {Row,TableClient} from '../db/table-client';
import {EVAL_MODULES} from './gold/schema';
import {CASE_ROW_LIMIT} from './store';
import type {ArtifactClass,CaseResultKind,EvalKind,EvalMode,EvalModule,EvalRunStatus,EvalRunRow,Summary} from './types';

export const EVAL_KINDS:readonly EvalKind[]=['official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration'];
export {EVAL_MODULES};
export const EVAL_LIST_DEFAULT=20,EVAL_LIST_MAX=100,EVAL_CASE_ROWS_MAX=CASE_ROW_LIMIT;
export const GATE_FAILING_STATUSES:readonly EvalRunStatus[]=['failed','incomplete','error'];
export const EVAL_RUN_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS=86_400_000;
const MAX_LOCATOR_TEXT=200;   // document_id.value only
const MAX_LOCATOR_BYTES=4096;   // defensive cap on a whole locator object; individual values are kept as stored

export interface EvalListQuery{limit:number;module?:EvalModule;kind?:EvalKind}
export type PublicEvalRun=Omit<EvalRunRow,'summary'>&{summary:Summary|null};
export interface PublicCaseResult{case_id:string;result:CaseResultKind;reason:string|null;left_text:string|null;right_text:string|null;abs_diff:string|null;rel_diff:string|null;tolerance:string;locator:Record<string,string|number>|null;document_id:{kind:string;value:string}|null}
export interface EvalRunList{runs:PublicEvalRun[];gate_failing_30d:number;refreshed_at:string}
export interface EvalRunDetail{run:PublicEvalRun;cases:PublicCaseResult[];cases_stored:number;cases_truncated:boolean}

export function parseEvalListQuery(p:URLSearchParams):{ok:true;query:EvalListQuery}|{ok:false;error:'invalid_limit'|'invalid_module'|'invalid_kind'}{
 const raw=p.get('limit');let limit=EVAL_LIST_DEFAULT;
 if(raw!==null){if(!/^[1-9][0-9]{0,2}$/.test(raw)||Number(raw)>EVAL_LIST_MAX)return {ok:false,error:'invalid_limit'};limit=Number(raw);}
 const m=p.get('module'),k=p.get('kind');
 if(m!==null&&!(EVAL_MODULES as readonly string[]).includes(m))return {ok:false,error:'invalid_module'};
 if(k!==null&&!(EVAL_KINDS as readonly string[]).includes(k))return {ok:false,error:'invalid_kind'};
 return {ok:true,query:{limit,...(m!==null?{module:m as EvalModule}:{}),...(k!==null?{kind:k as EvalKind}:{})}};
}

const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const nat=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const bool=(v:unknown):v is boolean=>typeof v==='boolean';
const decimalText=(v:unknown):v is string=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v);
const GATES=new Set(['pass','fail','incomplete']);
const EVIDENCE=new Set(['truth','comparison','adapter_check']);
const FORMATS=new Set(['f6','legacy_plan2']);
function nats<K extends string>(o:unknown,ks:readonly K[]):Record<K,number>|null{
 if(!isObj(o))return null;
 const out={} as Record<K,number>;
 for(const k of ks){const v=o[k];if(!nat(v))return null;out[k]=v;}
 return out;
}

/** The §3.2 summary, rebuilt key by key; null unless every key is present with the right type. */
export function whitelistSummary(raw:unknown):Summary|null{
 if(!isObj(raw))return null;
 const correctness=nats(raw.correctness,['pass','fail','unit_mismatch','provenance_incomplete','unexplained_diff'] as const);
 const coverage=nats(raw.coverage,['evaluated','evaluated_optional','missing_required','missing_optional','not_visible','skipped'] as const);
 const ex=raw.execution,th=raw.thresholds,g=raw.gold;
 if(!correctness||!coverage||!isObj(ex)||!isObj(th)||!isObj(g))return null;
 if(!nat(raw.population)||!nat(raw.required)||!nat(ex.read_error)||!nat(ex.truncated)||!bool(ex.subset))return null;
 if(!nat(th.max_fail)||!decimalText(th.min_coverage_optional)||Number(th.min_coverage_optional)>1)return null;
 if(typeof g.format!=='string'||!FORMATS.has(g.format)||!bool(g.ready)||!nat(g.pending)||!nat(g.provenance_gaps))return null;
 if(typeof raw.gate!=='string'||!GATES.has(raw.gate)||typeof raw.evidence_class!=='string'||!EVIDENCE.has(raw.evidence_class)||!bool(raw.reconciliations_truncated))return null;
 return {population:raw.population,required:raw.required,correctness,coverage,
  execution:{read_error:ex.read_error,truncated:ex.truncated,subset:ex.subset},
  thresholds:{max_fail:th.max_fail,min_coverage_optional:th.min_coverage_optional},
  gold:{format:g.format as Summary['gold']['format'],ready:g.ready,pending:g.pending,provenance_gaps:g.provenance_gaps},
  gate:raw.gate as Summary['gate'],evidence_class:raw.evidence_class as Summary['evidence_class'],reconciliations_truncated:raw.reconciliations_truncated};
}

const text=(v:unknown):string|null=>v===null||v===undefined?null:String(v);
export function publicRun(r:Row):PublicEvalRun{
 return {run_id:String(r.run_id),kind:String(r.kind) as EvalKind,module:String(r.module) as EvalModule,mode:String(r.mode) as EvalMode,privileged:r.privileged===true,
  artifact_class:String(r.artifact_class) as ArtifactClass,set_id:String(r.set_id),set_version:Number(r.set_version),set_sha256:String(r.set_sha256),
  evaluator_code_version:String(r.evaluator_code_version),started_at:String(r.started_at),finished_at:text(r.finished_at),status:String(r.status) as EvalRunStatus,
  summary:whitelistSummary(r.summary),report_ref:String(r.report_ref),report_sha256:String(r.report_sha256),triggered_by:String(r.triggered_by) as EvalRunRow['triggered_by']};
}
function locatorOf(v:unknown):Record<string,string|number>|null{
 if(!isObj(v))return null;
 const out:Record<string,string|number>={};
 for(const [k,x] of Object.entries(v)){
  if(typeof x==='number'&&Number.isFinite(x))out[k]=x;
  else if(typeof x==='string')out[k]=x;
  else return null;
 }
 return JSON.stringify(out).length>MAX_LOCATOR_BYTES?null:out;
}
function documentIdOf(v:unknown):{kind:string;value:string}|null{
 if(!isObj(v)||typeof v.kind!=='string'||typeof v.value!=='string'||v.value.length>MAX_LOCATOR_TEXT)return null;
 if(!['edgar_accession','cninfo_announcement','file_sha256','official_release'].includes(v.kind))return null;
 return {kind:v.kind,value:v.value};
}
export function publicCase(r:Row):PublicCaseResult{
 const detail=isObj(r.detail)?r.detail:{};
 return {case_id:String(r.case_id),result:String(r.result) as CaseResultKind,reason:text(r.reason),left_text:text(r.left_text),right_text:text(r.right_text),
  abs_diff:text(r.abs_diff),rel_diff:text(r.rel_diff),tolerance:String(r.tolerance),locator:locatorOf(detail.locator),document_id:documentIdOf(detail.document_id)};
}

export async function listEvalRuns(tables:TableClient,query:EvalListQuery,now:Date=new Date()):Promise<EvalRunList>{
 const match:Row={};
 if(query.module)match.module=query.module;
 if(query.kind)match.kind=query.kind;
 const since=new Date(now.getTime()-30*DAY_MS).toISOString();
 const [rows,...counts]=await Promise.all([
  tables.select('dq_eval_runs',match,{orderBy:'started_at',desc:true,limit:query.limit}),
  ...GATE_FAILING_STATUSES.map(status=>tables.count('dq_eval_runs',{status},{gte:{started_at:since}})),
 ]) as [Row[],...number[]];
 return {runs:rows.map(publicRun),gate_failing_30d:counts.reduce((a,b)=>a+b,0),refreshed_at:now.toISOString()};
}

export async function getEvalRun(tables:TableClient,runId:string):Promise<EvalRunDetail|null>{
 const [r]=await tables.select('dq_eval_runs',{run_id:runId},{limit:1});
 if(!r)return null;
 const run=publicRun(r);
 // Case rows exist only for public official_reconciliation / dual_source runs (store.ts::caseRowCandidates).
 const eligible=run.artifact_class==='public'&&(run.kind==='official_reconciliation'||run.kind==='dual_source');
 const [rows,total]=eligible?await Promise.all([
  tables.select('dq_eval_case_results',{eval_run_id:runId},{orderBy:'case_id',limit:EVAL_CASE_ROWS_MAX}),
  tables.count('dq_eval_case_results',{eval_run_id:runId}),
 ]):[[] as Row[],0];
 // Truncated when more rows are stored than returned, or the run itself stored fewer than it had (summary flag).
 return {run,cases:rows.map(publicCase),cases_stored:total,cases_truncated:total>rows.length||run.summary?.reconciliations_truncated===true};
}
