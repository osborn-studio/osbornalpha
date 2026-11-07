// src/lib/judgments/judgments.integration.test.ts
// F4 Tasks 2–3 (spec §5.1–§5.6, §14.2, acceptance examples 7–10): the judgments migration on real
// PostgreSQL 17. Task 2 (first describe): nine tables, the judgments-calibration bucket, every check
// and trigger, RLS and grants with the real roles. Task 3 (second describe): every §5.6 function.
// Data is set up as the migration owner (the harness admin role bypasses RLS and grants); role
// behaviour is exercised with `set local role` inside a transaction that is always rolled back.
// Rows are never cleaned up (append-only by design; test:db creates a fresh database per run): every
// test uses its own methodology id. Active judgments that are not claimed carry the far-future
// target 2099-01-01, and every claim runs under pg_advisory_lock(F4_CLAIM_LOCK) so the other
// judgments suites (judgments-db.integration, settle.integration) never take this file's queue rows.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {judgmentIdOf} from './contract';
import {inputsHash} from './canonical';
import {settleWindowOf} from './time';
import {operationDigest} from './settlement-digest';
import {F4_FUNCTIONS,INTERNAL_FUNCTION_NAMES,PUBLIC_RPC_NAMES,SERVICE_RPC_NAMES} from './rpc-inventory';
import type {Horizon,SettlementInsert,Target} from './types';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261109150000_judgments.sql';
const TABLES=['judgment_methodologies','judgment_methodology_events','judgments','judgment_settlements','judgment_settle_queue','judgment_calibrations','judgment_calibration_validity','judgment_job_state','judgment_calibration_cohort_members'];
const OPEN_READ=['judgment_methodologies','judgment_methodology_events','judgment_calibration_validity'];
const GATED=['judgments','judgment_settlements','judgment_calibrations'];
const PRIVATE=['judgment_settle_queue','judgment_job_state','judgment_calibration_cohort_members'];
const TRIGGER_FNS=['judgment_methodologies_limited_update()','judgments_append_only()','judgment_settlements_sequence()'];
const ROLES=['anon','authenticated','service_role'];
const F4_CLAIM_LOCK=20261109;
/** Schema-change mutex shared with pgJudgmentsDb (db-contract.ts F4_SCHEMA_LOCK): replayMigration holds it exclusively, every pg-judgments-db call shared. */
const F4_SCHEMA_LOCK=20261110;
const JSONB=new Set(['producer_ref','inputs','claim','condition','horizon','target','realized','evidence','params','params_json','upstream','metrics','reliability','isotonic_segments','query_bounds','state','last_detail','override','retrospective_hint']);
const H=(c:string)=>c.repeat(64);
const hex64=()=>`${randomUUID()}${randomUUID()}`.replaceAll('-','');
const mid=()=>`ztest_${randomUUID().replaceAll('-','').slice(0,16)}`;
const INPUT={kind:'macro_observation',ref:{series_id:'CPI',period_end:'2026-01-31',vintage_id:'v1'},snapshot:{series_id:'CPI',period_end:'2026-01-31',value:3.1,unit:'pct',vintage_id:'v1',available_at:'2026-02-10T13:30:00.000Z'},hash:H('1'),available_at:'2026-02-10T13:30:00.000Z',origin:{publisher:'BLS',adapter:'fixture',locator:'CPI'}};
const CONDITION={resolver:'macro_regime_replay',params:{region:'US',reference_period:'2026-01',macro_methodology_version:'v1',catalog_version:'c1'},predicate:{op:'eq',rhs:'recovery'},text:{zh:'复苏',en:'recovery'}};
const CLAIM={p:0.6,event:{zh:'复苏',en:'recovery'}};

