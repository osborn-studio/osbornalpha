// src/lib/industry/functions.integration.test.ts
// I-0 (spec §4.3 function table, §4.5, §5.4, §6.1, §6.4, §13.2): migration 20261111091000 on real
// PostgreSQL — every function's security attributes and EXECUTE matrix, service_role without direct
// writes (42501, truncate included) yet able to run every RPC, the membership lifecycle / source
// immutability / run immutability / row freeze triggers, apply_industry_memberships atomicity and
// concurrency (two connections), apply_observations receipts (A→B→A, the V7 retry, concurrency),
// run creation/activation (incomplete, dependencies_incomplete, obsolete_run, dependency_regression,
// one activation instant, a run created before and activated after UTC midnight), the valuation
// publish/activate path with the freeze and the V8 prune, the manifest index, and (Task 4) the
// pgIndustryDb contract. Isolation: private classification versions 't…' with their own licence rows,
// random tickers, ts_codes and l1 codes; prune is always scoped to a private version.
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {industryDbContract,mark} from './db-contract';
import type {IndustryContractHarness} from './db-contract';
import {mulDecimalText} from './memory-industry-db';
import {pgIndustryDb} from './pg-industry-db';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261111091000_industry_research_functions.sql';
const hex=(n:number)=>randomBytes(n).toString('hex');
/** Every function of both migrations with its EXECUTE grantees ('internal' = nobody). */
const FUNCTIONS:Record<string,'read'|'service'|'internal'>={
 'industry_dataset_is_public(text)':'read','industry_metric_run_visible(uuid)':'read','industry_valuation_run_visible(uuid)':'read','industry_freshness()':'read',
 'set_industry_dataset_license(text,text,text,text)':'service','industry_state_fingerprint(text)':'service','upsert_industry_source_memberships(uuid,jsonb)':'service',
 'record_industry_source_resolution_error(uuid[],jsonb)':'service','apply_industry_memberships(uuid,uuid,text,text,jsonb,uuid[],jsonb)':'service','correct_industry_membership_windows(uuid,uuid,text,text,uuid,jsonb)':'service','quarantine_industry_membership_lineage(uuid,text,text,uuid[],text)':'service',
 'apply_sic_memberships(uuid,uuid,text,date,text,jsonb,uuid,jsonb)':'service','begin_industry_fetch_event(text,jsonb,uuid)':'service','retry_industry_fetch_event(uuid)':'service',
 'apply_observations(text,uuid,jsonb)':'service','create_industry_metric_run(jsonb)':'service','create_industry_valuation_run(jsonb)':'service',
 'set_industry_metric_run_coverage(uuid,jsonb)':'service','fail_industry_run(text,uuid,text)':'service','stage_industry_metrics(uuid,jsonb)':'service',
 'stage_industry_run_dependencies(uuid,text,jsonb)':'service','stage_industry_valuations(uuid,jsonb)':'service','stage_industry_valuation_pairs(uuid,jsonb)':'service',
 'publish_industry_valuations(uuid)':'service','activate_industry_metric_run(uuid)':'service','activate_industry_valuation_run(uuid)':'service',
 'put_industry_manifest(text,text,integer)':'service','gc_industry_manifest_candidates(integer,integer)':'service','delete_industry_manifests(jsonb,integer)':'service','industry_manifests_lock_for_reference(jsonb)':'internal',
 'prune_industry_runs(integer,text,text)':'service',
 'industry_metric_run_lock(uuid)':'internal','industry_valuation_run_lock(uuid)':'internal','industry_manifest_unreferenced(text)':'internal',
 'industry_candidate_members(text,text,integer,text,date,date)':'internal',
};
const TRIGGER_FUNCTIONS=['issuer_industry_memberships_lifecycle()','industry_source_memberships_immutable()','industry_runs_immutable()','industry_rows_frozen()'];

