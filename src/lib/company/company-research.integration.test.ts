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

const enabled=!!process.env.S4_TEST_STATE;
const TABLES_MIGRATION='supabase/migrations/20261112090000_company_research.sql';
const FUNCTIONS_MIGRATION='supabase/migrations/20261112091000_company_research_functions.sql';
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
