// src/lib/evals/evals-store.integration.test.ts
// F6 storage on real PostgreSQL (spec §6.2, §5.2, §13.2; critical suite, independent of plan-2 tables):
// the 20261110090000_dq_eval_runs migration replays, every named constraint rejects, case rows restrict
// run deletion, anon/authenticated have no access, decimal text columns round-trip byte-identically
// through pgTableClient. Every row this file writes uses run ids it created and removes them afterwards.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {EvalError} from './errors';
import {evalStore,persistRun} from './store';
import type {EvalStore} from './store';
import type {CaseReport,EvalReport,Summary} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261110090000_dq_eval_runs.sql';
const TABLES=['dq_eval_runs','dq_eval_case_results'];

// Same replay policy as dq-foundation.integration.test.ts (not exported there): one transaction,
// short lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
  }finally{c.release();}
 }
}

type Over=Record<string,unknown>;
const runCols=(run_id:string,o:Over={}):Over=>({
 run_id,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',set_id:'facts/synthetic-us',set_version:1,
 set_sha256:'a'.repeat(64),evaluator_code_version:'b'.repeat(40),started_at:'2026-11-10T00:00:00Z',finished_at:'2026-11-10T00:01:00Z',
 status:'passed',summary:'{}',report_ref:`reports/evals/${run_id}.json`,report_sha256:'c'.repeat(64),triggered_by:'ci',...o,
});
const caseCols=(eval_run_id:string,o:Over={}):Over=>({
 eval_run_id,case_id:'X/revenue',result:'fail',reason:'value',left_text:'101',right_text:'100',abs_diff:'1',rel_diff:'0.0099009900',tolerance:'0',detail:'{}',...o,
});
const insertSql=(table:string,cols:Over)=>{
 const keys=Object.keys(cols);
 return {text:`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,values:keys.map(k=>cols[k])};
};

describe.skipIf(!enabled)('F6 dq_eval_runs / dq_eval_case_results on real PostgreSQL',()=>{
 let admin:Pool;
 const runs:string[]=[];
 const newRun=()=>{const id=randomUUID();runs.push(id);return id;};
 const insRun=(cols:Over)=>{const q=insertSql('dq_eval_runs',cols);return admin.query(q.text,q.values);};
 const insCase=(cols:Over)=>{const q=insertSql('dq_eval_case_results',cols);return admin.query(q.text,q.values);};
 const aRun=async(o:Over={})=>{const id=newRun();await insRun(runCols(id,o));return id;};
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{
  if(admin){
   await admin.query(`delete from public.dq_eval_case_results where eval_run_id=any($1::uuid[])`,[runs]);
   await admin.query(`delete from public.dq_eval_runs where run_id=any($1::uuid[])`,[runs]);
   await admin.end();
  }
 });

 it('creates both tables with RLS enabled and no policies, and replays twice without error',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:{relname:string})=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows)expect(r.relrowsecurity).toBe(true);
  expect((await admin.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).rows[0].n).toBe(0);
  const sql=readFileSync(MIGRATION,'utf8');
  await expect(replayMigration(admin,sql)).resolves.toBeUndefined();
  await expect(replayMigration(admin,sql)).resolves.toBeUndefined();
  expect(sql.replace(/--.*$/gm,'')).not.toMatch(/dq_reconciliations/);   // the header comment names it; no statement may
 },60000);

 it('rejects every named dq_eval_runs constraint and a duplicate run_id',async()=>{
  const bad:[Over,RegExp][]=[
   [{kind:'bogus'},/dq_eval_runs_kind_check/],
   [{module:''},/dq_eval_runs_module_check/],
   [{module:'m'.repeat(33)},/dq_eval_runs_module_check/],
   [{mode:'prod'},/dq_eval_runs_mode_check/],
   [{artifact_class:'secret'},/dq_eval_runs_artifact_class_check/],
   [{set_version:0},/dq_eval_runs_set_version_check/],
   [{set_sha256:'A'.repeat(64)},/dq_eval_runs_set_sha256_check/],
   [{set_sha256:'a'.repeat(63)},/dq_eval_runs_set_sha256_check/],
   [{evaluator_code_version:'b'.repeat(40)+'-dirty'},/dq_eval_runs_evaluator_code_version_check/],
   [{evaluator_code_version:'b'.repeat(39)},/dq_eval_runs_evaluator_code_version_check/],
   [{report_sha256:'z'.repeat(64)},/dq_eval_runs_report_sha256_check/],
   [{status:'done'},/dq_eval_runs_status_check/],
   [{triggered_by:'cron'},/dq_eval_runs_triggered_by_check/],
   [{status:'running'},/dq_eval_runs_running_iff_unfinished/],
   [{status:'passed',finished_at:null},/dq_eval_runs_running_iff_unfinished/],
   [{finished_at:'2026-11-09T23:59:59Z'},/dq_eval_runs_finished_after_started/],
   [{summary:'[]'},/dq_eval_runs_summary_object/],
  ];
  for(const [o,re] of bad)await expect(insRun(runCols(newRun(),o)),JSON.stringify(o)).rejects.toThrow(re);
  const ok=await aRun({status:'running',finished_at:null});
  await expect(insRun(runCols(ok))).rejects.toThrow(/dq_eval_runs_pkey/);
 });

 it('rejects every named dq_eval_case_results constraint, a duplicate key and an unknown run',async()=>{
  const run=await aRun();
  const bad:[Over,RegExp][]=[
   [{case_id:''},/dq_eval_case_results_case_id_check/],
   [{case_id:'c'.repeat(513)},/dq_eval_case_results_case_id_check/],
   [{result:'pass'},/dq_eval_case_results_result_check/],
   [{result:'identical'},/dq_eval_case_results_result_check/],
   [{reason:''},/dq_eval_case_results_reason_check/],
   [{reason:'r'.repeat(65)},/dq_eval_case_results_reason_check/],
   [{left_text:'1e5'},/dq_eval_case_results_left_text_check/],
   [{left_text:'1.'},/dq_eval_case_results_left_text_check/],
   [{left_text:'+1'},/dq_eval_case_results_left_text_check/],
   [{left_text:' 1'},/dq_eval_case_results_left_text_check/],
   [{right_text:'1,000'},/dq_eval_case_results_right_text_check/],
   [{right_text:'.5'},/dq_eval_case_results_right_text_check/],
   [{abs_diff:'-1'},/dq_eval_case_results_abs_diff_check/],
   [{rel_diff:'-0.1'},/dq_eval_case_results_rel_diff_check/],
   [{tolerance:'-0.01'},/dq_eval_case_results_tolerance_check/],
   [{tolerance:'1%'},/dq_eval_case_results_tolerance_check/],
   [{detail:'[]'},/dq_eval_case_results_detail_object/],
  ];
  for(const [i,[o,re]] of bad.entries())await expect(insCase(caseCols(run,{case_id:`bad/${i}`,...o})),JSON.stringify(o)).rejects.toThrow(re);
  await insCase(caseCols(run,{left_text:null,right_text:'-12.5',abs_diff:null,rel_diff:null,reason:null,result:'missing'}));
  await expect(insCase(caseCols(run))).rejects.toThrow(/dq_eval_case_results_pkey/);
  await expect(insCase(caseCols(randomUUID()))).rejects.toThrow(/dq_eval_case_results_eval_run_id_fkey/);
 });

 it('refuses to delete a run that still has case rows (on delete restrict); a run without case rows deletes',async()=>{
  const run=await aRun();await insCase(caseCols(run));
  await expect(admin.query(`delete from public.dq_eval_runs where run_id=$1`,[run])).rejects.toThrow(/dq_eval_case_results_eval_run_id_fkey/);
  const empty=await aRun();
  expect((await admin.query(`delete from public.dq_eval_runs where run_id=$1`,[empty])).rowCount).toBe(1);
 });

 it('grants nothing to anon/authenticated (privileges and real role reads/writes) and select/insert/update/delete to service_role',async()=>{
  const priv=async(role:string,t:string,p:string)=>(await admin.query(`select has_table_privilege($1,'public.'||$2,$3) ok`,[role,t,p])).rows[0].ok;
  for(const role of ['anon','authenticated'])for(const t of TABLES)for(const p of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])
   expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const t of TABLES)for(const p of ['SELECT','INSERT','UPDATE','DELETE'])expect({t,p,ok:await priv('service_role',t,p)}).toEqual({t,p,ok:true});
  const run=await aRun();
  for(const role of ['anon','authenticated'])for(const sql of [`select * from public.dq_eval_runs`,`select * from public.dq_eval_case_results`,insertSql('dq_eval_case_results',caseCols(run,{case_id:`role/${role}`})).text]){
   const c=await admin.connect();
   try{
    await c.query('begin');await c.query(`set local role ${role}`);
    const values=sql.startsWith('insert')?insertSql('dq_eval_case_results',caseCols(run,{case_id:`role/${role}`})).values:[];
    await expect(c.query(sql,values),`${role}: ${sql.slice(0,40)}`).rejects.toMatchObject({code:'42501'});
   }finally{await c.query('rollback');c.release();}
  }
 });

 it('round-trips a 20-digit integer and an 18-decimal value byte-identically through pgTableClient',async()=>{
  const tables=pgTableClient(admin);
  const run=await aRun();
  const row={eval_run_id:run,case_id:'X/precision',result:'fail',reason:'value',left_text:'12345678901234567890',right_text:'-0.123456789012345678',
   abs_diff:'12345678901234567890.123456789012345678',rel_diff:'1.0000000000',tolerance:'0.000000000000000001',detail:{locator:{page:1}}};
  await tables.insert('dq_eval_case_results',row);
  const [back]=await tables.select('dq_eval_case_results',{eval_run_id:run,case_id:'X/precision'});
  for(const k of ['left_text','right_text','abs_diff','rel_diff','tolerance'] as const)expect({k,v:back[k]}).toEqual({k,v:row[k]});
  expect(typeof back.left_text).toBe('string');
  expect(back.detail).toEqual({locator:{page:1}});
 });
});

// ── Task 6: persistRun (spec §6.3) on real PostgreSQL ──

const SUMMARY:Summary={
 population:3,required:3,correctness:{pass:1,fail:1,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0},
 coverage:{evaluated:2,evaluated_optional:0,missing_required:1,missing_optional:0,not_visible:0,skipped:0},execution:{read_error:0,truncated:0,subset:false},
 thresholds:{max_fail:0,min_coverage_optional:'0.95'},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},
 gate:'incomplete',evidence_class:'truth',reconciliations_truncated:false,
};
const storeCase=(case_id:string,outcome:CaseReport['outcome'],left:string|null,right:string|null):CaseReport=>({
 case_id,required:true,outcome,left,right,abs_diff:left&&right?'1':null,rel_diff:left&&right?'0.0099009900':null,tolerance:'0',provenance:null,detail:{locator:{page:28}},
});
const storeReport=(run_id:string):EvalReport=>({
 schema_version:1,run_id,kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',
 set:{id:'facts/synthetic-us',version:1,sha256:'a'.repeat(64),format:'f6',path:'src/lib/evals/fixtures/gold/facts/synthetic-us.json'},
 evaluator_code_version:'b'.repeat(40),dirty:false,started_at:'2026-11-10T00:00:00.000Z',finished_at:'2026-11-10T00:01:00.000Z',
 environment:{db_host:null,app_origin:null,db_state_rev:1},thresholds:{max_fail:0,min_coverage_optional:'0.95'},provenance:{verified:{artifacts:false,sources:false}},
 summary:SUMMARY,
 cases:[storeCase('A/pass',{result:'pass'},'100','100'),storeCase('B/fail',{result:'fail',reason:'value'},'12345678901234567891','12345678901234567890'),storeCase('C/missing',{result:'missing'},null,'100')],
});

describe.skipIf(!enabled)('F6 persistRun on real PostgreSQL (interrupt + resume, concurrent resume)',()=>{
 let admin:Pool;let store:EvalStore;
 const runs:string[]=[];
 const newRunId=()=>{const id=randomUUID();runs.push(id);return id;};
 const filesOf=(id:string)=>({ref:`reports/evals/${id}.json`,sha256:'c'.repeat(64)});
 const state=async(id:string)=>({
  run:(await admin.query(`select status,finished_at is not null finished,summary from public.dq_eval_runs where run_id=$1`,[id])).rows,
  cases:(await admin.query(`select case_id,result,left_text from public.dq_eval_case_results where eval_run_id=$1 order by case_id`,[id])).rows,
 });
 beforeAll(async()=>{
  const s=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:s.adminUrl,max:6});
  store=evalStore(pgTableClient(admin));
 });
 afterAll(async()=>{
  if(admin){
   await admin.query(`delete from public.dq_eval_case_results where eval_run_id=any($1::uuid[])`,[runs]);
   await admin.query(`delete from public.dq_eval_runs where run_id=any($1::uuid[])`,[runs]);
   await admin.end();
  }
 });

 it('persists a run end to end: terminal status, summary, only the non-pass case rows with exact text decimals',async()=>{
  const id=newRunId();
  await persistRun(store,storeReport(id),filesOf(id),{triggeredBy:'ci'});
  const s=await state(id);
  expect(s.run).toEqual([{status:'incomplete',finished:true,summary:SUMMARY}]);
  expect(s.cases).toEqual([{case_id:'B/fail',result:'fail',left_text:'12345678901234567891'},{case_id:'C/missing',result:'missing',left_text:null}]);
  expect((await store.getRun(id))?.report_sha256).toBe('c'.repeat(64));
 });

 it('interrupted after step 3 leaves the run running; --resume completes it without duplicating case rows',async()=>{
  const id=newRunId();
  const crashing:EvalStore={...store,finishRun:async()=>{throw new Error('process killed');}};
  await expect(persistRun(crashing,storeReport(id),filesOf(id),{triggeredBy:'script'})).rejects.toMatchObject({code:'store_partial'});
  let s=await state(id);
  expect(s.run.map(r=>r.status)).toEqual(['running']);expect(s.cases).toHaveLength(2);
  await expect(persistRun(store,storeReport(id),{...filesOf(id),sha256:'d'.repeat(64)},{triggeredBy:'script',resume:true})).rejects.toBeInstanceOf(EvalError);
  await persistRun(store,storeReport(id),filesOf(id),{triggeredBy:'script',resume:true});
  s=await state(id);
  expect(s.run.map(r=>r.status)).toEqual(['incomplete']);expect(s.cases).toHaveLength(2);
 });

 it('interrupted inside step 3 (after the first case row) resumes to the full set of case rows',async()=>{
  const id=newRunId();let n=0;
  const crashing:EvalStore={...store,insertCaseResult:async r=>{if(++n===2)throw new Error('connection reset');await store.insertCaseResult(r);}};
  await expect(persistRun(crashing,storeReport(id),filesOf(id),{triggeredBy:'script'})).rejects.toMatchObject({code:'store_partial'});
  expect((await state(id)).cases.map(r=>r.case_id)).toEqual(['B/fail']);
  await persistRun(store,storeReport(id),filesOf(id),{triggeredBy:'script',resume:true});
  const s=await state(id);
  expect(s.run.map(r=>r.status)).toEqual(['incomplete']);expect(s.cases.map(r=>r.case_id)).toEqual(['B/fail','C/missing']);
 });

 it('two concurrent resumes both succeed with exactly one terminal row and no duplicate case rows',async()=>{
  const id=newRunId();
  const crashing:EvalStore={...store,insertCaseResult:async()=>{throw new Error('crash before any case row');}};
  await expect(persistRun(crashing,storeReport(id),filesOf(id),{triggeredBy:'script'})).rejects.toMatchObject({code:'store_partial'});
  const results=await Promise.allSettled([
   persistRun(evalStore(pgTableClient(admin)),storeReport(id),filesOf(id),{triggeredBy:'script',resume:true}),
   persistRun(evalStore(pgTableClient(admin)),storeReport(id),filesOf(id),{triggeredBy:'script',resume:true}),
  ]);
  expect(results.map(r=>r.status)).toEqual(['fulfilled','fulfilled']);
  const s=await state(id);
  expect(s.run).toEqual([{status:'incomplete',finished:true,summary:SUMMARY}]);
  expect(s.cases.map(r=>r.case_id)).toEqual(['B/fail','C/missing']);
  expect((await admin.query(`select count(*)::int n from public.dq_eval_case_results where eval_run_id=$1`,[id])).rows[0].n).toBe(2);
 });

 it('a conflicting stored case row stops the resume with store_conflict and keeps the run running',async()=>{
  const id=newRunId();
  const crashing:EvalStore={...store,insertCaseResult:async()=>{throw new Error('crash');}};
  await expect(persistRun(crashing,storeReport(id),filesOf(id),{triggeredBy:'script'})).rejects.toMatchObject({code:'store_partial'});
  await admin.query(`insert into public.dq_eval_case_results(eval_run_id,case_id,result,reason,left_text,right_text,abs_diff,rel_diff,tolerance,detail) values($1,'B/fail','fail','value','999','12345678901234567890','1','0.0099009900','0','{"locator":{"page":28}}')`,[id]);
  await expect(persistRun(store,storeReport(id),filesOf(id),{triggeredBy:'script',resume:true})).rejects.toMatchObject({code:'store_conflict'});
  expect((await state(id)).run.map(r=>r.status)).toEqual(['running']);
 });
});