// Same replay policy as facts.integration.test.ts (not exported there).
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
/** Runs body inside one transaction on its own connection (pid known); rolls back only if still open. */
interface Tx{c:PoolClient;pid:number;commit():Promise<void>}
async function inTx(pool:Pool,body:(tx:Tx)=>Promise<void>):Promise<void>{
 const c=await pool.connect();let open=false;let broken:Error|undefined;
 try{
  await c.query('begin');open=true;
  const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
  await body({c,pid,commit:async()=>{await c.query('commit');open=false;}});
 }finally{
  if(open)await c.query('rollback').catch(e=>{broken=e as Error;});
  c.release(broken);
 }
}
/** Deterministic "is blocked": polls (20 ms, <= 3 s) until some backend waits on `pid`, then asserts p is still pending. */
async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
 let settled=false;p.then(()=>{settled=true;},()=>{settled=true;});
 for(const deadline=Date.now()+3000;;){
  const n=Number((await pool.query(`select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid])).rows[0].n);
  if(n>=1)break;
  if(settled||Date.now()>deadline)throw new Error(`no backend blocked behind pid ${pid} (settled=${settled})`);
  await new Promise(r=>setTimeout(r,20));
 }
 expect(settled).toBe(false);
}
type PgErr={message:string;code?:string};
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);

describe.skipIf(!enabled)('I-0 industry functions on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[],c:Pool|PoolClient=admin)=>(await c.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[],c:Pool|PoolClient=admin)=>(await q(text,values,c))[0]?.v;
 type GcClaim={hash:string;object_path:string;claim:string};
 const gcClaims=async(minAge?:number)=>(await one(minAge===undefined?`select public.gc_industry_manifest_candidates(100000) v`:`select public.gc_industry_manifest_candidates(100000,$1) v`,minAge===undefined?[]:[minAge])) as GcClaim[];
 const gcHashes=async(minAge?:number)=>(await gcClaims(minAge)).map(c=>c.hash);
 const gcDelete=(claims:{hash:string;claim:string}[])=>one(`select public.delete_industry_manifests($1::jsonb) v`,[JSON.stringify(claims)]);
 const objectPath=async(h:string)=>(await one(`select object_path v from public.industry_manifests where manifest_hash=$1`,[h])) as string|undefined;
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_zh) values($1,'行业函数测试')`,[id]);return id;};
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'industry-test','industry.test')`,[id]);return id;};
 const ticker=async()=>{const t=`ZZ${hex(4).toUpperCase()}`;await q(`insert into public.stocks_universe(ticker,name,market) values($1,'Industry Test','A')`,[t]);return t;};
 /** Private sw2021 version: nodes A1 > A11 > A111, B1 > B11 > B111 and an internal licence row. */
 const version=async()=>{
  const v=`t${hex(4)}`;
  await q(`insert into public.industry_dataset_licenses(dataset_key,status,decided_by) values($1,'internal','industry-test')`,[`scheme:sw2021:${v}`]);
  await q(`insert into public.industry_classifications(scheme,version,code,level,name_zh,parent_code) values
   ('sw2021',$1,'A1',1,'甲',null),('sw2021',$1,'B1',1,'乙',null),('sw2021',$1,'A11',2,'甲一','A1'),('sw2021',$1,'B11',2,'乙一','B1'),('sw2021',$1,'A111',3,'甲一一','A11'),('sw2021',$1,'B111',3,'乙一一','B11')`,[v]);
  return v;
 };
 const target=(code:string,level:number,o:Record<string,unknown>={})=>({code,level,valid_from:'2021-07-30',valid_to:null,available_date:'2021-07-30',valid_to_available_date:null,source:'tushare:index_member_all',provenance:{availability:'effective_date_assumed'},...o});
 const three=(sid:string|null,o:Record<string,unknown>={},codes=['A1','A11','A111'])=>codes.map((c,i)=>target(c,i+1,{...o,provenance:{availability:'effective_date_assumed',...(sid?{source_membership_id:sid}:{})}}));
 const srcRow=(o:Record<string,unknown>={})=>({source:'tushare:index_member_all',ts_code:`Z${hex(3)}.SZ`,name:'测试',l1_code:`ZT${hex(3)}`,l2_code:'L2',l3_code:'L3',in_date:'2021-07-30',out_date:null,observed_at:'2026-11-06T00:00:00Z',raw_hash:hex(32),locator:{page:1},...o});
 const upsertSources=(b:string,rows:unknown[],c:Pool|PoolClient=admin)=>one(`select public.upsert_industry_source_memberships($1,$2::jsonb) v`,[b,JSON.stringify(rows)],c);
 const currentSource=async(l1:string)=>(await q(`select * from public.industry_source_memberships where l1_code=$1 and status='current' order by ts_code,in_date`,[l1]));
 const apply=(b:string,iss:string,v:string,rows:unknown[],sources:string[],c:Pool|PoolClient=admin)=>one(`select public.apply_industry_memberships($1,$2,'sw2021',$3,$4::jsonb,$5::uuid[],$6::jsonb) v`,[b,iss,v,JSON.stringify(rows),sources,JSON.stringify({method:'today',resolved_at:'2026-11-06'})],c);
 const rowsOf=(iss:string)=>q(`select membership_id,code,level,status,valid_to::text valid_to,superseded_by from public.issuer_industry_memberships where issuer_id=$1 order by level,status,valid_from`,[iss]);
 const createRun=async(v:string,b:string,o:Record<string,unknown>={},c:Pool|PoolClient=admin)=>(await one(`select public.create_industry_metric_run($1::jsonb) v`,[JSON.stringify({scheme:'sw2021',version:v,level:1,facts_as_of:'2025-03-31',knowledge_date:'2025-03-31',history_class:'reconstruction',
  method_version:'industry-agg/1.0',config_hash:'c'.repeat(64),formula_version:'derive/1',code_version:'test',expected_grid:{codes:['A1','B1'],period_ends:['2024-12-31'],metrics:['member_count']},fingerprint_at:'2026-11-06T00:00:00Z',reused_from_run:null,batch_id:b,...o})],c)) as {run_id:string;generation:number};
 const manifest=async(c:Pool|PoolClient=admin)=>{const h=hex(32);expect(await one(`select public.put_industry_manifest($1,'aggregate',10) v`,[h],c)).toBe(true);return h;};
 const cells=(m:string,n:number,o:Record<string,unknown>={})=>['A1','B1'].map(code=>({code,metric:'member_count',period_start:'2024-12-31',period_end:'2024-12-31',duration:'INSTANT',status:'ok',missing_reason:null,value:String(n),unit:'count',n_members:n,n_with_data:n,n_unresolved:0,manifest_hash:m,...o}));
 const stage=(run:string,rows:unknown[],c:Pool|PoolClient=admin)=>one(`select public.stage_industry_metrics($1,$2::jsonb) v`,[run,JSON.stringify(rows)],c);
 const deps=(run:string,rows:{cell_key:string;issuer_id:string;state_rev:number}[],kind='aggregate',c:Pool|PoolClient=admin)=>one(`select public.stage_industry_run_dependencies($1,$2,$3::jsonb) v`,[run,kind,JSON.stringify(rows)],c);
 const activate=(run:string,c:Pool|PoolClient=admin)=>one(`select public.activate_industry_metric_run($1) v`,[run],c);
 const markRow=(t:string,close:string,o:Record<string,unknown>={})=>({ticker:t,trade_date:'2001-04-02',close,total_share:'1000',source:'tushare:daily_basic',upstream:'sse',raw_hash:hex(32),locator:{},...o});
 const begin=async(b:string,c:Pool|PoolClient=admin)=>(await one(`select public.begin_industry_fetch_event('marks','{"trade_date":"2001-04-02"}'::jsonb,$1) v`,[b],c)) as string;
 const observe=(e:string,rows:unknown[],kind='marks',c:Pool|PoolClient=admin)=>one(`select public.apply_observations($1,$2,$3::jsonb) v`,[kind,e,JSON.stringify(rows)],c);
 const currentMark=async(t:string,d='2001-04-02')=>(await q(`select observation_id,close_text,fetch_event_id,supersedes from public.security_marks where ticker=$1 and trade_date=$2 and status='ok'`,[t,d]))[0];
 const asRole=async<T>(role:string,body:(c:PoolClient)=>Promise<T>):Promise<T>=>{
  const c=await admin.connect();
  try{await c.query(`set role ${role}`);return await body(c);}
  finally{await c.query('reset role').catch(()=>{});c.release();}
 };

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 it('every function is security definer, owned by the table owner, with search_path pinned; EXECUTE: four read functions for clients, the rest service_role only, helpers nobody; replays twice',async()=>{
  const owner=await one(`select relowner::regrole::text v from pg_class where oid='public.industry_metrics'::regclass`);
  for(const [sig,kind] of Object.entries(FUNCTIONS)){
   const f=(await q(`select prosecdef,proowner::regrole::text owner,array_to_string(proconfig,';') config from pg_proc where oid=$1::regprocedure`,[`public.${sig}`]))[0];
   expect({sig,secdef:f.prosecdef,owner:f.owner,config:f.config}).toEqual({sig,secdef:true,owner,config:'search_path=pg_catalog, public'});
   const can=async(role:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,`public.${sig}`]);
   expect({sig,anon:await can('anon'),auth:await can('authenticated'),service:await can('service_role'),public:await one(`select exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=$1::regprocedure and a.grantee=0) v`,[`public.${sig}`])})
    .toEqual({sig,anon:kind==='read',auth:kind==='read',service:kind!=='internal',public:false});
  }
  for(const sig of TRIGGER_FUNCTIONS){
   const f=(await q(`select prosecdef,array_to_string(proconfig,';') config from pg_proc where oid=$1::regprocedure`,[`public.${sig}`]))[0];
   expect({sig,secdef:f.prosecdef,config:f.config}).toEqual({sig,secdef:false,config:'search_path=pg_catalog, public'});
  }
  const triggers=(await q(`select tgrelid::regclass::text t,tgname from pg_trigger where not tgisinternal and tgname=any($1) order by 1,2`,[['issuer_industry_memberships_lifecycle','industry_source_memberships_immutable','industry_runs_immutable','industry_metrics_frozen','industry_valuations_frozen','industry_valuation_pairs_frozen']])).map(r=>`${r.t}.${r.tgname}`);
  expect(triggers).toEqual(['industry_metric_runs.industry_runs_immutable','industry_metrics.industry_metrics_frozen','industry_source_memberships.industry_source_memberships_immutable','industry_valuation_pairs.industry_valuation_pairs_frozen','industry_valuation_runs.industry_runs_immutable','industry_valuations.industry_valuations_frozen','issuer_industry_memberships.issuer_industry_memberships_lifecycle']);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
  expect(await one(`select has_function_privilege('anon','public.apply_observations(text,uuid,jsonb)','EXECUTE') v`)).toBe(false);
 },60000);

 it('set_industry_dataset_license records its audit row in the same transaction: a failing audit insert rolls the switch back',async()=>{
  const v=await version();const key=`scheme:sw2021:${v}`;
  const user=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[user,`${user}@example.test`]);
  await q(`select public.set_industry_dataset_license($1,'public',$2,'owner decision')`,[key,user]);
  expect(await one(`select status v from public.industry_dataset_licenses where dataset_key=$1`,[key])).toBe('public');
  const [row]=await q(`select user_id,actor,action,object_type,object_id,detail from public.research_audit_log where detail->>'object_ref'=$1`,[key]);
  expect(row).toMatchObject({user_id:user,actor:user,action:'industry.license_set',object_type:'industry',object_id:null,detail:{object_ref:key,from:'internal',to:'public',note:'owner decision'}});
  // an actor without an auth user (and a non-uuid actor) makes the audit insert fail → the switch is not committed
  await expect(q(`select public.set_industry_dataset_license($1,'internal',$2,null)`,[key,randomUUID()])).rejects.toThrow();
  await expect(q(`select public.set_industry_dataset_license($1,'internal','svc',null)`,[key])).rejects.toThrow();
  expect(await one(`select status v from public.industry_dataset_licenses where dataset_key=$1`,[key])).toBe('public');
  expect(await q(`select 1 from public.research_audit_log where detail->>'object_ref'=$1`,[key])).toHaveLength(1);
 });
 it('industry_freshness returns only {dataset, status, last_ok_at} of industry.* rows; the fingerprint carries state_rev per issuer',async()=>{
  const d=`industry.fn-${hex(3)}`;
  await q(`insert into public.dq_freshness(dataset,expected_cadence,status,last_ok_at,consecutive_errors,detail) values($1,'weekly','fresh',now(),0,'{"secret":1}'),($2,'daily','missing',null,0,'{}')`,[d,`other.fn-${hex(3)}`]);
  const rows=await asRole('anon',async c=>(await c.query(`select public.industry_freshness() v`)).rows[0].v as Record<string,unknown>[]);
  expect(rows.every(r=>String(r.dataset).startsWith('industry.')&&Object.keys(r).sort().join()==='dataset,last_ok_at,status')).toBe(true);
  expect(rows.find(r=>r.dataset===d)).toMatchObject({status:'fresh'});
  const iss=await issuer();
  await q(`insert into public.fact_sync_scope(issuer_id,market,fetch_key,state_rev) values($1,'CN','x',5)`,[iss]);
  const f=await asRole('service_role',async c=>(await c.query(`select public.industry_state_fingerprint('CN') v`)).rows[0].v);
  expect(f.revs.find((r:{issuer_id:string})=>r.issuer_id===iss)).toEqual({issuer_id:iss,state_rev:5});expect(typeof f.taken_at).toBe('string');
 });

 it('service_role: no direct write on protected tables (42501, truncate included), the run status cannot be set directly, and every RPC runs end to end',async()=>{
  const v=await version();const b=await batch();const iss=await issuer();const t=await ticker();
  const sicCode=`ZQ${hex(2)}`;await q(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('sic','sec-current',$1,1,'Test SIC')`,[sicCode]);
  await asRole('service_role',async c=>{
   const denied=async(sql:string,values:unknown[]=[])=>expect((await fails(c.query(sql,values))).code).toBe('42501');
   await denied(`insert into public.industry_valuations(run_id,scheme,version,code,trade_date,metric,status,value,facts_as_of,series_qualified,published) values($1,'sw2021',$2,'A1','2024-12-31','pb','ok',1,'2024-12-31',true,true)`,[randomUUID(),v]);
   await denied(`update public.industry_valuations set published=true where version=$1`,[v]);
   await denied(`delete from public.industry_valuation_pairs where version=$1`,[v]);
   await denied(`update public.industry_metric_runs set status='building' where version=$1`,[v]);
   await denied(`insert into public.security_marks(ticker,trade_date,fetch_event_id,observed_at,close,total_share,source,upstream,raw_hash,locator,batch_id) values($1,'2001-01-01',$2,now(),1,1,'s','sse','h','{}',$3)`,[t,randomUUID(),b]);
   await denied(`update public.issuer_industry_memberships set status='quarantined' where issuer_id=$1`,[iss]);
   await denied(`truncate public.industry_metrics`);await denied(`truncate public.industry_valuation_pairs`);await denied(`truncate public.industry_metric_runs`);
   // the RPC path, as service_role
   const s=srcRow();
   expect(await upsertSources(b,[s],c)).toMatchObject({inserted:1});
   const [rec]=(await c.query(`select id from public.industry_source_memberships where l1_code=$1`,[s.l1_code])).rows;
   expect(await apply(b,iss,v,three(rec.id),[rec.id],c)).toMatchObject({inserted:3});
   expect(await one(`select public.record_industry_source_resolution_error($1::uuid[],'{"code":"x"}'::jsonb) v`,[[rec.id]],c)).toBe(0);   // already resolved
   const svcUser=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[svcUser,`${svcUser}@example.test`]);
   await c.query(`select public.set_industry_dataset_license($1,'internal',$2,null)`,[`scheme:sw2021:${v}`,svcUser]);
   const e=await begin(b,c);
   expect(await observe(e,[markRow(t,'2')],'marks',c)).toEqual({inserted:1,duplicates:0,superseded:0});
   expect(await one(`select public.retry_industry_fetch_event($1) v`,[e],c)).toBe(2);
   const m=await manifest(c);
   const r=await createRun(v,b,{},c);
   await c.query(`select public.set_industry_metric_run_coverage($1,'{"facts_scope_ready":true}'::jsonb)`,[r.run_id]);
   expect(await stage(r.run_id,cells(m,1).map(x=>x.code==='B1'?{...x,value:'0',n_members:0,n_with_data:0}:x),c)).toBe(2);   // iss is the only member (of A1)
   expect(await deps(r.run_id,[{cell_key:'A1:2024-12-31',issuer_id:iss,state_rev:1}],'aggregate',c)).toBe(1);
   expect(await activate(r.run_id,c)).toHaveProperty('activated_at');
   const r2=await createRun(v,b,{},c);await c.query(`select public.fail_industry_run('aggregate',$1,'test')`,[r2.run_id]);
   expect(Array.isArray(await one(`select public.gc_industry_manifest_candidates(10) v`,[],c))).toBe(true);
   expect(await one(`select public.delete_industry_manifests($1::jsonb) v`,[JSON.stringify([{hash:m,claim:randomUUID()}])],c)).toBe(0);
   expect(await one(`select public.prune_industry_runs(5,'sw2021',$1) v`,[v],c)).toBe(0);
   const vr=(await one(`select public.create_industry_valuation_run($1::jsonb) v`,[JSON.stringify({scheme:'sw2021',version:v,level:3,method_version:'industry-val/1.0',config_hash:'c',formula_version:'f',code_version:'x',expected_dates:['2024-12-31'],comparator_basis:'unknown',recompute_from:'2024-01-01',carried_from_run:null,fingerprint_at:'2026-11-06T00:00:00Z',batch_id:b})],c)).run_id;
   const vrows=['A111','B111'].flatMap(code=>['pe_ttm','pe_static','pb','market_cap'].map(metric=>({code,trade_date:'2024-12-31',metric,status:'missing',missing_reason:'no_members',value:null,facts_as_of:'2024-12-31',n_members:code==='A111'?1:0,n_with_data:0,n_unresolved:0,mcap_coverage:null,manifest_hash:null})));
   expect(await one(`select public.stage_industry_valuations($1,$2::jsonb) v`,[vr,JSON.stringify(vrows)],c)).toBe(8);
   expect(await deps(vr,[{cell_key:'A111:2024-12-31',issuer_id:iss,state_rev:1}],'valuation',c)).toBe(1);   // iss is a member of A111 on the trade date
   expect(await one(`select public.stage_industry_valuation_pairs($1,$2::jsonb) v`,[vr,JSON.stringify(vrows.map(x=>({code:x.code,trade_date:x.trade_date,metric:x.metric,pair_status:'no_computed'})))],c)).toBe(8);
   expect(await one(`select public.publish_industry_valuations($1) v`,[vr],c)).toEqual({qualified_series:0,published_rows:0});
   expect(await one(`select public.activate_industry_valuation_run($1) v`,[vr],c)).toHaveProperty('activated_at');
   await c.query(`insert into public.industry_sync_scope(issuer_id,job,lease_until,lease_batch_id) values($1,'sic',now()+interval '1 hour',$2)`,[iss,b]);
   expect((await one(`select public.apply_sic_memberships($1,$2,'sec-current','2026-01-05',$3,'{}'::jsonb,$1) v`,[b,iss,sicCode],c)).outcome).toBe('inserted');
   expect((await fails(c.query(`select public.apply_sic_memberships($1,$2,'sec-current','2026-01-06','ZZZZ','{}'::jsonb,$1)`,[b,iss]))).message).toMatch(/^unknown_sic_code/);
  });
 },60000);

 it('membership triggers: identity frozen, valid_to only null→date, legal status moves, provenance only grows, no delete; source records are immutable evidence',async()=>{
  const v=await version();const b=await batch();const iss=await issuer();const s=srcRow();
  await upsertSources(b,[s]);const [rec]=await currentSource(s.l1_code);
  await apply(b,iss,v,three(rec.id),[rec.id]);
  const [m]=await q(`select membership_id from public.issuer_industry_memberships where issuer_id=$1 and level=1`,[iss]);
  const upd=(set:string,values:unknown[]=[])=>q(`update public.issuer_industry_memberships set ${set} where membership_id=$1`,[m.membership_id,...values]);
  const refused=async(p:Promise<unknown>)=>{const e=await fails(p);expect(e.code).toBe('23514');expect(e.message).toMatch(/^append_only:/);};
  await refused(upd(`code='B1'`));await refused(upd(`valid_from='2021-07-31'`));await refused(upd(`batch_id=$2`,[await batch()]));
  await refused(upd(`valid_to='2021-07-30',valid_to_available_date='2021-07-30'`));             // not after valid_from
  await upd(`valid_to='2023-01-01',valid_to_available_date='2023-02-01'`);
  await refused(upd(`valid_to='2023-06-01',valid_to_available_date='2023-06-01'`));             // date → another date
  await upd(`status='quarantined'`);await upd(`status='ok'`);
  await refused(upd(`superseded_by=$2`,[randomUUID()]));
  await upd(`provenance=provenance||'{"note":"x"}'::jsonb`);
  await refused(upd(`provenance='{"availability":"effective_date_assumed"}'::jsonb`));
  await refused(q(`delete from public.issuer_industry_memberships where membership_id=$1`,[m.membership_id]));
  await refused(q(`insert into public.issuer_industry_memberships(membership_id,issuer_id,scheme,version,code,level,valid_from,available_date,source,batch_id,status,superseded_by) values($1,$2,'sw2021',$3,'B1',1,'2010-01-01','2010-01-01','t',$4,'quarantined',null)`,[randomUUID(),iss,v,b]));
  const c=await admin.connect();
  try{                                                                                             // superseded is terminal
   const n=randomUUID();await c.query('begin');
   await c.query(`update public.issuer_industry_memberships set status='superseded',superseded_by=$2 where membership_id=$1`,[m.membership_id,n]);
   await c.query(`insert into public.issuer_industry_memberships(membership_id,issuer_id,scheme,version,code,level,valid_from,valid_to,available_date,valid_to_available_date,source,batch_id) values($1,$2,'sw2021',$3,'A1',1,'2021-07-30','2023-01-01','2021-07-30','2023-02-01','t',$4)`,[n,iss,v,b]);
   await c.query('commit');
  }finally{await c.query('rollback').catch(()=>{});c.release();}
  await refused(upd(`status='ok',superseded_by=null`));
  await refused(q(`update public.industry_source_memberships set out_date='2024-01-01' where id=$1`,[rec.id]));
  await refused(q(`update public.industry_source_memberships set issuer_id=$2 where id=$1`,[rec.id,await issuer()]));
  await refused(q(`delete from public.industry_source_memberships where id=$1`,[rec.id]));
  await q(`update public.industry_source_memberships set resolution_error='{"code":"x"}'::jsonb where id=$1`,[rec.id]);   // resolution columns stay writable (functions)
 });

 it('upsert_industry_source_memberships: duplicate, null→date supersession with changed[], content change, current key kept unique',async()=>{
  const b=await batch();const s=srcRow();
  expect(await upsertSources(b,[s,{...s}])).toEqual({inserted:1,superseded:0,duplicates:1,changed:[]});
  const [r0]=await currentSource(s.l1_code);
  const x=await upsertSources(b,[{...s,out_date:'2024-01-02'}]);
  expect(x).toMatchObject({inserted:0,superseded:1,duplicates:0});expect(x.changed).toEqual([{old_id:r0.id,new_id:expect.any(String),null_to_date:true}]);
  const y=await upsertSources(b,[{...s,out_date:'2024-01-03'}]);
  expect(y.changed[0]).toMatchObject({old_id:x.changed[0].new_id,null_to_date:false});
  expect((await q(`select status,superseded_by,out_date::text from public.industry_source_memberships where ts_code=$1 order by created_at,status`,[s.ts_code])).map(r=>[r.status,r.out_date]))
   .toEqual(expect.arrayContaining([['superseded',null],['superseded','2024-01-02'],['current','2024-01-03']]));
  expect(await currentSource(s.l1_code)).toHaveLength(1);
 });

 it('apply_industry_memberships: a failing third row rolls back the first two, the supersession of the old rows and the resolution; the caller then records the error',async()=>{
  const v=await version();const b=await batch();const iss=await issuer();const s=srcRow();
  await upsertSources(b,[s]);const [rec]=await currentSource(s.l1_code);
  await apply(b,iss,v,three(rec.id),[rec.id]);                                                   // A1/A11/A111 open
  await apply(b,iss,v,[target('B111',3,{valid_from:'2019-01-01',available_date:'2019-01-01',valid_to:'2020-01-01',valid_to_available_date:'2020-01-01'})],[]);   // an earlier level-3 window
  // out_date correction for the record; its third row is given a start that overlaps the 2019 window
  const up=await upsertSources(b,[{...s,out_date:'2024-01-02'}]);const nid=up.changed[0].new_id as string;
  const bad=three(nid,{valid_to:'2024-01-02',valid_to_available_date:'2024-01-02'});
  bad[2]={...bad[2],valid_from:'2019-06-01',available_date:'2019-06-01'};
  const before=await rowsOf(iss);
  const e=await fails(apply(b,iss,v,bad,[nid]));
  expect(e.code).toBe('23P01');expect(e.message).toMatch(/^membership_overlap/);
  expect(await rowsOf(iss)).toEqual(before);                                                    // old rows still ok, no new row
  const r=(await q(`select issuer_id,resolution,resolution_error from public.industry_source_memberships where id=$1`,[nid]))[0];
  expect(r).toEqual({issuer_id:null,resolution:{},resolution_error:null});
  expect(await one(`select public.record_industry_source_resolution_error($1::uuid[],$2::jsonb) v`,[[nid],JSON.stringify({code:'membership_overlap',at:'2026-11-06T00:00:00Z'})])).toBe(1);
  expect((await q(`select resolution_error from public.industry_source_memberships where id=$1`,[nid]))[0].resolution_error).toMatchObject({code:'membership_overlap'});
  // the correct correction supersedes all three and points each old row at its same-level successor
  expect(await apply(b,iss,v,three(nid,{valid_to:'2024-01-02',valid_to_available_date:'2024-01-02'}),[nid])).toMatchObject({inserted:3,superseded:3});
  const after=await rowsOf(iss);
  for(const code of ['A1','A11','A111']){
   const ok=after.find(x=>x.code===code&&x.status==='ok')!;const old=after.find(x=>x.code===code&&x.status==='superseded')!;
   expect(old.superseded_by).toBe(ok.membership_id);expect(ok.valid_to).toBe('2024-01-02');
  }
  expect((await q(`select resolution_error,resolution->'membership_ids' ids from public.industry_source_memberships where id=$1`,[nid]))[0]).toMatchObject({resolution_error:null,ids:expect.arrayContaining(after.filter(x=>x.status==='ok'&&x.code!=='B111').map(x=>x.membership_id))});
 });

 it('apply_industry_memberships: two transactions on one issuer serialise on the issuer row; the second sees the first and fails membership_overlap',async()=>{
  const v=await version();const b=await batch();const iss=await issuer();
  await inTx(admin,async({c,pid,commit})=>{
   await apply(b,iss,v,[target('A1',1)],[],c);
   const second=apply(b,iss,v,[target('B1',1,{valid_from:'2022-01-01',available_date:'2022-01-01'})],[]);second.catch(()=>{});
   await stillBlockedBehind(admin,pid,second);
   await commit();
   const e=await fails(second);expect(e.code).toBe('23P01');expect(e.message).toMatch(/^membership_overlap/);
  });
  expect((await rowsOf(iss)).map(r=>r.code)).toEqual(['A1']);
 });

 it('apply_observations: A→B→A from three events is three observations; a retry is a duplicate by receipt even after a later change (V7); same content inserts nothing; a changed retry payload is refused',async()=>{
  const b=await batch();const t=await ticker();
  const e1=await begin(b),e2=await begin(b),e3=await begin(b),e4=await begin(b);
  expect(await observe(e1,[markRow(t,'10')])).toEqual({inserted:1,duplicates:0,superseded:0});
  expect(await observe(e2,[markRow(t,'10.00')])).toEqual({inserted:0,duplicates:1,superseded:0});   // same content: no row
  expect(await observe(e3,[markRow(t,'11')])).toEqual({inserted:0,duplicates:0,superseded:1});
  expect(await observe(e2,[markRow(t,'10.00')])).toEqual({inserted:0,duplicates:1,superseded:0});   // retry of E2: receipt, B stays
  expect((await currentMark(t)).close_text).toBe('11');
  expect((await fails(observe(e2,[markRow(t,'12')]))).message).toMatch(/^fetch_event_payload_changed/);
  expect(await observe(e4,[markRow(t,'10')])).toEqual({inserted:0,duplicates:0,superseded:1});
  const all=await q(`select fetch_event_id,status,close_text,supersedes from public.security_marks where ticker=$1 and trade_date='2001-04-02' order by created_at,observed_at`,[t]);
  expect(all.map(r=>[r.fetch_event_id,r.status])).toEqual([[e1,'superseded'],[e3,'superseded'],[e4,'ok']]);
  expect(all[1].supersedes).not.toBeNull();
  expect((await q(`select outcome from public.industry_observation_receipts where fetch_event_id=any($1::uuid[]) and natural_key=$2 order by created_at`,[[e1,e2,e3,e4],`${t}:2001-04-02`])).map(r=>r.outcome))
   .toEqual(['inserted','duplicate','superseded_previous','superseded_previous']);
  expect(await one(`select count(*)::int v from public.dq_quarantine where dataset='industry.marks' and natural_key=$1 and reason_code='mark_revised' and status='open'`,[`${t}:2001-04-02`])).toBe(1);
 });

 it('apply_observations: two transactions on one natural key serialise; the second compares with the first one\'s observation',async()=>{
  const b=await batch();const t=await ticker();const e1=await begin(b);const e2=await begin(b);
  await inTx(admin,async({c,pid,commit})=>{
   await observe(e1,[markRow(t,'5')],'marks',c);
   const second=observe(e2,[markRow(t,'6')]);second.catch(()=>{});
   await stillBlockedBehind(admin,pid,second);
   await commit();
   expect(await second).toEqual({inserted:0,duplicates:0,superseded:1});
  });
  expect((await currentMark(t)).close_text).toBe('6');
 });

 it('metric runs: concurrent creation numbers generations; staging needs building; activation checks completeness, dependencies, obsolescence, regression per cell and issuer, and stamps one instant',async()=>{
  const v=await version();const b=await batch();const i1=await issuer();const i2=await issuer();const i3=await issuer();const m=await manifest();
  // candidate members: i1, i2 in A1 and i3 in B1 (an issuer holds one level-1 code at a time)
  await apply(b,i1,v,[target('A1',1)],[]);await apply(b,i2,v,[target('A1',1)],[]);await apply(b,i3,v,[target('B1',1)],[]);
  const sized=cells(m,0).map(c=>({...c,value:c.code==='A1'?'2':'1',n_members:c.code==='A1'?2:1,n_with_data:c.code==='A1'?2:1}));
  const dep=(cell:string,issuer_id:string,state_rev:number)=>({cell_key:`${cell}:2024-12-31`,issuer_id,state_rev});
  const gens=(await Promise.all(Array.from({length:4},()=>createRun(v,b)))).map(r=>Number(r.generation)).sort();
  expect(gens).toEqual([1,2,3,4]);
  const r=await createRun(v,b);
  await stage(r.run_id,sized.slice(0,1));
  expect((await fails(activate(r.run_id))).message).toBe('incomplete_run');
  await stage(r.run_id,sized);
  expect((await fails(activate(r.run_id))).message).toBe('dependencies_incomplete');
  // one issuer at different state_revs in different cells is fine (V6: per cell)
  await deps(r.run_id,[dep('A1',i1,3),dep('A1',i2,1),dep('B1',i3,5)]);
  const {activated_at}=await activate(r.run_id);
  const stamps=await q(`select distinct updated_at=$2::timestamptz same from public.industry_metrics where run_id=$1`,[r.run_id,activated_at]);
  expect(stamps).toEqual([{same:true}]);
  expect(await one(`select activated_at=$2::timestamptz v from public.industry_metric_runs where run_id=$1`,[r.run_id,activated_at])).toBe(true);
  expect((await fails(stage(r.run_id,[]))).message).toBe('run_not_building');
  expect((await fails(q(`select public.set_industry_metric_run_coverage($1,'{}'::jsonb)`,[r.run_id]))).message).toBe('run_not_building');
  expect((await fails(q(`select public.fail_industry_run('aggregate',$1,'x')`,[r.run_id]))).message).toMatch(/^illegal_transition/);
  // a lower generation built earlier cannot activate after a newer one
  const low=await one(`select run_id v from public.industry_metric_runs where version=$1 and generation=1`,[v]);
  await stage(low,sized);await deps(low,[dep('A1',i1,3),dep('A1',i2,1),dep('B1',i3,5)]);
  expect((await fails(activate(low))).message).toBe('obsolete_run');
  // regression: the next run reads i1 in cell A1 at an older revision than the active run did
  const n=await createRun(v,b);await stage(n.run_id,sized);
  await deps(n.run_id,[dep('A1',i1,2),dep('A1',i2,1),dep('B1',i3,9)]);
  expect((await fails(activate(n.run_id))).message).toBe('dependency_regression');
  await deps(n.run_id,[dep('A1',i1,3)]);
  await activate(n.run_id);
  expect(await q(`select run_id,status from public.industry_metric_runs where run_id=any($1::uuid[]) order by generation`,[[r.run_id,n.run_id]])).toEqual([{run_id:r.run_id,status:'superseded'},{run_id:n.run_id,status:'active'}]);
  // two weekly runs in a row both activate
  for(let i=0;i<2;i++){const w=await createRun(v,b,{facts_as_of:'2025-04-0'+(i+1),knowledge_date:'2025-04-0'+(i+1)});await stage(w.run_id,sized);await deps(w.run_id,[dep('A1',i1,9),dep('A1',i2,9),dep('B1',i3,9)]);expect(await activate(w.run_id)).toHaveProperty('activated_at');}
 });

 it('activation: each cell\'s dependency set must equal its candidate-member set as known at facts_as_of (a dependency for an unrelated issuer, a missing member, a closed or not-yet-known member are all refused)',async()=>{
  const v=await version();const b=await batch();const m=await manifest();
  const A=await issuer(),E=await issuer(),B=await issuer(),C=await issuer(),D=await issuer();
  await apply(b,A,v,[target('A1',1)],[]);                                                                                        // member
  await apply(b,E,v,[target('A1',1,{valid_to:'2024-06-30',valid_to_available_date:'2026-02-01'})],[]);                              // closure not yet known at facts_as_of → still a member
  await apply(b,C,v,[target('A1',1,{available_date:'2026-01-01'})],[]);                                                            // not yet known at facts_as_of → not a member
  await apply(b,D,v,[target('A1',1,{valid_to:'2024-06-30',valid_to_available_date:'2024-07-01'})],[]);                             // closed and known → not a member on 2024-12-31
  const grid={codes:['A1'],period_ends:['2024-12-31'],metrics:['member_count']};
  const trial=async(issuers:string[],n:number,extra:{cell_key:string;issuer_id:string;state_rev:number}[]=[])=>{
   const run=await createRun(v,b,{expected_grid:grid});
   await stage(run.run_id,[cells(m,n)[0]]);
   await deps(run.run_id,[...issuers.map(i=>({cell_key:'A1:2024-12-31',issuer_id:i,state_rev:1})),...extra]);
   return run.run_id;
  };
  const msg=async(run:string)=>(await fails(activate(run))).message;
  expect(await msg(await trial([A,B],2))).toBe('dependencies_incomplete');          // E missing, unrelated B present (counts equal)
  expect(await msg(await trial([A],2))).toBe('dependencies_incomplete');            // E missing
  expect(await msg(await trial([A,E,C],3))).toBe('dependencies_incomplete');        // C is not known yet
  expect(await msg(await trial([A,E,D],3))).toBe('dependencies_incomplete');        // D left before the cell date
  expect(await msg(await trial([A,E],2,[{cell_key:'A1:2020-01-01',issuer_id:A,state_rev:1}]))).toBe('dependencies_incomplete');   // dependency of a cell that does not exist
  expect(await activate(await trial([A,E],2))).toHaveProperty('activated_at');
 });

 it('run immutability and row freeze: no direct status reset, metadata frozen, rows of a left-building run frozen except the activation stamp; building rows are invisible to anon',async()=>{
  const v=await version();const b=await batch();const m=await manifest();
  const r=await createRun(v,b);await stage(r.run_id,cells(m,0));
  expect((await q(`select updated_at from public.industry_metrics where run_id=$1`,[r.run_id])).every(x=>x.updated_at===null)).toBe(true);
  await q(`update public.industry_dataset_licenses set status='public' where dataset_key=$1`,[`scheme:sw2021:${v}`]);
  expect(await asRole('anon',async c=>Number((await c.query(`select count(*) n from public.industry_metrics where run_id=$1`,[r.run_id])).rows[0].n))).toBe(0);
  await activate(r.run_id);
  expect(await asRole('anon',async c=>Number((await c.query(`select count(*) n from public.industry_metrics where run_id=$1`,[r.run_id])).rows[0].n))).toBe(2);
  const refused=async(p:Promise<unknown>)=>{const e=await fails(p);expect(e.code).toBe('23514');expect(e.message).toMatch(/^append_only:/);};
  await refused(q(`update public.industry_metric_runs set status='building' where run_id=$1`,[r.run_id]));
  await refused(q(`update public.industry_metric_runs set config_hash='x' where run_id=$1`,[r.run_id]));
  await refused(q(`update public.industry_metric_runs set coverage_summary='{"x":1}' where run_id=$1`,[r.run_id]));
  await refused(q(`delete from public.industry_metric_runs where run_id=$1`,[r.run_id]));
  await refused(q(`update public.industry_metrics set value=5 where run_id=$1`,[r.run_id]));
  await refused(q(`update public.industry_metrics set updated_at=now() where run_id=$1`,[r.run_id]));
  await refused(q(`delete from public.industry_metrics where run_id=$1`,[r.run_id]));
  await q(`update public.industry_dataset_licenses set status='internal' where dataset_key=$1`,[`scheme:sw2021:${v}`]);
 });

 it('U6 across UTC midnight: a run created before midnight that reads a correction after it activates with updated_at after midnight',async()=>{
  const v=await version();const b=await batch();const t=await ticker();const m=await manifest();
  const r=await createRun(v,b);
  // backdate the creation to 23:59 UTC yesterday (admin only; the immutability trigger is bypassed for this one statement)
  const c=await admin.connect();
  try{
   await c.query('begin');await c.query(`set local session_replication_role = replica`);
   await c.query(`update public.industry_metric_runs set created_at=((date_trunc('day', now() at time zone 'UTC') - interval '1 minute') at time zone 'UTC') where run_id=$1`,[r.run_id]);
   await c.query('commit');
  }finally{await c.query('rollback').catch(()=>{});c.release();}
  const e=await begin(b);await observe(e,[markRow(t,'7')]);
  await stage(r.run_id,cells(m,0));
  const {activated_at}=await activate(r.run_id);
  const x=(await q(`select (r.created_at at time zone 'UTC')::date::text created_day,(min(i.updated_at) at time zone 'UTC')::date::text row_day,
    bool_and(i.updated_at=r.activated_at) same,min(i.updated_at)>=(select observed_at from public.security_marks where fetch_event_id=$2) after_obs
   from public.industry_metric_runs r join public.industry_metrics i on i.run_id=r.run_id where r.run_id=$1 group by r.created_at`,[r.run_id,e]))[0];
  expect(x.same).toBe(true);expect(x.after_obs).toBe(true);expect(x.row_day>x.created_day).toBe(true);
  expect(typeof activated_at).toBe('string');
 });

 /** Shared by the valuation tests: a private version with member `iss` of A1 (level 1), 25 month-end dates, official observations for A1 and row/pair builders. */
 const valuationKit=async()=>{
  const v=await version();const b=await batch();const iss=await issuer();const m=await manifest();
  await apply(b,iss,v,[target('A1',1)],[]);
  const dates=Array.from({length:25},(_,i)=>new Date(Date.UTC(2023,i+1,0)).toISOString().slice(0,10));   // 25 month ends
  const create=async(o:Record<string,unknown>={})=>(await one(`select public.create_industry_valuation_run($1::jsonb) v`,[JSON.stringify({scheme:'sw2021',version:v,level:1,method_version:'industry-val/1.0',config_hash:'c',formula_version:'f',code_version:'x',expected_dates:dates,comparator_basis:'ttm',recompute_from:'2023-01-01',carried_from_run:null,fingerprint_at:'2026-11-06T00:00:00Z',batch_id:b,...o})])).run_id as string;
  const missing=(code:string,d:string,metric:string,n=0)=>({code,trade_date:d,metric,status:'missing',missing_reason:'no_members',value:null,facts_as_of:d,n_members:n,n_with_data:0,n_unresolved:0,mcap_coverage:null,manifest_hash:null});
  const okRow=(code:string,d:string,metric:string,value:string,hash:string|null=m)=>({code,trade_date:d,metric,status:'ok',missing_reason:null,value,facts_as_of:d,n_members:1,n_with_data:1,n_unresolved:0,mcap_coverage:'1',manifest_hash:hash});
  /** Every cell of both level-1 codes; `ok` overrides the A1 rows of the given metrics (A1 has one member: n_members 1 everywhere). */
  const rowsFor=(ok:Record<string,string>={})=>['A1','B1'].flatMap(code=>dates.flatMap(d=>['pe_ttm','pe_static','pb','market_cap'].map(metric=>code==='A1'&&ok[metric]!==undefined?okRow(code,d,metric,ok[metric]):missing(code,d,metric,code==='A1'?1:0))));
  const e=await one(`select public.begin_industry_fetch_event('official','{}'::jsonb,$1) v`,[b]) as string;
  const off=(metric:string,d:string,value:string)=>({scheme:'sw2021',version:v,code:'A1',trade_date:d,metric,value,source:'tushare:sw_daily',upstream:'swsresearch',raw_hash:hex(32),locator:{}});
  // pe: 10.05 except the first date (12); pb: 2.01
  await observe(e,dates.flatMap((d,i)=>[off('pe',d,i===0?'12':'10.05'),off('pb',d,'2.01')]),'official');
  const ids=new Map((await q(`select metric,trade_date::text d,observation_id from public.industry_official_valuations where version=$1 and status='ok'`,[v])).map(r=>[`${r.metric}|${r.d}`,r.observation_id as string]));
  const obs=(metric:string,d:string)=>ids.get(`${metric}|${d}`)!;
  const comparator:Record<string,string>={pe_ttm:'pe',pe_static:'pe',pb:'pb'};
  /** One pair per row, with the caller's claim `claim` for every row that has a comparator (derived by the database anyway). */
  const pairsFor=(rows:{code:string;trade_date:string;metric:string;status:string}[],claim='within')=>rows.map(x=>({code:x.code,trade_date:x.trade_date,metric:x.metric,
   official_observation_id:x.status==='ok'&&comparator[x.metric]?obs(comparator[x.metric],x.trade_date):null,official_value:'999',rel_diff:'0',pair_status:x.status==='ok'?claim:'no_computed'}));
  const stageRows=(run:string,rows:unknown[])=>one(`select public.stage_industry_valuations($1,$2::jsonb) v`,[run,JSON.stringify(rows)]);
  const stagePairs=(run:string,pairs:unknown[])=>one(`select public.stage_industry_valuation_pairs($1,$2::jsonb) v`,[run,JSON.stringify(pairs)]);
  const stageV=async(run:string,rows:{code:string;trade_date:string;metric:string;status:string}[],pairs=pairsFor(rows))=>{await stageRows(run,rows);await stagePairs(run,pairs);};
  /** One dependency per A1 cell (the sole member). */
  const stageDeps=(run:string,rev=1,who=iss)=>deps(run,dates.map(d=>({cell_key:`A1:${d}`,issuer_id:who,state_rev:rev})),'valuation');
  const publish=(run:string)=>one(`select public.publish_industry_valuations($1) v`,[run]);
  return {v,b,iss,m,dates,create,missing,okRow,rowsFor,obs,pairsFor,stageRows,stagePairs,stageV,stageDeps,publish};
 };

 it('valuation runs: staging forces unpublished, pair status is derived from the official observation, publish qualifies series once and freezes, activation re-checks and stamps; pairs_mismatch; prune removes a superseded run with rows, pairs and dependencies (V8)',async()=>{
  const k=await valuationKit();const {v,dates,create,rowsFor,stageV,stageDeps,publish}=k;
  const rows=rowsFor({pe_ttm:'10'});
  const r1=await create();
  await stageV(r1,rows.map(x=>({...x,published:true,series_qualified:true,updated_at:'2030-01-01'})),k.pairsFor(rows));   // flags in the input are ignored
  expect(await one(`select count(*)::int v from public.industry_valuations where run_id=$1 and (published or series_qualified or updated_at is not null)`,[r1])).toBe(0);
  // the caller claimed 'within' for every ok row: the database recomputed rel_diff from the staged value and the referenced official observation
  expect((await q(`select pair_status,count(*)::int n from public.industry_valuation_pairs where run_id=$1 and metric='pe_ttm' and code='A1' group by 1 order by 1`,[r1]))).toEqual([{pair_status:'outside',n:1},{pair_status:'within',n:24}]);
  const first=(await q(`select official_value::float8 ov,rel_diff::float8 rd,pair_status from public.industry_valuation_pairs where run_id=$1 and code='A1' and metric='pe_ttm' and trade_date=$2`,[r1,dates[0]]))[0];
  expect(first.pair_status).toBe('outside');expect(first.ov).toBe(12);expect(first.rd).toBeCloseTo(10/12-1,9);   // the caller's official_value 999 / rel_diff 0 are ignored
  // an extra A1 pe_ttm cell outside expected_dates (inserted directly: admin may write while the run is building) is not counted in the series
  await q(`insert into public.industry_valuations(run_id,scheme,version,code,trade_date,metric,status,value,facts_as_of,n_members,manifest_hash) values($1,'sw2021',$2,'A1','2030-01-31','pe_ttm','ok',10,'2030-01-31',1,$3)`,[r1,v,k.m]);
  await q(`insert into public.industry_valuation_pairs(run_id,scheme,version,code,trade_date,metric,pair_status) values($1,'sw2021',$2,'A1','2030-01-31','pe_ttm','outside')`,[r1,v]);
  await stageDeps(r1);await deps(r1,[{cell_key:'A1:2030-01-31',issuer_id:k.iss,state_rev:1}],'valuation');
  expect((await fails(q(`select public.activate_industry_valuation_run($1)`,[r1]))).message).toMatch(/^illegal_transition/);   // building, not published
  expect(await publish(r1)).toEqual({qualified_series:1,published_rows:24});
  expect(await one(`select e->>'n_pairs' v from public.industry_valuation_runs r, jsonb_array_elements(r.reconciliation->'series') e where r.run_id=$1 and e->>'code'='A1' and e->>'metric'='pe_ttm'`,[r1])).toBe('25');   // the 2030 cell is not an expected date
  expect(await one(`select count(*)::int v from public.industry_valuations where run_id=$1 and published and trade_date=$2`,[r1,dates[0]])).toBe(0);   // the outside date stays unpublished
  const refused=async(p:Promise<unknown>)=>{const e=await fails(p);expect(e.code).toBe('23514');};
  await refused(q(`update public.industry_valuations set published=true where run_id=$1 and trade_date=$2 and metric='pe_ttm' and code='A1'`,[r1,dates[0]]));
  await refused(q(`update public.industry_valuation_pairs set pair_status='within' where run_id=$1`,[r1]));
  await refused(q(`delete from public.industry_valuation_pairs where run_id=$1`,[r1]));
  expect((await fails(q(`select public.stage_industry_valuations($1,'[]'::jsonb)`,[r1]))).message).toBe('run_not_building');
  expect((await fails(q(`select public.publish_industry_valuations($1)`,[r1]))).message).toBe('run_not_building');
  const {activated_at}=await one(`select public.activate_industry_valuation_run($1) v`,[r1]);
  expect(await one(`select bool_and(updated_at=$2::timestamptz) v from public.industry_valuations where run_id=$1`,[r1,activated_at])).toBe(true);
  await q(`update public.industry_dataset_licenses set status='public' where dataset_key=$1`,[`scheme:sw2021:${v}`]);
  expect(await asRole('anon',async c=>Number((await c.query(`select count(*) n from public.industry_valuations where run_id=$1 and published`,[r1])).rows[0].n))).toBe(24);
  await q(`update public.industry_dataset_licenses set status='internal' where dataset_key=$1`,[`scheme:sw2021:${v}`]);
  // pairs_mismatch: a valuation row without its pair
  const bad=await create();await stageV(bad,rows,k.pairsFor(rows).slice(1));
  expect((await fails(q(`select public.publish_industry_valuations($1)`,[bad]))).message).toBe('pairs_mismatch');
  await q(`select public.fail_industry_run('valuation',$1,'pairs_mismatch')`,[bad]);
  expect(await one(`select reconciliation->>'failure_reason' v from public.industry_valuation_runs where run_id=$1`,[bad])).toBe('pairs_mismatch');
  // two more weekly runs with different recompute_from both activate: r1 becomes superseded, then the next; prune(keep 1) removes r1 with its rows, pairs and dependencies
  expect(await one(`select count(*)::int v from public.industry_run_dependencies where run_kind='valuation' and run_id=$1`,[r1])).toBe(26);
  for(const from of ['2023-10-31','2023-11-30']){const r=await create({recompute_from:from});await stageV(r,rows);await stageDeps(r);await publish(r);await one(`select public.activate_industry_valuation_run($1) v`,[r]);}
  await refused(q(`delete from public.industry_valuation_runs where run_id=$1 and status='active'`,[await one(`select run_id v from public.industry_valuation_runs where version=$1 and status='active'`,[v])]));
  expect(await one(`select public.prune_industry_runs(1,'sw2021',$1) v`,[v])).toBe(1);
  expect(await one(`select count(*)::int v from public.industry_valuation_runs where run_id=$1`,[r1])).toBe(0);
  expect(await one(`select (select count(*) from public.industry_valuations where run_id=$1)+(select count(*) from public.industry_valuation_pairs where run_id=$1)+(select count(*) from public.industry_run_dependencies where run_kind='valuation' and run_id=$1) v`,[r1])).toBe('0');
  expect(await one(`select count(*)::int v from public.industry_valuation_runs where version=$1 and status='superseded'`,[v])).toBe(1);
 },60000);

 it('valuation staging: ok rows need a registered manifest (stage and publish), dates must be expected dates, a pair label is never trusted',async()=>{
  const k=await valuationKit();const {v,dates,create,okRow,missing,stageRows,stagePairs,pairsFor,m}=k;
  const run=await create();
  // item 4: ok without a manifest (null, or a hash nobody registered) is refused at staging; a registered one is accepted
  for(const hash of [null,hex(32)])expect((await fails(stageRows(run,[okRow('A1',dates[0],'pe_ttm','10',hash)]))).message).toBe('invalid_manifest');
  expect(await stageRows(run,[okRow('A1',dates[0],'pe_ttm','10',m)])).toBe(1);
  // … and publish refuses an ok row that reached the table without one (inserted directly: admin may write while building)
  const bare=await create();
  await q(`insert into public.industry_valuations(run_id,scheme,version,code,trade_date,metric,status,value,facts_as_of) values($1,'sw2021',$2,'A1',$3,'pe_ttm','ok',10,$3)`,[bare,v,dates[0]]);
  await q(`insert into public.industry_valuation_pairs(run_id,scheme,version,code,trade_date,metric,pair_status) values($1,'sw2021',$2,'A1',$3,'pe_ttm','no_official')`,[bare,v,dates[0]]);
  expect((await fails(q(`select public.publish_industry_valuations($1)`,[bare]))).message).toBe('invalid_manifest');
  // item 6: valuation and pair dates must be in the run's expected_dates
  expect((await fails(stageRows(run,[missing('A1','2030-01-31','pe_ttm')]))).message).toBe('invalid_trade_date');
  expect((await fails(stagePairs(run,[{code:'A1',trade_date:'2030-01-31',metric:'pe_ttm',pair_status:'no_computed'}]))).message).toBe('invalid_trade_date');
  // item 5: the label is ignored — 'within' without an official observation is stored no_official; a wrong-metric, wrong-date, other-code or superseded observation is no official either
  const pairOf=async(label:string,id:string|null,d=dates[1])=>{
   await stagePairs(run,[{code:'A1',trade_date:d,metric:'pe_ttm',official_observation_id:id,official_value:'10',rel_diff:'0',pair_status:label}]);
   return (await q(`select pair_status,official_observation_id,official_value,rel_diff from public.industry_valuation_pairs where run_id=$1 and code='A1' and trade_date=$2 and metric='pe_ttm'`,[run,d]))[0];
  };
  await stageRows(run,[okRow('A1',dates[1],'pe_ttm','10',m),okRow('A1',dates[2],'pe_ttm','10',m)]);
  const none={pair_status:'no_official',official_observation_id:null,official_value:null,rel_diff:null};
  expect(await pairOf('within',null)).toEqual(none);
  expect(await pairOf('within',k.obs('pb',dates[1]))).toEqual(none);                 // another metric (pb) is not the pe comparator
  expect(await pairOf('within',k.obs('pe',dates[2]))).toEqual(none);                 // another trade date
  const e2=await one(`select public.begin_industry_fetch_event('official','{}'::jsonb,$1) v`,[k.b]) as string;
  await observe(e2,[{scheme:'sw2021',version:v,code:'A1',trade_date:dates[1],metric:'pe',value:'10.02',source:'tushare:sw_daily',upstream:'swsresearch',raw_hash:hex(32),locator:{}}],'official');   // supersedes the 10.05 observation
  expect(await pairOf('within',k.obs('pe',dates[1]))).toEqual(none);                // the referenced observation is no longer current
  const cur=await one(`select observation_id v from public.industry_official_valuations where version=$1 and code='A1' and metric='pe' and trade_date=$2 and status='ok'`,[v,dates[1]]);
  expect(await pairOf('outside',cur)).toMatchObject({pair_status:'within',official_observation_id:cur});   // 10 / 10.02 - 1 = -0.2 %: the claim 'outside' is ignored
  expect(await pairOf('within',k.obs('pe',dates[6]),dates[6])).toMatchObject({pair_status:'no_computed'});   // no staged valuation row for that cell
  // market_cap is never compared; a non-positive official value is an invalid denominator; a missing computed value is no_computed
  await stageRows(run,[okRow('A1',dates[3],'market_cap','5000',m),missing('A1',dates[4],'pe_ttm'),okRow('A1',dates[5],'pe_ttm','10',m)]);
  await stagePairs(run,[{code:'A1',trade_date:dates[3],metric:'market_cap',official_observation_id:null,pair_status:'within'},{code:'A1',trade_date:dates[4],metric:'pe_ttm',official_observation_id:k.obs('pe',dates[4]),pair_status:'within'}]);
  expect((await q(`select metric,pair_status from public.industry_valuation_pairs where run_id=$1 and trade_date in ($2,$3) order by trade_date`,[run,dates[3],dates[4]]))).toEqual([{metric:'market_cap',pair_status:'not_applicable'},{metric:'pe_ttm',pair_status:'no_computed'}]);
  const zero=await one(`select public.begin_industry_fetch_event('official','{}'::jsonb,$1) v`,[k.b]) as string;
  await observe(zero,[{scheme:'sw2021',version:v,code:'A1',trade_date:dates[5],metric:'pe',value:'0',source:'tushare:sw_daily',upstream:'swsresearch',raw_hash:hex(32),locator:{}}],'official');
  const zid=await one(`select observation_id v from public.industry_official_valuations where version=$1 and code='A1' and metric='pe' and trade_date=$2 and status='ok'`,[v,dates[5]]);
  expect((await pairOf('within',zid,dates[5])).pair_status).toBe('invalid_denominator');
  // a whole series labelled 'within' by the caller without any official observation is never published
  const lie=await create();const rows=k.rowsFor({pe_ttm:'10'});
  await k.stageRows(lie,rows);await k.stagePairs(lie,pairsFor(rows).map(p=>({...p,official_observation_id:null})));
  expect(await k.publish(lie)).toEqual({qualified_series:0,published_rows:0});
  expect(await one(`select count(*)::int v from public.industry_valuation_pairs where run_id=$1 and pair_status='no_official'`,[lie])).toBe(25);
 },60000);

 it('valuation publish gate: pb and market_cap never qualify; pe_ttm only with comparator_basis ttm, pe_static only with static (§6.4 K1)',async()=>{
  const k=await valuationKit();
  const cases:[string,string,string,boolean][]=[['ttm','pe_ttm','10',true],['static','pe_ttm','10',false],['static','pe_static','10',true],['ttm','pe_static','10',false],
   ['ttm','pb','2',false],['static','pb','2',false],['unknown','pe_ttm','10',false],['ttm','market_cap','5000',false]];
  for(const [basis,metric,value,qualified] of cases){
   const run=await k.create({comparator_basis:basis});const rows=k.rowsFor({[metric]:value});
   await k.stageV(run,rows.filter(x=>x.code==='A1'&&x.metric===metric),k.pairsFor(rows.filter(x=>x.code==='A1'&&x.metric===metric),'within'));
   // pe_ttm: 10 vs 10.05 and the first date 12 (24 of 25 within); pb: 2 vs 2.01 (all within) — a pair-wise perfect pb series still does not qualify
   const res=await k.publish(run);
   expect({basis,metric,qualified_series:res.qualified_series}).toEqual({basis,metric,qualified_series:qualified?1:0});
   const published=Number(await one(`select count(*)::int v from public.industry_valuations where run_id=$1 and published`,[run]));
   expect({basis,metric,published}).toEqual({basis,metric,published:qualified?24:0});
  }
 },60000);

 it('valuation activation: the dependency set of each cell must equal its candidate-member set as known on the trade date',async()=>{
  const k=await valuationKit();const rows=k.rowsFor({});const stranger=await issuer();
  const bad=await k.create();await k.stageV(bad,rows);await k.stageDeps(bad,1,stranger);   // n_members 1 and one dependency, but for a non-member
  await k.publish(bad);
  expect((await fails(q(`select public.activate_industry_valuation_run($1)`,[bad]))).message).toBe('dependencies_incomplete');
  const good=await k.create();await k.stageV(good,rows);await k.stageDeps(good);
  await k.publish(good);
  expect(await one(`select public.activate_industry_valuation_run($1) v`,[good])).toHaveProperty('activated_at');
 },60000);

 it('apply_sic_memberships: insert, duplicate, close-and-open, same_day_change',async()=>{
  const b=await batch();const iss=await issuer();const c1=`ZS${hex(2)}`,c2=`ZR${hex(2)}`;
  await q(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('sic','sec-current',$1,1,'Test SIC A'),('sic','sec-current',$2,1,'Test SIC B')`,[c1,c2]);
  await q(`insert into public.industry_sync_scope(issuer_id,job,lease_until,lease_batch_id) values($1,'sic',now()+interval '1 hour',$2)`,[iss,b]);
  const sic=(d:string,c:string,lease:string=b)=>one(`select public.apply_sic_memberships($1,$2,'sec-current',$3::date,$4,'{"raw_hash":"h"}'::jsonb,$5)->>'outcome' v`,[b,iss,d,c,lease]);
  expect(await sic('2026-01-05',c1)).toBe('inserted');expect(await sic('2026-02-05',c1)).toBe('duplicate');expect(await sic('2026-03-05',c2)).toBe('changed');
  expect((await fails(sic('2026-03-05',c1))).message).toMatch(/^same_day_change/);
  expect((await q(`select code,valid_from::text f,valid_to::text t,provenance->>'availability' a from public.issuer_industry_memberships where issuer_id=$1 order by valid_from`,[iss]))).toEqual([{code:c1,f:'2026-01-05',t:'2026-03-05',a:'observed'},{code:c2,f:'2026-03-05',t:null,a:'observed'}]);
  // lease fence (Codex round 2 R2-3): another batch's lease, or an expired one, rejects the write in the same transaction
  const other=randomUUID();
  expect((await fails(sic('2026-04-05',c1,other))).message).toBe('lease_lost');
  await q(`update public.industry_sync_scope set lease_until=now()-interval '1 second' where issuer_id=$1 and job='sic'`,[iss]);
  expect((await fails(sic('2026-04-05',c1))).message).toBe('lease_lost');
  expect((await q(`select count(*)::int n from public.issuer_industry_memberships where issuer_id=$1`,[iss]))[0].n).toBe(2);   // nothing written
  await q(`update public.industry_sync_scope set lease_until=now()+interval '1 hour' where issuer_id=$1 and job='sic'`,[iss]);
  expect(await one(`select public.apply_sic_memberships($1,$2,'sec-current','2026-04-06',null,'{}'::jsonb,$1,'{"fiscal_year_end":"0926"}'::jsonb)->>'outcome' v`,[b,iss])).toBe('none');
  expect(await one(`select provenance->'sec_submissions'->>'fiscal_year_end' v from public.issuers where issuer_id=$1`,[iss])).toBe('0926');
 });

 it('apply_sic_memberships: a call that waits on the issuer lock past its lease end is rejected lease_lost (Codex round 3 R3-2)',async()=>{
  const b=await batch();const iss=await issuer();const c1=`ZW${hex(2)}`;
  await q(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('sic','sec-current',$1,1,'Test SIC W')`,[c1]);
  await q(`insert into public.industry_sync_scope(issuer_id,job,lease_until,lease_batch_id) values($1,'sic',clock_timestamp()+interval '1500 milliseconds',$2)`,[iss,b]);
  const holder=await admin.connect();const caller=await admin.connect();
  try{
   await holder.query('begin');
   await holder.query(`select 1 from public.issuers where issuer_id=$1 for update`,[iss]);   // connection A holds the issuer lock
   // connection B starts its statement (now() fixed) while the lease is valid, then blocks on the issuer lock
   const pending=fails(caller.query(`select public.apply_sic_memberships($1,$2,'sec-current','2026-05-05',$3,'{"raw_hash":"h"}'::jsonb,$1,'{"sic":"x"}'::jsonb)`,[b,iss,c1]));
   await new Promise(r=>setTimeout(r,2500));   // the lease expires while B waits
   await holder.query('commit');
   expect((await pending).message).toBe('lease_lost');
  }finally{await holder.query('rollback').catch(()=>{});holder.release();caller.release();}
  expect((await q(`select count(*)::int n from public.issuer_industry_memberships where issuer_id=$1`,[iss]))[0].n).toBe(0);
  expect(await one(`select provenance->'sec_submissions' v from public.issuers where issuer_id=$1`,[iss])).toBeNull();
 },20000);

 it('manifest index: put touches existing rows, GC honours the grace window and references, delete re-checks the claim token',async()=>{
  const free=hex(32);
  expect(await one(`select public.put_industry_manifest($1,'valuation',5) v`,[free])).toBe(true);
  const p1=(await objectPath(free))!;
  expect(p1).toMatch(new RegExp(`^sha256/${free}/[0-9a-f-]{36}\\.json\\.gz$`));
  expect(await one(`select public.put_industry_manifest($1,'valuation',5) v`,[free])).toBe(false);
  expect(await objectPath(free)).toBe(p1);                                                            // a touch keeps the incarnation
  expect(await gcHashes()).not.toContain(free);
  await q(`update public.industry_manifests set created_at=now()-interval '2 days' where manifest_hash=$1`,[free]);
  expect(await gcHashes(3*86400)).not.toContain(free);
  expect(await gcDelete([{hash:free,claim:randomUUID()}])).toBe(0);                                  // not claimed yet
  const [mine]=(await gcClaims()).filter(c=>c.hash===free);                                            // selected = claimed (tombstone)
  expect(mine.object_path).toBe(p1);
  expect(await gcHashes()).not.toContain(free);                                                       // a live claim is not handed out twice
  expect((await fails(q(`select public.put_industry_manifest($1,'valuation',5)`,[free]))).message).toBe('manifest_gc_in_progress');
  await q(`update public.industry_manifests set gc_claimed_at=now()-interval '2 hours' where manifest_hash=$1`,[free]);
  const [again]=(await gcClaims()).filter(c=>c.hash===free);                                           // a stale claim (GC died) is re-claimable
  expect(again.claim).not.toBe(mine.claim);
  expect(await gcDelete([{hash:free,claim:mine.claim}])).toBe(0);                                    // the stale token finalizes nothing
  expect(await gcDelete([{hash:free,claim:again.claim}])).toBe(1);
  expect(await one(`select public.put_industry_manifest($1,'valuation',5) v`,[free])).toBe(true);   // after GC: a new registration…
  expect(await objectPath(free)).not.toBe(p1);                                                        // …with a new incarnation path
  expect((await fails(q(`select public.gc_industry_manifest_candidates(0)`))).message).toBe('invalid_limit');
 });

 it('stale collector after a reclaim (Codex round 2 R2-1): its claim token deletes no later incarnation; the new path is distinct',async()=>{
  const h=hex(32);await q(`select public.put_industry_manifest($1,'aggregate',5)`,[h]);
  await q(`update public.industry_manifests set created_at=now()-interval '2 days' where manifest_hash=$1`,[h]);
  const [a]=(await gcClaims()).filter(c=>c.hash===h);                                                 // collector A claims and pauses
  await q(`update public.industry_manifests set gc_claimed_at=now()-interval '2 hours' where manifest_hash=$1`,[h]);
  const [b]=(await gcClaims()).filter(c=>c.hash===h);                                                 // B reclaims, deletes the object, finalizes
  expect(await gcDelete([{hash:h,claim:b.claim}])).toBe(1);
  expect(await one(`select public.put_industry_manifest($1,'aggregate',5) v`,[h])).toBe(true);      // a writer re-registers (new incarnation)…
  const fresh=(await objectPath(h))!;
  expect(fresh).not.toBe(a.object_path);                                                               // …so A's storage delete (a.object_path) cannot hit it
  expect(await gcDelete([{hash:h,claim:a.claim}])).toBe(0);                                           // and A's finalize is a no-op
  expect(await objectPath(h)).toBe(fresh);
 });

 it('GC race (Codex round 1 #4): candidate claimed → a run reuses the hash → registration and staging are refused; a stage holding the row first makes GC skip it',async()=>{
  const v=`t${hex(4)}`;await q(`insert into public.industry_dataset_licenses(dataset_key,status,decided_by) values($1,'internal','test')`,[`scheme:sw2021:${v}`]);
  const b=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'t','industry.test')`,[b]);
  const run=async()=>(await one(`select public.create_industry_metric_run($1::jsonb) v`,[JSON.stringify({scheme:'sw2021',version:v,level:2,facts_as_of:'2025-03-31',knowledge_date:'2025-03-31',history_class:'reconstruction',method_version:'m',config_hash:'c',formula_version:'f',code_version:'x',expected_grid:{codes:['A1'],period_ends:['2024-12-31'],metrics:['member_count']},fingerprint_at:'2026-11-06T00:00:00Z',reused_from_run:null,batch_id:b})])).run_id as string;
  const row=(h:string)=>JSON.stringify([{code:'A1',metric:'member_count',period_start:'2024-12-31',period_end:'2024-12-31',duration:'INSTANT',status:'ok',missing_reason:null,value:'1',unit:'count',n_members:1,n_with_data:1,n_unresolved:0,manifest_hash:h}]);
  // 1 GC first: claimed → reuse is refused (the TS store then fails the run; the next run re-registers and re-uploads)
  const h1=hex(32);await q(`select public.put_industry_manifest($1,'aggregate',5)`,[h1]);
  await q(`update public.industry_manifests set created_at=now()-interval '2 days' where manifest_hash=$1`,[h1]);
  const [c1]=(await gcClaims()).filter(c=>c.hash===h1);
  expect(c1).toBeDefined();
  const r1=await run();
  expect((await fails(q(`select public.stage_industry_metrics($1,$2::jsonb)`,[r1,row(h1)]))).message).toBe('manifest_gc_in_progress');
  expect((await fails(q(`select public.put_industry_manifest($1,'aggregate',5)`,[h1]))).message).toBe('manifest_gc_in_progress');
  expect(await gcDelete([{hash:h1,claim:c1.claim}])).toBe(1);
  // 2 stage first (transaction still open): GC skips the locked row; after commit the hash is referenced → never a candidate
  const h2=hex(32);await q(`select public.put_industry_manifest($1,'aggregate',5)`,[h2]);
  await q(`update public.industry_manifests set created_at=now()-interval '2 days' where manifest_hash=$1`,[h2]);
  const r2=await run();
  const c=await admin.connect();
  try{
   await c.query('begin');
   await c.query(`select public.stage_industry_metrics($1,$2::jsonb)`,[r2,row(h2)]);
   expect(await gcHashes()).not.toContain(h2);   // FOR SHARE held → skipped
   await c.query('commit');
  }finally{c.release();}
  expect(await gcHashes()).not.toContain(h2);    // referenced
  expect(await one(`select gc_claimed_at is null v from public.industry_manifests where manifest_hash=$1`,[h2])).toBe(true);
  await q(`select public.fail_industry_run('aggregate',$1,'test')`,[r1]);await q(`select public.fail_industry_run('aggregate',$1,'test')`,[r2]);
 });
 it('GC claim re-checks references after taking the locks (Codex review P1): staging that commits between the candidate snapshot and the row lock leaves the hash unclaimed',async()=>{
  const v=`t${hex(4)}`;await q(`insert into public.industry_dataset_licenses(dataset_key,status,decided_by) values($1,'internal','test')`,[`scheme:sw2021:${v}`]);
  const b=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'t','industry.test')`,[b]);
  const run=(await one(`select public.create_industry_metric_run($1::jsonb) v`,[JSON.stringify({scheme:'sw2021',version:v,level:2,facts_as_of:'2025-03-31',knowledge_date:'2025-03-31',history_class:'reconstruction',method_version:'m',config_hash:'c',formula_version:'f',code_version:'x',expected_grid:{codes:['A1'],period_ends:['2024-12-31'],metrics:['member_count']},fingerprint_at:'2026-11-06T00:00:00Z',reused_from_run:null,batch_id:b})])).run_id as string;
  const h=hex(32);await q(`select public.put_industry_manifest($1,'aggregate',5)`,[h]);
  await q(`update public.industry_manifests set created_at=now()-interval '2 days' where manifest_hash=$1`,[h]);
  const row=JSON.stringify([{code:'A1',metric:'member_count',period_start:'2024-12-31',period_end:'2024-12-31',duration:'INSTANT',status:'ok',missing_reason:null,value:'1',unit:'count',n_members:1,n_with_data:1,n_unresolved:0,manifest_hash:h}]);
  await inTx(admin,async({c,pid,commit})=>{
   await c.query('lock table public.industry_metrics in access exclusive mode');
   const gc=gcHashes();gc.catch(()=>{});
   await stillBlockedBehind(admin,pid,gc);                                  // the candidate scan took its snapshot and waits to read industry_metrics
   await c.query(`select public.stage_industry_metrics($1,$2::jsonb)`,[run,row]);   // the reference commits after that snapshot, before the row lock
   await commit();
   expect(await gc).not.toContain(h);
  });
  expect(await one(`select gc_claimed_at is null v from public.industry_manifests where manifest_hash=$1`,[h])).toBe(true);
  await q(`select public.fail_industry_run('aggregate',$1,'test')`,[run]);
 });

 it('apply_industry_memberships and correct_industry_membership_windows lock the source records before validating them (Codex review P2): a record superseded by a concurrent refresh is refused',async()=>{
  const v=await version();const b=await batch();const iss=await issuer();const s=srcRow();
  await upsertSources(b,[s]);const [rec]=await currentSource(s.l1_code);
  await inTx(admin,async({c,pid,commit})=>{
   expect(await upsertSources(b,[{...s,out_date:'2024-01-02'}],c)).toMatchObject({superseded:1});     // uncommitted: the record is superseded
   const second=apply(b,iss,v,three(rec.id),[rec.id]);second.catch(()=>{});
   await stillBlockedBehind(admin,pid,second);
   await commit();
   expect((await fails(second)).message).toMatch(/^membership_conflict/);
  });
  expect(await rowsOf(iss)).toEqual([]);
  // the same for a correction of a resolved record
  const s2=srcRow();await upsertSources(b,[s2]);const [rec2]=await currentSource(s2.l1_code);
  await apply(b,iss,v,three(rec2.id),[rec2.id]);
  await inTx(admin,async({c,pid,commit})=>{
   await upsertSources(b,[{...s2,out_date:'2024-01-02'}],c);
   const corr=one(`select public.correct_industry_membership_windows($1,$2,'sw2021',$3,$4,$5::jsonb) v`,[b,iss,v,rec2.id,JSON.stringify(three(rec2.id,{valid_to:'2023-06-30',valid_to_available_date:'2023-06-30'}))]);corr.catch(()=>{});
   await stillBlockedBehind(admin,pid,corr);
   await commit();
   expect((await fails(corr)).message).toMatch(/^membership_conflict/);
  });
  expect((await rowsOf(iss)).every(r=>r.status==='ok'&&r.valid_to===null)).toBe(true);
 });
});

