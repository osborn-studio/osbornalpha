// src/lib/company/company-research.integration.test.ts
// Company research on real PostgreSQL (spec §4, §4.6, §12.2, §0 #64 #70, §0.1 items 2–3): the two
// company migrations — tables, constraints, triggers, RLS and grants under real roles (Task 1); the
// digest / evidence / snapshot / selection functions with two-connection interleavings and the
// SQL-vs-TS canonical ids (Task 2); the pgCompanyDb contract (Task 4). Rows are never cleaned up:
// test:db creates a fresh database for every run, and every test uses its own issuers and users.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {canonicalJson,eventIdOf,payloadHashOf,sha256Utf8} from './canonical';
import {pgFactsDb} from '../facts/pg-facts-db';
import {companyDbContract} from './db-contract';
import type {CompanyContractHarness} from './db-contract';
import {pgCompanyDb,pgRpcClient} from './pg-company-db';
import {readSnapshot} from './snapshot-read';

const enabled=!!process.env.S4_TEST_STATE;
const TABLES_MIGRATION='supabase/migrations/20261112090000_company_research.sql';
const FUNCTIONS_MIGRATION='supabase/migrations/20261112091000_company_research_functions.sql';
const FENCE_MIGRATION='supabase/migrations/20261112092000_company_evidence_fence.sql';
const TABLES=['issuer_events','issuer_coverage','company_watches','company_event_reads','company_digest_state','company_fact_evidence'];
const SERVICE_ONLY=['issuer_events','company_digest_state','company_fact_evidence'];
const NO_DIRECT_WRITE=['issuer_events','issuer_coverage','company_digest_state','company_fact_evidence'];
type Market='US'|'CN';
type Role='anon'|'authenticated'|'service_role';

// Same replay policy as src/lib/facts/facts.integration.test.ts (not exported there): one transaction,
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
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}

/** One open transaction on its own connection, optionally as a client role with JWT claims (local auth.uid() reads request.jwt.claim.sub; hosted reads request.jwt.claims). */
interface Tx{c:PoolClient;pid:number;commit():Promise<void>;rollback():Promise<void>}
async function openTx(pool:Pool,o:{role?:Role;userId?:string}={}):Promise<Tx>{
 const c=await pool.connect();let done=false;
 try{
  await c.query('begin');
  if(o.userId)await c.query(`select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)`,[o.userId,JSON.stringify({sub:o.userId,role:o.role??'authenticated'})]);
  if(o.role)await c.query(`set local role ${o.role}`);   // o.role is a fixed literal union
 }catch(e){c.release(e as Error);throw e;}
 const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
 const end=async(sql:string)=>{if(done)return;done=true;try{await c.query(sql);c.release();}catch(e){c.release(e as Error);throw e;}};
 return {c,pid,commit:()=>end('commit'),rollback:()=>end('rollback')};
}
/** Runs body in one transaction (as role/user when given); commits on success, rolls back and rethrows on failure. */
async function inTx<T>(pool:Pool,o:{role?:Role;userId?:string},body:(tx:Tx)=>Promise<T>):Promise<T>{
 const tx=await openTx(pool,o);
 try{const out=await body(tx);await tx.commit();return out;}
 catch(e){await tx.rollback().catch(()=>{});throw e;}
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
type PgErr={message:string;code?:string;detail?:string};
/** Resolves with the rejection (message + SQLSTATE + detail) so tests can assert all three. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
const hex=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');

interface FactSpec{fact_id?:string;concept?:string;statement?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;raw_hash?:string}
interface FilingSpec{sourceRef?:string;available?:string;form?:string;fiscalYear?:number|null;fiscalPeriod?:string|null;periodEnd?:string|null;facts?:FactSpec[]}
interface Published{run:string;filingIds:string[];factIds:string[][]}
interface Stream extends Published{iss:string;market:Market;factsBatch:string}

/** Fixtures over the admin (superuser) pool: issuers, users, batches, and published fact streams built with the landed facts functions. */
function fixtures(pool:Pool){
 const q=async(text:string,values:unknown[]=[])=>(await pool.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async(name='ZZ Company Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
 const issuers=async(n:number)=>(await q(`insert into public.issuers(issuer_id,canonical_name_en) select gen_random_uuid(),'ZZ Company Bulk '||g from generate_series(1,$1::int) g returning issuer_id`,[n])).map(r=>String(r.issuer_id));
 const user=async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@example.test`]);return id;};
 const batch=async(producer='company-digest',dataset='company.digest')=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset,code_version,tool_versions) values($1,$2,$3,'test-sha','{"node":"test"}'::jsonb)`,[id,producer,dataset]);return id;};
 const scope=(iss:string,market:Market)=>one(`select public.reconcile_fact_sync_scope($1,$2::jsonb) v`,[market,JSON.stringify([{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
 const filingRow=(market:Market,f:FilingSpec,sourceRef:string)=>market==='US'
  ?{filing_id:randomUUID(),source:'edgar',origin:'sec',form_type:f.form??'10-K',fiscal_year:f.fiscalYear===undefined?2023:f.fiscalYear,fiscal_period:f.fiscalPeriod===undefined?'FY':f.fiscalPeriod,period_end:f.periodEnd===undefined?'2023-12-31':f.periodEnd,available_date:f.available??'2024-02-01',source_ref:sourceRef,url:'https://www.sec.gov/Archives/edgar/data/1/x.htm'}
  :{filing_id:randomUUID(),source:'tushare',origin:'sse',form_type:f.form??'annual',fiscal_year:f.fiscalYear===undefined?2023:f.fiscalYear,fiscal_period:f.fiscalPeriod===undefined?'FY':f.fiscalPeriod,period_end:f.periodEnd===undefined?'2023-12-31':f.periodEnd,available_date:f.available??'2024-03-30',source_ref:sourceRef,url:null};
 /** One run on an existing scope: stage the filings (an existing sourceRef reuses its filing) and their facts, publish. state_rev + 1. */
 const publish=async(iss:string,market:Market,factsBatch:string,filings:FilingSpec[],gen=1):Promise<Published>=>{
  expect(await one(`select public.claim_fact_sync_lease($1,$2,$3,600) v`,[iss,market,factsBatch])).toBe(true);
  const run=String(await one(`select public.begin_sync_run($1,$2,$3,$4) v`,[iss,market,factsBatch,gen]));
  const filingIds:string[]=[];const factIds:string[][]=[];
  for(const f of filings){
   const sourceRef=f.sourceRef??randomUUID();const row=filingRow(market,f,sourceRef);
   const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([row])]) as Record<string,string>;
   const fid=m[sourceRef];filingIds.push(fid);
   const facts=(f.facts??[]).map(x=>{const duration=x.duration??'12M';return {fact_id:x.fact_id??randomUUID(),filing_id:fid,concept:x.concept??'revenue',source_concept:'Revenues',
    statement:x.statement??(duration==='INSTANT'?'BS':'IS'),period_start:duration==='INSTANT'?null:(x.period_start??'2023-01-01'),period_end:x.period_end??'2023-12-31',duration,
    value:x.value??'100',unit:x.unit??(market==='US'?'USD':'CNY'),consolidation:'consolidated',available_date:row.available_date,mapping_version:`facts-map/${gen}`,raw_hash:x.raw_hash??'h'};});
   if(facts.length)expect(await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(facts)])).toBe(facts.length);
   factIds.push(facts.map(x=>x.fact_id));
  }
  await one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,filingIds]);
  return {run,filingIds,factIds};
 };
 /** A fresh issuer with a scope row and one published run (state_rev = 1). */
 const stream=async(filings:FilingSpec[],market:Market='US'):Promise<Stream>=>{
  const iss=await issuer();expect(await scope(iss,market)).toBe(1);
  const factsBatch=await batch('facts-sync',market==='US'?'facts.us':'facts.cn');
  return {iss,market,factsBatch,...await publish(iss,market,factsBatch,filings)};
 };
 const rev=(iss:string,market:Market)=>one(`select public.fact_state_rev($1,$2) v`,[iss,market]).then(Number);
 /** Raw issuer_events row written as the superuser (Task 1 tests only; Task 2+ write through replace_company_digest). */
 const rawEvent=async(iss:string,market:Market,b:string,o:{kind?:string;natural_key?:string;payload?:unknown;filing_id?:string|null}={})=>{
  const id=hex(randomUUID());
  await q(`insert into public.issuer_events(event_id,issuer_id,market,kind,natural_key,occurred_on,payload,payload_hash,based_on_rev,rebuild_id,rebuild_batch_id,filing_id)
   values($1,$2,$3,$4,$5,'2024-02-01',$6::jsonb,$7,1,gen_random_uuid(),$8,$9)`,[id,iss,market,o.kind??'filing_published',o.natural_key??randomUUID(),JSON.stringify(o.payload??{}),hex('p'),b,o.filing_id??null]);
  return id;
 };
 return {q,one,issuer,issuers,user,batch,scope,publish,stream,rev,rawEvent};
}