// Same replay policy as facts.integration.test.ts (not exported there): one transaction, short
// lock_timeout, jittered retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; select pg_advisory_xact_lock(${F4_SCHEMA_LOCK}); set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}
type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
/** Runs body as `role` in one transaction on its own connection; always rolls back. */
async function asRole<T>(pool:Pool,role:string,body:(c:PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();
 try{await c.query('begin');await c.query(`set local role ${role}`);return await body(c);}
 finally{await c.query('rollback').catch(()=>{});c.release();}
}
/** Values for a parameterised insert: objects/arrays in jsonb columns are sent as JSON text; text[] columns get JS arrays; strings stay strings. */
const sqlArgs=(cols:Record<string,unknown>)=>{const k=Object.keys(cols);return {k,values:k.map(c=>JSONB.has(c)&&cols[c]!==null&&typeof cols[c]==='object'?JSON.stringify(cols[c]):cols[c])};};

// Column sets for owner-side inserts (Task 2 has no RPCs yet). Defaults: active, retrospective, never due.
const methodologyCols=(o:{id?:string;kind?:string;status?:string;publishable?:boolean}={})=>({methodology_id:o.id??mid(),version:'v1',judgment_type:'synthetic_fact_metric',kind:o.kind??'probability',producer_kind:'rule',subject_types:['macro_region','issuer'],input_kinds:['macro_observation','financial_fact'],markets:null,title_zh:'测试方法',title_en:'Test methodology',doc_path:'docs/methodologies/ztest/v1.md',doc_sha256:H('a'),implementation_sha256:H('a'),params:{grace_days:30},params_json:{},horizon:{unit:'calendar_days',n:30},upstream:{},deps_sha256:H('a'),formula_hash:H('a'),status:o.status??'active',publishable:o.publishable??false,code_version:'abcdef1'});
const judgmentCols=(m:string,b:string,active=true):Record<string,unknown>=>({judgment_id:randomUUID(),subject_type:'macro_region',subject_key:'US',judgment_type:'synthetic_fact_metric',methodology_id:m,methodology_version:'v1',kind:'probability',producer_kind:'rule',producer_ref:{},producer_nonce:'',as_of:'2026-01-02',registered_at:new Date().toISOString(),retrospective:true,
 inputs:active?[INPUT]:[],inputs_hash:H('b'),abstained:!active,abstain_reason:active?null:'no_inputs',claim:active?CLAIM:null,condition:active?CONDITION:null,horizon:active?{unit:'calendar_days',n:30}:null,target:active?{kind:'date',date:'2099-01-01'}:null,label_policy:active?'first_observed':null,
 settle_after:active?'2099-01-01T00:00:00.000Z':null,settle_by:active?'2099-01-31T00:00:00.000Z':null,code_version:'abcdef1',batch_id:b});
const settlementCols=(j:string,b:string,seq:number,kind:string,actor='cron'):Record<string,unknown>=>{const settled=kind==='settled';return {settlement_id:randomUUID(),judgment_id:j,seq,kind,outcome:settled?'hit':null,realized:settled?{value:'recovery',unit:null,from:null,to:null,label_policy:'cutoff_vintage'}:null,evidence:{},resolver:'macro_regime_replay',resolver_version:'1.0.0',reason:settled?null:`test:${kind}`,actor,settled_at:new Date().toISOString(),request_key:`rk:${randomUUID()}`,request_digest:H('c'),code_version:'abcdef1',batch_id:b};};
const queueCols=(j:string)=>({judgment_id:j,settle_after:'2099-01-01T00:00:00.000Z',settle_by:'2099-01-31T00:00:00.000Z',label_policy:'first_observed',next_attempt_at:'2099-01-01T00:00:00.000Z'});
const eventCols=(m:string,seq:number)=>({event_id:randomUUID(),methodology_id:m,version:'v1',seq,event:'registered',status:'active',publishable:false,formula_hash:H('a'),code_version:'abcdef1',actor:'script',reason:null,occurred_at:new Date().toISOString()});
const calibrationCols=(m:string,b:string):Record<string,unknown>=>{const id=randomUUID();return {calibration_id:id,methodology_id:m,methodology_version:'v1',scope_type:'all',scope_key:'',window_from:'2023-01-01',window_to:'2026-01-01',n_registered:10,n_settled:8,n_independent:5,n_void:1,n_retrospective_excluded:1,threshold_n:100,ece_max:0.1,kind:'probability',state:'insufficient',valid_until:'2099-01-01T00:00:00.000Z',validity_revision:1,metrics:{},reliability:[],isotonic_segments:null,cohort_path:`judgments-calibration/${id}.json`,cohort_sha256:H('d'),query_bounds:{window_from:'2023-01-01',window_to:'2026-01-01',registered_at_lte:'2026-01-02T00:00:00.000Z',settled_at_lte:'2026-01-02T00:00:00.000Z',frozen_at:'2026-01-02T00:00:00.000Z',n:10},fingerprint:hex64(),algorithm_version:'calib/1',code_version:'abcdef1',computed_at:new Date().toISOString(),batch_id:b};};

describe.skipIf(!enabled)('F4 judgments migration: tables, checks, triggers, RLS (Task 2)',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const insert=async(table:string,cols:Record<string,unknown>)=>{const {k,values}=sqlArgs(cols);await q(`insert into public.${table}(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,values);return cols;};
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ts-judgments','judgments.ztest')`,[id]);return id;};
 const methodology=async(o:{kind?:string;status?:string;publishable?:boolean}={})=>{
  const cols=await insert('judgment_methodologies',methodologyCols(o));
  await q(`insert into public.judgment_calibration_validity(methodology_id,version) values($1,'v1')`,[cols.methodology_id]);
  return String(cols.methodology_id);
 };
 const judgment=async(m:string,b:string,active=true)=>(await insert('judgments',judgmentCols(m,b,active))).judgment_id as string;

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates nine RLS tables, the private bucket, the spec indexes, select-only grants, trigger functions no client role can execute, and replays',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect(r.relrowsecurity).toBe(true);
  expect(await q(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='judgments-calibration'`)).toEqual([{id:'judgments-calibration',public:false,file_size_limit:'52428800',allowed_mime_types:['application/json']}]);
  const idx=(await q(`select indexdef from pg_indexes where schemaname='public' and tablename=any($1)`,[TABLES])).map(r=>String(r.indexdef));
  for(const re of [/public\.judgments USING gin \(inputs jsonb_path_ops\)/,/public\.judgments USING btree \(subject_type, subject_key, judgment_type, as_of DESC, registered_at DESC, judgment_id\)/,/public\.judgments USING btree \(methodology_id, methodology_version, as_of\) WHERE \(NOT abstained\)/,
   /public\.judgment_settle_queue USING btree \(next_attempt_at, judgment_id\) WHERE \(closed_at IS NULL\)/,/public\.judgment_settlements USING btree \(settled_at DESC\)/,/public\.judgment_calibrations USING btree \(methodology_id, methodology_version, scope_type, scope_key, computed_at DESC\)/,/public\.judgment_methodology_events USING btree \(methodology_id, version, occurred_at\)/])
   expect({re:String(re),found:idx.some(d=>re.test(d))}).toEqual({re:String(re),found:true});
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const role of ROLES)for(const t of TABLES)for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  for(const t of TABLES)expect({t,ok:await priv('service_role',t,'SELECT')}).toEqual({t,ok:true});
  for(const role of ['anon','authenticated']){
   for(const t of [...OPEN_READ,...GATED])expect({role,t,ok:await priv(role,t,'SELECT')}).toEqual({role,t,ok:true});
   for(const t of PRIVATE)expect({role,t,ok:await priv(role,t,'SELECT')}).toEqual({role,t,ok:false});
  }
  // P3-01: the trigger functions are not callable by any client role (PUBLIC's default EXECUTE is revoked too).
  for(const f of TRIGGER_FNS){
   for(const role of ROLES)expect({f,role,ok:await one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,`public.${f}`])}).toEqual({f,role,ok:false});
   expect({f,public:await one(`select exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=$1::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') v`,[`public.${f}`])}).toEqual({f,public:false});
  }
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
 },30000);

 it('checks: judgment shape, inputs, settle order, public subject and producer kinds, FKs; settlement outcome/reason/actor/key; calibration state by kind; events; queue; job keys',async()=>{
  const m=await methodology();const b=await batch();
  await judgment(m,b);await judgment(m,b,false);
  const bad:[string,Record<string,unknown>,RegExp][]=[
   ['judgments',{...judgmentCols(m,b),claim:null},/judgments_active_shape/],
   ['judgments',{...judgmentCols(m,b,false),abstain_reason:null},/judgments_active_shape/],
   ['judgments',{...judgmentCols(m,b,false),label_policy:'first_observed'},/judgments_active_shape/],
   ['judgments',{...judgmentCols(m,b),inputs:[]},/judgments_active_has_inputs/],
   ['judgments',{...judgmentCols(m,b,false),inputs:{}},/judgments_inputs_check/],
   ['judgments',{...judgmentCols(m,b),settle_by:'2098-12-31T00:00:00.000Z'},/judgments_settle_order/],
   ['judgments',{...judgmentCols(m,b),subject_type:'security'},/judgments_subject_type_check/],
   ['judgments',{...judgmentCols(m,b),subject_key:''},/judgments_subject_key_check/],
   ['judgments',{...judgmentCols(m,b),producer_kind:'human'},/judgments_producer_kind_check/],
   ['judgments',{...judgmentCols(m,b),inputs_hash:'xyz'},/judgments_inputs_hash_check/],
   ['judgments',{...judgmentCols(m,b),code_version:'abc'},/judgments_code_version_check/],
   ['judgments',{...judgmentCols(m,b),methodology_id:mid()},/judgments_methodology_id_methodology_version_fkey/],
   ['judgments',{...judgmentCols(m,b),batch_id:randomUUID()},/judgments_batch_id_fkey/],
   ['judgment_methodologies',{...methodologyCols(),methodology_id:'Bad-Id'},/judgment_methodologies_methodology_id_check/],
   ['judgment_methodologies',{...methodologyCols(),version:'1'},/judgment_methodologies_version_check/],
   ['judgment_methodologies',{...methodologyCols(),formula_hash:'x'},/judgment_methodologies_formula_hash_check/],
   ['judgment_methodologies',{...methodologyCols(),horizon:[]},/judgment_methodologies_horizon_check/],
   ['judgment_methodologies',{...methodologyCols(),producer_kind:'oracle'},/judgment_methodologies_producer_kind_check/],
   ['judgment_methodology_events',{...eventCols(m,1),actor:'cron'},/judgment_methodology_events_actor_check/],
   ['judgment_methodology_events',{...eventCols(m,0)},/judgment_methodology_events_seq_check/],
   ['judgment_methodology_events',eventCols(mid(),1),/judgment_methodology_events_methodology_id_version_fkey/],
   ['judgment_calibrations',{...calibrationCols(m,b),kind:'score',state:'calibrated'},/judgment_calibrations_state_by_kind/],
   ['judgment_calibrations',{...calibrationCols(m,b),kind:'probability',state:'evaluated'},/judgment_calibrations_state_by_kind/],
   ['judgment_calibrations',{...calibrationCols(m,b),scope_type:'planet'},/judgment_calibrations_scope_type_check/],
   ['judgment_job_state',{job:'',state:{}},/judgment_job_state_job_check/],
   ['judgment_job_state',{job:'x',state:[]},/judgment_job_state_state_check/],
  ];
  for(const [t,cols,re] of bad)await expect(insert(t,cols)).rejects.toThrow(re);
  await insert('judgment_methodology_events',eventCols(m,1));
  await expect(insert('judgment_methodology_events',eventCols(m,1))).rejects.toThrow(/judgment_methodology_events_methodology_id_version_seq_key/);
  await insert('judgment_calibrations',{...calibrationCols(m,b),kind:'score',state:'evaluated'});
  const c=await insert('judgment_calibrations',calibrationCols(m,b));
  await expect(insert('judgment_calibrations',{...calibrationCols(m,b),fingerprint:c.fingerprint})).rejects.toThrow(/judgment_calibrations_fingerprint_key/);
  const j=await judgment(m,b);
  const sbad:[Record<string,unknown>,RegExp][]=[
   [{...settlementCols(j,b,1,'settled'),outcome:null},/settlements_outcome_iff_settled/],
   [{...settlementCols(j,b,1,'void'),outcome:'hit'},/settlements_outcome_iff_settled/],
   [{...settlementCols(j,b,1,'void'),realized:{value:1}},/settlements_outcome_iff_settled/],
   [{...settlementCols(j,b,1,'void'),reason:null},/settlements_reason_unless_settled/],
   [{...settlementCols(j,b,1,'settled'),actor:'admin:nope'},/judgment_settlements_actor_check/],
   [{...settlementCols(j,b,1,'settled'),request_key:'short'},/judgment_settlements_request_key_check/],
   [{...settlementCols(j,b,1,'settled'),request_digest:'x'},/judgment_settlements_request_digest_check/],
   [{...settlementCols(j,b,1,'settled'),realized:[]},/judgment_settlements_realized_check/],
  ];
  for(const [cols,re] of sbad)await expect(insert('judgment_settlements',cols)).rejects.toThrow(re);
  const s=await insert('judgment_settlements',settlementCols(j,b,1,'settled'));
  await expect(insert('judgment_settlements',{...settlementCols(j,b,2,'withdrawn',`admin:${randomUUID()}`),request_key:s.request_key})).rejects.toThrow(/judgment_settlements_request_key_key/);
  await expect(insert('judgment_settle_queue',{...queueCols(j),last_status:'weird'})).rejects.toThrow(/judgment_settle_queue_last_status_check/);
  await insert('judgment_settle_queue',queueCols(j));
  expect(await q(`select attempts,last_detail,closed_at,lease_token from public.judgment_settle_queue where judgment_id=$1`,[j])).toEqual([{attempts:0,last_detail:{},closed_at:null,lease_token:null}]);
 });

 it('judgment_methodologies: only status, publishable, synced_at and code_version may change; created_at is immutable; no delete',async()=>{
  const m=await methodology();
  await q(`update public.judgment_methodologies set status='retired',publishable=true,synced_at=now()+interval '1 minute',code_version='bcdefa2' where methodology_id=$1`,[m]);
  expect((await q(`select status,publishable,code_version from public.judgment_methodologies where methodology_id=$1`,[m]))[0]).toEqual({status:'retired',publishable:true,code_version:'bcdefa2'});
  for(const set of [`title_en='x'`,`formula_hash='${H('f')}'`,`created_at=now()-interval '1 day'`,`params='{"grace_days":7}'`,`horizon='{"unit":"calendar_days","n":7}'`,`subject_types=array['issuer']`,`kind='score'`])
   expect({set,e:await fails(q(`update public.judgment_methodologies set ${set} where methodology_id=$1`,[m]))}).toMatchObject({set,e:{code:'23514',message:'append_only:judgment_methodologies'}});
  expect(await fails(q(`delete from public.judgment_methodologies where methodology_id=$1`,[m]))).toMatchObject({code:'23514',message:'append_only:judgment_methodologies'});
 });

 it('append-only: judgments, settlements, methodology events and calibrations refuse update, delete and truncate',async()=>{
  const m=await methodology();const b=await batch();const j=await judgment(m,b);
  const s=await insert('judgment_settlements',settlementCols(j,b,1,'settled'));
  const e=await insert('judgment_methodology_events',eventCols(m,1));
  const c=await insert('judgment_calibrations',calibrationCols(m,b));
  const cases:[string,string,string][]=[['judgments','judgment_id',j],['judgment_settlements','settlement_id',String(s.settlement_id)],['judgment_methodology_events','event_id',String(e.event_id)],['judgment_calibrations','calibration_id',String(c.calibration_id)]];
  for(const [t,k,id] of cases){
   expect(await fails(q(`update public.${t} set ${k}=${k} where ${k}=$1`,[id]))).toMatchObject({code:'23514',message:`append_only:${t}`});
   expect(await fails(q(`delete from public.${t} where ${k}=$1`,[id]))).toMatchObject({code:'23514',message:`append_only:${t}`});
  }
  // truncate: a statement-level trigger on all four; exercised (inside a rolled-back transaction) on the one table nothing references
  const truncTriggers=(await q(`select tgrelid::regclass::text t from pg_trigger where not tgisinternal and (tgtype & 32) <> 0 and tgrelid = any(array['public.judgments','public.judgment_settlements','public.judgment_methodology_events','public.judgment_calibrations']::regclass[])`)).map(r=>r.t).sort();
  expect(truncTriggers).toEqual(['judgment_calibrations','judgment_methodology_events','judgment_settlements','judgments']);
  const conn=await admin.connect();
  try{
   await conn.query(`begin; set local lock_timeout='3s'`);
   expect(await fails(conn.query('truncate public.judgment_calibrations'))).toMatchObject({code:'23514',message:'append_only:judgment_calibrations'});
  }finally{await conn.query('rollback').catch(()=>{});conn.release();}
 });

 it('settlement_sequence: seq = 1 + max, the allowed transitions, admin-only ones by actor, never on an abstained judgment',async()=>{
  const m=await methodology();const b=await batch();const A=`admin:${randomUUID()}`;
  const ins=(j:string,seq:number,kind:string,actor='cron')=>insert('judgment_settlements',settlementCols(j,b,seq,kind,actor));
  const refused=async(p:Promise<unknown>)=>expect(await fails(p)).toMatchObject({code:'23514',message:expect.stringMatching(/^settlement_sequence/)});
  // spec §5.3 example: settled(1) → withdrawn(2) → reopened(3) → settled(4)
  const a=await judgment(m,b);
  await refused(ins(a,2,'settled'));
  await refused(ins(a,1,'withdrawn',A));await refused(ins(a,1,'reopened',A));
  await ins(a,1,'settled');
  await refused(ins(a,2,'settled'));await refused(ins(a,2,'void'));await refused(ins(a,2,'reopened',A));
  await refused(ins(a,2,'withdrawn'));await refused(ins(a,2,'withdrawn','script'));
  await refused(ins(a,3,'withdrawn',A));
  await ins(a,2,'withdrawn',A);
  await refused(ins(a,3,'settled'));await refused(ins(a,3,'reopened','script'));
  await ins(a,3,'reopened',A);
  await refused(ins(a,4,'withdrawn',A));await refused(ins(a,4,'reopened',A));
  await ins(a,4,'settled');
  expect((await q(`select seq,kind from public.judgment_settlements where judgment_id=$1 order by seq`,[a])).map(r=>`${r.seq}:${r.kind}`)).toEqual(['1:settled','2:withdrawn','3:reopened','4:settled']);
  // spec §5.3 example: void(1) → reopened(2) → settled(3); reopened → void is allowed as well
  const v=await judgment(m,b);
  await ins(v,1,'void');
  await refused(ins(v,2,'settled'));await refused(ins(v,2,'reopened'));await refused(ins(v,2,'withdrawn',A));
  await ins(v,2,'reopened',A);await ins(v,3,'void');await ins(v,4,'reopened',A);await ins(v,5,'settled');
  const ab=await judgment(m,b,false);
  await refused(ins(ab,1,'void'));
 });

 it('RLS with real roles: anon/authenticated read publishable rows only and never the queue or job state; no role writes directly (acceptance 7, denial half)',async()=>{
  const pub=await methodology({publishable:true});const hidden=await methodology();const b=await batch();
  const jp=await judgment(pub,b);const jq=await judgment(hidden,b);
  for(const j of [jp,jq]){await insert('judgment_settlements',settlementCols(j,b,1,'settled'));await insert('judgment_settle_queue',queueCols(j));}
  await insert('judgment_calibrations',calibrationCols(pub,b));await insert('judgment_calibrations',calibrationCols(hidden,b));
  await insert('judgment_methodology_events',eventCols(hidden,1));
  await insert('judgment_job_state',{job:`produce:${hidden}@v1`,state:{}});
  for(const role of ['anon','authenticated']){
   const seen=await asRole(admin,role,async c=>{
    const n=async(sql:string,v:unknown[])=>Number((await c.query(sql,v)).rows[0].n);
    return {
     jIds:(await c.query(`select judgment_id from public.judgments where judgment_id=any($1::uuid[])`,[[jp,jq]])).rows.map(r=>r.judgment_id),
     s:await n(`select count(*) n from public.judgment_settlements where judgment_id=any($1::uuid[])`,[[jp,jq]]),
     c:await n(`select count(*) n from public.judgment_calibrations where methodology_id=any($1)`,[[pub,hidden]]),
     m:await n(`select count(*) n from public.judgment_methodologies where methodology_id=any($1)`,[[pub,hidden]]),
     e:await n(`select count(*) n from public.judgment_methodology_events where methodology_id=$1`,[hidden]),
     v:await n(`select count(*) n from public.judgment_calibration_validity where methodology_id=any($1)`,[[pub,hidden]]),
    };
   });
   expect({role,...seen}).toEqual({role,jIds:[jp],s:1,c:1,m:2,e:1,v:2});
   for(const t of PRIVATE)expect({role,t,e:await fails(asRole(admin,role,c=>c.query(`select * from public.${t} limit 1`)))}).toMatchObject({role,t,e:{code:'42501'}});
   expect(await fails(asRole(admin,role,c=>c.query(`insert into public.judgments select * from public.judgments where judgment_id=$1`,[jp])))).toMatchObject({code:'42501'});
  }
  expect(await asRole(admin,'service_role',async c=>Number((await c.query(`select count(*) n from public.judgments where judgment_id=any($1::uuid[])`,[[jp,jq]])).rows[0].n))).toBe(2);
  for(const t of PRIVATE)await asRole(admin,'service_role',c=>c.query(`select * from public.${t} limit 1`));
  // acceptance example 7 (denial half; Task 3 adds the register_judgment half)
  const {k,values}=sqlArgs(judgmentCols(pub,b));
  expect(await fails(asRole(admin,'service_role',c=>c.query(`insert into public.judgments(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,values)))).toMatchObject({code:'42501'});
  for(const [t,set] of [['judgment_settle_queue','attempts=attempts'],['judgment_calibration_validity','revision=revision'],['judgment_job_state','state=state'],['judgment_methodologies','synced_at=synced_at']])
   expect({t,e:await fails(asRole(admin,'service_role',c=>c.query(`update public.${t} set ${set}`)))}).toMatchObject({t,e:{code:'42501'}});
  expect(await fails(asRole(admin,'service_role',c=>c.query(`delete from public.judgment_settle_queue where judgment_id=$1`,[jq])))).toMatchObject({code:'42501'});
  expect(await fails(asRole(admin,'service_role',c=>c.query(`insert into public.judgment_job_state(job,state) values('x','{}')`)))).toMatchObject({code:'42501'});
 });

 it('publishable toggles anon visibility of judgments, settlements and calibrations immediately (acceptance 8, direct select)',async()=>{
  const m=await methodology();const b=await batch();const j=await judgment(m,b);
  await insert('judgment_settlements',settlementCols(j,b,1,'settled'));await insert('judgment_calibrations',calibrationCols(m,b));
  const counts=()=>asRole(admin,'anon',async c=>{
   const n=async(sql:string)=>Number((await c.query(sql,[m,j])).rows[0].n);
   return [await n(`select count(*) n from public.judgments where methodology_id=$1 and judgment_id=$2`),await n(`select count(*) n from public.judgment_settlements where judgment_id=$2 and $1::text is not null`),await n(`select count(*) n from public.judgment_calibrations where methodology_id=$1 and $2::uuid is not null`)];
  });
  expect(await counts()).toEqual([0,0,0]);
  await q(`update public.judgment_methodologies set publishable=true where methodology_id=$1`,[m]);
  expect(await counts()).toEqual([1,1,1]);
  await q(`update public.judgment_methodologies set publishable=false where methodology_id=$1`,[m]);
  expect(await counts()).toEqual([0,0,0]);
 });
});

describe.skipIf(!enabled)('F4 judgments functions (Task 3)',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const serverNow=async()=>(await one(`select public.judgments_server_time() v`) as Date).toISOString();
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ts-judgments','judgments.ztest')`,[id]);return id;};
 type MOpts={id?:string;kind?:string;status?:string;publishable?:boolean;params?:Record<string,unknown>;horizon?:Record<string,unknown>;inputKinds?:string[]};
 const methodologyRow=(o:MOpts={}):Record<string,unknown>=>({...methodologyCols(o),...(o.params?{params:o.params}:{}),...(o.horizon?{horizon:o.horizon}:{}),...(o.inputKinds?{input_kinds:o.inputKinds}:{})});
 const sync=(row:Record<string,unknown>,actor='script',reason:string|null=null)=>one(`select public.sync_methodology($1::jsonb,$2,$3) v`,[JSON.stringify(row),actor,reason]);
 const syncNew=async(o:MOpts={})=>{const row=methodologyRow(o);await sync(row);return String(row.methodology_id);};
 type JOpts={subjectType?:string;subjectKey?:string;asOf?:string;target?:Record<string,unknown>;horizon?:Record<string,unknown>;params?:Record<string,number|string>;abstained?:boolean;hint?:string|null;inputs?:Record<string,unknown>[];labelPolicy?:string};
 /** A register_judgment payload whose ids, hashes and settle window come from the Task 1 TS twins. */
 const judgmentRow=(m:string,b:string,o:JOpts={})=>{
  const active=!o.abstained;
  const inputs=o.inputs??[{...INPUT,ref:{...INPUT.ref,series_id:`S${randomUUID().slice(0,8)}`}}];
  const inputs_hash=inputsHash(inputs as never);
  const subject_type=o.subjectType??'macro_region',subject_key=o.subjectKey??'US',as_of=o.asOf??'2026-01-02';
  const target=o.target??{kind:'date',date:'2099-01-01'};const horizon=o.horizon??{unit:'calendar_days',n:30};
  const win=active?settleWindowOf(target as unknown as Target,horizon as unknown as Horizon,o.params??{grace_days:30}):null;
  const label_policy=active?(o.labelPolicy??'first_observed'):null;
  const judgment_id=judgmentIdOf({subject_type:subject_type as never,subject_key,judgment_type:'synthetic_fact_metric',methodology_id:m,methodology_version:'v1',as_of,inputs_hash,producer_nonce:''});
  const row={judgment_id,subject_type,subject_key,judgment_type:'synthetic_fact_metric',methodology_id:m,methodology_version:'v1',kind:'probability',producer_kind:'rule',producer_ref:{},producer_nonce:'',as_of,inputs,inputs_hash,
   abstained:!active,abstain_reason:active?null:'no_inputs',claim:active?CLAIM:null,condition:active?CONDITION:null,horizon:active?horizon:null,target:active?target:null,label_policy,
   settle_after:win?.settle_after??null,settle_by:win?.settle_by??null,code_version:'abcdef1',batch_id:b,retrospective_hint:{label_available_at:o.hint??null}};
  return {row:row as Record<string,unknown>,queue:win?{settle_after:win.settle_after,settle_by:win.settle_by,label_policy}:null};
 };
 const register=(r:{row:Record<string,unknown>;queue:unknown})=>one(`select public.register_judgment($1::jsonb,$2::jsonb) v`,[JSON.stringify(r.row),r.queue===null?null:JSON.stringify(r.queue)]);
 const DUE={kind:'date',date:'2026-01-10'};
 const sRow=(b:string,o:Partial<SettlementInsert>={}):SettlementInsert=>({kind:'settled',outcome:'hit',realized:{value:'recovery',unit:null,from:null,to:null,label_policy:'first_observed'},evidence:{observed:true},resolver:'macro_regime_replay',resolver_version:'1.0.0',reason:null,actor:'cron',code_version:'abcdef1',batch_id:b,...o});
 const append=(j:string,token:string|null,key:string,row:Record<string,unknown>)=>one(`select public.append_settlement($1,$2,$3,$4::jsonb) v`,[j,token,key,JSON.stringify(row)]);
 const appendOp=(j:string,token:string|null,key:string,row:SettlementInsert)=>append(j,token,key,{...row,request_digest:operationDigest(j,row)});
 const CLAIM_ROWS=(args:string)=>`select q.* from jsonb_populate_recordset(null::public.judgment_settle_queue, public.claim_due_judgments(${args})) q`;   // E-03: the function returns ONE jsonb array
const claim=async(limit=100,lease=600)=>q(CLAIM_ROWS('$1,$2'),[limit,lease]);
 const release=(j:string,token:string|null,patch:Record<string,unknown>)=>q(`select public.release_lease($1,$2,$3::jsonb)`,[j,token,JSON.stringify(patch)]);
 const park=(j:string,token:string)=>release(j,token,{last_status:'pending',last_detail:{},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0});
 /** Cross-file mutex for claims (see file header). */
 async function withClaimLock<T>(fn:()=>Promise<T>):Promise<T>{
  const c=await admin.connect();
  try{await c.query('select pg_advisory_lock($1)',[F4_CLAIM_LOCK]);return await fn();}
  finally{await c.query('select pg_advisory_unlock($1)',[F4_CLAIM_LOCK]).catch(()=>{});c.release();}
 }
 const waitBlocked=async(pid:number)=>{
  for(const deadline=Date.now()+3000;;){
   if(Number(await one(`select count(*)::int v from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid]))>=1)return;
   if(Date.now()>deadline)throw new Error(`nothing blocked behind pid ${pid}`);
   await pause(20);
  }
 };
 /** Registers a due judgment, claims it and settles it (seq 1); caller holds the claim lock. */
 const settledJudgment=async(m:string,b:string)=>{
  const r=judgmentRow(m,b,{target:DUE});await register(r);const j=String(r.row.judgment_id);
  const t=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
  expect(await appendOp(j,t,`${b}:${j}:1`,sRow(b))).toEqual({seq:1,status:'applied'});
  return j;
 };
 const asService=async<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>=>{
  const c=await admin.connect();
  try{await c.query('begin');await c.query('set local role service_role');const out=await fn(c);await c.query('commit');return out;}
  catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{c.release();}
 };

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 // Q1-06: the privilege assertions derive from the one inventory (rpc-inventory.ts); a function missing there fails here.
 const READS:readonly string[]=PUBLIC_RPC_NAMES;
 const WRITES:readonly string[]=SERVICE_RPC_NAMES;
 const INTERNAL:readonly string[]=INTERNAL_FUNCTION_NAMES;
 const SIG:Readonly<Record<string,string>>=F4_FUNCTIONS;

 it('defines judgment_envelope and every §5.6 function with the declared security, search_path and execute grants; the whole file replays',async()=>{
  expect((await q(`select a.attname from pg_attribute a join pg_type t on t.typrelid=a.attrelid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname='judgment_envelope' and a.attnum>0 order by a.attnum`)).map(r=>r.attname)).toEqual(['judgment','settlement','calibration','calibration_valid','methodology_state']);
  const names=[...READS,...WRITES,...INTERNAL];
  const procs=await q(`select p.proname n,p.prosecdef d,p.proconfig c from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=any($1)`,[names]);
  expect(procs.map(p=>p.n).sort()).toEqual([...names].sort());
  for(const p of procs)expect({n:p.n,d:p.d,c:p.c}).toEqual({n:p.n,d:WRITES.includes(p.n),c:['search_path=""']});
  const fn=(role:string,name:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,`public.${name}${SIG[name]}`]);
  for(const n of READS)for(const role of ROLES)expect({n,role,ok:await fn(role,n)}).toEqual({n,role,ok:true});
  for(const n of WRITES){for(const role of ['anon','authenticated'])expect({n,role,ok:await fn(role,n)}).toEqual({n,role,ok:false});expect({n,ok:await fn('service_role',n)}).toEqual({n,ok:true});}
  for(const n of INTERNAL)for(const role of ROLES)expect({n,role,ok:await fn(role,n)}).toEqual({n,role,ok:false});
  expect(await fails(asRole(admin,'anon',c=>c.query(`select public.set_job_state('x',null,'{}')`)))).toMatchObject({code:'42501'});
  expect(await one(`select public.judgments_server_time() = now() v`)).toBe(true);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
 },30000);

 it('sync_methodology: registered, resynced, status_changed, publishable_changed (two events when both change); created_at fixed; formula_hash_drift; methodology_state_at',async()=>{
  const row=methodologyRow({status:'draft'});const m=String(row.methodology_id);
  expect(await sync(row)).toEqual({changed:true,seq:1});
  expect(await q(`select revision,reason from public.judgment_calibration_validity where methodology_id=$1`,[m])).toEqual([{revision:'1',reason:'initial'}]);
  const first=(await q(`select created_at,synced_at from public.judgment_methodologies where methodology_id=$1`,[m]))[0];
  await pause(5);
  expect(await sync(row)).toEqual({changed:false,seq:2});
  const second=(await q(`select created_at,synced_at from public.judgment_methodologies where methodology_id=$1`,[m]))[0];
  expect(second.created_at.getTime()).toBe(first.created_at.getTime());
  expect(second.synced_at.getTime()).toBeGreaterThan(first.synced_at.getTime());
  expect(await sync({...row,status:'active'})).toEqual({changed:true,seq:3});
  expect(await sync({...row,status:'active',publishable:true},`admin:${randomUUID()}`,'licence confirmed')).toEqual({changed:true,seq:4});
  expect(await sync({...row,status:'retired',publishable:false})).toEqual({changed:true,seq:6});
  expect(await sync({...row,status:'retired',code_version:'fedcba9'})).toEqual({changed:false,seq:7});   // code_version is run metadata
  expect((await q(`select seq,event,status,publishable from public.judgment_methodology_events where methodology_id=$1 order by seq`,[m])).map(r=>`${r.seq}:${r.event}:${r.status}:${r.publishable}`)).toEqual(
   ['1:registered:draft:false','2:resynced:draft:false','3:status_changed:active:false','4:publishable_changed:active:true','5:status_changed:retired:true','6:publishable_changed:retired:false','7:resynced:retired:false']);
  expect((await q(`select status,publishable,code_version from public.judgment_methodologies where methodology_id=$1`,[m]))[0]).toEqual({status:'retired',publishable:false,code_version:'fedcba9'});
  expect(await fails(sync({...row,status:'retired',formula_hash:H('f')}))).toMatchObject({code:'P0001',message:expect.stringMatching(/^formula_hash_drift/)});
  expect(await fails(sync({...row,status:'retired',title_en:'Renamed'}))).toMatchObject({code:'P0001',message:expect.stringMatching(/^formula_hash_drift/)});
  expect(await fails(sync(row,'cron'))).toMatchObject({code:'23514'});   // event actor check; nothing changes
  expect((await q(`select status from public.judgment_methodologies where methodology_id=$1`,[m]))[0].status).toBe('retired');
  const at=async(cutoff:string)=>(await q(`select (public.methodology_state_at($1,'v1',$2::timestamptz)).*`,[m,cutoff]))[0];
  expect(await at('2000-01-01T00:00:00.000Z')).toMatchObject({event_id:null});
  expect(await at(new Date(Date.now()+60_000).toISOString())).toMatchObject({seq:7,event:'resynced',status:'retired'});
 });

 it('register_judgment: judgment and queue row in one transaction as service_role, server registered_at, the three retrospective rules, abstained without queue, 23505 unchanged (acceptance 7, RPC half)',async()=>{
  const m=await syncNew();const b=await batch();
  const today=String(await one(`select ((now() at time zone 'UTC')::date)::text v`));
  const p=judgmentRow(m,b,{asOf:today});
  const before=await serverNow();
  const res=await asService(async c=>(await c.query(`select public.register_judgment($1::jsonb,$2::jsonb) v`,[JSON.stringify(p.row),JSON.stringify(p.queue)])).rows[0].v);
  expect(res).toMatchObject({judgment_id:p.row.judgment_id,retrospective:false});
  expect(Date.parse(res.registered_at)).toBeGreaterThanOrEqual(Date.parse(before));
  const stored=(await q(`select registered_at,retrospective from public.judgments where judgment_id=$1`,[p.row.judgment_id]))[0];
  expect(stored.registered_at.getTime()).toBe(Date.parse(res.registered_at));
  const qr=(await q(`select settle_after,settle_by,label_policy,next_attempt_at,attempts,closed_at,lease_token,last_status from public.judgment_settle_queue where judgment_id=$1`,[p.row.judgment_id]))[0];
  expect({...qr,settle_after:qr.settle_after.toISOString(),settle_by:qr.settle_by.toISOString(),next_attempt_at:qr.next_attempt_at.toISOString()}).toEqual({settle_after:'2099-01-01T00:00:00.000Z',settle_by:'2099-01-31T00:00:00.000Z',label_policy:'first_observed',next_attempt_at:'2099-01-01T00:00:00.000Z',attempts:0,closed_at:null,lease_token:null,last_status:null});
  expect(await fails(register(p))).toMatchObject({code:'23505'});
  const retro=async(o:JOpts)=>(await register(judgmentRow(m,b,o))).retrospective;
  expect(await retro({asOf:'2026-01-02'})).toBe(true);                                    // as_of before the registration date
  expect(await retro({asOf:today,hint:'2026-01-01T00:00:00.000Z'})).toBe(true);           // label already available
  expect(await retro({asOf:today,hint:'2099-02-01T00:00:00.000Z'})).toBe(false);
  await withClaimLock(async()=>{
   const r=judgmentRow(m,b,{asOf:today,target:{kind:'date',date:today}});                // settle_after (today 00:00Z) <= registered_at
   expect((await register(r)).retrospective).toBe(true);
   const mine=(await claim()).find(x=>x.judgment_id===r.row.judgment_id)!;
   await park(String(r.row.judgment_id),String(mine.lease_token));
  });
  const ab=judgmentRow(m,b,{abstained:true});
  expect(await register(ab)).toMatchObject({judgment_id:ab.row.judgment_id,retrospective:true});
  expect(await q(`select 1 from public.judgment_settle_queue where judgment_id=$1`,[ab.row.judgment_id])).toHaveLength(0);
 });

 it('register_judgment refuses: unavailable methodology, row/methodology mismatches, non-public subject, input kinds, settle window or queue mismatch, abstained with a queue — and writes nothing',async()=>{
  const m=await syncNew();const draft=await syncNew({status:'draft'});const retired=await syncNew({status:'retired'});const b=await batch();
  const reg=(r:{row:Record<string,unknown>;queue:unknown})=>fails(register(r));
  for(const mm of [draft,retired,mid()])expect({mm,e:await reg(judgmentRow(mm,b))}).toMatchObject({mm,e:{code:'P0001',message:expect.stringMatching(/^methodology_unavailable/)}});
  const ok=judgmentRow(m,b);
  for(const row of [{...ok.row,kind:'score'},{...ok.row,judgment_type:'macro_regime'},{...ok.row,subject_type:'industry',subject_key:'sw2021:2021:801010'},{...ok.row,producer_kind:'model'},{...ok.row,horizon:{unit:'calendar_days',n:31}}])
   expect(await reg({row,queue:ok.queue})).toMatchObject({code:'22023',message:expect.stringMatching(/^methodology_mismatch/)});
  expect(await reg({row:{...ok.row,subject_type:'security',subject_key:'US:AAPL'},queue:ok.queue})).toMatchObject({code:'22023',message:expect.stringMatching(/^subject_type_not_public/)});
  for(const kind of ['document_span','legacy_fill','price_bar'])
   expect({kind,e:await reg({row:{...ok.row,inputs:[{...INPUT,kind}]},queue:ok.queue})}).toMatchObject({kind,e:{code:'22023',message:expect.stringMatching(/^input_not_allowed/)}});
  const windows=[{row:{...ok.row,settle_after:'2099-01-02T00:00:00.000Z'},queue:ok.queue},{row:{...ok.row,settle_by:'2099-02-01T00:00:00.000Z'},queue:ok.queue},{row:ok.row,queue:{...ok.queue!,settle_by:'2099-02-01T00:00:00.000Z'}},
   {row:ok.row,queue:{...ok.queue!,label_policy:'cutoff_vintage'}},{row:ok.row,queue:null},{row:{...ok.row,target:{kind:'date',date:'2099-01-02'}},queue:ok.queue}];
  for(const r of windows)expect(await reg(r)).toMatchObject({code:'22023',message:expect.stringMatching(/^settle_window_mismatch/)});
  const ab=judgmentRow(m,b,{abstained:true});
  expect(await reg({row:ab.row,queue:{settle_after:'2099-01-01T00:00:00.000Z',settle_by:'2099-01-31T00:00:00.000Z',label_policy:'first_observed'}})).toMatchObject({code:'22023',message:expect.stringMatching(/^settle_window_mismatch/)});
  expect(Number(await one(`select count(*) v from public.judgments where methodology_id=$1`,[m]))).toBe(0);
  expect(await register(ok)).toMatchObject({judgment_id:ok.row.judgment_id});
 });

 it('settle window: the SQL recompute equals time.ts settleWindowOf for every target kind with default and explicit grace (plan 契约补充)',async()=>{
  const b=await batch();
  const cases:[Record<string,unknown>,Record<string,unknown>,Record<string,number|string>][]=[
   [{kind:'session_index',base_date:'2028-02-27',n:5},{unit:'trading_sessions',n:5},{}],
   [{kind:'date',date:'2099-03-01'},{unit:'calendar_days',n:30},{grace_days:7}],
   [{kind:'period',period:'2098-02'},{unit:'calendar_months',n:1},{}],
   [{kind:'fiscal_period',period_end:'2098-12-31',calendar:{anchor_period_end:'2098-09-30',months:3},extrapolated:true},{unit:'fiscal_quarters',n:1},{grace_days:'14'}],
  ];
  for(const [target,horizon,params] of cases){
   const m=await syncNew({horizon,params});
   const r=judgmentRow(m,b,{target,horizon,params});
   await register(r);
   const qr=(await q(`select settle_after,settle_by from public.judgment_settle_queue where judgment_id=$1`,[r.row.judgment_id]))[0];
   expect({target,after:qr.settle_after.toISOString(),by:qr.settle_by.toISOString()}).toEqual({target,after:r.queue!.settle_after,by:r.queue!.settle_by});
  }
 });

 it('claim_due_judgments and release_lease: due order, skip locked across connections, fresh tokens, lease_lost, next_attempt_at clamp, attempts (under F4_CLAIM_LOCK)',async()=>{
  const m=await syncNew();const b=await batch();
  await withClaimLock(async()=>{
   const ids:string[]=[];
   for(const d of ['2026-01-12','2026-01-10','2026-01-11']){const r=judgmentRow(m,b,{target:{kind:'date',date:d}});await register(r);ids.push(String(r.row.judgment_id));}
   const later=judgmentRow(m,b);await register(later);                                    // not due (2099)
   const c1=await admin.connect();let held:Record<string,any>[]=[];let rest:Record<string,any>[]=[];
   try{
    await c1.query('begin');
    held=(await c1.query(CLAIM_ROWS('1,600'))).rows;
    expect(held.map(r=>r.judgment_id)).toEqual([ids[1]]);                                 // earliest next_attempt_at first
    rest=(await claim()).filter(r=>ids.includes(r.judgment_id)).sort((a,b2)=>a.next_attempt_at-b2.next_attempt_at);
    expect(rest.map(r=>r.judgment_id)).toEqual([ids[2],ids[0]]);                          // the row locked by c1 is skipped
    await c1.query('commit');
   }finally{await c1.query('rollback').catch(()=>{});c1.release();}
   const all=[...held,...rest];
   expect(new Set(all.map(r=>r.lease_token)).size).toBe(3);
   for(const r of all)expect(r.leased_until.getTime()).toBeGreaterThan(Date.now()+590_000);
   expect((await claim()).filter(r=>[...ids,later.row.judgment_id].includes(r.judgment_id))).toEqual([]);   // leased / not due
   const tok=(id:string)=>String(all.find(r=>r.judgment_id===id)!.lease_token);
   const patch={last_status:'unavailable',last_detail:{failure:'timeout'},next_attempt_at:'2000-01-01T00:00:00.000Z',attempts_increment:1};
   expect(await fails(release(ids[1],randomUUID(),patch))).toMatchObject({code:'55P03',message:'lease_lost'});
   expect(await fails(release(randomUUID(),randomUUID(),patch))).toMatchObject({code:'55P03',message:'lease_lost'});
   for(const bad of [{...patch,last_status:'settled'},{...patch,attempts_increment:2},{...patch,last_detail:[]},{last_status:'pending'}])
    expect(await fails(release(ids[1],tok(ids[1]),bad))).toMatchObject({code:'22023'});
   const before=await serverNow();
   await release(ids[1],tok(ids[1]),patch);
   const r1=(await q(`select attempts,last_status,last_detail,next_attempt_at,leased_until,lease_token from public.judgment_settle_queue where judgment_id=$1`,[ids[1]]))[0];
   expect(r1).toMatchObject({attempts:1,last_status:'unavailable',last_detail:{failure:'timeout'},leased_until:null,lease_token:null});
   expect(r1.next_attempt_at.getTime()).toBeGreaterThanOrEqual(Date.parse(before));       // clamped to now, never the past value
   expect(await fails(release(ids[1],tok(ids[1]),patch))).toMatchObject({code:'55P03'});   // lease already released
   const again=(await claim()).find(r=>r.judgment_id===ids[1])!;                           // due again at once: take it back
   expect(String(again.lease_token)).not.toBe(tok(ids[1]));
   await park(ids[1],String(again.lease_token));
   for(const id of [ids[0],ids[2]])await park(id,tok(id));
   expect((await q(`select attempts from public.judgment_settle_queue where judgment_id=any($1::uuid[]) order by judgment_id`,[ids])).map(r=>r.attempts).sort()).toEqual([0,0,1]);
  });
 });

 it('claim_due_judgments returns one jsonb array (a scalar, so a capped max_rows cannot drop leased rows), ordered, [] when nothing is due (E-03)',async()=>{
  const m=await syncNew();const b=await batch();
  await withClaimLock(async()=>{
   const late=judgmentRow(m,b,{target:{kind:'date',date:'2026-01-12'}}),early=judgmentRow(m,b,{target:{kind:'date',date:'2026-01-10'}});await register(late);await register(early);
   const arr=await one(`select public.claim_due_judgments(100,600) v`) as {judgment_id:string;lease_token:string}[];
   expect(Array.isArray(arr)).toBe(true);
   const mine=arr.filter(r=>[late.row.judgment_id,early.row.judgment_id].includes(r.judgment_id as never));
   expect(mine.map(r=>r.judgment_id)).toEqual([early.row.judgment_id,late.row.judgment_id]);
   expect(await q(`select 1 from public.claim_due_judgments(100,600)`)).toHaveLength(1);   // one scalar row, whatever the array holds
   for(const r of arr)await park(r.judgment_id,r.lease_token);
   expect(await one(`select public.claim_due_judgments(100,600) v`)).toEqual([]);
  });
 });

 it('append_settlement: applied, replay after the lease is cleared, request_key conflicts (incl. resolver_version only), already_final, lease_lost, admin path, sequence, validity bump, queue state (R06)',async()=>{
  const m=await syncNew();const b=await batch();const A=`admin:${randomUUID()}`;
  const rev=async()=>Number(await one(`select revision v from public.judgment_calibration_validity where methodology_id=$1`,[m]));
  const queueOf=async(j:string)=>(await q(`select closed_at is not null closed,lease_token,leased_until,attempts,next_attempt_at from public.judgment_settle_queue where judgment_id=$1`,[j]))[0];
  await withClaimLock(async()=>{
   const r=judgmentRow(m,b,{target:DUE});await register(r);const j=String(r.row.judgment_id);
   const r2=judgmentRow(m,b,{target:DUE});await register(r2);const j2=String(r2.row.judgment_id);
   const leased=(await claim()).filter(x=>[j,j2].includes(x.judgment_id));
   expect(leased).toHaveLength(2);
   const tok=(id:string)=>String(leased.find(x=>x.judgment_id===id)!.lease_token);
   const row=sRow(b);const key=`${b}:${j}:1`;
   expect(await fails(appendOp(j,randomUUID(),key,row))).toMatchObject({code:'55P03',message:'lease_lost'});
   expect(await appendOp(j,tok(j),key,row)).toEqual({seq:1,status:'applied'});
   expect(await queueOf(j)).toMatchObject({closed:true,lease_token:null,leased_until:null});
   // the response was lost and the lease is gone: the retry still converges, with or without a token
   expect(await appendOp(j,tok(j),key,row)).toEqual({seq:1,status:'already_applied'});
   expect(await appendOp(j,null,key,row)).toEqual({seq:1,status:'already_applied'});
   expect(await appendOp(j,tok(j),key,{...row,resolver_version:'1.0.1'})).toEqual({seq:1,status:'request_key_conflict'});
   expect(await appendOp(j,tok(j),key,{...row,outcome:'miss'})).toEqual({seq:1,status:'request_key_conflict'});
   expect(await appendOp(j2,tok(j2),key,row)).toEqual({seq:1,status:'request_key_conflict'});            // same key, another judgment
   expect(await append(j,tok(j),key,{...row,request_digest:H('9')})).toEqual({seq:1,status:'request_key_conflict'});   // same payload, other digest
   // a new automatic request on a closed queue is already_final, not an error
   expect(await appendOp(j,tok(j),`${b}:${j}:2`,row)).toEqual({seq:1,status:'already_final'});
   expect(await appendOp(j,null,`${b}:${j}:2s`,{...row,actor:'script'})).toEqual({seq:1,status:'already_final'});
   expect(await fails(appendOp(j2,null,`${b}:${j2}:x`,row))).toMatchObject({code:'55P03',message:'lease_lost'});   // null token needs an admin actor
   // admin path: withdrawn(2) and reopened(3) bump the validity revision in the same transaction
   expect(await rev()).toBe(1);
   const w=sRow(b,{kind:'withdrawn',outcome:null,realized:null,reason:'bad data',actor:A});
   expect(await appendOp(j,null,`adm:${randomUUID()}`,w)).toEqual({seq:2,status:'applied'});
   expect(await rev()).toBe(2);
   expect(await queueOf(j)).toMatchObject({closed:true});
   expect(await appendOp(j,null,`adm:${randomUUID()}`,sRow(b,{kind:'reopened',outcome:null,realized:null,reason:'re-settle',actor:A}))).toEqual({seq:3,status:'applied'});
   expect(await rev()).toBe(3);
   const reopened=(await q(`select v.reason,s.settlement_id from public.judgment_calibration_validity v, public.judgment_settlements s where v.methodology_id=$1 and s.judgment_id=$2 and s.seq=3`,[m,j]))[0];
   expect(reopened.reason).toBe(`reopened:${reopened.settlement_id}`);
   const qo=await queueOf(j);expect(qo).toMatchObject({closed:false,attempts:0,lease_token:null});expect(qo.next_attempt_at.getTime()).toBeLessThanOrEqual(Date.now()+1000);
   expect(await fails(appendOp(j,null,`adm:${randomUUID()}`,w))).toMatchObject({code:'23514',message:expect.stringMatching(/^settlement_sequence/)});   // reopened → withdrawn is not a transition
   const again=(await claim()).find(x=>x.judgment_id===j)!;                                 // reopened is due again
   expect(await appendOp(j,String(again.lease_token),`${b}:${j}:4`,row)).toEqual({seq:4,status:'applied'});
   expect((await q(`select seq,kind,request_key,request_digest from public.judgment_settlements where judgment_id=$1 order by seq`,[j])).map(x=>`${x.seq}:${x.kind}`)).toEqual(['1:settled','2:withdrawn','3:reopened','4:settled']);
   expect((await q(`select request_digest from public.judgment_settlements where request_key=$1`,[key]))[0].request_digest).toBe(operationDigest(j,row));
   expect(await rev()).toBe(3);                                                             // settled does not bump
   const ab=judgmentRow(m,b,{abstained:true});await register(ab);
   expect(await fails(appendOp(String(ab.row.judgment_id),null,`adm:${randomUUID()}`,{...row,actor:A}))).toMatchObject({code:'23514',message:expect.stringMatching(/^settlement_sequence/)});
   expect(await fails(appendOp(randomUUID(),null,`adm:${randomUUID()}`,{...row,actor:A}))).toMatchObject({code:'P0002',message:'unknown_judgment'});
   expect(await fails(append(j,null,`adm:${randomUUID()}`,{...row,actor:A}))).toMatchObject({code:'22023'});   // no request_digest
   expect(await appendOp(j2,tok(j2),`${b}:${j2}:1`,sRow(b,{kind:'void',outcome:null,realized:null,reason:'no_data:test'}))).toEqual({seq:1,status:'applied'});
  });
 });

 it('append_settlement concurrency: two connections on one judgment — the first is applied, the second already_final (different key) or already_applied (same key), never 23505',async()=>{
  const m=await syncNew();const b=await batch();
  await withClaimLock(async()=>{
   for(const sameKey of [false,true]){
    const r=judgmentRow(m,b,{target:DUE});await register(r);const j=String(r.row.judgment_id);
    const t=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
    const row=sRow(b);
    const c1=await admin.connect();
    try{
     await c1.query('begin');
     const pid=Number((await c1.query('select pg_backend_pid() p')).rows[0].p);
     expect((await c1.query(`select public.append_settlement($1,$2,$3,$4::jsonb) v`,[j,t,`${b}:${j}:A`,JSON.stringify({...row,request_digest:operationDigest(j,row)})])).rows[0].v).toEqual({seq:1,status:'applied'});
     const second=appendOp(j,t,sameKey?`${b}:${j}:A`:`${b}:${j}:B`,row);                  // waits on the queue row lock
     await waitBlocked(pid);
     await c1.query('commit');
     expect(await second).toEqual({seq:1,status:sameKey?'already_applied':'already_final'});
    }finally{await c1.query('rollback').catch(()=>{});c1.release();}
    expect(Number(await one(`select count(*) v from public.judgment_settlements where judgment_id=$1`,[j]))).toBe(1);
   }
  });
 });

 it('insert_calibration: inserted, duplicate fingerprint, stale_revision when the row or the expectation lags a withdrawal (acceptance 10, SQL half)',async()=>{
  const m=await syncNew();const b=await batch();
  const ins=(row:Record<string,unknown>,expected:number)=>one(`select public.insert_calibration($1::jsonb,$2) v`,[JSON.stringify(row),expected]);
  const c=calibrationCols(m,b);
  expect(await ins(c,1)).toBe('inserted');
  expect(await ins({...c,calibration_id:randomUUID()},1)).toBe('duplicate');
  expect(await ins({...calibrationCols(m,b),validity_revision:2},1)).toBe('stale_revision');
  const readRevision=1;                                                                     // the calibration job read revision 1 …
  await withClaimLock(async()=>{                                                            // … then an admin withdraws a settlement
   const j=await settledJudgment(m,b);
   expect(await appendOp(j,null,`adm:${randomUUID()}`,sRow(b,{kind:'withdrawn',outcome:null,realized:null,reason:'bad',actor:`admin:${randomUUID()}`}))).toEqual({seq:2,status:'applied'});
  });
  expect(await ins({...calibrationCols(m,b),validity_revision:readRevision},readRevision)).toBe('stale_revision');
  expect(await ins({...calibrationCols(m,b),validity_revision:2},2)).toBe('inserted');
  expect(await fails(ins(calibrationCols(mid(),b),1))).toMatchObject({code:'P0002',message:'unknown_methodology'});
  expect(Number(await one(`select count(*) v from public.judgment_calibrations where methodology_id=$1`,[m]))).toBe(2);
 });

 it('latest_judgment_cards and judgment_history: one card per (type, methodology), ordering, merged issuer expansion (§12.4), calibration_valid, keyset paging',async()=>{
  const m1=await syncNew();const m2=await syncNew();const b=await batch();
  const x=randomUUID(),y=randomUUID();
  await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Judgments X')`,[x]);
  await q(`insert into public.issuers(issuer_id,canonical_name_en,status,merged_into) values($1,'ZZ Judgments Y','merged',$2)`,[y,x]);
  const reg=async(m:string,key:string,asOf:string)=>{const r=judgmentRow(m,b,{subjectType:'issuer',subjectKey:key,asOf});await register(r);return String(r.row.judgment_id);};
  const a1=await reg(m1,x,'2026-01-02');const a2=await reg(m1,x,'2026-01-05');const a3=await reg(m1,y,'2026-01-04');const bb=await reg(m2,y,'2026-01-03');
  const cards=async(key:string,view='latest',cutoff:string|null=null,types:string[]|null=null)=>q(`select (e.judgment).judgment_id id,(e.judgment).subject_key k,e.calibration_valid cv,(e.methodology_state).seq ms from public.latest_judgment_cards('issuer',$1,$2::text[],$3,$4::timestamptz) e`,[key,types,view,cutoff]);
  expect((await cards(x)).map(r=>[r.id,r.k,r.ms])).toEqual([[a2,x,1],[bb,y,1]]);          // m1 → newest as_of across X and merged Y; m2 → Y's judgment
  expect((await cards(y)).map(r=>r.id)).toEqual([a3,bb]);                                  // Y alone: no upward expansion
  expect(await cards(x,'latest',null,['nope'])).toEqual([]);
  expect((await cards(x,'latest',null,['synthetic_fact_metric'])).map(r=>r.id)).toEqual([a2,bb]);
  for(const [view,cutoff] of [['as_known',null],['sometimes',null]] as const)expect(await fails(cards(x,view,cutoff))).toMatchObject({code:'22023'});
  expect(await one(`select public.insert_calibration($1::jsonb,1) v`,[JSON.stringify(calibrationCols(m1,b))])).toBe('inserted');
  expect(await one(`select public.insert_calibration($1::jsonb,1) v`,[JSON.stringify({...calibrationCols(m2,b),valid_until:'2020-01-01T00:00:00.000Z'})])).toBe('inserted');
  expect((await cards(x)).map(r=>[r.id,r.cv])).toEqual([[a2,true],[bb,false]]);            // current revision and unexpired vs expired
  const hist=async(before:string|null,limit:number)=>(await q(`select (e.judgment).judgment_id id from public.judgment_history('issuer',$1,'synthetic_fact_metric',$2,'v1','latest',null,$3,$4) e`,[x,m1,before,limit])).map(r=>r.id);
  expect(await hist(null,10)).toEqual([a2,a1]);
  expect(await hist(null,1)).toEqual([a2]);
  expect(await hist(a2,10)).toEqual([a1]);
  expect(await hist(a1,10)).toEqual([]);
  expect(await fails(hist(null,501))).toMatchObject({code:'22023'});
  expect(await fails(hist(null,0))).toMatchObject({code:'22023'});
  expect(await fails(hist(randomUUID(),10))).toMatchObject({code:'P0002',message:'unknown_judgment'});
 });

 it('as_known: registered_at and the methodology event history decide what was known; a resync does not rewrite history (acceptance 9)',async()=>{
  const row=methodologyRow();const m=String(row.methodology_id);const b=await batch();
  await sync(row);
  await pause(20);const t0=await serverNow();await pause(20);
  const r=judgmentRow(m,b);await register(r);const j=String(r.row.judgment_id);
  await pause(20);const t1=await serverNow();await pause(20);
  await sync(row);                                                                          // resynced (seq 2), synced_at moves
  await sync({...row,status:'retired'});                                                    // status_changed (seq 3)
  await pause(20);const t2=await serverNow();
  const known=async(cutoff:string)=>(await q(`select (e.judgment).judgment_id id,(e.methodology_state).seq seq,(e.methodology_state).status status from public.latest_judgment_cards('macro_region','US',array['synthetic_fact_metric'],'as_known',$1::timestamptz) e where (e.judgment).methodology_id=$2`,[cutoff,m]));
  expect(await known(t0)).toEqual([]);                                                      // not yet registered
  expect(await known(t1)).toEqual([{id:j,seq:1,status:'active'}]);                         // the state as it was before the resync
  expect(await known(t2)).toEqual([{id:j,seq:3,status:'retired'}]);
  expect(await known('2000-01-01T00:00:00.000Z')).toEqual([]);                             // the methodology did not exist
  expect((await one(`select synced_at v from public.judgment_methodologies where methodology_id=$1`,[m])).getTime()).toBeGreaterThan(Date.parse(t1));
  const hist=await q(`select (e.methodology_state).seq seq from public.judgment_history('macro_region','US','synthetic_fact_metric',$1,'v1','as_known',$2::timestamptz,null,50) e`,[m,t1]);
  expect(hist.map(h=>h.seq)).toEqual([1]);
 });

 it('public RPCs run under RLS: anon sees a methodology only while publishable via latest cards, history and calibration_cohort; calibration_cohort_internal is complete for service_role (acceptance 8, RPC half; R04)',async()=>{
  const row=methodologyRow();const m=String(row.methodology_id);await sync(row);const b=await batch();
  const r=judgmentRow(m,b,{subjectType:'macro_region',subjectKey:'CN',asOf:'2025-06-01'});await register(r);
  const cutoff=new Date(Date.now()+60_000).toISOString();
  const anonView=()=>asRole(admin,'anon',async c=>({
   cards:(await c.query(`select 1 from public.latest_judgment_cards('macro_region','CN',null,'latest',null) e where (e.judgment).methodology_id=$1`,[m])).rows.length,
   hist:(await c.query(`select 1 from public.judgment_history('macro_region','CN','synthetic_fact_metric',$1,'v1','latest',null,null,50)`,[m])).rows.length,
   cohort:(await c.query(`select 1 from public.calibration_cohort($1,'v1','2025-01-01','2025-12-31',$2::timestamptz,null,100)`,[m,cutoff])).rows.length,
  }));
  const internal=()=>asRole(admin,'service_role',async c=>(await c.query(`select 1 from public.calibration_cohort_internal($1,'v1','2025-01-01','2025-12-31',$2::timestamptz,null,100)`,[m,cutoff])).rows.length);
  expect(await anonView()).toEqual({cards:0,hist:0,cohort:0});
  expect(await internal()).toBe(1);
  await sync({...row,publishable:true});
  expect(await anonView()).toEqual({cards:1,hist:1,cohort:1});
  await sync({...row,publishable:false});
  expect(await anonView()).toEqual({cards:0,hist:0,cohort:0});
  expect(await internal()).toBe(1);
  expect(await fails(asRole(admin,'anon',c=>c.query(`select * from public.calibration_cohort_internal($1,'v1','2025-01-01','2025-12-31',$2::timestamptz,null,100)`,[m,cutoff])))).toMatchObject({code:'42501'});
 });

 it('calibration_cohort: window by as_of, active rows only, registered_at <= cutoff on both sides of the cursor, settlement <= cutoff, keyset paging (R03)',async()=>{
  const m=await syncNew();const b=await batch();
  const ids:string[]=[];
  for(const d of ['2025-03-01','2025-06-01','2025-09-01']){const r=judgmentRow(m,b,{asOf:d});await register(r);ids.push(String(r.row.judgment_id));}
  await register(judgmentRow(m,b,{asOf:'2024-01-01'}));                                    // outside the window
  await register(judgmentRow(m,b,{asOf:'2025-05-01',abstained:true}));                     // abstained: not in the cohort
  await pause(20);const cutoff=await serverNow();await pause(20);
  const late=judgmentRow(m,b,{asOf:'2025-07-01'});await register(late);                    // registered after the cutoff
  const page=async(after:string|null,limit:number,cut=cutoff)=>q(`select (e.judgment).judgment_id id,(e.settlement).kind sk,e.calibration_valid cv from public.calibration_cohort($1,'v1','2025-01-01','2025-12-31',$2::timestamptz,$3,$4) e`,[m,cut,after,limit]);
  const sorted=[...ids].sort();
  const p1=await page(null,2);expect(p1.map(r=>r.id)).toEqual(sorted.slice(0,2));
  const p2=await page(p1[1].id,2);expect(p2.map(r=>r.id)).toEqual(sorted.slice(2));
  expect(await page(p2[0].id,2)).toEqual([]);
  expect((await page(null,100,new Date(Date.now()+60_000).toISOString())).map(r=>r.id)).toEqual([...ids,String(late.row.judgment_id)].sort());
  expect(p1.every(r=>r.sk===null&&r.cv===false)).toBe(true);
  await withClaimLock(async()=>{
   const s=judgmentRow(m,b,{asOf:'2025-04-01',target:DUE});await register(s);const sj=String(s.row.judgment_id);
   await pause(20);const beforeSettle=await serverNow();await pause(20);
   const t=String((await claim()).find(x=>x.judgment_id===sj)!.lease_token);
   expect(await appendOp(sj,t,`${b}:${sj}:1`,sRow(b))).toEqual({seq:1,status:'applied'});
   const at=async(cut:string)=>(await page(null,100,cut)).find(r=>r.id===sj)?.sk;
   expect(await at(beforeSettle)).toBeNull();
   expect(await at(new Date(Date.now()+60_000).toISOString())).toBe('settled');
  });
  expect(await fails(q(`select * from public.calibration_cohort($1,'v1','2025-12-31','2025-01-01',now(),null,10)`,[m]))).toMatchObject({code:'22023'});
  expect(await fails(q(`select * from public.calibration_cohort($1,'v1','2025-01-01','2025-12-31',now(),null,0)`,[m]))).toMatchObject({code:'22023'});
  expect(await fails(q(`select * from public.calibration_cohort($1,'v1','2025-01-01','2025-12-31',null,null,10)`,[m]))).toMatchObject({code:'22023'});
 });

 it('set_job_state: insert-once with null, optimistic update on the exact updated_at, millisecond precision, strictly increasing updated_at',async()=>{
  const job=`calibrate:${mid()}@v1:market:${encodeURIComponent('港股')}`;
  const set=(exp:string|null,state:unknown)=>one(`select public.set_job_state($1,$2::timestamptz,$3::jsonb) v`,[job,exp,JSON.stringify(state)]);
  const read=async()=>(await q(`select state,to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') u,(extract(microseconds from updated_at)::bigint % 1000)::int sub from public.judgment_job_state where job=$1`,[job]))[0];
  expect(await set(null,{page:0})).toBe(true);
  expect(await set(null,{page:9})).toBe(false);
  const r1=await read();expect(r1).toMatchObject({state:{page:0},sub:0});
  expect(await set('2000-01-01T00:00:00.000Z',{page:1})).toBe(false);
  expect(await set(r1.u,{page:1})).toBe(true);
  const r2=await read();expect(r2.state).toEqual({page:1});expect(Date.parse(r2.u)).toBeGreaterThan(Date.parse(r1.u));
  expect(await set(r1.u,{page:2})).toBe(false);                                             // stale expectation
  expect(await set(r2.u,{page:2})).toBe(true);
  const r3=await read();expect(await set(r3.u,{page:3})).toBe(true);
  const r4=await read();expect(r4.u).not.toBe(r3.u);
  expect(await fails(set(null,[]))).toMatchObject({code:'22023'});
 });

 /** The settle worker's single quarantine write (Q1-02); patchOf builds settle.ts's inconsistent patch (parked in 2099 by default):
  *  top level = this attempt, incident = the open incident it raises (R3-01; quarantine_settlement adds quarantine_id). */
 const qs=(j:string,token:string,payload:Record<string,unknown>,patch:Record<string,unknown>,b:string,reason='settlement_basis_mismatch')=>
  one(`select public.quarantine_settlement($1,$2,$3,$4::jsonb,$5::jsonb,$6) v`,[j,token,reason,JSON.stringify(payload),JSON.stringify(patch),b]) as Promise<{status:string;quarantine_id:string|null}>;
 const patchOf=(hash:string,cutoff:string,extra:Record<string,unknown>={},next='2099-06-01T00:00:00.000Z')=>{
  const attempt={reason_code:'settlement_basis_mismatch',evidence_hash:hash,cutoff,...extra};
  return {last_status:'inconsistent',last_detail:{...attempt,incident:{...attempt,quarantined_at:cutoff}},next_attempt_at:next,attempts_increment:0};
 };
 // A judgment whose queue holds an open incident (last_detail.incident, R3-01) for evidence hash `hash`, with an open item
 // carrying the same hash and cutoff — published exactly as settle.ts does it: ONE quarantine_settlement under the claimed
 // lease (Q1-02). Runs under the claim lock; the row is parked in 2099 afterwards.
 const quarantined=async(m:string,b:string,hash=H('e'),cutoff='2026-03-02T04:00:00.000Z')=>{
  const r=judgmentRow(m,b,{target:DUE});await register(r);const j=String(r.row.judgment_id);
  const t=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
  const res=await qs(j,t,{evidence_hash:hash,cutoff,judgment_id:j},patchOf(hash,cutoff),b);
  expect(res.status).toBe('quarantined');
  return {j,item:String(res.quarantine_id)};
 };
 const adminUser=async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@judgments.test`]);return id;};
 const overrideOf=(by:string,hash=H('e'),cutoff='2026-03-02T04:00:00.000Z')=>({reason_code:'settlement_basis_mismatch',resolution:{kind:'accept_refetched',evidence_hash:hash,evidence:{bars:[]}},evidence_hash:hash,resolved_by:by,at:new Date().toISOString(),cutoff});
 type Conn={query:(text:string,values?:unknown[])=>Promise<{rows:any[]}>};
 const applyQ=(jid:string,o:unknown,qid:string,c:Conn=admin)=>c.query(`select public.apply_quarantine_override($1,$2::jsonb,$3,$4::jsonb) v`,[jid,JSON.stringify(o),qid,JSON.stringify({route:'test'})]).then(r=>r.rows[0].v as string);
 const voidRow=(b:string,by:string):SettlementInsert=>({kind:'void',outcome:null,realized:null,evidence:{quarantine:true},resolver:'macro_regime_replay',resolver_version:'1.0.0',reason:'quarantine_rejected',actor:`admin:${by}`,code_version:'abcdef1',batch_id:b});
 /** What the hook read from the item (Q1-03): the default matches quarantined()'s hash and cutoff. */
 const EXP={evidence_hash:H('e'),cutoff:'2026-03-02T04:00:00.000Z'};
 const rejectQ=(jid:string,qid:string,key:string,row:SettlementInsert,c:Conn=admin,exp:{evidence_hash:string;cutoff:string}=EXP)=>c.query(`select public.reject_quarantined_settlement($1,$2,$3::jsonb,$4,$5::jsonb,$6::jsonb) v`,[jid,qid,JSON.stringify(exp),key,JSON.stringify({...row,request_digest:operationDigest(jid,row)}),JSON.stringify({route:'test'})]).then(r=>r.rows[0].v as {seq:number;status:string});
 const queueOf=async(j:string)=>(await q(`select override,next_attempt_at,leased_until,lease_token,last_status,last_detail,closed_at from public.judgment_settle_queue where judgment_id=$1`,[j]))[0];

 it('apply_quarantine_override: locks queue then item; writes override, schedules now, REVOKES the lease, flips the item, audits — atomically; idempotent; stale / closed / item_not_open write nothing (P1-04)',async()=>{
  const m=await syncNew();const b=await batch();const by=await adminUser();
  await withClaimLock(async()=>{
   const {j,item}=await quarantined(m,b);
   const override=overrideOf(by);
   // A worker re-claims the row (lease held) while the admin accepts: the acceptance revokes that lease.
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[j]);
   const worker=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
   const before=await serverNow();
   expect(await applyQ(j,override,item)).toBe('applied');
   const qr=await queueOf(j);
   expect(qr.override).toEqual(override);expect(qr.next_attempt_at.getTime()).toBeGreaterThanOrEqual(Date.parse(before));
   expect({l:qr.leased_until,t:qr.lease_token,s:qr.last_status,h:qr.last_detail.incident.evidence_hash}).toEqual({l:null,t:null,s:'inconsistent',h:H('e')});
   expect(await fails(release(j,worker,{last_status:'inconsistent',last_detail:{reason_code:'settlement_basis_mismatch',evidence_hash:H('f')},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0}))).toMatchObject({code:'55P03',message:'lease_lost'});
   expect(await fails(appendOp(j,worker,`${b}:${j}:1`,sRow(b)))).toMatchObject({code:'55P03',message:'lease_lost'});
   expect((await queueOf(j)).last_detail.incident.evidence_hash).toBe(H('e'));              // the accepted incident survives
   expect((await q(`select status,resolved_by,detail->'override' o from public.dq_quarantine where id=$1`,[item]))[0]).toEqual({status:'resolved_accept',resolved_by:by,o:override});
   expect(await q(`select user_id,actor,action,object_type,object_id,detail->>'route' route,detail->>'judgment_id' jid from public.research_audit_log where object_id=$1`,[item])).toEqual([{user_id:by,actor:'user',action:'dq.quarantine_resolve',object_type:'dq',object_id:item,route:'test',jid:j}]);
   expect(await applyQ(j,override,item)).toBe('applied');                                   // replay: no-op, no second audit row
   expect(await q(`select 1 from public.research_audit_log where object_id=$1`,[item])).toHaveLength(1);
   expect(await applyQ(j,{...override,at:new Date(Date.now()+5).toISOString()},item)).toBe('item_not_open');
   const mine=(await claim()).find(x=>x.judgment_id===j)!;await park(j,String(mine.lease_token));
   // stale: the worker published another inconsistency (new evidence hash) after the hook read the item → nothing written
   const s1=await quarantined(m,b);
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[s1.j]);
   const t1=String((await claim()).find(x=>x.judgment_id===s1.j)!.lease_token);
   expect(await qs(s1.j,t1,{evidence_hash:H('f'),cutoff:'2026-03-02T04:00:00.000Z',judgment_id:s1.j},patchOf(H('f'),'2026-03-02T04:00:00.000Z'),b)).toEqual({status:'quarantined',quarantine_id:s1.item});
   expect(await applyQ(s1.j,overrideOf(by),s1.item)).toBe('stale');
   expect((await queueOf(s1.j)).override).toBeNull();
   expect((await q(`select status from public.dq_quarantine where id=$1`,[s1.item]))[0].status).toBe('open');
   // stale: same inconsistency, but the override names another resolution cutoff than the item's
   const s2=await quarantined(m,b);
   expect(await applyQ(s2.j,overrideOf(by,H('e'),'2026-01-01T00:00:00.000Z'),s2.item)).toBe('stale');
   expect((await queueOf(s2.j)).override).toBeNull();
   // stale (Q1-03): item matches the override, but the locked queue's incident names another cutoff
   await q(`update public.judgment_settle_queue set last_detail=jsonb_set(last_detail,'{incident,cutoff}','"2026-01-01T00:00:00.000Z"'::jsonb) where judgment_id=$1`,[s2.j]);
   expect(await applyQ(s2.j,overrideOf(by),s2.item)).toBe('stale');
   expect((await q(`select status from public.dq_quarantine where id=$1`,[s2.item]))[0].status).toBe('open');
   // stale: the queue holds no open incident (an item for a row never published through quarantine_settlement)
   const bare=judgmentRow(m,b,{target:DUE});await register(bare);const bj=String(bare.row.judgment_id);
   const bareItem=randomUUID();
   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'judgments','judgment_settlements',$2,'settlement_basis_mismatch',$3,$4::jsonb)`,[bareItem,bj,b,JSON.stringify({evidence_hash:H('e'),cutoff:'2026-03-02T04:00:00.000Z',judgment_id:bj})]);
   expect(await applyQ(bj,overrideOf(by),bareItem)).toBe('stale');
   await park(bj,String((await claim()).find(x=>x.judgment_id===bj)!.lease_token));
   // R3-01: a transient attempt status (a pending park) keeps the open incident, so the acceptance still applies
   const s4=await quarantined(m,b);
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[s4.j]);
   await park(s4.j,String((await claim()).find(x=>x.judgment_id===s4.j)!.lease_token));
   expect(await queueOf(s4.j)).toMatchObject({last_status:'pending',last_detail:{incident:{quarantine_id:s4.item,evidence_hash:H('e')}}});
   expect(await applyQ(s4.j,overrideOf(by),s4.item)).toBe('applied');
   await park(s4.j,String((await claim()).find(x=>x.judgment_id===s4.j)!.lease_token));
   // closed: the judgment was settled meanwhile
   const s3=await quarantined(m,b);
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[s3.j]);
   const t3=String((await claim()).find(x=>x.judgment_id===s3.j)!.lease_token);
   expect(await appendOp(s3.j,t3,`${b}:${s3.j}:1`,sRow(b))).toEqual({seq:1,status:'applied'});
   expect(await applyQ(s3.j,overrideOf(by),s3.item)).toBe('closed');
   expect(await q(`select 1 from public.research_audit_log where object_id=$1`,[s3.item])).toHaveLength(0);
   // item of another judgment → item_not_open (status, not an exception); unknown judgment still raises
   expect(await applyQ(s2.j,overrideOf(by),item)).toBe('item_not_open');
   expect(await fails(applyQ(randomUUID(),override,item))).toMatchObject({code:'P0002',message:'unknown_judgment'});
   for(const bad of [{...override,evidence_hash:'x'},{...override,resolved_by:'nope'},{...override,resolution:'x'},{...override,reason_code:undefined},{...override,cutoff:undefined}])
    expect(await fails(applyQ(j,bad,item))).toMatchObject({code:'22023'});
  });
 });

 it('reject_quarantined_settlement: void + item resolved_reject + audit in one transaction; replay-safe on request_key; stale / item_not_open write nothing (P1-05)',async()=>{
  const m=await syncNew();const b=await batch();const by=await adminUser();
  await withClaimLock(async()=>{
   const {j,item}=await quarantined(m,b);
   const row=voidRow(b,by);const key=`adm:${randomUUID()}`;
   expect(await rejectQ(j,item,key,row)).toEqual({seq:1,status:'applied'});
   expect(await q(`select seq,kind,reason,actor,request_key from public.judgment_settlements where judgment_id=$1`,[j])).toEqual([{seq:1,kind:'void',reason:'quarantine_rejected',actor:`admin:${by}`,request_key:key}]);
   expect((await q(`select status,resolved_by,(detail->>'rejected_settlement_seq')::int s from public.dq_quarantine where id=$1`,[item]))[0]).toEqual({status:'resolved_reject',resolved_by:by,s:1});
   expect((await queueOf(j)).closed_at).not.toBeNull();
   expect((await queueOf(j)).last_detail.incident).toBeUndefined();                        // R3-01: the void ends the incident
   expect(await q(`select detail->>'decision' d,(detail->>'seq')::int s from public.research_audit_log where object_id=$1`,[item])).toEqual([{d:'reject',s:1}]);
   expect(await rejectQ(j,item,key,row)).toEqual({seq:1,status:'already_applied'});         // lost response retried
   expect(await rejectQ(j,item,key,{...row,reason:'other'})).toEqual({seq:1,status:'request_key_conflict'});
   expect(await q(`select 1 from public.research_audit_log where object_id=$1`,[item])).toHaveLength(1);
   expect(await rejectQ(j,item,`adm:${randomUUID()}`,row)).toEqual({seq:1,status:'item_not_open'});
   // stale: the worker refreshed queue and item to another inconsistency after the hook read (e) → nothing written
   const s=await quarantined(m,b,H('e'));
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[s.j]);
   const t=String((await claim()).find(x=>x.judgment_id===s.j)!.lease_token);
   expect(await qs(s.j,t,{evidence_hash:H('f'),cutoff:EXP.cutoff,judgment_id:s.j},patchOf(H('f'),EXP.cutoff),b)).toEqual({status:'quarantined',quarantine_id:s.item});
   expect(await rejectQ(s.j,s.item,`adm:${randomUUID()}`,row)).toEqual({seq:0,status:'stale'});
   expect(await q(`select 1 from public.judgment_settlements where judgment_id=$1`,[s.j])).toHaveLength(0);
   expect((await q(`select status from public.dq_quarantine where id=$1`,[s.item]))[0].status).toBe('open');
   // stale (Q1-03): queue and item agree with each other but not with what the hook read
   const e2=await quarantined(m,b);
   expect(await rejectQ(e2.j,e2.item,`adm:${randomUUID()}`,row,admin,{...EXP,evidence_hash:H('f')})).toEqual({seq:0,status:'stale'});
   expect(await rejectQ(e2.j,e2.item,`adm:${randomUUID()}`,row,admin,{...EXP,cutoff:'2026-01-01T00:00:00.000Z'})).toEqual({seq:0,status:'stale'});
   expect(await q(`select 1 from public.judgment_settlements where judgment_id=$1`,[e2.j])).toHaveLength(0);
   for(const bad of [{...row,kind:'settled'},{...row,actor:'cron'}] as SettlementInsert[])
    expect(await fails(rejectQ(s.j,s.item,`adm:${randomUUID()}`,bad))).toMatchObject({code:'22023'});
   for(const exp of [{evidence_hash:'x',cutoff:EXP.cutoff},{evidence_hash:EXP.evidence_hash}] as {evidence_hash:string;cutoff:string}[])
    expect(await fails(rejectQ(s.j,s.item,`adm:${randomUUID()}`,row,admin,exp))).toMatchObject({code:'22023'});
  });
 });

 it('quarantine_settlement: ONE lease-checked transaction upserts the open item and publishes the queue state; an expired worker refreshing after its replacement gets lease_lost and writes nothing; quarantined_at of an unresolved incident is kept (Q1-01, Q1-02)',async()=>{
  const m=await syncNew();const b=await batch();
  await withClaimLock(async()=>{
   const r=judgmentRow(m,b,{target:DUE});await register(r);const j=String(r.row.judgment_id);
   const c1='2026-03-02T04:00:00.000Z',c2='2026-03-05T04:00:00.000Z';
   const t1=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
   const first=await qs(j,t1,{evidence_hash:H('e'),cutoff:c1,judgment_id:j},patchOf(H('e'),c1),b);
   expect(first.status).toBe('quarantined');
   const item=String(first.quarantine_id);
   expect((await q(`select dataset,table_name,natural_key,reason_code,status,batch_id,payload->>'evidence_hash' h,payload->>'cutoff' c from public.dq_quarantine where id=$1`,[item]))[0])
    .toEqual({dataset:'judgments',table_name:'judgment_settlements',natural_key:j,reason_code:'settlement_basis_mismatch',status:'open',batch_id:b,h:H('e'),c:c1});
   const q1=await queueOf(j);
   expect(q1).toMatchObject({last_status:'inconsistent',leased_until:null,lease_token:null,
    last_detail:{evidence_hash:H('e'),cutoff:c1,incident:{quarantine_id:item,reason_code:'settlement_basis_mismatch',evidence_hash:H('e'),cutoff:c1,quarantined_at:c1}}});
   expect(q1.next_attempt_at.toISOString()).toBe('2099-06-01T00:00:00.000Z');
   // Worker A claims and stalls past its lease; worker B claims (new token) and publishes another inconsistency.
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[j]);
   const tA=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
   await q(`update public.judgment_settle_queue set leased_until=now()-interval '1 second' where judgment_id=$1`,[j]);
   const tB=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
   expect(tB).not.toBe(tA);
   expect(await qs(j,tB,{evidence_hash:H('f'),cutoff:c2,judgment_id:j},patchOf(H('f'),c2),b)).toEqual({status:'quarantined',quarantine_id:item});   // same open item, refreshed
   // A wakes up and refreshes after its replacement: lease_lost, neither the item nor the queue changes.
   expect(await qs(j,tA,{evidence_hash:H('d'),cutoff:c2,judgment_id:j},patchOf(H('d'),c2),b)).toEqual({status:'lease_lost',quarantine_id:null});
   expect((await q(`select payload->>'evidence_hash' h,payload->>'cutoff' c from public.dq_quarantine where id=$1`,[item]))[0]).toEqual({h:H('f'),c:c2});
   // Q1-01: the incident is still unresolved, so the first quarantined_at survives B's publish.
   expect((await queueOf(j)).last_detail).toEqual({reason_code:'settlement_basis_mismatch',evidence_hash:H('f'),cutoff:c2,
    incident:{quarantine_id:item,reason_code:'settlement_basis_mismatch',evidence_hash:H('f'),cutoff:c2,quarantined_at:c1}});
   expect((await q(`select attempts from public.judgment_settle_queue where judgment_id=$1`,[j]))[0].attempts).toBe(0);
   expect((await q(`select count(*)::int n from public.dq_quarantine where natural_key=$1 and status='open'`,[j]))[0].n).toBe(1);
   // Another reason code opens its own item (the open key includes reason_code, exactly like quarantine()).
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[j]);
   const t3=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
   const gapPatch=patchOf(H('9'),c2,{reason_code:'settlement_benchmark_gap'});
   const gap=await qs(j,t3,{evidence_hash:H('9'),cutoff:c2,judgment_id:j},gapPatch,b,'settlement_benchmark_gap');
   expect(gap.status).toBe('quarantined');expect(gap.quarantine_id).not.toBe(item);
   // The incident now names the gap item and its evidence; its first quarantine time is still c1 (one unresolved incident).
   expect((await queueOf(j)).last_detail.incident).toEqual({quarantine_id:gap.quarantine_id,reason_code:'settlement_benchmark_gap',evidence_hash:H('9'),cutoff:c2,quarantined_at:c1});
   // Parameters are checked before any lock or write.
   const ok={evidence_hash:H('9'),cutoff:c2,judgment_id:j};
   const noIncident={...gapPatch,last_detail:{reason_code:'settlement_benchmark_gap',evidence_hash:H('9'),cutoff:c2}};
   for(const [payload,patch] of [[ok,{...gapPatch,last_status:'pending'}],[ok,{...gapPatch,attempts_increment:1}],[{cutoff:c2},gapPatch],[{...ok,cutoff:c1},gapPatch],[ok,noIncident]] as const)
    expect(await fails(qs(j,randomUUID(),payload,patch,b,'settlement_benchmark_gap'))).toMatchObject({code:'22023'});
   expect(await fails(qs(randomUUID(),randomUUID(),ok,gapPatch,b))).toMatchObject({code:'P0002',message:'unknown_judgment'});
  });
 });

 it('release_lease carries an open incident through transient statuses and drops a patch incident; the same inconsistency keeps the first quarantined_at; a final settlement clears it (R3-01)',async()=>{
  const m=await syncNew();const b=await batch();
  await withClaimLock(async()=>{
   const c1='2026-03-02T04:00:00.000Z';
   const {j,item}=await quarantined(m,b,H('e'),c1);
   const inc0=(await queueOf(j)).last_detail.incident;
   expect(inc0).toEqual({quarantine_id:item,reason_code:'settlement_basis_mismatch',evidence_hash:H('e'),cutoff:c1,quarantined_at:c1});
   const again=async()=>{await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[j]);return String((await claim()).find(x=>x.judgment_id===j)!.lease_token);};
   const transient:Record<string,unknown>[]=[
    {last_status:'error',last_detail:{code:'resolver_failed',message:'boom'},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:1},
    {last_status:'pending',last_detail:{reason:'awaiting_bars'},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0},
    {last_status:'unavailable',last_detail:{failure:'timeout',incident:{quarantined_at:'2099-01-01T00:00:00.000Z'}},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:1},   // a patch incident is dropped
   ];
   for(const patch of transient){
    await release(j,await again(),patch);
    const qr=await queueOf(j);
    expect({s:qr.last_status,d:qr.last_detail}).toEqual({s:patch.last_status,d:{...(patch.last_detail as Record<string,unknown>),incident:inc0}});
   }
   // The same inconsistency after error / pending / unavailable: the incident's first quarantined_at (the review deadline) survives.
   const c2='2026-03-09T04:00:00.000Z';
   expect(await qs(j,await again(),{evidence_hash:H('e'),cutoff:c2,judgment_id:j},patchOf(H('e'),c2),b)).toEqual({status:'quarantined',quarantine_id:item});
   expect((await queueOf(j)).last_detail.incident).toEqual({...inc0,cutoff:c2});
   // A final settlement ends the incident.
   expect(await appendOp(j,await again(),`${b}:${j}:1`,sRow(b))).toEqual({seq:1,status:'applied'});
   expect((await queueOf(j)).last_detail.incident).toBeUndefined();
  });
 });

 it('races on two connections: acceptance vs a worker release, acceptance vs rejection — the queue lock serialises them and the loser writes nothing (P1-04, P1-05)',async()=>{
  const m=await syncNew();const b=await batch();const by=await adminUser();
  await withClaimLock(async()=>{
   // 1. A worker's quarantine_settlement (new inconsistency) is in flight when the admin accepts the old one.
   const a=await quarantined(m,b);
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[a.j]);
   const t=String((await claim()).find(x=>x.judgment_id===a.j)!.lease_token);
   const w=await admin.connect();
   try{
    await w.query('begin');
    const wpid=Number((await w.query('select pg_backend_pid() p')).rows[0].p);
    await w.query(`select public.quarantine_settlement($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,[a.j,t,'settlement_basis_mismatch',JSON.stringify({evidence_hash:H('f'),cutoff:'2026-03-02T04:00:00.000Z',judgment_id:a.j}),JSON.stringify(patchOf(H('f'),'2026-03-02T04:00:00.000Z')),b]);
    const accepting=applyQ(a.j,overrideOf(by),a.item);                                      // blocks on the queue row lock
    await waitBlocked(wpid);
    await w.query('commit');
    expect(await accepting).toBe('stale');
   }finally{w.release();}
   expect((await queueOf(a.j)).override).toBeNull();
   // 2. Rejection and acceptance of the same item at once: exactly one wins; the other reports and writes nothing.
   const r=await quarantined(m,b);
   const c=await admin.connect();
   try{
    await c.query('begin');
    const cpid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
    expect(await rejectQ(r.j,r.item,`adm:${randomUUID()}`,voidRow(b,by),c)).toMatchObject({status:'applied'});
    const accepting=applyQ(r.j,overrideOf(by),r.item);
    await waitBlocked(cpid);
    await c.query('commit');
    expect(await accepting).toBe('item_not_open');
   }finally{c.release();}
   expect((await queueOf(r.j)).override).toBeNull();
   expect((await q(`select status from public.dq_quarantine where id=$1`,[r.item]))[0].status).toBe('resolved_reject');
   // 3. The other order: acceptance first, rejection waits and finds the item resolved.
   const x=await quarantined(m,b);
   const e=await admin.connect();
   try{
    await e.query('begin');
    const epid=Number((await e.query('select pg_backend_pid() p')).rows[0].p);
    expect(await applyQ(x.j,overrideOf(by),x.item,e)).toBe('applied');
    const rejecting=rejectQ(x.j,x.item,`adm:${randomUUID()}`,voidRow(b,by));
    await waitBlocked(epid);
    await e.query('commit');
    expect(await rejecting).toEqual({seq:0,status:'item_not_open'});
   }finally{e.release();}
   expect(await q(`select 1 from public.judgment_settlements where judgment_id=$1`,[x.j])).toHaveLength(0);
   const mine=(await claim()).find(z=>z.judgment_id===x.j)!;await park(x.j,String(mine.lease_token));   // the accepted row is due now
   // 4. Q1-03: the hook reads the item (hash e, cutoff c1); a worker then re-resolves to another inconsistency and publishes it
   //    through quarantine_settlement (same open item and queue refreshed to f / c2); the old verdicts are stale and write nothing.
   const y=await quarantined(m,b);
   const read=(await q(`select payload from public.dq_quarantine where id=$1`,[y.item]))[0].payload as {evidence_hash:string;cutoff:string};
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[y.j]);
   const ty=String((await claim()).find(z=>z.judgment_id===y.j)!.lease_token);
   const c2='2026-03-09T04:00:00.000Z';
   expect(await qs(y.j,ty,{evidence_hash:H('f'),cutoff:c2,judgment_id:y.j},patchOf(H('f'),c2),b)).toEqual({status:'quarantined',quarantine_id:y.item});
   expect(await rejectQ(y.j,y.item,`adm:${randomUUID()}`,voidRow(b,by),admin,{evidence_hash:read.evidence_hash,cutoff:read.cutoff})).toEqual({seq:0,status:'stale'});
   expect(await applyQ(y.j,overrideOf(by,read.evidence_hash,read.cutoff),y.item)).toBe('stale');
   expect(await q(`select 1 from public.judgment_settlements where judgment_id=$1`,[y.j])).toHaveLength(0);
   expect((await q(`select status from public.dq_quarantine where id=$1`,[y.item]))[0].status).toBe('open');
  });
 });

 it('freeze_calibration_cohort: one statement freezes members + latest settlements; a transaction open before the freeze and committed after is excluded consistently; members page stably; clear removes the generation (P1-10)',async()=>{
  const m=await syncNew();const b=await batch();
  const ids:string[]=[];
  for(const d of ['2025-03-01','2025-06-01','2025-09-01']){const r=judgmentRow(m,b,{asOf:d});await register(r);ids.push(String(r.row.judgment_id));}
  // One member that will be settled AFTER the freeze: registered due, taken and parked under the claim lock.
  const due=judgmentRow(m,b,{asOf:'2025-04-01',target:DUE});const dueId=String(due.row.judgment_id);
  await withClaimLock(async()=>{await register(due);await park(dueId,String((await claim()).find(x=>x.judgment_id===dueId)!.lease_token));});
  ids.push(dueId);
  await register(judgmentRow(m,b,{asOf:'2024-01-01'}));                                    // outside the window
  await register(judgmentRow(m,b,{asOf:'2025-05-01',abstained:true}));                     // abstained: not a member
  await pause(5);   // E-01: frozen_at is truncated to the millisecond, so a member registered in the same ms may fall after it
  // A registration whose transaction began BEFORE the freeze and commits AFTER it.
  const late=judgmentRow(m,b,{asOf:'2025-07-01'});
  const gen=randomUUID();
  let frozen={status:'',frozen_at:'',n:-1};
  const c=await admin.connect();
  try{
   await c.query('begin');
   await c.query(`select public.register_judgment($1::jsonb,$2::jsonb)`,[JSON.stringify(late.row),JSON.stringify(late.queue)]);
   frozen=await one(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[gen,m]);
   await c.query('commit');
  }finally{c.release();}
  expect(frozen).toMatchObject({status:'frozen',n:4});expect(Number.isFinite(Date.parse(frozen.frozen_at))).toBe(true);
  const members=async(g:string,after:string|null,limit:number)=>q(`select (e.judgment).judgment_id id,(e.settlement).settlement_id sid from public.calibration_cohort_members($1,$2,$3) e`,[g,after,limit]);
  const sorted=[...ids].sort();
  const p1=await members(gen,null,2);expect(p1.map(r=>r.id)).toEqual(sorted.slice(0,2));
  // The frozen member is settled between two pages: the generation's pages do not change.
  await withClaimLock(async()=>{
   await q(`update public.judgment_settle_queue set next_attempt_at=now() where judgment_id=$1`,[dueId]);
   const t=String((await claim()).find(x=>x.judgment_id===dueId)!.lease_token);
   expect(await appendOp(dueId,t,`${b}:${dueId}:1`,sRow(b))).toEqual({seq:1,status:'applied'});
  });
  const p2=await members(gen,p1[1].id,2);expect(p2.map(r=>r.id)).toEqual(sorted.slice(2));
  expect(await members(gen,p2[1].id,2)).toEqual([]);
  expect([...p1,...p2].every(r=>r.sid===null)).toBe(true);                                 // frozen before the settlement
  expect([...p1,...p2].map(r=>r.id)).not.toContain(String(late.row.judgment_id));             // committed after the snapshot: consistently out
  // A later generation sees the late registration and the new settlement (latest at ITS snapshot).
  const gen2=randomUUID();
  expect((await one(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[gen2,m])).n).toBe(5);
  expect((await members(gen2,null,100)).filter(r=>r.sid!==null).map(r=>r.id)).toEqual([dueId]);
  expect(await q(`select ord from public.judgment_calibration_cohort_members where generation=$1 order by judgment_id`,[gen2])).toEqual([1,2,3,4,5].map(ord=>({ord:String(ord)})));
  // Q1-05: once per generation — a second freeze returns the stored marker and inserts nothing
  expect(await one(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[gen,m])).toEqual({status:'already_frozen',frozen_at:frozen.frozen_at,n:4});
  expect(Number(await one(`select count(*)::int v from public.judgment_calibration_cohort_members where generation=$1`,[gen]))).toBe(4);
  expect(await q(`select state->>'methodology' m,state->>'version' v,(state->>'n')::int n from public.judgment_job_state where job=$1`,[`cohort:${gen}`])).toEqual([{m,v:'v1',n:4}]);
  // Q1-05: an EMPTY generation is frozen too — after a new registration in its window, reuse still returns already_frozen with n = 0
  const m0=await syncNew();const empty=randomUUID();
  expect(await one(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[empty,m0])).toMatchObject({status:'frozen',n:0});
  await register(judgmentRow(m0,b,{asOf:'2025-02-01'}));
  expect(await one(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[empty,m0])).toMatchObject({status:'already_frozen',n:0});
  expect(await members(empty,null,10)).toEqual([]);
  expect(await fails(q(`select public.freeze_calibration_cohort($1,$2,'v1','2025-12-31','2025-01-01')`,[randomUUID(),m]))).toMatchObject({code:'22023'});
  expect(await fails(q(`select * from public.calibration_cohort_members($1,null,0)`,[gen]))).toMatchObject({code:'22023'});
  expect(await one(`select public.clear_calibration_generation($1) v`,[gen])).toBe(4);
  expect(await members(gen,null,100)).toEqual([]);
  expect(await q(`select 1 from public.judgment_job_state where job=$1`,[`cohort:${gen}`])).toHaveLength(0);   // the marker goes with the members
  expect(await one(`select public.clear_calibration_generation($1) v`,[gen])).toBe(0);
  expect(await one(`select public.clear_calibration_generation($1) v`,[empty])).toBe(0);
  expect((await one(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[empty,m0])).status).toBe('frozen');   // cleared → claimable again
  await one(`select public.clear_calibration_generation($1) v`,[empty]);
  for(const role of ['anon','authenticated'])
   expect(await fails(asRole(admin,role,c2=>c2.query(`select * from public.calibration_cohort_members($1,null,10)`,[gen2])))).toMatchObject({code:'42501'});
 });

 it('freeze_calibration_cohort: two concurrent freezes of one generation — the second waits on the claim and returns already_frozen; members are inserted once (Q1-05)',async()=>{
  const m=await syncNew();const b=await batch();
  for(const d of ['2025-03-01','2025-06-01'])await register(judgmentRow(m,b,{asOf:d}));
  await pause(5);   // E-01: frozen_at is truncated to the millisecond, so a member registered in the same ms may fall after it
  const gen=randomUUID();
  const c=await admin.connect();
  try{
   await c.query('begin');
   const cpid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
   const first=(await c.query(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[gen,m])).rows[0].v as {status:string;frozen_at:string;n:number};
   const second=one(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[gen,m]);   // blocks on the marker's primary key
   await waitBlocked(cpid);
   await c.query('commit');
   expect(first).toMatchObject({status:'frozen',n:2});
   expect(await second).toEqual({status:'already_frozen',frozen_at:first.frozen_at,n:2});
  }finally{c.release();}
  expect(Number(await one(`select count(*)::int v from public.judgment_calibration_cohort_members where generation=$1`,[gen]))).toBe(2);
  expect(await one(`select public.clear_calibration_generation($1) v`,[gen])).toBe(2);
 });

 it('judgment_envelope_by_id: one envelope under latest / as_known, RLS-gated by publishable, empty for an unknown id (P2-01)',async()=>{
  const row=methodologyRow();const m=String(row.methodology_id);await sync({...row,publishable:true});const b=await batch();
  const r=judgmentRow(m,b,{subjectType:'macro_region',subjectKey:'CN'});await register(r);const j=String(r.row.judgment_id);
  const byId=(c:Conn,id:string,view:string,cutoff:string|null)=>c.query(`select (e.judgment).judgment_id id from public.judgment_envelope_by_id($1,$2,$3::timestamptz) e`,[id,view,cutoff]).then(x=>x.rows.map(y=>y.id));
  expect(await asRole(admin,'anon',c=>byId(c,j,'latest',null))).toEqual([j]);
  expect(await asRole(admin,'anon',c=>byId(c,j,'as_known','2000-01-01T00:00:00.000Z'))).toEqual([]);
  expect(await asRole(admin,'anon',c=>byId(c,j,'as_known',new Date(Date.now()+60_000).toISOString()))).toEqual([j]);
  expect(await asRole(admin,'anon',c=>byId(c,randomUUID(),'latest',null))).toEqual([]);
  await sync({...row,publishable:false});
  expect(await asRole(admin,'anon',c=>byId(c,j,'latest',null))).toEqual([]);
  expect(await fails(q(`select * from public.judgment_envelope_by_id($1,'as_known',null)`,[j]))).toMatchObject({code:'22023'});
 });

 it('repair_stale_batches: only the named judgments.* dataset, only running batches older than the threshold; appends stale_running',async()=>{
  const ds=`judgments.${mid()}`;const stale=randomUUID(),fresh=randomUUID(),done=randomUUID();
  await q(`insert into public.ingest_batches(batch_id,producer,dataset,started_at) values($1,'ts-judgments',$2,now()-interval '1 hour'),($3,'ts-judgments',$2,now())`,[stale,ds,fresh]);
  await q(`insert into public.ingest_batches(batch_id,producer,dataset,status,started_at,finished_at) values($1,'ts-judgments',$2,'success',now()-interval '2 hours',now()-interval '1 hour')`,[done,ds]);
  expect(await one(`select public.repair_stale_batches($1,'15 minutes') v`,[ds])).toBe(1);
  const s=(await q(`select status,finished_at is not null f,errors from public.ingest_batches where batch_id=$1`,[stale]))[0];
  expect(s).toMatchObject({status:'failed',f:true});expect(s.errors.at(-1)).toMatchObject({code:'stale_running'});
  expect((await q(`select batch_id,status from public.ingest_batches where batch_id=any($1::uuid[]) order by status`,[[fresh,done]])).map(x=>x.status)).toEqual(['running','success']);
  expect(await one(`select public.repair_stale_batches($1,'15 minutes') v`,[ds])).toBe(0);
  for(const [d,i] of [['facts.us','15 minutes'],['judgments','15 minutes'],[ds,'30 seconds'],['judgments.Bad','15 minutes']])
   expect({d,i,e:await fails(q(`select public.repair_stale_batches($1,$2::interval)`,[d,i]))}).toMatchObject({d,i,e:{code:'22023'}});
 });

 it('GIN containment: judgments whose inputs contain {kind:macro_snapshot, ref:{snapshot_id}} are found by @>, abstained registrations included (spec §7.1 step 0)',async()=>{
  const m=await syncNew({inputKinds:['macro_snapshot']});const b=await batch();const snap=randomUUID();
  const input={kind:'macro_snapshot',ref:{snapshot_id:snap},snapshot:{snapshot_id:snap},hash:H('2'),available_at:'2026-01-31T00:00:00.000Z',origin:{publisher:'fixture',adapter:'fixture',locator:snap}};
  const a=judgmentRow(m,b,{inputs:[input]});await register(a);
  const ab=judgmentRow(m,b,{inputs:[input],abstained:true,subjectKey:'CN'});await register(ab);
  await register(judgmentRow(m,b,{inputs:[{...input,ref:{snapshot_id:randomUUID()}}]}));
  const found=await q(`select judgment_id from public.judgments where inputs @> $1::jsonb order by judgment_id`,[JSON.stringify([{kind:'macro_snapshot',ref:{snapshot_id:snap}}])]);
  expect(found.map(r=>r.judgment_id)).toEqual([String(a.row.judgment_id),String(ab.row.judgment_id)].sort());
 });

 // ---- review round 1 (coordinator items 1–8) ----
 it('reopened clears the accepted override: settled via override → withdrawn → reopened → override null, and the same inconsistency is quarantined again',async()=>{
  const m=await syncNew();const b=await batch();const by=await adminUser();const A=`admin:${by}`;
  await withClaimLock(async()=>{
   const {j,item}=await quarantined(m,b);
   expect(await applyQ(j,overrideOf(by),item)).toBe('applied');
   expect((await queueOf(j)).override).not.toBeNull();
   const t=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
   expect(await appendOp(j,t,`${b}:${j}:1`,sRow(b))).toEqual({seq:1,status:'applied'});
   expect(await appendOp(j,null,`adm:${randomUUID()}`,sRow(b,{kind:'withdrawn',outcome:null,realized:null,reason:'bad',actor:A}))).toEqual({seq:2,status:'applied'});
   expect(await appendOp(j,null,`adm:${randomUUID()}`,sRow(b,{kind:'reopened',outcome:null,realized:null,reason:'again',actor:A}))).toEqual({seq:3,status:'applied'});
   expect((await queueOf(j)).override).toBeNull();
   const t2=String((await claim()).find(x=>x.judgment_id===j)!.lease_token);
   const c='2026-03-02T04:00:00.000Z';
   const res=await qs(j,t2,{evidence_hash:H('e'),cutoff:c,judgment_id:j},patchOf(H('e'),c),b);
   expect(res.status).toBe('quarantined');expect(res.quarantine_id).not.toBe(item);
   expect((await queueOf(j)).override).toBeNull();
  });
 });

 it('an EXPIRED lease is lease_lost for release_lease, append_settlement and quarantine_settlement even when the token matches; nothing is written (C-01)',async()=>{
  const m=await syncNew();const b=await batch();
  await withClaimLock(async()=>{
   const js:string[]=[];
   for(let i=0;i<3;i++){const r=judgmentRow(m,b,{target:DUE});await register(r);js.push(String(r.row.judgment_id));}
   const mine=(await claim(100,1)).filter(x=>js.includes(x.judgment_id));
   expect(mine).toHaveLength(3);
   const tok=(id:string)=>String(mine.find(x=>x.judgment_id===id)!.lease_token);
   await pause(2000);
   const patch={last_status:'pending',last_detail:{},next_attempt_at:'2099-06-01T00:00:00.000Z',attempts_increment:0};
   expect(await fails(release(js[0],tok(js[0]),patch))).toMatchObject({code:'55P03',message:'lease_lost'});
   expect(await fails(appendOp(js[1],tok(js[1]),`${b}:${js[1]}:1`,sRow(b)))).toMatchObject({code:'55P03',message:'lease_lost'});
   const c='2026-03-02T04:00:00.000Z';
   expect(await qs(js[2],tok(js[2]),{evidence_hash:H('e'),cutoff:c,judgment_id:js[2]},patchOf(H('e'),c),b)).toEqual({status:'lease_lost',quarantine_id:null});
   expect(await q(`select 1 from public.judgment_settlements where judgment_id=any($1::uuid[])`,[js])).toHaveLength(0);
   expect(await q(`select 1 from public.dq_quarantine where natural_key=$1`,[js[2]])).toHaveLength(0);
   for(const j of js)expect(await queueOf(j)).toMatchObject({last_status:null,closed_at:null});
   for(const x of (await claim()).filter(y=>js.includes(y.judgment_id)))await park(x.judgment_id,String(x.lease_token));   // expired leases are claimable again
  });
 });

 it('judgment_envelope_of is not a bypass: under as_known it applies registered_at / methodology-event predicates, and an unpublishable row yields nothing (C-02)',async()=>{
  const row=methodologyRow();const m=String(row.methodology_id);await sync({...row,publishable:true});const b=await batch();
  const r=judgmentRow(m,b,{subjectType:'macro_region',subjectKey:'CN'});await register(r);const j=String(r.row.judgment_id);
  const json=JSON.stringify((await q(`select to_jsonb(x) v from public.judgments x where judgment_id=$1`,[j]))[0].v);
  const call=(role:string,view:string,cutoff:string|null)=>asRole(admin,role,async c=>(await c.query(`select ((public.judgment_envelope_of(jsonb_populate_record(null::public.judgments,$1::jsonb),$2,$3::timestamptz)).judgment).judgment_id id`,[json,view,cutoff])).rows[0].id as string|null);
  for(const role of ['anon','authenticated']){
   expect(await call(role,'latest',null)).toBe(j);
   expect(await call(role,'as_known','2000-01-01T00:00:00.000Z')).toBeNull();
   expect(await call(role,'as_known',new Date(Date.now()+60_000).toISOString())).toBe(j);
  }
  await sync({...row,publishable:false});
  expect(await call('anon','latest',null)).toBeNull();
 });

 it('judgment_envelope_of trusts only the judgment id: a forged registered_at or substituted methodology fields change nothing, and bad views are refused (D-01)',async()=>{
  const row=methodologyRow();const m=String(row.methodology_id);await sync({...row,publishable:true});const b=await batch();
  const r=judgmentRow(m,b,{subjectType:'macro_region',subjectKey:'CN'});await register(r);const j=String(r.row.judgment_id);
  const other=await syncNew();                                                              // a second methodology the forger substitutes
  const future=new Date(Date.now()+3_600_000).toISOString();
  const pastCut='2000-01-01T00:00:00.000Z';
  const forged:Record<string,unknown>[]=[{registered_at:'1999-01-01T00:00:00.000Z'},{methodology_id:other},{methodology_id:other,methodology_version:'v9',registered_at:'1999-01-01T00:00:00.000Z'}];
  const call=(role:string,patch:Record<string,unknown>,view:string,cutoff:string|null)=>asRole(admin,role,async c=>(await c.query(
   `select (e).judgment.judgment_id id,(e).judgment.registered_at ra,(e).judgment.methodology_id mid from (select public.judgment_envelope_of(jsonb_populate_record(null::public.judgments,(select to_jsonb(x) from public.judgments x where judgment_id=$1)||$2::jsonb),$3,$4::timestamptz) e) t`,[j,JSON.stringify(patch),view,cutoff])).rows[0] as {id:string|null;ra:Date|null;mid:string|null});
  for(const role of ['anon','authenticated'])for(const patch of forged){
   expect({role,patch,r:(await call(role,patch,'as_known',pastCut)).id}).toEqual({role,patch,r:null});       // registered after the cutoff whatever the caller claims
   const ok=await call(role,patch,'as_known',future);
   expect({role,patch,id:ok.id,mid:ok.mid}).toEqual({role,patch,id:j,mid:m});                              // the stored row comes back, not the forged one
   expect(ok.ra!.getFullYear()).toBeGreaterThan(2000);
  }
  expect((await call('anon',{judgment_id:randomUUID()},'latest',null)).id).toBeNull();
  for(const [view,cut] of [['sometimes',null],['as_known',null]] as const)expect(await fails(call('anon',{},view,cut))).toMatchObject({code:'22023'});
 });

 it('calibration_valid under the latest view ignores the supplied cutoff (C-03)',async()=>{
  const m=await syncNew();const b=await batch();
  const r=judgmentRow(m,b,{subjectType:'issuer',subjectKey:randomUUID()});await register(r);
  expect(await one(`select public.insert_calibration($1::jsonb,1) v`,[JSON.stringify({...calibrationCols(m,b),valid_until:'2020-01-01T00:00:00.000Z'})])).toBe('inserted');
  const cv=(cutoff:string|null)=>q(`select e.calibration_valid cv from public.latest_judgment_cards('issuer',$1,null,'latest',$2::timestamptz) e`,[r.row.subject_key,cutoff]);
  expect(await cv(null)).toEqual([{cv:false}]);
  expect(await cv('1900-01-01T00:00:00.000Z')).toEqual([{cv:false}]);
 });

 it('freeze and clear of one generation serialise on a per-generation lock, in either order (C-04)',async()=>{
  const m=await syncNew();const b=await batch();
  for(const d of ['2025-03-01','2025-06-01'])await register(judgmentRow(m,b,{asOf:d}));
  await pause(5);   // E-01: frozen_at is truncated to the millisecond, so a member registered in the same ms may fall after it
  const frz=(g:string)=>`select public.freeze_calibration_cohort('${g}','${m}','v1','2025-01-01','2025-12-31') v`;
  // freeze in flight, clear waits and then removes what the freeze wrote
  const g1=randomUUID();const c=await admin.connect();
  try{
   await c.query('begin');
   const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
   expect((await c.query(frz(g1))).rows[0].v).toMatchObject({status:'frozen',n:2});
   const clearing=one(`select public.clear_calibration_generation($1) v`,[g1]);
   await waitBlocked(pid);
   await c.query('commit');
   expect(await clearing).toBe(2);
  }finally{await c.query('rollback').catch(()=>{});c.release();}
  expect(Number(await one(`select count(*)::int v from public.judgment_calibration_cohort_members where generation=$1`,[g1]))).toBe(0);
  expect(await q(`select 1 from public.judgment_job_state where job=$1`,[`cohort:${g1}`])).toHaveLength(0);
  // clear in flight, freeze waits and then freezes anew
  const g2=randomUUID();expect(await one(frz(g2))).toMatchObject({status:'frozen',n:2});
  const d=await admin.connect();
  try{
   await d.query('begin');
   const pid=Number((await d.query('select pg_backend_pid() p')).rows[0].p);
   expect((await d.query(`select public.clear_calibration_generation($1) v`,[g2])).rows[0].v).toBe(2);
   const freezing=one(frz(g2));
   await waitBlocked(pid);
   await d.query('commit');
   expect(await freezing).toMatchObject({status:'frozen',n:2});
  }finally{await d.query('rollback').catch(()=>{});d.release();}
  expect(await one(`select public.clear_calibration_generation($1) v`,[g2])).toBe(2);
 });

 it('freeze: only registrations at or before frozen_at and settlements at or before it are frozen (minor 7)',async()=>{
  const m=await syncNew();const b=await batch();
  await pause(5);   // E-01: frozen_at is truncated to the millisecond, so a member registered in the same ms may fall after it
  await register(judgmentRow(m,b,{asOf:'2025-03-01'}));
  const gen=randomUUID();const c=await admin.connect();
  try{
   await c.query('begin');
   const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
   await c.query(`select pg_advisory_xact_lock(pg_catalog.hashtextextended('cohort:'||$1::text,0))`,[gen]);   // the generation lock (C-04)
   const freezing=one(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[gen,m]);
   await waitBlocked(pid);
   await register(judgmentRow(m,b,{asOf:'2025-04-01'}));                               // registered_at is later than the freeze call, committed before its snapshot
   await c.query('commit');
   expect(await freezing).toMatchObject({status:'frozen',n:1});
  }finally{await c.query('rollback').catch(()=>{});c.release();}
  expect(Number(await one(`select count(*)::int v from public.judgment_calibration_cohort_members where generation=$1`,[gen]))).toBe(1);
 });

 it('freeze: frozen_at has millisecond precision and the ms value reproduces the frozen set, also for a member registered in the same millisecond (E-01)',async()=>{
  const m=await syncNew();const b=await batch();
  for(let i=0;i<25;i++){
   const c=await admin.connect();
   try{
    await c.query('begin');
    const r=judgmentRow(m,b,{asOf:`2025-02-${String(i+1).padStart(2,'0')}`});
    await c.query(`select public.register_judgment($1::jsonb,$2::jsonb)`,[JSON.stringify(r.row),JSON.stringify(r.queue)]);
    const f=(await c.query(`select public.freeze_calibration_cohort($1,$2,'v1','2025-01-01','2025-12-31') v`,[randomUUID(),m])).rows[0].v as {frozen_at:string;n:number};
    const at=(await c.query(`select ($1::timestamptz = date_trunc('milliseconds',$1::timestamptz)) ms, count(*)::int n from public.judgments j where j.methodology_id=$2 and not j.abstained and j.as_of between '2025-01-01' and '2025-12-31' and j.registered_at <= date_trunc('milliseconds',$1::timestamptz)`,[f.frozen_at,m])).rows[0] as {ms:boolean;n:number};
    expect({i,ms:at.ms,n:at.n}).toEqual({i,ms:true,n:Number(f.n)});
    await c.query('commit');
   }finally{await c.query('rollback').catch(()=>{});c.release();}
  }
 });

 it('apply / reject require the item to be a judgment_settlements item and to be the queue incident\'s own quarantine_id, else stale (minor 6)',async()=>{
  const m=await syncNew();const b=await batch();const by=await adminUser();
  await withClaimLock(async()=>{
   const {j}=await quarantined(m,b);
   const payload=JSON.stringify({evidence_hash:H('e'),cutoff:'2026-03-02T04:00:00.000Z',judgment_id:j});
   const wrongTable=randomUUID(),otherReason=randomUUID();
   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'judgments','judgments',$2,'settlement_basis_mismatch',$3,$4::jsonb)`,[wrongTable,j,b,payload]);
   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'judgments','judgment_settlements',$2,'settlement_benchmark_gap',$3,$4::jsonb)`,[otherReason,j,b,payload]);
   for(const id of [wrongTable,otherReason]){
    expect(await applyQ(j,overrideOf(by),id)).toBe('stale');
    expect(await rejectQ(j,id,`adm:${randomUUID()}`,voidRow(b,by))).toEqual({seq:0,status:'stale'});
    expect((await q(`select status from public.dq_quarantine where id=$1`,[id]))[0].status).toBe('open');
   }
   expect((await queueOf(j)).override).toBeNull();
   expect(await q(`select 1 from public.judgment_settlements where judgment_id=$1`,[j])).toHaveLength(0);
  });
 });

 it('the public RPCs also run for the authenticated role under RLS (minor 8)',async()=>{
  const row=methodologyRow();const m=String(row.methodology_id);await sync({...row,publishable:true});const b=await batch();
  await register(judgmentRow(m,b,{subjectType:'macro_region',subjectKey:'HK'}));
  const view=()=>asRole(admin,'authenticated',async c=>(await c.query(`select 1 from public.latest_judgment_cards('macro_region','HK',null,'latest',null) e where (e.judgment).methodology_id=$1`,[m])).rows.length);
  expect(await view()).toBe(1);
  await sync({...row,publishable:false});
  expect(await view()).toBe(0);
 });
});