// ---------------------------------------------------------------- Task 4: pgIndustryDb against the shared contract
async function pgHarness():Promise<IndustryContractHarness>{
 const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
 const pool=new Pool({connectionString:state.adminUrl,statement_timeout:8000});   // a regression that blocks fails cleanly instead of hanging afterAll
 const q=(text:string,values:unknown[]=[])=>pool.query(text,values);
 return {
  db:pgIndustryDb(pool),tables:pgTableClient(pool),
  actor:async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@example.test`]);return id;},
  issuer:async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_zh) values($1,'行业契约测试')`,[id]);return id;},
  batch:async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'industry-test','industry.test')`,[id]);return id;},
  ticker:async()=>{const t=`ZZ${hex(4).toUpperCase()}`;await q(`insert into public.stocks_universe(ticker,name,market) values($1,'Industry Contract','A')`,[t]);return t;},
  version:async()=>{const v=`t${hex(4)}`;await q(`insert into public.industry_dataset_licenses(dataset_key,status,decided_by) values($1,'internal','industry-test')`,[`scheme:sw2021:${v}`]);return v;},
  factScope:async(issuer,rev)=>{await q(`insert into public.fact_sync_scope(issuer_id,market,fetch_key,state_rev) values($1,'CN','x',$2)`,[issuer,rev]);},
  ageManifest:async(hash,seconds)=>{await q(`update public.industry_manifests set created_at=created_at-make_interval(secs=>$2) where manifest_hash=$1`,[hash,seconds]);},
  close:async()=>{await pool.end();},
 };
}

describe.skipIf(!enabled)('pgIndustryDb on real PostgreSQL',()=>{
 // The same scenarios memoryIndustryDb passes in db.test.ts, now against the SQL functions.
 industryDbContract('pgIndustryDb contract',pgHarness);

 describe('pg specifics',()=>{
  let h:IndustryContractHarness;
  beforeAll(async()=>{h=await pgHarness();});
  afterAll(async()=>{await h?.close?.();});
  it('timestamps come back in toISOString() form and decimals from the *_text columns',async()=>{
   const b=await h.batch();const t=await h.ticker();
   const e=await h.db.beginFetchEvent('marks',{trade_date:'2001-05-02'},b);
   await h.db.applyObservations('marks',e,[mark(t,'12.3400',{trade_date:'2001-05-02',total_share:'123456789012345678.5'})]);
   const [m]=await h.db.currentMarksOn('2001-05-02',[t]);
   expect(m.observed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
   expect([m.close,m.total_share,m.market_cap]).toEqual(['12.3400','123456789012345678.5',mulDecimalText('12.3400','123456789012345678.5')]);
   expect(await h.db.freshness()).toEqual(expect.any(Array));
  });
  it('pruneRuns calls the unscoped function (a large keep prunes nothing)',async()=>{
   expect(await h.db.pruneRuns(1000000)).toBe(0);
   await expect(h.db.pruneRuns(0)).rejects.toMatchObject({name:'IndustryDbError',code:'unknown'});
  });
 });
});
