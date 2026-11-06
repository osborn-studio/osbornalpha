// src/lib/evals/store.test.ts
// Spec §6.3 on the in-memory TableClient with the real primary keys: order, 23505 content comparison,
// terminal update with 0 hits (same / different terminal state), resume authentication, case-row scope and cap.
import {describe,expect,it} from 'vitest';
import {TableError} from '../db/table-client';
import {memoryTableClient} from '../db/memory-table-client';
import {EvalError} from './errors';
import {CASES,CASE_ROW_LIMIT,RUNS,caseRowCandidates,caseRowsOf,caseRowsTruncated,evalStore,persistRun,runRowOf} from './store';
import type {EvalStore} from './store';
import type {Database} from '../supabase/database.types';
import type {CaseReport,EvalReport,Gate,Summary} from './types';

const RUN='11111111-1111-4111-8111-111111111111';
const SHA='a'.repeat(64);
const FILES={ref:`reports/evals/${RUN}.json`,sha256:SHA};
const keys={[RUNS]:['run_id'],[CASES]:['eval_run_id','case_id']};
const summaryOf=(gate:Gate,truncated=false):Summary=>({
 population:3,required:3,
 correctness:{pass:1,fail:1,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0},
 coverage:{evaluated:2,evaluated_optional:0,missing_required:1,missing_optional:0,not_visible:0,skipped:0},
 execution:{read_error:0,truncated:0,subset:false},
 thresholds:{max_fail:0,min_coverage_optional:'0.95'},
 gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},
 gate,evidence_class:'truth',reconciliations_truncated:truncated,
});
const kase=(case_id:string,outcome:CaseReport['outcome'],left:string|null='100',right:string|null='100'):CaseReport=>({
 case_id,required:true,outcome,left,right,abs_diff:left&&right?'0':null,rel_diff:left&&right?'0':null,tolerance:'0',provenance:null,
 detail:{locator:{page:28},document_id:{kind:'edgar_accession',value:'0009990601-24-000001'}},
});
const CASES3=[kase('A/pass',{result:'pass'}),kase('B/fail',{result:'fail',reason:'value'},'101','100'),kase('C/missing',{result:'missing'},null,'100')];
const report=(o:Partial<EvalReport>={}):EvalReport=>({
 schema_version:1,run_id:RUN,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',
 set:{id:'facts/synthetic-us',version:1,sha256:'b'.repeat(64),format:'f6',path:'src/lib/evals/fixtures/gold/facts/synthetic-us.json'},
 evaluator_code_version:'c'.repeat(40),dirty:false,started_at:'2026-11-10T00:00:00.000Z',finished_at:'2026-11-10T00:01:00.000Z',
 environment:{db_host:null,app_origin:null,db_state_rev:3},thresholds:{max_fail:0,min_coverage_optional:'0.95'},
 provenance:{verified:{artifacts:false,sources:false}},summary:summaryOf('incomplete'),cases:CASES3,...o,
});
/** Records every store call in order; `fail` lets a test make one call throw. */
function recording(inner:EvalStore,fail:Partial<Record<keyof EvalStore,(arg:unknown)=>Error|null>>={}){
 const calls:string[]=[];
 const wrap=<K extends keyof EvalStore>(k:K)=>(async(...a:unknown[])=>{
  calls.push(k==='insertCaseResult'?`${k}:${(a[0] as {case_id:string}).case_id}`:k);
  const err=fail[k]?.(a[0]);if(err)throw err;
  return (inner[k] as (...x:unknown[])=>Promise<unknown>)(...a);
 }) as EvalStore[K];
 const store:EvalStore={insertRun:wrap('insertRun'),insertCaseResult:wrap('insertCaseResult'),finishRun:wrap('finishRun'),getRun:wrap('getRun'),getCaseResult:wrap('getCaseResult')};
 return {store,calls};
}
const setup=()=>{const tables=memoryTableClient(keys);return {tables,store:evalStore(tables)};};
const code=async(p:Promise<unknown>)=>{try{await p;}catch(e){if(e instanceof EvalError)return e.code;throw e;}return 'resolved';};