describe.skipIf(!enabled)('company research tables on real PostgreSQL',()=>{
 let admin:Pool;let fx:ReturnType<typeof fixtures>;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl,statement_timeout:10000});fx=fixtures(admin);
 });
 afterAll(async()=>{await admin?.end();});
 const priv=(role:string,t:string,p:string)=>fx.one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);

 it('creates six RLS tables with the §4.6/§0 #64 grant matrix and three triggers, and replays twice',async()=>{
  const rows=await fx.q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());for(const r of rows)expect({t:r.relname,rls:r.relrowsecurity}).toEqual({t:r.relname,rls:true});
  for(const role of ['anon','authenticated','service_role'] as const){
   for(const t of NO_DIRECT_WRITE)for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
   for(const t of ['company_watches','company_event_reads'])expect({role,t,ok:await priv(role,t,'TRUNCATE')}).toEqual({role,t,ok:false});
   expect({role,ok:await priv(role,'issuer_coverage','SELECT')}).toEqual({role,ok:true});
   expect({role,ok:await priv(role,'company_event_reads','UPDATE')}).toEqual({role,ok:false});
  }
  for(const t of SERVICE_ONLY){
   for(const role of ['anon','authenticated'])expect({t,role,ok:await priv(role,t,'SELECT')}).toEqual({t,role,ok:false});
   expect({t,ok:await priv('service_role',t,'SELECT')}).toEqual({t,ok:true});
  }
  for(const p of ['SELECT','INSERT','UPDATE','DELETE']){
   expect({p,ok:await priv('anon','company_watches',p)}).toEqual({p,ok:false});
   expect({p,ok:await priv('authenticated','company_watches',p)}).toEqual({p,ok:true});
   expect({p,ok:await priv('service_role','company_watches',p)}).toEqual({p,ok:true});
  }
  for(const p of ['SELECT','INSERT','DELETE']){
   expect({p,ok:await priv('anon','company_event_reads',p)}).toEqual({p,ok:false});
   expect({p,ok:await priv('authenticated','company_event_reads',p)}).toEqual({p,ok:true});
   expect({p,ok:await priv('service_role','company_event_reads',p)}).toEqual({p,ok:true});
  }
  const triggers=await fx.q(`select tgname, tgrelid::regclass::text rel from pg_trigger where not tgisinternal and tgname = any($1) order by tgname`,[['company_event_reads_check','company_watches_limit','company_watches_touch']]);
  expect(triggers).toEqual([{tgname:'company_event_reads_check',rel:'company_event_reads'},{tgname:'company_watches_limit',rel:'company_watches'},{tgname:'company_watches_touch',rel:'company_watches'}]);
  const fn=(sig:string)=>fx.q(`select r.rolname, has_function_privilege(r.rolname,$1,'EXECUTE') ok from pg_roles r where r.rolname in ('anon','authenticated','service_role') order by 1`,[sig]);
  for(const sig of ['public.company_watches_limit()','public.company_watches_touch()','public.company_event_reads_check()'])
   expect({sig,rows:await fn(sig)}).toEqual({sig,rows:[{rolname:'anon',ok:false},{rolname:'authenticated',ok:false},{rolname:'service_role',ok:false}]});
  const own=(t:string)=>[`${t} own select|SELECT|{authenticated}`,`${t} own delete|DELETE|{authenticated}`,`${t} own insert|INSERT|{authenticated}`,`${t} service all|ALL|{service_role}`];
  const expectedPolicies=[
   ...['issuer_events','company_digest_state','company_fact_evidence'].map(t=>`${t}|${t} service read|SELECT|{service_role}`),
   'issuer_coverage|issuer_coverage public read|SELECT|{public}',
   ...own('company_watches').map(x=>`company_watches|${x}`),'company_watches|company_watches own update|UPDATE|{authenticated}',
   ...own('company_event_reads').map(x=>`company_event_reads|${x}`),
  ].sort();
  const actualPolicies=(await fx.q(`select tablename,policyname,cmd,roles::text r from pg_policies where schemaname='public' and tablename=any($1)`,[TABLES])).map(r=>`${r.tablename}|${r.policyname}|${r.cmd}|${r.r}`).sort();
  expect(actualPolicies).toEqual(expectedPolicies);
  const sql=readFileSync(TABLES_MIGRATION,'utf8');
  await expect(replayMigration(admin,sql)).resolves.toBeUndefined();
  await expect(replayMigration(admin,sql)).resolves.toBeUndefined();
 });

 it('constraints and foreign keys: enums, JSON shapes, hex ids, the natural key, batches, filings, coverage, note length, evidence cascade',async()=>{
  const s=await fx.stream([{facts:[{}]}]);const b=await fx.batch();
  const ins=(o:Record<string,unknown>)=>fx.q(`insert into public.issuer_events(event_id,issuer_id,market,kind,natural_key,occurred_on,payload,meta,payload_hash,based_on_rev,rebuild_id,rebuild_batch_id,filing_id)
   values($1,$2,$3,$4,$5,'2024-02-01',$6::jsonb,$7::jsonb,$8,1,gen_random_uuid(),$9,$10)`,
   [o.event_id??hex(randomUUID()),o.issuer_id??s.iss,o.market??'US',o.kind??'filing_published',o.natural_key??'k',o.payload??'{}',o.meta??'{}',o.payload_hash??hex('p'),o.batch??b,o.filing_id??s.filingIds[0]]);
  await ins({natural_key:'k1'});
  expect((await fails(ins({natural_key:'k1'}))).code).toBe('23505');                        // unique (issuer_id, market, kind, natural_key)
  for(const bad of [{market:'HK'},{kind:'news'},{payload:'[]'},{meta:'"x"'},{event_id:'XYZ'},{payload_hash:'abc'},{natural_key:''}])
   expect({bad,code:(await fails(ins({natural_key:randomUUID(),...bad}))).code}).toEqual({bad,code:'23514'});
  expect((await fails(ins({natural_key:randomUUID(),batch:randomUUID()}))).code).toBe('23503');   // rebuild_batch_id → ingest_batches
  expect((await fails(ins({natural_key:randomUUID(),filing_id:randomUUID()}))).code).toBe('23503'); // filing_id → filings
  expect((await fails(ins({natural_key:randomUUID(),issuer_id:randomUUID()}))).code).toBe('23503'); // issuer_id → issuers
  const cov=(o:Record<string,unknown>)=>fx.q(`insert into public.issuer_coverage(issuer_id,market,filings_count,facts_count,concepts_covered,citation_summary,scope_last_status,based_on_rev,rebuild_id,rebuild_batch_id)
   values($1,$2,$3,0,0,$4::jsonb,$5,1,gen_random_uuid(),$6)`,[o.issuer_id??s.iss,o.market??'US',o.filings_count??0,o.citation_summary??'{"linked":0,"pending":0,"edgar":0}',o.status??null,b]);
  await cov({});
  expect((await fails(cov({}))).code).toBe('23505');                                          // pk (issuer_id, market)
  for(const bad of [{market:'CN',filings_count:-1},{market:'CN',citation_summary:'[]'},{market:'CN',status:'running'}])
   expect({bad,code:(await fails(cov(bad))).code}).toEqual({bad,code:'23514'});
  const u=await fx.user();
  expect((await fails(fx.q(`insert into public.company_watches(user_id,issuer_id,note) values($1,$2,repeat('x',2001))`,[u,s.iss]))).code).toBe('23514');
  expect((await fails(fx.q(`insert into public.company_watches(user_id,issuer_id) values($1,$2)`,[randomUUID(),s.iss]))).code).toBe('23503');   // auth.users
  await fx.q(`insert into public.company_watches(user_id,issuer_id,note) values($1,$2,repeat('x',2000))`,[u,s.iss]);
  expect((await fails(fx.q(`insert into public.company_digest_state(issuer_id,market,consecutive_failures) values($1,'US',-1)`,[s.iss]))).code).toBe('23514');
  expect((await fails(fx.q(`insert into public.company_digest_state(issuer_id,market,last_status) values($1,'US','running')`,[s.iss]))).code).toBe('23514');
  await fx.q(`insert into public.company_digest_state(issuer_id,market) values($1,'US')`,[s.iss]);
  expect((await fx.q(`select digested_rev::int d, attempt_seq::int a, consecutive_failures c, next_attempt_at = 'epoch'::timestamptz epoch, swept_at, last_failed_attempt_id from public.company_digest_state where issuer_id=$1`,[s.iss]))[0])
   .toEqual({d:0,a:0,c:0,epoch:true,swept_at:null,last_failed_attempt_id:null});
  // Evidence rows cascade with their fact: a staged fact deleted by abandoning its run takes its index row along.
  const run=String(await fx.one(`select public.begin_sync_run($1,'US',$2,1) v`,[s.iss,s.factsBatch]));
  const m=await fx.one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:randomUUID(),source:'edgar',origin:'sec',form_type:'10-Q',fiscal_year:2024,fiscal_period:'Q1',period_end:'2024-03-31',available_date:'2024-05-01',source_ref:'ev-cascade-'+randomUUID(),url:null}])]) as Record<string,string>;
  const staged=randomUUID();
  await fx.one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify([{fact_id:staged,filing_id:Object.values(m)[0],concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'1',unit:'USD',consolidation:'consolidated',available_date:'2024-05-01',mapping_version:'facts-map/1',raw_hash:hex('x')}])]);
  const ev=(o:Record<string,unknown>)=>fx.q(`insert into public.company_fact_evidence(fact_id,issuer_id,market,raw_hash,snapshot_sha256,snapshot_path,hash_locator,json_pointer,source,index_version,http_status)
   values($1,$2,'US',$3,$4,$5,'loc',$6,$7,'company-evidence/1',$8)`,[o.fact_id??staged,s.iss,o.raw_hash??hex('x'),hex('s'),'edgar/x.json',o.pointer??'/facts/us-gaap/Revenues/units/USD/0',o.source??'edgar',o.http_status??200]);
  for(const bad of [{raw_hash:'h'},{pointer:'facts'},{source:'cninfo'},{http_status:42}])
   expect({bad,code:(await fails(ev(bad))).code}).toEqual({bad,code:'23514'});
  expect((await fails(ev({fact_id:randomUUID()}))).code).toBe('23503');
  await ev({});
  await fx.q(`select public.abandon_sync_run($1)`,[run]);
  expect(await fx.one(`select count(*)::int v from public.company_fact_evidence where fact_id=$1`,[staged])).toBe(0);
 });

 it('real roles: anon/authenticated cannot read the service-only tables; no role writes the public/materialized tables; coverage is public',async()=>{
  const s=await fx.stream([{facts:[{}]}]);const b=await fx.batch();
  await fx.rawEvent(s.iss,'US',b,{filing_id:s.filingIds[0]});
  await fx.q(`insert into public.issuer_coverage(issuer_id,market,filings_count,facts_count,concepts_covered,citation_summary,based_on_rev,rebuild_id,rebuild_batch_id) values($1,'US',1,1,1,'{"linked":0,"pending":0,"edgar":1}',1,gen_random_uuid(),$2)`,[s.iss,b]);
  await fx.q(`insert into public.company_digest_state(issuer_id,market) values($1,'US')`,[s.iss]);
  for(const role of ['anon','authenticated'] as const){
   for(const t of [...SERVICE_ONLY,...(role==='anon'?['company_watches','company_event_reads']:[])])
    expect({role,t,msg:(await fails(inTx(admin,{role,userId:role==='authenticated'?randomUUID():undefined},tx=>tx.c.query(`select * from public.${t}`)))).message}).toEqual({role,t,msg:expect.stringMatching(/permission denied/)});
   expect(await inTx(admin,{role},async tx=>(await tx.c.query(`select count(*)::int n from public.issuer_coverage where issuer_id=$1`,[s.iss])).rows[0].n)).toBe(1);
  }
  expect(await inTx(admin,{role:'service_role'},async tx=>(await tx.c.query(`select (select count(*) from public.issuer_events where issuer_id=$1)::int e, (select count(*) from public.company_digest_state where issuer_id=$1)::int d`,[s.iss])).rows[0])).toEqual({e:1,d:1});
  const writes=[
   `insert into public.issuer_events(event_id,issuer_id,market,kind,natural_key,occurred_on,payload,payload_hash,based_on_rev,rebuild_id,rebuild_batch_id) values('${hex('w')}','${s.iss}','US','filing_published','w','2024-01-01','{}','${hex('p')}',1,gen_random_uuid(),'${b}')`,
   `update public.issuer_events set retired_at=now() where issuer_id='${s.iss}'`,
   `delete from public.issuer_events where issuer_id='${s.iss}'`,
   `update public.issuer_coverage set facts_count=9 where issuer_id='${s.iss}'`,
   `delete from public.issuer_coverage where issuer_id='${s.iss}'`,
   `insert into public.company_digest_state(issuer_id,market) values('${s.iss}','CN')`,
   `update public.company_digest_state set digested_rev=99 where issuer_id='${s.iss}'`,
   `delete from public.company_fact_evidence where issuer_id='${s.iss}'`,
   `truncate public.company_watches`,
  ];
  for(const role of ['anon','authenticated','service_role'] as const)for(const sql of writes)
   expect({role,sql,msg:(await fails(inTx(admin,{role},tx=>tx.c.query(sql)))).message}).toEqual({role,sql,msg:expect.stringMatching(/permission denied/)});
 });

 it('watches and receipts are own-rows: user B neither sees nor writes A\'s rows; service_role sees both',async()=>{
  const iss=await fx.issuer();const a=await fx.user();const bU=await fx.user();const b=await fx.batch();
  const e1=await fx.rawEvent(iss,'US',b);
  await inTx(admin,{role:'authenticated',userId:a},async tx=>{
   expect((await tx.c.query(`insert into public.company_watches(user_id,issuer_id,note) values($1,$2,'mine') returning user_id`,[a,iss])).rowCount).toBe(1);
   expect((await tx.c.query(`insert into public.company_event_reads(user_id,issuer_id,event_id) values($1,$2,$3)`,[a,iss,e1])).rowCount).toBe(1);
  });
  await inTx(admin,{role:'authenticated',userId:bU},async tx=>{
   expect((await tx.c.query(`select count(*)::int n from public.company_watches`)).rows[0].n).toBe(0);
   expect((await tx.c.query(`select count(*)::int n from public.company_event_reads`)).rows[0].n).toBe(0);
   expect((await tx.c.query(`update public.company_watches set note='x' where user_id=$1`,[a])).rowCount).toBe(0);
   expect((await tx.c.query(`delete from public.company_watches where user_id=$1`,[a])).rowCount).toBe(0);
   expect((await tx.c.query(`delete from public.company_event_reads where user_id=$1`,[a])).rowCount).toBe(0);
  });
  const otherIssuer=await fx.issuer();
  expect((await fails(inTx(admin,{role:'authenticated',userId:bU},tx=>tx.c.query(`insert into public.company_watches(user_id,issuer_id) values($1,$2)`,[a,otherIssuer])))).message).toMatch(/row-level security/);
  expect((await fails(inTx(admin,{role:'authenticated',userId:bU},tx=>tx.c.query(`insert into public.company_event_reads(user_id,issuer_id,event_id) values($1,$2,$3)`,[a,iss,e1])))).message).toMatch(/row-level security/);
  expect(await inTx(admin,{role:'authenticated',userId:a},async tx=>(await tx.c.query(`select note from public.company_watches`)).rows)).toEqual([{note:'mine'}]);
  expect(await inTx(admin,{role:'service_role'},async tx=>(await tx.c.query(`select count(*)::int n from public.company_watches where user_id=$1`,[a])).rows[0].n)).toBe(1);
  // touch trigger: updated_at moves, keys are immutable
  const before=(await fx.q(`select updated_at::text u from public.company_watches where user_id=$1`,[a]))[0].u;
  await fx.q(`select pg_sleep(0.01)`);
  await inTx(admin,{role:'authenticated',userId:a},tx=>tx.c.query(`update public.company_watches set muted=true where user_id=$1 and issuer_id=$2`,[a,iss]));
  expect((await fx.q(`select updated_at::text u from public.company_watches where user_id=$1`,[a]))[0].u).not.toBe(before);
  for(const [col,val] of [['issuer_id',await fx.issuer()],['user_id',await fx.user()],['created_at','2000-01-01']] as const){
   const moved=await fails(fx.q(`update public.company_watches set ${col}=$2 where user_id=$1`,[a,val]));
   expect({col,moved}).toMatchObject({col,moved:{message:'immutable_watch_key',code:'23514'}});
  }
  // timestamps are server time: client-supplied created_at/updated_at are overwritten on insert
  const stamped=await fx.issuer();
  await inTx(admin,{role:'authenticated',userId:a},tx=>tx.c.query(`insert into public.company_watches(user_id,issuer_id,created_at,updated_at) values($1,$2,'2000-01-01','2000-01-01')`,[a,stamped]));
  expect((await fx.q(`select abs(extract(epoch from now()-created_at))<60 c, abs(extract(epoch from now()-updated_at))<60 u from public.company_watches where user_id=$1 and issuer_id=$2`,[a,stamped]))[0]).toEqual({c:true,u:true});
 });

 it('watch_limit: 200 per user, enforced under concurrent inserts; an existing key passes to the primary key',async()=>{
  const ids=await fx.issuers(202);const u=await fx.user();
  await fx.q(`insert into public.company_watches(user_id,issuer_id) select $1, unnest($2::uuid[])`,[u,ids.slice(0,199)]);
  expect(await fx.one(`select count(*)::int v from public.company_watches where user_id=$1`,[u])).toBe(199);
  // two sessions race for the 200th slot with different issuers: the second waits on the advisory lock, then sees 200 and is refused
  const t1=await openTx(admin,{role:'authenticated',userId:u});const t2=await openTx(admin,{role:'authenticated',userId:u});
  try{
   await t1.c.query(`insert into public.company_watches(user_id,issuer_id) values($1,$2)`,[u,ids[199]]);
   const second=t2.c.query(`insert into public.company_watches(user_id,issuer_id) values($1,$2)`,[u,ids[200]]);
   await stillBlockedBehind(admin,t1.pid,second);
   await t1.commit();
   expect(await fails(second)).toMatchObject({message:'watch_limit',code:'23514'});
  }finally{await t1.rollback().catch(()=>{});await t2.rollback().catch(()=>{});}
  expect(await fx.one(`select count(*)::int v from public.company_watches where user_id=$1`,[u])).toBe(200);
  // at the limit an existing key is not counted: on conflict do nothing → 0 rows, plain insert → 23505 (not watch_limit)
  expect(await inTx(admin,{role:'authenticated',userId:u},async tx=>(await tx.c.query(`insert into public.company_watches(user_id,issuer_id) values($1,$2) on conflict (user_id,issuer_id) do nothing`,[u,ids[0]])).rowCount)).toBe(0);
  expect((await fails(inTx(admin,{role:'authenticated',userId:u},tx=>tx.c.query(`insert into public.company_watches(user_id,issuer_id) values($1,$2)`,[u,ids[0]])))).code).toBe('23505');
  expect(await fails(fx.q(`insert into public.company_watches(user_id,issuer_id) values($1,$2)`,[u,ids[201]]))).toMatchObject({message:'watch_limit',code:'23514'});
  // a multi-row insert counts the rows it already wrote
  const v=await fx.user();
  expect(await fails(fx.q(`insert into public.company_watches(user_id,issuer_id) select $1, unnest($2::uuid[])`,[v,ids.slice(0,201)]))).toMatchObject({message:'watch_limit'});
  // the same new key from two sessions at 199: the second waits, then finds the key and lets on conflict do nothing decide
  const w=await fx.user();
  await fx.q(`insert into public.company_watches(user_id,issuer_id) select $1, unnest($2::uuid[])`,[w,ids.slice(0,199)]);
  const s1=await openTx(admin,{role:'authenticated',userId:w});const s2=await openTx(admin,{role:'authenticated',userId:w});
  try{
   await s1.c.query(`insert into public.company_watches(user_id,issuer_id) values($1,$2)`,[w,ids[199]]);
   const same=s2.c.query(`insert into public.company_watches(user_id,issuer_id) values($1,$2) on conflict (user_id,issuer_id) do nothing`,[w,ids[199]]);
   await stillBlockedBehind(admin,s1.pid,same);
   await s1.commit();
   expect((await same).rowCount).toBe(0);
   await s2.commit();
  }finally{await s1.rollback().catch(()=>{});await s2.rollback().catch(()=>{});}
  expect(await fx.one(`select count(*)::int v from public.company_watches where user_id=$1`,[w])).toBe(200);
 });

 it('receipts: the event must belong to the issuer; the issuer must be watched; unwatching clears the receipts',async()=>{
  const i1=await fx.issuer();const i2=await fx.issuer();const i3=await fx.issuer();const u=await fx.user();const b=await fx.batch();
  const e1=await fx.rawEvent(i1,'US',b);const e1cn=await fx.rawEvent(i1,'CN',b);const e3=await fx.rawEvent(i3,'US',b);
  await fx.q(`insert into public.company_watches(user_id,issuer_id) values($1,$2),($1,$3)`,[u,i1,i2]);
  const read=(iss:string,ev:string,conflict='')=>inTx(admin,{role:'authenticated',userId:u},async tx=>(await tx.c.query(`insert into public.company_event_reads(user_id,issuer_id,event_id) values($1,$2,$3)${conflict}`,[u,iss,ev])).rowCount);
  expect(await fails(read(i2,e1))).toMatchObject({message:'invalid_read',code:'23514'});        // cross-issuer receipt
  expect(await fails(read(i1,hex('missing')))).toMatchObject({message:'invalid_read',code:'23514'});
  expect(await read(i1,e1)).toBe(1);
  expect(await read(i1,e1cn)).toBe(1);                                                          // both markets belong to the issuer
  expect(await read(i1,e1,' on conflict (user_id,event_id) do nothing')).toBe(0);
  expect((await fails(read(i3,e3))).code).toBe('23503');                                         // not watched → composite FK
  await inTx(admin,{role:'authenticated',userId:u},tx=>tx.c.query(`delete from public.company_watches where user_id=$1 and issuer_id=$2`,[u,i1]));
  expect(await fx.one(`select count(*)::int v from public.company_event_reads where user_id=$1`,[u])).toBe(0);
 });
});

