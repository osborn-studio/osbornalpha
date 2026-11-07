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

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261109150000_judgments.sql';
const TABLES=['judgment_methodologies','judgment_methodology_events','judgments','judgment_settlements','judgment_settle_queue','judgment_calibrations','judgment_calibration_validity','judgment_job_state','judgment_calibration_cohort_members'];
const OPEN_READ=['judgment_methodologies','judgment_methodology_events','judgment_calibration_validity'];
const GATED=['judgments','judgment_settlements','judgment_calibrations'];
const PRIVATE=['judgment_settle_queue','judgment_job_state','judgment_calibration_cohort_members'];
const TRIGGER_FNS=['judgment_methodologies_limited_update()','judgments_append_only()','judgment_settlements_sequence()'];
const ROLES=['anon','authenticated','service_role'];
const F4_CLAIM_LOCK=20261109;
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
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
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