describe('case rows',()=>{
 it('are the non-pass results of public official/dual_source runs, in report order, with text decimals and a cloned detail',()=>{
  const rows=caseRowsOf(report());
  expect(rows.map(r=>[r.case_id,r.result,r.reason,r.left_text,r.right_text,r.tolerance])).toEqual([['B/fail','fail','value','101','100','0'],['C/missing','missing',null,null,'100','0']]);
  expect(rows[0].detail).toEqual(CASES3[1].detail);expect(rows[0].detail).not.toBe(CASES3[1].detail);
  expect(caseRowsOf(report({kind:'dual_source'}))).toHaveLength(2);
 });
 it('are empty for restricted sets and for replay/reference/extraction/calibration kinds',()=>{
  expect(caseRowsOf(report({artifact_class:'restricted'}))).toEqual([]);
  for(const kind of ['replay_consistency','reference_regression','extraction_gold','judgment_calibration'] as const)expect(caseRowsOf(report({kind}))).toEqual([]);
 });
 it('cap at CASE_ROW_LIMIT and report truncation; reasons are cut to 64 characters',()=>{
  const many=Array.from({length:CASE_ROW_LIMIT+1},(_,i)=>kase(`F/${String(i).padStart(3,'0')}`,{result:'provenance_incomplete',reason:'x'.repeat(80)}));
  const r=report({cases:many});
  expect(caseRowCandidates(r)).toHaveLength(101);expect(caseRowsOf(r)).toHaveLength(100);expect(caseRowsOf(r)[99].case_id).toBe('F/099');
  expect(caseRowsTruncated(r)).toBe(true);expect(caseRowsTruncated(report())).toBe(false);
  expect(caseRowsOf(r)[0].reason).toBe('x'.repeat(64));
 });
 it('runRowOf maps the report header to a running row',()=>{
  expect(runRowOf(report(),FILES,'ci')).toEqual({run_id:RUN,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',set_id:'facts/synthetic-us',set_version:1,set_sha256:'b'.repeat(64),evaluator_code_version:'c'.repeat(40),started_at:'2026-11-10T00:00:00.000Z',finished_at:null,status:'running',summary:{},report_ref:FILES.ref,report_sha256:SHA,triggered_by:'ci'});
 });
});

describe('persistRun (spec §6.3)',()=>{
 it('inserts the running row, then the case rows, then the terminal update',async()=>{
  const {tables,store}=setup();const rec=recording(store);
  await persistRun(rec.store,report(),FILES,{triggeredBy:'ci'});
  expect(rec.calls).toEqual(['insertRun','insertCaseResult:B/fail','insertCaseResult:C/missing','finishRun']);
  const [run]=tables.rows(RUNS);
  expect([run.status,run.finished_at,run.summary]).toEqual(['incomplete','2026-11-10T00:01:00.000Z',summaryOf('incomplete')]);
  expect(tables.rows(CASES).map(r=>r.case_id)).toEqual(['B/fail','C/missing']);
 });
 it('maps the gate to the terminal status',async()=>{
  for(const [gate,status] of [['pass','passed'],['fail','failed'],['incomplete','incomplete']] as const){
   const {tables,store}=setup();
   await persistRun(store,report({summary:summaryOf(gate)}),FILES,{triggeredBy:'script'});
   expect(tables.rows(RUNS)[0].status).toBe(status);
  }
 });
 it('step 2: a failed run insert is store_write_failed and writes nothing else',async()=>{
  const {tables,store}=setup();const rec=recording(store,{insertRun:()=>new Error('network')});
  expect(await code(persistRun(rec.store,report(),FILES,{triggeredBy:'ci'}))).toBe('store_write_failed');
  expect(rec.calls).toEqual(['insertRun']);expect(tables.rows(CASES)).toEqual([]);
 });
 it('step 2: an existing run_id (23505) is also store_write_failed',async()=>{
  const {store}=setup();await persistRun(store,report(),FILES,{triggeredBy:'ci'});
  expect(await code(persistRun(store,report(),FILES,{triggeredBy:'ci'}))).toBe('store_write_failed');
 });
 it('step 3: 23505 with an identical stored row continues',async()=>{
  const {tables,store}=setup();
  await tables.insert(RUNS,{...runRowOf(report(),FILES,'ci')});
  await tables.insert(CASES,{...caseRowsOf(report())[0]});
  await persistRun(store,report(),FILES,{triggeredBy:'ci',resume:true});
  expect(tables.rows(CASES)).toHaveLength(2);expect(tables.rows(RUNS)[0].status).toBe('incomplete');
 });
 it('step 3: 23505 with any differing field is store_conflict and leaves the run running',async()=>{
  const base=caseRowsOf(report())[0];
  for(const diff of [{left_text:'102'},{reason:'ambiguous'},{tolerance:'0.01'},{detail:{locator:{page:29}}},{result:'unit_mismatch'}]){
   const {tables,store}=setup();
   await tables.insert(RUNS,{...runRowOf(report(),FILES,'ci')});
   await tables.insert(CASES,{...base,...diff});
   expect(await code(persistRun(store,report(),FILES,{triggeredBy:'ci',resume:true}))).toBe('store_conflict');
   expect(tables.rows(RUNS)[0].status).toBe('running');
  }
 });
 it('step 3: a non-23505 case insert failure is store_partial (run stays running, resumable)',async()=>{
  const {tables,store}=setup();
  const rec=recording(store,{insertCaseResult:a=>(a as {case_id:string}).case_id==='C/missing'?new TableError('insert',CASES,'timeout','57014'):null});
  expect(await code(persistRun(rec.store,report(),FILES,{triggeredBy:'ci'}))).toBe('store_partial');
  expect(tables.rows(RUNS)[0].status).toBe('running');expect(tables.rows(CASES).map(r=>r.case_id)).toEqual(['B/fail']);
  await persistRun(store,report(),FILES,{triggeredBy:'ci',resume:true});
  expect(tables.rows(CASES).map(r=>r.case_id)).toEqual(['B/fail','C/missing']);expect(tables.rows(RUNS)[0].status).toBe('incomplete');
 });
 it('step 4: a failed terminal update is store_partial',async()=>{
  const {tables,store}=setup();const rec=recording(store,{finishRun:()=>new Error('crash')});
  expect(await code(persistRun(rec.store,report(),FILES,{triggeredBy:'ci'}))).toBe('store_partial');
  expect(tables.rows(RUNS)[0].status).toBe('running');expect(tables.rows(CASES)).toHaveLength(2);
 });
 it('step 4: 0 hits with the same terminal status and summary succeeds; different status or summary is store_conflict',async()=>{
  const {store}=setup();await persistRun(store,report(),FILES,{triggeredBy:'ci'});
  await expect(store.finishRun(RUN,'incomplete',summaryOf('incomplete'),'2026-11-10T00:09:00.000Z')).resolves.toBeUndefined();
  expect(await code(store.finishRun(RUN,'failed',summaryOf('incomplete'),'2026-11-10T00:01:00.000Z'))).toBe('store_conflict');
  expect(await code(store.finishRun(RUN,'incomplete',{...summaryOf('incomplete'),population:4},'2026-11-10T00:01:00.000Z'))).toBe('store_conflict');
  expect(await code(store.finishRun('22222222-2222-4222-8222-222222222222','passed',summaryOf('pass'),'2026-11-10T00:01:00.000Z'))).toBe('store_conflict');
 });
 it('refuses a report whose reconciliations_truncated disagrees with its case rows, before any write',async()=>{
  const {tables,store}=setup();
  expect(await code(persistRun(store,report({summary:summaryOf('incomplete',true)}),FILES,{triggeredBy:'ci'}))).toBe('store_write_failed');
  expect(tables.rows(RUNS)).toEqual([]);
  const many=Array.from({length:101},(_,i)=>kase(`F/${i}`,{result:'missing'},null,'1'));
  await persistRun(store,report({cases:many,summary:summaryOf('incomplete',true)}),FILES,{triggeredBy:'ci'});
  expect(tables.rows(CASES)).toHaveLength(100);
 });
});

describe('persistRun --resume (spec §6.3 step 5)',()=>{
 it('requires the run row to exist',async()=>{
  const {store}=setup();
  expect(await code(persistRun(store,report(),FILES,{triggeredBy:'ci',resume:true}))).toBe('resume_mismatch');
 });
 it('requires the local report sha256 and ref to equal the stored ones',async()=>{
  const {tables,store}=setup();await tables.insert(RUNS,{...runRowOf(report(),FILES,'ci')});
  expect(await code(persistRun(store,report(),{...FILES,sha256:'d'.repeat(64)},{triggeredBy:'ci',resume:true}))).toBe('resume_mismatch');
  expect(await code(persistRun(store,report(),{...FILES,ref:'reports/evals/other.json'},{triggeredBy:'ci',resume:true}))).toBe('resume_mismatch');
  expect(tables.rows(CASES)).toEqual([]);
 });
 it('is a no-op when the run is already terminal',async()=>{
  const {store}=setup();await persistRun(store,report(),FILES,{triggeredBy:'ci'});
  const rec=recording(store);
  await persistRun(rec.store,report(),FILES,{triggeredBy:'ci',resume:true});
  expect(rec.calls).toEqual(['getRun']);
 });
 it('repeats steps 3–4 for a running row without inserting the run again',async()=>{
  const {tables,store}=setup();await tables.insert(RUNS,{...runRowOf(report(),FILES,'ci')});
  const rec=recording(store);
  await persistRun(rec.store,report(),FILES,{triggeredBy:'ci',resume:true});
  expect(rec.calls).toEqual(['getRun','insertCaseResult:B/fail','insertCaseResult:C/missing','finishRun']);
  expect(tables.rows(RUNS)[0].status).toBe('incomplete');
 });
});

describe('evalStore row mapping',()=>{
 it('getRun / getCaseResult return the contract shapes (extra columns such as created_at are dropped)',async()=>{
  const {tables,store}=setup();
  await persistRun(store,report(),FILES,{triggeredBy:'manual'});
  await tables.update(CASES,{eval_run_id:RUN,case_id:'B/fail'},{created_at:'2026-11-10 00:00:00+00'});
  expect(await store.getRun(RUN)).toEqual({...runRowOf(report(),FILES,'manual'),status:'incomplete',finished_at:'2026-11-10T00:01:00.000Z',summary:summaryOf('incomplete')});
  expect(await store.getCaseResult(RUN,'B/fail')).toEqual(caseRowsOf(report())[0]);
  expect(await store.getRun('22222222-2222-4222-8222-222222222222')).toBeNull();
  expect(await store.getCaseResult(RUN,'nope')).toBeNull();
 });
});

describe('database.types.ts F6 block',()=>{
 it('DqEvalRun / DqEvalCaseResult carry every contract column (compile-time) and nothing else but created_at',()=>{
  const run:Database['public']['Tables']['dq_eval_runs']['Row']={...runRowOf(report(),FILES,'ci'),summary:{}};
  const kase:Database['public']['Tables']['dq_eval_case_results']['Row']={...caseRowsOf(report())[0],created_at:'2026-11-10 00:00:00+00'};
  expect(Object.keys(run).sort()).toEqual(Object.keys(runRowOf(report(),FILES,'ci')).sort());
  expect(Object.keys(kase).filter(k=>k!=='created_at').sort()).toEqual(Object.keys(caseRowsOf(report())[0]).sort());
 });
});