describe.skipIf(!enabled)('company research functions on real PostgreSQL',()=>{
 let admin:Pool;let fx:ReturnType<typeof fixtures>;
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl,statement_timeout:10000});fx=fixtures(admin);
 });
 afterAll(async()=>{await admin?.end();});
 const TODAY=new Date().toISOString().slice(0,10);
 const ALL:Role[]=['anon','authenticated','service_role'];
 interface Ev{kind:string;natural_key:string;occurred_on:string;period_end:string|null;concept:string|null;filing_id:string|null;payload:Record<string,unknown>;meta:Record<string,unknown>}
 const omit=(o:Record<string,unknown>,k:string)=>Object.fromEntries(Object.entries(o).filter(([x])=>x!==k));
 const coverage=(o:Record<string,unknown>={})=>({filings_count:1,facts_count:1,concepts_covered:1,earliest_period_end:'2023-12-31',latest_period_end:'2023-12-31',latest_available_date:'2024-02-01',citation_summary:{linked:0,pending:0,edgar:1},scope_last_success_at:null,scope_last_status:null,...o});
 const code=(p:Promise<unknown>)=>fails(p).then(e=>({message:e.message,code:e.code,detail:e.detail}));
 const begin=(iss:string,market:Market='US',now=new Date().toISOString())=>fx.one(`select public.begin_company_digest_attempt($1,$2,$3::timestamptz) v`,[iss,market,now]).then(Number);
 const fail=(iss:string,attempt:number,now:string,market:Market='US')=>fx.one(`select public.mark_company_digest_failed($1,$2,$3,$4::timestamptz) v`,[iss,market,attempt,now]);
 const replace=(a:{iss:string;market?:Market;batch:string;attempt:number;rebuild?:string;rev:number;sweep?:boolean;events:Ev[];coverage?:Record<string,unknown>},c:Pool|PoolClient=admin)=>
  c.query(`select public.replace_company_digest($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) v`,[a.iss,a.market??'US',a.batch,a.attempt,a.rebuild??randomUUID(),a.rev,a.sweep??false,JSON.stringify(a.events),JSON.stringify(a.coverage??coverage())])
   .then(r=>r.rows[0].v as {upserted:number;changed:number;retired:number;revived:number});
 const state=(iss:string,market:Market='US')=>fx.q(`select digested_rev::int dr, attempt_seq::int seq, last_attempt_id::int la, last_success_attempt_id::int ls, last_failed_attempt_id::int lf, last_status st, consecutive_failures cf, next_attempt_at::text nx, swept_at::text sw from public.company_digest_state where issuer_id=$1 and market=$2`,[iss,market]).then(r=>r[0]);
 const events=(iss:string,market:Market='US')=>fx.q(`select event_id,kind,natural_key,payload_hash,first_seen_at::text fs,payload_changed_at::text pc,retired_at::text rt,rebuild_id::text rb from public.issuer_events where issuer_id=$1 and market=$2 order by kind,natural_key`,[iss,market]);
 /** The filing_published event Task 5 must produce for a filing (payload = the filings row + its visible fact count). */
 const filingEvent=async(filingId:string):Promise<Ev>=>{
  const g=(await fx.q(`select filing_id::text id, form_type, fiscal_year, fiscal_period, period_end::text pe, available_date::text ad, source_ref,
   (select count(*)::int from public.financial_facts f where f.filing_id=g.filing_id and f.status='ok' and f.mapping_gen=g.mapping_gen) n from public.filings g where filing_id=$1`,[filingId]))[0];
  return {kind:'filing_published',natural_key:g.id,occurred_on:g.ad,period_end:g.pe,concept:null,filing_id:g.id,meta:{},
   payload:{formType:g.form_type,fiscalYear:g.fiscal_year,fiscalPeriod:g.fiscal_period,periodEnd:g.pe,availableDate:g.ad,sourceRef:g.source_ref,factCount:g.n}};
 };
 const factOf=async(id:string)=>(await fx.q(`select fact_id::text id, concept, statement, coalesce(period_start,period_end)::text ps, period_end::text pe, duration, value_text v, unit, filing_id::text fid, available_date::text ad from public.financial_facts where fact_id=$1`,[id]))[0];
 /** period_first_seen for the period of the given headline facts, first seen in filingId. */
 const periodEvent=async(filingId:string,headline:string[]):Promise<Ev>=>{
  const hs=await Promise.all(headline.map(factOf));const h=hs[0];
  const ad=(await fx.q(`select available_date::text ad from public.filings where filing_id=$1`,[filingId]))[0].ad as string;
  return {kind:'period_first_seen',natural_key:`${h.ps}:${h.pe}:${h.duration}`,occurred_on:ad,period_end:h.pe,concept:null,filing_id:filingId,meta:{headlineAsOf:TODAY},
   payload:{periodStart:h.ps,periodEnd:h.pe,duration:h.duration,filingId,conceptCount:hs.length,headline:Object.fromEntries(hs.map(x=>[x.concept,{factId:x.id,value:x.v,unit:x.unit}])),ambiguousUnits:[]}};
 };
 const revisedEvent=async(fromId:string,toId:string):Promise<Ev>=>{
  const f=await factOf(fromId);const t=await factOf(toId);
  const payload:Record<string,unknown>={concept:t.concept,statement:t.statement,periodStart:t.ps,periodEnd:t.pe,duration:t.duration,consolidation:'consolidated',unit:t.unit,
   from:{factId:f.id,value:f.v,filingId:f.fid,availableDate:f.ad},to:{factId:t.id,value:t.v,filingId:t.fid,availableDate:t.ad}};
  if(Number(f.v)!==0)payload.relChange='0.1000000000';
  return {kind:'fact_revised',natural_key:`${t.concept}:${t.ps}:${t.pe}:consolidated:${t.unit}:${t.ad}`,occurred_on:t.ad,period_end:t.pe,concept:t.concept,filing_id:t.fid,payload,meta:{}};
 };
 const FUNCS:{sig:string;definer:boolean;roles:Role[]}[]=[
  {sig:'public.begin_company_digest_attempt(uuid,text,timestamptz)',definer:true,roles:['service_role']},
  {sig:'public.replace_company_digest(uuid,text,uuid,bigint,uuid,bigint,boolean,jsonb,jsonb)',definer:true,roles:['service_role']},
  {sig:'public.mark_company_digest_failed(uuid,text,bigint,timestamptz)',definer:true,roles:['service_role']},
  {sig:'public.replace_company_fact_evidence(uuid,text,bigint,bigint,jsonb)',definer:true,roles:['service_role']},
  {sig:'public.company_digest_due(timestamptz,int,text)',definer:true,roles:['service_role']},
  {sig:'public.company_sweep_due(timestamptz,timestamptz,int,text)',definer:true,roles:['service_role']},
  {sig:'public.company_digest_backlog()',definer:true,roles:['service_role']},
  {sig:'public.company_fact_evidence(uuid[])',definer:true,roles:ALL},
  {sig:'public.company_read_snapshot(uuid,text,text[],date,date,date,boolean,int)',definer:false,roles:ALL},
  {sig:'public.company_list_coverage(text,uuid[],text,int,int)',definer:false,roles:ALL},
  {sig:'public.company_canonical_json(jsonb)',definer:false,roles:[]},
  {sig:'public.company_ev_check(uuid,text,jsonb,date)',definer:false,roles:[]},
  {sig:'public.company_cov_check(jsonb)',definer:false,roles:[]},
  {sig:'public.company_ev_keys(jsonb,text[],text[],text)',definer:false,roles:[]},
  {sig:'public.company_ev_text(jsonb,boolean,text)',definer:false,roles:[]},
  {sig:'public.company_ev_date(jsonb,boolean,text)',definer:false,roles:[]},
  {sig:'public.company_ev_int(jsonb,boolean,bigint,text)',definer:false,roles:[]},
  {sig:'public.company_ev_uuid(jsonb,boolean,text)',definer:false,roles:[]},
  {sig:'public.company_ev_fact(uuid,text,jsonb,date,text)',definer:false,roles:[]},
  {sig:'public.company_ev_filing(uuid,text,jsonb,date,text)',definer:false,roles:[]},
  {sig:'public.company_ev_side(uuid,text,jsonb,date,text)',definer:false,roles:[]},
  {sig:'public.company_evidence_check(uuid,text,jsonb)',definer:false,roles:[]},
 ];

 it('function inventory: migration-role owner, security mode, empty search_path, execute grants by real role; both migrations replay',async()=>{
  const owner=await fx.one(`select proowner::regrole::text v from pg_proc where oid='public.read_facts(uuid,text,text[],date,date,date,boolean,int,boolean)'::regprocedure`);
  for(const f of FUNCS){
   const p=(await fx.q(`select proowner::regrole::text owner, prosecdef, coalesce(proconfig,'{}'::text[]) cfg from pg_proc where oid=$1::regprocedure`,[f.sig]))[0];
   expect({sig:f.sig,owner:p.owner,definer:p.prosecdef,path:(p.cfg as string[]).includes('search_path=""')}).toEqual({sig:f.sig,owner,definer:f.definer,path:true});
   for(const role of ALL)expect({sig:f.sig,role,ok:await fx.one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,f.sig])}).toEqual({sig:f.sig,role,ok:f.roles.includes(role)});
  }
  const s=await fx.stream([{facts:[{}]}]);
  const calls=[`select public.begin_company_digest_attempt('${s.iss}','US',now())`,`select public.replace_company_digest('${s.iss}','US',gen_random_uuid(),1,gen_random_uuid(),1,false,'[]','{}')`,
   `select public.mark_company_digest_failed('${s.iss}','US',1,now())`,`select public.replace_company_fact_evidence('${s.iss}','US',1,1,'[]')`,`select public.company_digest_due(now(),10)`,`select public.company_digest_backlog()`];
  for(const role of ['anon','authenticated'] as const)for(const sql of calls)
   expect({role,sql,msg:(await fails(inTx(admin,{role},tx=>tx.c.query(sql)))).message}).toEqual({role,sql,msg:expect.stringMatching(/permission denied/)});
  await expect(replayMigration(admin,readFileSync(TABLES_MIGRATION,'utf8'))).resolves.toBeUndefined();
  for(let i=0;i<2;i++){   // replay in lock order: the fence migration supersedes the 3-arg evidence writer and the evidence check
   await expect(replayMigration(admin,readFileSync(FUNCTIONS_MIGRATION,'utf8'))).resolves.toBeUndefined();
   await expect(replayMigration(admin,readFileSync(FENCE_MIGRATION,'utf8'))).resolves.toBeUndefined();
  }
  expect(await fx.one(`select to_regprocedure('public.replace_company_fact_evidence(uuid,text,jsonb)') is null v`)).toBe(true);
 });

 it('company_canonical_json is byte-identical to canonicalJson; replace stores eventIdOf / payloadHashOf',async()=>{
  const SAMPLES:unknown[]=[
   {},[],{b:1,a:[true,false,null],c:{z:'',y:'x'}},
   {k:'quote " backslash \\ slash / tab \t newline \n cr \r bs \b ff \f'},
   {k:'\u0001\u001f\u007f é 中文 😀   '},
   {Z:1,a:2,'é':3,'中':4,'�':5,'😀':6,aa:7,'a\u0001':8},
   {n:[0,-5,9007199254740991,-9007199254740991]},
   {nested:{deep:[{x:{y:[1,{z:'w'}]}}]}},
  ];
  for(const s of SAMPLES){
   const r=(await fx.q(`select public.company_canonical_json($1::jsonb) c, encode(sha256(convert_to(public.company_canonical_json($1::jsonb),'UTF8')),'hex') h`,[JSON.stringify(s)]))[0];
   expect({s,c:r.c,h:r.h}).toEqual({s,c:canonicalJson(s),h:sha256Utf8(canonicalJson(s))});
  }
  expect(await code(fx.q(`select public.company_canonical_json('{"x":1.5}'::jsonb)`))).toMatchObject({message:'invalid_event',code:'22023'});
  expect(await code(fx.q(`select public.company_canonical_json('[9007199254740992]'::jsonb)`))).toMatchObject({message:'invalid_event'});
  const s=await fx.stream([{facts:[{concept:'revenue',value:'100'},{concept:'net_income_parent',value:'7'}]}]);const b=await fx.batch();
  const a=await begin(s.iss);
  const evs=[await filingEvent(s.filingIds[0]),await periodEvent(s.filingIds[0],s.factIds[0])];
  await replace({iss:s.iss,batch:b,attempt:a,rev:1,events:evs});
  const rows=await fx.q(`select event_id,payload_hash,kind,natural_key from public.issuer_events where issuer_id=$1 order by kind`,[s.iss]);
  expect(rows).toEqual(evs.map(e=>({event_id:eventIdOf(s.iss,'US',e.kind,e.natural_key),payload_hash:payloadHashOf(e.payload),kind:e.kind,natural_key:e.natural_key})));
 });

 it('begin numbers attempts; replace writes events, coverage and state; refuses unknown_stream, stale_computation, stale_attempt, invalid_attempt, invalid_batch',async()=>{
  const s=await fx.stream([{facts:[{}]}]);const b=await fx.batch();
  expect(await code(begin(randomUUID()))).toMatchObject({message:'unknown_stream',code:'P0002'});
  const a1=await begin(s.iss);const a2=await begin(s.iss);expect([a1,a2]).toEqual([1,2]);
  expect(await state(s.iss)).toMatchObject({seq:2,la:2,ls:null,lf:null,st:null,dr:0});
  const ev=await filingEvent(s.filingIds[0]);
  expect(await code(replace({iss:randomUUID(),batch:b,attempt:1,rev:0,events:[]}))).toMatchObject({message:'unknown_stream',code:'P0002'});
  expect(await code(replace({iss:s.iss,batch:b,attempt:a2,rev:0,events:[ev]}))).toMatchObject({message:'stale_computation',code:'55P03'});
  expect(await code(replace({iss:s.iss,batch:b,attempt:3,rev:1,events:[ev]}))).toMatchObject({message:'invalid_attempt',code:'22023'});
  expect(await code(replace({iss:s.iss,batch:await fx.batch('facts-sync','facts.us'),attempt:a2,rev:1,events:[ev]}))).toMatchObject({message:'invalid_batch'});
  const done=await fx.batch();await fx.q(`update public.ingest_batches set status='success',finished_at=now() where batch_id=$1`,[done]);
  expect(await code(replace({iss:s.iss,batch:done,attempt:a2,rev:1,events:[ev]}))).toMatchObject({message:'invalid_batch'});
  const rebuild=randomUUID();
  expect(await replace({iss:s.iss,batch:b,attempt:a2,rebuild,rev:1,events:[ev],coverage:coverage({facts_count:1})})).toEqual({upserted:1,changed:1,retired:0,revived:0});
  expect(await state(s.iss)).toMatchObject({dr:1,ls:2,lf:null,st:'success',cf:0,sw:null});
  expect((await fx.q(`select facts_count,based_on_rev::int r,rebuild_id::text rb,rebuild_batch_id::text bb,citation_summary from public.issuer_coverage where issuer_id=$1`,[s.iss]))[0])
   .toEqual({facts_count:1,r:1,rb:rebuild,bb:b,citation_summary:{linked:0,pending:0,edgar:1}});
  expect(await code(replace({iss:s.iss,batch:b,attempt:a1,rev:1,events:[ev]}))).toMatchObject({message:'stale_attempt',code:'P0001'});
  expect(await replace({iss:s.iss,batch:b,attempt:a2,rev:1,events:[ev]})).toEqual({upserted:1,changed:0,retired:0,revived:0});   // the same attempt may write again
  const other=await fx.stream([{facts:[{}]}]);
  expect(await code(replace({iss:other.iss,batch:b,attempt:1,rev:1,events:[]}))).toMatchObject({message:'invalid_attempt'});   // no attempt began
  await fx.publish(s.iss,'US',s.factsBatch,[{available:'2024-05-01',facts:[{period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M'}]}]);
  const a3=await begin(s.iss);
  expect(await code(replace({iss:s.iss,batch:b,attempt:a3,rev:1,events:[ev]}))).toMatchObject({message:'stale_computation'});
 });

 it('invalid_event: shape, kinds, cross-stream, visibility (quarantined, older generation, future), value_text, lengths, duplicates, filing consistency, relChange, coverage, rebuild reuse',async()=>{
  const sr=randomUUID();
  const s=await fx.stream([{sourceRef:sr,facts:[{value:'100.50'}]},{available:'2024-05-01',facts:[{value:'120'}]}]);
  const other=await fx.stream([{facts:[{}]}]);
  const b=await fx.batch();const a=await begin(s.iss);
  const good=await filingEvent(s.filingIds[0]);const rev=await revisedEvent(s.factIds[0][0],s.factIds[1][0]);
  expect((await replace({iss:s.iss,batch:b,attempt:a,rev:1,events:[good,rev]})).upserted).toBe(2);   // the good set passes
  const bad=async(events:unknown[],cov?:Record<string,unknown>)=>code(replace({iss:s.iss,batch:b,attempt:a,rev:await fx.rev(s.iss,'US'),events:events as Ev[],coverage:cov}));
  const cases:[string,unknown[],RegExp][]=[
   ['extra top-level key',[{...good,extra:1}],/^event: unexpected key/],
   ['missing top-level key',[omit(good as unknown as Record<string,unknown>,'meta')],/^event: missing key/],
   ['meta extra key',[{...good,meta:{headlineAsOf:TODAY}}],/^meta: unexpected key/],
   ['payload extra key',[{...good,payload:{...good.payload,url:'x'}}],/^payload: unexpected key/],
   ['unknown kind',[{...good,kind:'news'}],/^kind: unknown event kind/],
   ['cross-stream filing',[await filingEvent(other.filingIds[0])],/^filing_id: filing not in this stream/],
   ['factCount differs',[{...good,payload:{...good.payload,factCount:9}}],/^payload\.factCount/],
   ['value is not value_text',[{...rev,payload:{...rev.payload,from:{...(rev.payload.from as Record<string,unknown>),value:'100.5'}}}],/^payload\.from: value differs/],
   ['string longer than 256',[{...good,payload:{...good.payload,sourceRef:'x'.repeat(257)}}],/^payload\.sourceRef: string/],
   ['uppercase uuid',[{...good,filing_id:good.filing_id!.toUpperCase()}],/^filing_id: uuid/],
   ['bad date',[{...good,occurred_on:'2024-2-1'}],/^occurred_on: date/],
   ['duplicate natural key',[good,good],/^events: duplicate/],
   ['relChange missing while from is non-zero',[{...rev,payload:omit(rev.payload,'relChange')}],/^payload\.relChange/],
   ['relChange format',[{...rev,payload:{...rev.payload,relChange:'1e-3'}}],/^payload\.relChange/],
   ['natural key mismatch',[{...rev,natural_key:rev.natural_key+'x'}],/^fact_revised: natural_key/],
  ];
  for(const [name,evs,re] of cases)expect({name,...await bad(evs)}).toEqual({name,message:'invalid_event',code:'22023',detail:expect.stringMatching(re)});
  const covCases:[string,Record<string,unknown>,RegExp][]=[
   ['extra key',{...coverage(),x:1},/^coverage: unexpected key/],
   ['negative count',coverage({facts_count:-1}),/^coverage\.facts_count/],
   ['citation keys',coverage({citation_summary:{linked:0,pending:0}}),/^coverage\.citation_summary: missing key/],
   ['status',coverage({scope_last_status:'running'}),/^coverage\.scope_last_status/],
   ['timestamp',coverage({scope_last_success_at:'not-a-time'}),/^coverage\.scope_last_success_at/],
  ];
  for(const [name,cov,re] of covCases)expect({name,...await bad([],cov)}).toEqual({name,message:'invalid_event',code:'22023',detail:expect.stringMatching(re)});
  const used=(await fx.q(`select rebuild_id::text r from public.issuer_coverage where issuer_id=$1`,[s.iss]))[0].r as string;
  expect((await code(replace({iss:s.iss,batch:b,attempt:a,rebuild:used,rev:1,events:[]}))).detail).toMatch(/^rebuild_id: already used/);
  // a quarantined fact is not visible
  const q=await fx.stream([{facts:[{value:'1'}]},{available:'2024-05-01',facts:[{value:'2'}]}]);const qa=await begin(q.iss);
  const qrev=await revisedEvent(q.factIds[0][0],q.factIds[1][0]);
  await fx.q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[q.factIds[1][0]]);
  expect((await code(replace({iss:q.iss,batch:b,attempt:qa,rev:1,events:[qrev]}))).detail).toMatch(/^payload\.to\.factId: fact not visible/);
  // an older mapping generation is not visible: filing 0 republished on generation 2
  await fx.publish(s.iss,'US',s.factsBatch,[{sourceRef:sr,facts:[{value:'100.50'}]}],2);
  const a2=await begin(s.iss);
  expect((await code(replace({iss:s.iss,batch:b,attempt:a2,rev:2,events:[rev]}))).detail).toMatch(/^payload\.from\.factId: fact not visible/);
  // facts and filings available after today are not visible
  const f=await fx.stream([{facts:[{concept:'revenue',value:'5'}]},{available:'2999-01-01',facts:[{concept:'net_income_parent',value:'6'}]}]);const fa=await begin(f.iss);
  const pe=await periodEvent(f.filingIds[0],[f.factIds[0][0],f.factIds[1][0]]);
  expect((await code(replace({iss:f.iss,batch:b,attempt:fa,rev:1,events:[pe]}))).detail).toMatch(/^payload\.headline\.net_income_parent\.factId: fact not visible/);
  expect((await code(replace({iss:f.iss,batch:b,attempt:fa,rev:1,events:[await filingEvent(f.filingIds[1])]}))).detail).toMatch(/^occurred_on: after today/);
  // ambiguousUnits, isolated: a visible headline-only event (revenue only) with each bad ambiguousUnits
  const g=await fx.stream([{facts:[{concept:'revenue',value:'5'}]}]);const ga=await begin(g.iss);
  const gpe=await periodEvent(g.filingIds[0],[g.factIds[0][0]]);
  expect((await replace({iss:g.iss,batch:b,attempt:ga,rev:1,events:[gpe]})).upserted).toBe(1);   // the headline-only event itself is valid
  for(const [name,units] of [['in headline',['revenue']],['duplicate',['net_income_parent','net_income_parent']],['not a headline concept',['gross_profit']]] as [string,string[]][])
   expect({name,detail:(await code(replace({iss:g.iss,batch:b,attempt:ga,rev:1,events:[{...gpe,payload:{...gpe.payload,ambiguousUnits:units}}]}))).detail}).toEqual({name,detail:expect.stringMatching(/^payload\.ambiguousUnits/)});
 });

 it('rebuilds: a late intermediate disclosure changes one edge and adds one; omitted events are tombstoned and revive with first_seen_at kept; meta is not hashed; p_sweep writes swept_at',async()=>{
  const s=await fx.stream([{available:'2024-01-01',facts:[{value:'90'}]},{available:'2024-03-01',facts:[{value:'110'}]}]);const b=await fx.batch();
  const [A,C]=[s.factIds[0][0],s.factIds[1][0]];
  const fA=await filingEvent(s.filingIds[0]);const fC=await filingEvent(s.filingIds[1]);const ac=await revisedEvent(A,C);
  const a1=await begin(s.iss);
  expect(await replace({iss:s.iss,batch:b,attempt:a1,rev:1,events:[fA,fC,ac]})).toEqual({upserted:3,changed:3,retired:0,revived:0});
  const first=await events(s.iss);
  expect(first.every(e=>e.pc===null&&e.rt===null)).toBe(true);
  await fx.q(`select pg_sleep(0.02)`);
  const late=await fx.publish(s.iss,'US',s.factsBatch,[{available:'2024-02-01',facts:[{value:'100'}]}]);const B=late.factIds[0][0];
  const fB=await filingEvent(late.filingIds[0]);const ab=await revisedEvent(A,B);const bc=await revisedEvent(B,C);
  expect(bc.natural_key).toBe(ac.natural_key);
  const a2=await begin(s.iss);
  expect(await replace({iss:s.iss,batch:b,attempt:a2,rev:2,events:[fA,fB,fC,ab,bc]})).toEqual({upserted:5,changed:3,retired:0,revived:0});   // fB, ab new; the C edge changed
  const second=await events(s.iss);
  const edgeC=second.find(e=>e.kind==='fact_revised'&&e.natural_key===ac.natural_key)!;const edgeC0=first.find(e=>e.kind==='fact_revised')!;
  expect({fs:edgeC.fs===edgeC0.fs,pc:edgeC.pc!==null,hash:edgeC.payload_hash!==edgeC0.payload_hash}).toEqual({fs:true,pc:true,hash:true});
  expect(second.find(e=>e.natural_key===fA.natural_key)!.pc).toBeNull();
  const a3=await begin(s.iss);   // same batch, new rebuild id, fC omitted → tombstone
  expect(await replace({iss:s.iss,batch:b,attempt:a3,rev:2,events:[fA,fB,ab,bc]})).toEqual({upserted:4,changed:0,retired:1,revived:0});
  expect((await events(s.iss)).find(e=>e.natural_key===fC.natural_key)!.rt).not.toBeNull();
  const a4=await begin(s.iss);
  expect(await replace({iss:s.iss,batch:b,attempt:a4,rev:2,sweep:true,events:[fA,fB,fC,ab,bc]})).toEqual({upserted:5,changed:0,retired:0,revived:1});
  const revived=(await events(s.iss)).find(e=>e.natural_key===fC.natural_key)!;
  expect({rt:revived.rt,fs:revived.fs,pc:revived.pc}).toEqual({rt:null,fs:first.find(e=>e.natural_key===fC.natural_key)!.fs,pc:null});
  expect((await state(s.iss)).sw).not.toBeNull();
  // meta-only change: same payload_hash, payload_changed_at stays null, meta stored
  const p=await fx.stream([{facts:[{}]}]);const pa=await begin(p.iss);const pe=await periodEvent(p.filingIds[0],p.factIds[0]);
  await replace({iss:p.iss,batch:b,attempt:pa,rev:1,events:[pe]});
  const before=(await events(p.iss))[0];const pa2=await begin(p.iss);
  expect(await replace({iss:p.iss,batch:b,attempt:pa2,rev:1,events:[{...pe,meta:{headlineAsOf:'2024-01-01'}}]})).toEqual({upserted:1,changed:0,retired:0,revived:0});
  const after=(await events(p.iss))[0];
  expect({h:after.payload_hash,pc:after.pc}).toEqual({h:before.payload_hash,pc:null});
  expect((await fx.q(`select meta from public.issuer_events where event_id=$1`,[after.event_id]))[0].meta).toEqual({headlineAsOf:'2024-01-01'});
 });

 it('company_digest_due / company_sweep_due / company_digest_backlog select and order streams',async()=>{
  const b=await fx.batch();
  const behind1=await fx.stream([{facts:[{}]}]);
  const behind2=await fx.stream([{facts:[{}]}]);await fx.publish(behind2.iss,'US',behind2.factsBatch,[{available:'2024-05-01',facts:[{period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M'}]}]);
  const current=await fx.stream([{facts:[{}]}]);const ca=await begin(current.iss);await replace({iss:current.iss,batch:b,attempt:ca,rev:1,events:[]});
  const backoff=await fx.stream([{facts:[{}]}]);const ba=await begin(backoff.iss);
  const empty=await fx.issuer();await fx.scope(empty,'US');                                   // state_rev 0: never due, never swept
  const mine=new Set([behind1.iss,behind2.iss,current.iss,backoff.iss,empty]);
  const now=Date.now();const iso=(ms:number)=>new Date(now+ms).toISOString();
  const backlog0=Number(await fx.one(`select public.company_digest_backlog() v`));
  expect(await fail(backoff.iss,ba,iso(0))).toBe(true);
  expect(Number(await fx.one(`select public.company_digest_backlog() v`))).toBe(backlog0+1);
  type Due={issuerId:string;market:string;stateRev:number;digestedRev:number};
  const due=async(at:string,limit=100000)=>((await fx.one(`select public.company_digest_due($1::timestamptz,$2) v`,[at,limit])) as Due[]).filter(x=>mine.has(x.issuerId));
  expect(await due(iso(0))).toEqual([{issuerId:behind2.iss,market:'US',stateRev:2,digestedRev:0},{issuerId:behind1.iss,market:'US',stateRev:1,digestedRev:0}]);
  expect((await due(iso(2*3600_000))).map(x=>x.issuerId)).toEqual([behind2.iss,...[behind1.iss,backoff.iss].sort()]);
  expect(await fx.one(`select public.company_digest_due(now(),0) v`)).toEqual([]);
  // market filter applies inside the limit (plan audit Q6): these streams are US, so a CN-only selection excludes them
  expect(((await fx.one(`select public.company_digest_due(now(),100000,'CN') v`)) as Due[]).filter(x=>mine.has(x.issuerId))).toEqual([]);
  expect(((await fx.one(`select public.company_digest_due(now(),100000,'US') v`)) as Due[]).filter(x=>mine.has(x.issuerId)).length).toBeGreaterThan(0);
  const sweep=async(older:string,at:string)=>((await fx.one(`select public.company_sweep_due($1::timestamptz,$2::timestamptz,100000) v`,[older,at])) as Due[]).filter(x=>mine.has(x.issuerId)).map(x=>x.issuerId);
  expect(await sweep(iso(0),iso(60_000))).toEqual([behind1.iss,behind2.iss,current.iss].sort());     // all never swept: issuer order
  const ca2=await begin(current.iss);await replace({iss:current.iss,batch:b,attempt:ca2,rev:1,sweep:true,events:[]});
  expect(await sweep(iso(-3600_000),iso(60_000))).toEqual([behind1.iss,behind2.iss].sort());   // at: a minute ahead (the sweep replace set next_attempt_at = its now())
  expect(await sweep(iso(3600_000),iso(60_000))).toEqual([...[behind1.iss,behind2.iss].sort(),current.iss]);   // nulls first, then swept_at
 });

 it('mark_company_digest_failed (§0 #70): duplicate and older reports are ignored; backoff 1h·2^n capped at 24h; both completion orders (e) and (f)',async()=>{
  const s=await fx.stream([{facts:[{}]}]);const b=await fx.batch();const T='2030-01-01T00:00:00.000Z';
  const gap=async(iss=s.iss)=>Number((await fx.q(`select extract(epoch from next_attempt_at - $2::timestamptz)::int g from public.company_digest_state where issuer_id=$1`,[iss,T]))[0].g);
  expect(await code(fail(randomUUID(),1,T))).toMatchObject({message:'unknown_stream'});
  expect(await code(fail(s.iss,1,T))).toMatchObject({message:'invalid_attempt'});            // no attempt began
  const a1=await begin(s.iss);
  expect(await fail(s.iss,a1,T)).toBe(true);expect(await gap()).toBe(3600);
  expect(await fail(s.iss,a1,T)).toBe(false);                                                // the same failure delivered twice
  expect(await state(s.iss)).toMatchObject({lf:1,cf:1,st:'failed'});
  const a2=await begin(s.iss);const a3=await begin(s.iss);
  expect(await fail(s.iss,a3,T)).toBe(true);expect(await gap()).toBe(7200);
  expect(await fail(s.iss,a2,T)).toBe(false);                                                // newer failure, then an older one
  expect(await state(s.iss)).toMatchObject({lf:3,cf:2});
  await fx.q(`update public.company_digest_state set consecutive_failures=40 where issuer_id=$1`,[s.iss]);
  const a4=await begin(s.iss);expect(await fail(s.iss,a4,T)).toBe(true);expect(await gap()).toBe(86400);
  expect(await code(fail(s.iss,99,T))).toMatchObject({message:'invalid_attempt'});
  // (e) attempts 1 and 2 begin; 2 fails; 1 succeeds → materialisation recorded, failure state kept, swept_at not advanced
  const e=await fx.stream([{facts:[{}]}]);const e1=await begin(e.iss);const e2=await begin(e.iss);
  const backlog0=Number(await fx.one(`select public.company_digest_backlog() v`));
  expect(await fail(e.iss,e2,T)).toBe(true);
  expect(await replace({iss:e.iss,batch:b,attempt:e1,rev:1,sweep:true,events:[await filingEvent(e.filingIds[0])]})).toMatchObject({upserted:1});
  expect(await state(e.iss)).toMatchObject({dr:1,ls:1,lf:2,st:'failed',cf:1,sw:null});
  expect(await gap(e.iss)).toBe(3600);
  expect(Number(await fx.one(`select public.company_digest_backlog() v`))).toBe(backlog0+1);
  // (f) attempts 1 and 2 begin; 2 succeeds; 1 reports failure → ignored
  const f=await fx.stream([{facts:[{}]}]);const f1=await begin(f.iss);const f2=await begin(f.iss);
  await replace({iss:f.iss,batch:b,attempt:f2,rev:1,events:[]});
  expect(await fail(f.iss,f1,T)).toBe(false);
  expect(await state(f.iss)).toMatchObject({ls:2,lf:null,st:'success',cf:0});
  // a newer success clears (e)'s failure state and advances swept_at
  const e3=await begin(e.iss);await replace({iss:e.iss,batch:b,attempt:e3,rev:1,sweep:true,events:[await filingEvent(e.filingIds[0])]});
  const after=await state(e.iss);
  expect(after).toMatchObject({ls:3,lf:2,st:'success',cf:0});expect(after.sw).not.toBeNull();
 });

 it('(a) a publish holding the scope row blocks replace, which then fails as stale_computation',async()=>{
  const s=await fx.stream([{facts:[{}]}]);const b=await fx.batch();const a=await begin(s.iss);const ev=await filingEvent(s.filingIds[0]);
  const t1=await openTx(admin);
  try{
   await t1.c.query(`select state_rev from public.fact_sync_scope where issuer_id=$1 and market='US' for update`,[s.iss]);
   await t1.c.query(`update public.fact_sync_scope set state_rev=state_rev+1 where issuer_id=$1 and market='US'`,[s.iss]);
   const p=replace({iss:s.iss,batch:b,attempt:a,rev:1,events:[ev]});
   await stillBlockedBehind(admin,t1.pid,p);
   await t1.commit();
   expect(await code(p)).toMatchObject({message:'stale_computation'});
  }finally{await t1.rollback().catch(()=>{});}
  expect(await fx.one(`select count(*)::int v from public.issuer_events where issuer_id=$1`,[s.iss])).toBe(0);
 });

 it('(b) two digest writers with different event sets serialise on the scope row; the later one wins, no union',async()=>{
  const s=await fx.stream([{facts:[{}]},{available:'2024-05-01',facts:[{value:'120'}]}]);const b=await fx.batch();
  const a1=await begin(s.iss);const a2=await begin(s.iss);
  const X=[await filingEvent(s.filingIds[0]),await filingEvent(s.filingIds[1])];
  const Y=[await filingEvent(s.filingIds[1]),await revisedEvent(s.factIds[0][0],s.factIds[1][0])];
  const r2=randomUUID();
  const t1=await openTx(admin);
  try{
   await replace({iss:s.iss,batch:b,attempt:a1,rev:1,events:X,coverage:coverage({filings_count:2})},t1.c);
   const p=replace({iss:s.iss,batch:b,attempt:a2,rebuild:r2,rev:1,events:Y,coverage:coverage({filings_count:9})});
   await stillBlockedBehind(admin,t1.pid,p);
   await t1.commit();
   expect(await p).toEqual({upserted:2,changed:1,retired:1,revived:0});
  }finally{await t1.rollback().catch(()=>{});}
  const active=await fx.q(`select kind,natural_key from public.issuer_events where issuer_id=$1 and retired_at is null order by kind,natural_key`,[s.iss]);
  expect(active).toEqual(Y.map(e=>({kind:e.kind,natural_key:e.natural_key})).sort((x,y)=>x.kind<y.kind?-1:1));
  expect((await fx.q(`select filings_count,rebuild_id::text r from public.issuer_coverage where issuer_id=$1`,[s.iss]))[0]).toEqual({filings_count:9,r:r2});
 });

 it('(c) a fault between the event and coverage writes rolls the whole replace back',async()=>{
  const s=await fx.stream([{facts:[{}]},{available:'2024-05-01',facts:[{value:'120'}]}]);const b=await fx.batch();
  const a1=await begin(s.iss);await replace({iss:s.iss,batch:b,attempt:a1,rev:1,events:[await filingEvent(s.filingIds[0])],coverage:coverage({filings_count:1})});
  const snap=async()=>({ev:await fx.q(`select event_id,retired_at::text r,payload_hash from public.issuer_events where issuer_id=$1 order by event_id`,[s.iss]),
   cov:await fx.q(`select filings_count,rebuild_id::text r from public.issuer_coverage where issuer_id=$1`,[s.iss]),st:await state(s.iss)});
  const before=await snap();
  const a2=await begin(s.iss);const ev=await filingEvent(s.filingIds[1]);
  const err=await code(inTx(admin,{},async tx=>{
   await tx.c.query(`select set_config('company.fail_after_events','on',true)`);
   await replace({iss:s.iss,batch:b,attempt:a2,rev:1,events:[ev],coverage:coverage({filings_count:2})},tx.c);
  }));
  expect(err).toMatchObject({message:'company_test_fault'});
  const after=await snap();
  expect({...after,st:{...after.st,seq:before.st.seq,la:before.st.la}}).toEqual(before);   // only begin's attempt counter moved
 });

 it('(d) a receipt written while a replace is uncommitted cannot cover the new event',async()=>{
  const s=await fx.stream([{facts:[{}]},{available:'2024-05-01',facts:[{value:'120'}]}]);const b=await fx.batch();const u=await fx.user();
  const a1=await begin(s.iss);const old=await filingEvent(s.filingIds[0]);
  await replace({iss:s.iss,batch:b,attempt:a1,rev:1,events:[old]});
  await inTx(admin,{role:'authenticated',userId:u},tx=>tx.c.query(`insert into public.company_watches(user_id,issuer_id) values($1,$2)`,[u,s.iss]));
  const a2=await begin(s.iss);const fresh=await filingEvent(s.filingIds[1]);
  const t1=await openTx(admin);
  try{
   await replace({iss:s.iss,batch:b,attempt:a2,rev:1,events:[old,fresh]},t1.c);
   const seen=await inTx(admin,{role:'service_role'},async tx=>(await tx.c.query(`select event_id from public.issuer_events where issuer_id=$1 and retired_at is null`,[s.iss])).rows.map(r=>String(r.event_id)));
   expect(seen).toEqual([eventIdOf(s.iss,'US','filing_published',old.natural_key)]);
   await inTx(admin,{role:'authenticated',userId:u},tx=>tx.c.query(`insert into public.company_event_reads(user_id,issuer_id,event_id) select $1,$2,unnest($3::text[]) on conflict do nothing`,[u,s.iss,seen]));
   await t1.commit();
  }finally{await t1.rollback().catch(()=>{});}
  const unread=await fx.q(`select e.event_id from public.issuer_events e where e.issuer_id=$1 and e.retired_at is null and not exists (select 1 from public.company_event_reads r where r.user_id=$2 and r.event_id=e.event_id)`,[s.iss,u]);
  expect(unread.map(r=>r.event_id)).toEqual([eventIdOf(s.iss,'US','filing_published',fresh.natural_key)]);
 });

 it('evidence index: replace verifies each row against its fact and replaces the stream; company_fact_evidence returns the whitelist for visible facts only',async()=>{
  const sha=hex('snapshot-bytes');const loc=(i:number)=>`us-gaap/Revenues/USD/${i}`;const rh=(i:number)=>hex(`${sha}\n${loc(i)}`);
  const sr=randomUUID();
  const s=await fx.stream([{sourceRef:sr,facts:[{concept:'revenue',raw_hash:rh(0)},{concept:'net_income_parent',raw_hash:rh(1)},{concept:'operating_cash_flow',statement:'CF',raw_hash:rh(2)}]}]);
  const other=await fx.stream([{facts:[{raw_hash:rh(9)}]}]);
  const [f0,f1,f2]=s.factIds[0];
  const row=(factId:string,i:number,o:Record<string,unknown>={})=>({fact_id:factId,raw_hash:rh(i),snapshot_sha256:sha,snapshot_path:`edgar/${s.iss}/${sha}.json`,hash_locator:loc(i),
   json_pointer:`/facts/us-gaap/Revenues/units/USD/${i}`,field:null,source:'edgar',api:null,url:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json',params:null,
   captured_at:'2024-02-02T00:00:00Z',http_status:200,page:null,index_version:'company-evidence/1',...o});
  const put=async(rows:unknown[],iss=s.iss,o:{attempt?:number;rev?:number}={})=>{   // default: a fresh attempt on the current state_rev
   const attempt=o.attempt??await begin(iss).catch(()=>1);const rev=o.rev??await fx.rev(iss,'US').catch(()=>1);
   return fx.one(`select public.replace_company_fact_evidence($1,'US',$2,$3,$4::jsonb) v`,[iss,attempt,rev,JSON.stringify(rows)]);
  };
  expect(await put([row(f0,0),row(f1,1),row(f2,2)])).toEqual({upserted:3,deleted:0});
  expect(await put([row(f0,0),row(f1,1)])).toEqual({upserted:2,deleted:1});
  expect(await code(put([],randomUUID()))).toMatchObject({message:'unknown_stream'});
  const badRows:[string,unknown[],RegExp][]=[
   ['raw_hash differs from the fact',[row(f0,1)],/^raw_hash: differs/],
   ['locator does not hash to raw_hash',[row(f0,0,{hash_locator:'x'})],/^raw_hash: not sha256/],
   ['path of another issuer',[row(f0,0,{snapshot_path:`edgar/${other.iss}/${sha}.json`})],/^snapshot_path/],
   ['source differs from the filing',[row(f0,0,{source:'tushare',snapshot_path:`tushare/${s.iss}/${sha}.json`})],/^source/],
   ['token in params',[row(f0,0,{params:{ts_token:'x'}})],/^params: must not carry a token/],
   ['extra key',[{...row(f0,0),verified_at:'x'}],/^row: /],
   ['fact of another stream',[row(other.factIds[0][0],9)],/^fact_id: not a fact of this stream/],
   ['duplicate fact',[row(f0,0),row(f0,0)],/^rows: duplicate fact_id/],
   ['http_status',[row(f0,0,{http_status:42})],/^http_status/],
   ['captured_at',[row(f0,0,{captured_at:'soon'})],/^captured_at/],
   ['captured_at now',[row(f0,0,{captured_at:'now'})],/^captured_at/],
   ['nested token in params',[row(f0,0,{params:{x:{token:'y'}}})],/^params: must not carry a token/],
   ['nested token in params array',[row(f0,0,{params:{x:[{a:{Api_Token:'y'}}]}})],/^params: must not carry a token/],
  ];
  for(const [name,rows,re] of badRows)expect({name,...await code(put(rows))}).toEqual({name,message:'invalid_evidence',code:'22023',detail:expect.stringMatching(re)});
  const read=(ids:string[],role:Role='anon')=>inTx(admin,{role},async tx=>(await tx.c.query(`select public.company_fact_evidence($1::uuid[]) v`,[ids])).rows[0].v as Record<string,Record<string,unknown>>);
  const out=await read([f0,f1,f2,randomUUID()]);
  expect(Object.keys(out).sort()).toEqual([f0,f1].sort());
  expect(Object.keys(out[f0]).sort()).toEqual(['api','captured_at','code_version','fact_id','field','hash_locator','http_status','index_version','json_pointer','mapping_version','page','params','raw_hash','run_id','snapshot_path','snapshot_sha256','source','tool_versions','url']);
  expect(out[f0]).toMatchObject({fact_id:f0,raw_hash:rh(0),snapshot_sha256:sha,snapshot_path:`edgar/${s.iss}/${sha}.json`,run_id:s.run,code_version:'test-sha',tool_versions:{node:'test'},mapping_version:'facts-map/1',http_status:200,source:'edgar'});
  await fx.q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[f1]);
  expect(Object.keys(await read([f0,f1],'authenticated'))).toEqual([f0]);
  await fx.publish(s.iss,'US',s.factsBatch,[{sourceRef:sr,facts:[{concept:'revenue',raw_hash:rh(0)}]}],2);   // filing on generation 2 hides the generation-1 fact
  expect(await read([f0],'service_role')).toEqual({});
  expect(await code(read(Array.from({length:101},()=>randomUUID())))).toMatchObject({message:'invalid_read',code:'22023'});
  expect(await read([])).toEqual({});
 });

 it('evidence writer fence: an older attempt or a moved state_rev is refused and leaves the newer attempt\'s evidence intact',async()=>{
  const sha=hex('fence-snapshot');const loc=(i:number)=>`us-gaap/Revenues/USD/f${i}`;const rh=(i:number)=>hex(`${sha}\n${loc(i)}`);
  const s=await fx.stream([{facts:[{concept:'revenue',raw_hash:rh(0)},{concept:'net_income_parent',raw_hash:rh(1)}]}]);const b=await fx.batch();
  const [f0,f1]=s.factIds[0];
  const row=(id:string,i:number)=>({fact_id:id,raw_hash:rh(i),snapshot_sha256:sha,snapshot_path:`edgar/${s.iss}/${sha}.json`,hash_locator:loc(i),json_pointer:`/facts/x/${i}`,field:null,source:'edgar',api:null,url:null,params:null,captured_at:'2024-02-02T00:00:00Z',http_status:200,page:null,index_version:'company-evidence/1'});
  const put=(rows:unknown[],attempt:number,rev:number)=>fx.one(`select public.replace_company_fact_evidence($1,'US',$2,$3,$4::jsonb) v`,[s.iss,attempt,rev,JSON.stringify(rows)]);
  const stored=()=>fx.q(`select fact_id::text id from public.company_fact_evidence where issuer_id=$1 order by 1`,[s.iss]).then(r=>r.map(x=>x.id));
  const a1=await begin(s.iss);const a2=await begin(s.iss);
  // attempt 2 materialises and writes its evidence; attempt 1 (older, slow) then tries to replace it
  await replace({iss:s.iss,batch:b,attempt:a2,rev:1,events:[]});
  expect(await put([row(f0,0),row(f1,1)],a2,1)).toEqual({upserted:2,deleted:0});
  expect(await code(put([row(f0,0)],a1,1))).toMatchObject({message:'stale_attempt',code:'P0001'});
  expect(await stored()).toEqual([f0,f1].sort());
  // wrong based_on_rev (state_rev moved on, or the caller is ahead)
  expect(await code(put([row(f0,0)],a2,0))).toMatchObject({message:'stale_computation',code:'55P03'});
  await fx.publish(s.iss,'US',s.factsBatch,[{available:'2024-05-01',facts:[{period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M'}]}]);
  expect(await code(put([row(f0,0)],a2,1))).toMatchObject({message:'stale_computation',code:'55P03'});
  expect(await stored()).toEqual([f0,f1].sort());
  expect(await put([row(f0,0)],a2,2)).toEqual({upserted:1,deleted:1});   // the current rev with the owning attempt passes
 });

 it('company_read_snapshot: read_facts envelope and the stream filings in one statement; ok facts only for every role; counts and citation computed in-statement',async()=>{
  const s=await fx.stream([{form:'10-K',facts:[{concept:'revenue',value:'100'},{concept:'net_income_parent',value:'9'}]},
   {available:'2024-05-01',form:'10-Q',fiscalPeriod:'Q1',periodEnd:'2024-03-31',facts:[{period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M',value:'30'}]}]);
  await fx.q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[s.factIds[0][1]]);
  const run=String(await fx.one(`select public.begin_sync_run($1,'US',$2,1) v`,[s.iss,s.factsBatch]));   // a staged run: generation-0 filing and a staged fact
  const m=await fx.one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:randomUUID(),source:'edgar',origin:'sec',form_type:'10-Q',fiscal_year:2024,fiscal_period:'Q2',period_end:'2024-06-30',available_date:'2024-08-01',source_ref:'staged-'+randomUUID(),url:null}])]) as Record<string,string>;
  await fx.one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify([{fact_id:randomUUID(),filing_id:Object.values(m)[0],concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2024-04-01',period_end:'2024-06-30',duration:'3M',value:'40',unit:'USD',consolidation:'consolidated',available_date:'2024-08-01',mapping_version:'facts-map/1',raw_hash:'h'}])]);
  type Snap={facts:{state_rev:number;truncated:boolean;rows:{fact_id:string;status:string}[]};filings:Record<string,unknown>[]};
  const snap=(role:Role,asOf='2030-01-01')=>inTx(admin,{role},async tx=>(await tx.c.query(`select public.company_read_snapshot($1,'US',null,$2::date,null,null,true,null) v`,[s.iss,asOf])).rows[0].v as Snap);
  const url='https://www.sec.gov/Archives/edgar/data/1/x.htm';
  const filing=(i:number,o:Record<string,unknown>)=>({filingId:s.filingIds[i],fiscalYear:2023,sourceRef:expect.any(String),source:'edgar',url,documentUrl:null,citation:'edgar',linkAttempts:0,factCount:1,mappingGen:1,...o});
  for(const role of ALL){
   const v=await snap(role);
   expect({role,rev:v.facts.state_rev,trunc:v.facts.truncated,facts:v.facts.rows.map(r=>r.fact_id).sort(),status:[...new Set(v.facts.rows.map(r=>r.status))]})
    .toEqual({role,rev:1,trunc:false,facts:[s.factIds[0][0],s.factIds[1][0]].sort(),status:['ok']});
   expect({role,filings:v.filings}).toEqual({role,filings:[
    filing(1,{formType:'10-Q',fiscalPeriod:'Q1',periodEnd:'2024-03-31',availableDate:'2024-05-01'}),
    filing(0,{formType:'10-K',fiscalPeriod:'FY',periodEnd:'2023-12-31',availableDate:'2024-02-01'})]});
  }
  const early=await snap('anon','2024-03-01');
  expect({facts:early.facts.rows.map(r=>r.fact_id),filings:early.filings.map(f=>f.filingId)}).toEqual({facts:[s.factIds[0][0]],filings:[s.filingIds[0]]});
  const cn=await fx.stream([{facts:[{}]},{available:'2024-08-30',form:'semiannual',fiscalPeriod:'H1',periodEnd:'2024-06-30',facts:[{period_start:'2024-01-01',period_end:'2024-06-30',duration:'6M'}]}],'CN');
  await fx.q(`update public.filings set document_ref='cninfo:1',document_url='https://static.cninfo.com.cn/x.pdf' where filing_id=$1`,[cn.filingIds[0]]);
  await fx.q(`update public.filings set document_ref='' where filing_id=$1`,[cn.filingIds[1]]);
  const c=await inTx(admin,{role:'anon'},async tx=>(await tx.c.query(`select public.company_read_snapshot($1,'CN',array['revenue'],'2030-01-01',null,null,false,null) v`,[cn.iss])).rows[0].v as Snap);
  expect(c.filings.map(f=>[f.filingId,f.citation,f.documentUrl,f.source])).toEqual([[cn.filingIds[1],'pending',null,'tushare'],[cn.filingIds[0],'linked','https://static.cninfo.com.cn/x.pdf','tushare']]);
 });

 it('company_list_coverage sorts, filters and pages with a total; refuses a bad sort or page',async()=>{
  const b=await fx.batch();
  const ids=[await fx.issuer('ZZ Cov B'),await fx.issuer('ZZ Cov A'),await fx.issuer('ZZ Cov C')];
  const put=(iss:string,market:Market,lad:string|null,lpe:string|null)=>fx.q(`insert into public.issuer_coverage(issuer_id,market,filings_count,facts_count,concepts_covered,latest_available_date,latest_period_end,citation_summary,based_on_rev,rebuild_id,rebuild_batch_id)
   values($1,$2,1,1,1,$3,$4,'{"linked":0,"pending":0,"edgar":1}',1,gen_random_uuid(),$5)`,[iss,market,lad,lpe,b]);
  await put(ids[0],'US','2024-05-01','2024-03-31');await put(ids[1],'US','2024-02-01','2023-12-31');await put(ids[2],'US',null,null);await put(ids[1],'CN','2024-08-30','2024-06-30');
  type Page={rows:Record<string,unknown>[];total:number};
  const list=(market:Market|null,sort:string,offset=0,limit=10)=>inTx(admin,{role:'anon'},async tx=>(await tx.c.query(`select public.company_list_coverage($1,$2::uuid[],$3,$4,$5) v`,[market,ids,sort,offset,limit])).rows[0].v as Page);
  const keys=(p:Page)=>p.rows.map(x=>`${String(x.issuer_id)}:${String(x.market)}`);
  expect(keys(await list(null,'latest_available_date'))).toEqual([`${ids[1]}:CN`,`${ids[0]}:US`,`${ids[1]}:US`,`${ids[2]}:US`]);
  expect(keys(await list('US','latest_period_end'))).toEqual([`${ids[0]}:US`,`${ids[1]}:US`,`${ids[2]}:US`]);
  const byName=await list(null,'name',1,2);
  expect({rows:keys(byName),total:byName.total}).toEqual({rows:[`${ids[1]}:US`,`${ids[0]}:US`],total:4});
  expect(Object.keys((await list('US','name')).rows[0]).sort()).toEqual(['based_on_rev','citation_summary','concepts_covered','earliest_period_end','facts_count','filings_count','issuer_id','latest_available_date','latest_period_end','market','rebuild_batch_id','rebuild_id','rebuilt_at','scope_last_status','scope_last_success_at']);
  expect(await code(list(null,'revenue'))).toMatchObject({message:'invalid_read',code:'22023'});
  expect(await code(list(null,'name',0,201))).toMatchObject({message:'invalid_read'});
  expect(await code(list(null,'name',-1,10))).toMatchObject({message:'invalid_read'});
 });
});

async function companyHarness():Promise<CompanyContractHarness&{pool:Pool}>{
 const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
 const pool=new Pool({connectionString:state.adminUrl,statement_timeout:10000});   // a regression that blocks fails instead of hanging afterAll
 const fx=fixtures(pool);
 return {pool,db:pgCompanyDb(pool),facts:pgFactsDb(pool),
  issuer:(name='ZZ Company Contract')=>fx.issuer(name),user:()=>fx.user(),
  batch:(producer='company-digest')=>fx.batch(producer,producer==='company-digest'?'company.digest':'facts.us'),
  close:async()=>{await pool.end();}};
}

describe.skipIf(!enabled)('pgCompanyDb on real PostgreSQL',()=>{
 // The same scenarios memoryCompanyDb passes in db.test.ts, now against the SQL functions, grants and RLS.
 companyDbContract('pgCompanyDb contract',companyHarness);

 describe('roles and the snapshot reader',()=>{
  let h:Awaited<ReturnType<typeof companyHarness>>;let fx:ReturnType<typeof fixtures>;
  beforeAll(async()=>{h=await companyHarness();fx=fixtures(h.pool);});
  afterAll(async()=>{await h?.close?.();});

  it('per-user methods see only the caller\'s rows through RLS (the pg adapter has no user filter of its own)',async()=>{
   const a=await fx.user();const b=await fx.user();const iss=await fx.issuer();const other=await fx.issuer();
   await fx.q(`insert into public.company_watches(user_id,issuer_id,note) values($1,$2,'a-note'),($1,$3,null)`,[a,iss,other]);
   expect(await h.db.watchesOf(b)).toEqual([]);
   expect((await h.db.watchesOf(a)).map(w=>w.issuer_id).sort()).toEqual([iss,other].sort());
   expect(await h.db.patchWatch(b,iss,{note:'stolen'})).toBeNull();
   expect(await h.db.deleteWatch(b,iss)).toBe(false);
   expect((await fx.q(`select note from public.company_watches where user_id=$1 and issuer_id=$2`,[a,iss]))[0].note).toBe('a-note');
   expect(await h.db.upsertWatch(b,iss)).toMatchObject({created:true,row:{user_id:b,issuer_id:iss}});   // b's own row; a's row untouched
   expect((await h.db.watchesOf(a)).length).toBe(2);
  });

  it('readSnapshot through pgRpcClient: anon gets ok facts only and the same filings as service_role, converted like PostgREST',async()=>{
   const s=await fx.stream([{facts:[{concept:'revenue',value:'100.50'},{concept:'net_income_parent',value:'9'}]},{available:'2024-05-01',form:'10-Q',fiscalPeriod:'Q1',periodEnd:'2024-03-31',facts:[{period_start:'2024-01-01',period_end:'2024-03-31',duration:'3M'}]}]);
   await fx.q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[s.factIds[0][1]]);
   const opts={concepts:null,asOf:'2030-01-01',history:true};
   const anon=await readSnapshot(pgRpcClient(h.pool,'anon'),s.iss,'US',opts);
   const svc=await readSnapshot(pgRpcClient(h.pool,'service_role'),s.iss,'US',opts);
   expect(anon).toEqual(svc);
   expect({rev:anon.stateRev,trunc:anon.truncated,facts:anon.rows.map(r=>r.fact_id).sort(),status:[...new Set(anon.rows.map(r=>r.status))]}).toEqual({rev:1,trunc:false,facts:[s.factIds[0][0],s.factIds[1][0]].sort(),status:['ok']});
   expect(anon.rows.find(r=>r.fact_id===s.factIds[0][0])).toMatchObject({value:'100.50',value_text:'100.50',disclosure_seq:1,is_current:true,is_revision:false});
   expect(anon.filings.map(f=>[f.filingId,f.formType,f.factCount,f.citation,f.fiscalYear,f.linkAttempts])).toEqual([[s.filingIds[1],'10-Q',1,'edgar',2023,0],[s.filingIds[0],'10-K',1,'edgar',2023,0]]);
   await expect(readSnapshot(pgRpcClient(h.pool,'anon'),s.iss,'US',{...opts,asOf:'not-a-date'})).rejects.toMatchObject({code:'internal'});
  });

  it('service-only reads fail for client roles: the evidence gate data never reaches anon or authenticated directly',async()=>{
   const s=await fx.stream([{facts:[{}]}]);const b=await fx.batch();
   const a=await h.db.beginAttempt(s.iss,'US',new Date());
   await h.db.replaceDigest(s.iss,'US',b,a,randomUUID(),1,false,[],{filings_count:1,facts_count:1,concepts_covered:1,earliest_period_end:null,latest_period_end:null,latest_available_date:null,citation_summary:{linked:0,pending:0,edgar:1},scope_last_success_at:null,scope_last_status:null});
   expect((await h.db.coverageOf([s.iss]))[0]).toMatchObject({issuer_id:s.iss,facts_count:1});   // anon read
   for(const role of ['anon','authenticated'] as const)
    expect((await fails(inTx(h.pool,{role,userId:role==='authenticated'?randomUUID():undefined},tx=>tx.c.query(`select * from public.company_digest_state where issuer_id=$1`,[s.iss])))).message).toMatch(/permission denied/);
  });
 });
});
