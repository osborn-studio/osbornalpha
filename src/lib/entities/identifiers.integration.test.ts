// src/lib/entities/identifiers.integration.test.ts
// Plan 3 Task 1 (spec 3 §3.1, §9.2): migration 20261107090000 on real PostgreSQL. Task 1a covers the
// guarded column additions and their one-time backfill (a seeded pre-migration database is upgraded,
// new evidence is written, then the migration is replayed and must not rewrite it), every new
// constraint, service-role-only privileges on the new tables and the reconcile-raw bucket. Task 1b
// appends resolve_identifier_claim, the calendar pass functions and the topology guard.
// test:db builds a fresh cluster per run, so rows are not cleaned up (every test uses its own
// issuers and tickers). Calendar passes are the one shared resource (one open pass per market):
// every test that touches them runs inside withCalendarLock, a session advisory lock shared with
// Task 18's calendar.integration.test.ts.
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261107090000_identifiers_and_dq.sql';
const VERSION='20261107090000';
const NEW_TABLES=['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'];
const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
const SHA='a'.repeat(64);

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

type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);

// The bootstrap scripts/s4/local-db.ts runs before the migrations (roles are cluster-wide and exist).
const BOOTSTRAP=`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`;

/** A throwaway database in the same cluster, migrated up to (not including) `version`; dropped afterwards. */
async function withPreMigrationDatabase(adminUrl:string,version:string,body:(db:Pool)=>Promise<void>):Promise<void>{
 const name='df3_upgrade_'+randomBytes(4).toString('hex');
 const root=new Pool({connectionString:adminUrl,max:1});
 await root.query(`create database ${name}`);
 const url=new URL(adminUrl);url.pathname=`/${name}`;
 const db=new Pool({connectionString:url.toString(),max:2});
 try{
  await db.query(BOOTSTRAP);
  for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<version).sort()){
   try{await db.query(readFileSync(join('supabase/migrations',f),'utf8'));}
   catch(e){throw new Error(`pre-migration ${f}: ${(e as Error).message}`);}
  }
  await body(db);
 }finally{
  await db.end();
  await root.query(`drop database if exists ${name} with (force)`);
  await root.end();
 }
}

/**
 * Calendar passes are one-open-per-market shared state. Every suite that touches them holds this
 * session advisory lock for the body and closes any open pass before and after, so concurrent
 * suites never see each other's leases (Task 18b's calendar.integration.test.ts uses the same key).
 * Plan 3 advisory-lock registry (接口对齐记录 #4): 724311001 = CALENDAR_TEST_LOCK (test-only, session);
 * the SQL function claim_calendar_pass uses pg_advisory_xact_lock(hashtext('dq_calendar_pass:'||market)).
 */
const CALENDAR_TEST_LOCK=724_311_001;
async function withCalendarLock(pool:Pool,body:()=>Promise<void>):Promise<void>{
 const c=await pool.connect();
 try{
  await c.query('select pg_advisory_lock($1)',[CALENDAR_TEST_LOCK]);
  const close=()=>c.query(`update public.dq_calendar_passes set status='complete_with_failures',finished_at=clock_timestamp() where finished_at is null`);
  await close();
  try{await body();}finally{await close();}
 }finally{
  await c.query('select pg_advisory_unlock($1)',[CALENDAR_TEST_LOCK]).catch(()=>{});
  c.release();
 }
}

let admin:Pool;
let adminUrl:string;
const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
const insertRow=(table:string,row:Record<string,unknown>)=>{
 const cols=Object.keys(row);
 return admin.query(`insert into public.${table}(${cols.join(',')}) values(${cols.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
};
const issuer=async(name='ZZ Ident Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
const ticker=async(market='US')=>{
 const t='ZZ'+hex(4);
 const r=await q(`insert into public.stocks_universe(ticker,name,market) values($1,'Ident Test',$2) on conflict (ticker) do nothing returning ticker`,[t,market]);
 if(r.length!==1)throw new Error('ZZ test ticker collided');
 return t;
};
const batch=async(dataset='dq.calendar.cn',producer='filing-calendar')=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,$2,$3)`,[id,producer,dataset]);return id;};
/** issuer_securities row with source 'test' (so the default method is first_observed) plus `extra` columns. */
const sec=(iss:string,t:string,from:string,to:string|null,extra:Record<string,unknown>={})=>insertRow('issuer_securities',{issuer_id:iss,ticker:t,valid_from:from,valid_to:to,source:'test',...extra});

beforeAll(async()=>{
 if(!enabled)return;
 adminUrl=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl;
 admin=new Pool({connectionString:adminUrl});
});
afterAll(async()=>{await admin?.end();});

describe.skipIf(!enabled)('plan 3 migration one: schema',()=>{
 it('adds the columns, creates seven service-role-only tables and the reconcile-raw bucket, and replays twice',async()=>{
  const cols=await q(`select table_name,column_name from information_schema.columns where table_schema='public' and (table_name,column_name) in (
   ('issuer_securities','valid_from_method'),('issuer_securities','valid_to_method'),
   ('issuer_identifier_claims','op'),('issuer_identifier_claims','target_key'),('issuer_identifier_claims','detail'),('issuer_identifier_claims','resolved_by'),('issuer_identifier_claims','resolved_at'),
   ('dq_reconciliations','pair'),('dq_reconciliations','kind'),('dq_reconciliations','outcome'),('dq_reconciliations','detail'),
   ('dq_reconciliations','cycle_id'),('dq_reconciliations','issuer_id'),('dq_reconciliations','market'),('dq_reconciliations','attempt'))`);
  expect(cols).toHaveLength(15);
  expect(await q(`select is_nullable from information_schema.columns where table_schema='public' and table_name='issuer_identifier_claims' and column_name='confidence'`)).toEqual([{is_nullable:'YES'}]);
  const rls=await q(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) order by c.relname`,[NEW_TABLES]);
  expect(rls).toEqual([...NEW_TABLES].sort().map(relname=>({relname,relrowsecurity:true})));
  expect(await q(`select tablename from pg_policies where schemaname='public' and tablename=any($1)`,[NEW_TABLES])).toEqual([]);
  for(const role of ['anon','authenticated'])for(const t of [...NEW_TABLES,'issuer_identifier_claims'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
   const ok=(await q(`select has_table_privilege($1,'public.'||$2,$3) ok`,[role,t,priv]))[0].ok;
   expect({role,t,priv,ok}).toEqual({role,t,priv,ok:false});
  }
  const SERVICE:Record<string,string[]>={
   dq_reconcile_cycles:['SELECT','INSERT','UPDATE'],dq_reconcile_cursor:['SELECT','INSERT'],
   dq_calendar_passes:['SELECT'],dq_calendar_pass_members:['SELECT'],dq_filing_expectations:['SELECT'],
   issuer_filer_categories:['SELECT','INSERT','UPDATE','DELETE'],issuer_filing_profiles:['SELECT','INSERT','UPDATE','DELETE'],
  };
  for(const [t,granted] of Object.entries(SERVICE))for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
   const ok=(await q(`select has_table_privilege('service_role','public.'||$1,$2) ok`,[t,priv]))[0].ok;
   expect({t,priv,ok}).toEqual({t,priv,ok:granted.includes(priv)});
  }
  const c=await admin.connect();
  try{
   await c.query('set role anon');
   await expect(c.query('select * from public.dq_filing_expectations')).rejects.toThrow(/permission denied/);
  }finally{await c.query('reset role').catch(()=>{});c.release();}
  expect(await q(`select id,public,file_size_limit::text limit_bytes,allowed_mime_types from storage.buckets where id='reconcile-raw'`)).toEqual([{
   id:'reconcile-raw',public:false,limit_bytes:'52428800',
   allowed_mime_types:['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'],
  }]);
  // A private bucket with no storage.objects policy is unreadable and unwritable for anon/authenticated
  // on hosted Supabase; the migration must not add one (the local harness has no storage.objects).
  const sql=readFileSync(MIGRATION,'utf8');
  expect(sql).not.toMatch(/storage\.objects/);
  await replayMigration(admin,sql);
  await replayMigration(admin,sql);
 },120000);

 it('leaves evidence written after the first run untouched on replay',async()=>{
  const a=await issuer();const t=await ticker();const t2=await ticker();
  const prov={valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}};
  await sec(a,t,'2020-01-01',null,{valid_from_method:'listing_date',provenance:JSON.stringify(prov)});
  await sec(a,t2,'2010-01-01','2015-01-01',{valid_to_method:'delisting'});
  await replayMigration(admin,readFileSync(MIGRATION,'utf8'));
  expect(await q(`select ticker,valid_from_method,valid_to_method,provenance from public.issuer_securities where issuer_id=$1 order by valid_from`,[a])).toEqual([
   {ticker:t2,valid_from_method:'first_observed',valid_to_method:'delisting',provenance:{}},
   {ticker:t,valid_from_method:'listing_date',valid_to_method:null,provenance:prov},
  ]);
 },60000);

 it('upgrades a seeded pre-migration database once; a second run after new evidence rewrites nothing',async()=>{
  await withPreMigrationDatabase(adminUrl,VERSION,async db=>{
   const iss=randomUUID();
   await db.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Upgrade Co')`,[iss]);
   for(const t of ['ZZUPA','ZZUPB','ZZUPC','ZZUPD'])await db.query(`insert into public.stocks_universe(ticker,name,market) values($1,'Upgrade Test','US')`,[t]);
   const sec0=(t:string,from:string,to:string|null,source:string)=>db.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source) values($1,$2,$3,$4,$5)`,[iss,t,from,to,source]);
   await sec0('ZZUPA','2020-01-01',null,'curated');
   await sec0('ZZUPB','2010-01-01','2015-01-01','curated');
   await sec0('ZZUPC','2011-01-01','2016-01-01','sec_company_tickers_exchange');
   await sec0('ZZUPD','2021-01-01',null,'sec_company_tickers_exchange');
   const handled=randomUUID(),pending=randomUUID();
   // a claim handled by SQL before resolved_at existed (runbook §4), and a pending one
   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence,status) values($1,$3,'lei','LEIUPGRADE0000000012','test',0.5,'accepted'),($2,$3,'cik','123','test',0.5,'pending')`,[handled,pending,iss]);
   const rec=randomUUID();
   await db.query(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,left_value,right_value,tolerance,passed) values($1,'legacy.test','a','b','k',1,2,0,false)`,[rec]);
   await db.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('legacy.test','daily','missing')`);
   const sql=readFileSync(MIGRATION,'utf8');
   await db.query(sql);                                                       // first upgrade: backfill runs
   const methods=async()=>(await db.query(`select ticker,valid_from_method,valid_to_method from public.issuer_securities where issuer_id=$1 order by ticker`,[iss])).rows;
   expect(await methods()).toEqual([
    {ticker:'ZZUPA',valid_from_method:'curated',valid_to_method:null},
    {ticker:'ZZUPB',valid_from_method:'curated',valid_to_method:'curated'},
    {ticker:'ZZUPC',valid_from_method:'first_observed',valid_to_method:'unrecorded'},
    {ticker:'ZZUPD',valid_from_method:'first_observed',valid_to_method:null},
   ]);
   const claims=async()=>(await db.query(`select id,op,target_key,detail,confidence::text conf,status,resolved_at from public.issuer_identifier_claims where issuer_id=$1 order by value`,[iss])).rows;
   expect(await claims()).toEqual([
    {id:pending,op:'legacy',target_key:'',detail:{},conf:'0.5',status:'pending',resolved_at:null},
    {id:handled,op:'legacy',target_key:'',detail:{},conf:'0.5',status:'accepted',resolved_at:null},
   ]);
   const recRow=async()=>(await db.query(`select pair,kind,outcome,detail,cycle_id from public.dq_reconciliations where id=$1`,[rec])).rows[0];
   expect(await recRow()).toEqual({pair:'legacy',kind:'numeric',outcome:'legacy',detail:{},cycle_id:null});
   // new evidence written between the two runs
   await db.query(`update public.issuer_securities set valid_from_method='listing_date',provenance=provenance||'{"valid_from":{"source":"stocks_universe.list_date","as_of":"2026-11-05"}}'::jsonb where ticker='ZZUPA'`);
   await db.query(`update public.issuer_securities set valid_to_method='delisting' where ticker='ZZUPC'`);
   await db.query(`update public.dq_reconciliations set outcome='compared' where id=$1`,[rec]);
   const fresh=randomUUID();
   await db.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,status,op,target_key,detail) values($1,$2,'ticker','ZZUPA','test','pending','evidence_only',$3,'{"schema":"claim/1"}')`,[fresh,iss,`evidence_only:${iss}`]);
   await db.query(sql);                                                       // second run: guarded blocks skip the backfill
   expect(await methods()).toEqual([
    {ticker:'ZZUPA',valid_from_method:'listing_date',valid_to_method:null},
    {ticker:'ZZUPB',valid_from_method:'curated',valid_to_method:'curated'},
    {ticker:'ZZUPC',valid_from_method:'first_observed',valid_to_method:'delisting'},
    {ticker:'ZZUPD',valid_from_method:'first_observed',valid_to_method:null},
   ]);
   expect((await db.query(`select provenance from public.issuer_securities where ticker='ZZUPA'`)).rows[0].provenance).toEqual({valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}});
   expect((await recRow()).outcome).toBe('compared');
   expect((await db.query(`select op from public.issuer_identifier_claims where id=$1`,[fresh])).rows).toEqual([{op:'evidence_only'}]);
   await db.query(`insert into public.dq_freshness(dataset,expected_cadence,status) values('weekly.test','weekly','missing')`);
  });
 },240000);

 it('keeps valid_from_method=curated for a curated row written after the migration, across a replay',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2020-01-01',null,{source:'curated',valid_from_method:'curated'});
  await replayMigration(admin,readFileSync(MIGRATION,'utf8'));
  expect(await q(`select valid_from_method from public.issuer_securities where issuer_id=$1`,[a])).toEqual([{valid_from_method:'curated'}]);
 });

 it('enforces the window-method checks and to_method_iff_to on issuer_securities',async()=>{
  const a=await issuer();const t=await ticker();
  expect((await fails(sec(a,t,'2020-01-01',null,{valid_from_method:'guessed'}))).message).toMatch(/issuer_securities_valid_from_method_check/);
  expect((await fails(sec(a,t,'2020-01-01','2021-01-01'))).message).toMatch(/issuer_securities_to_method_iff_to/);
  expect((await fails(sec(a,t,'2020-01-01',null,{valid_to_method:'delisting'}))).message).toMatch(/issuer_securities_to_method_iff_to/);
  expect((await fails(sec(a,t,'2020-01-01','2021-01-01',{valid_to_method:'vanished'}))).message).toMatch(/issuer_securities_valid_to_method_check/);
  await sec(a,t,'2020-01-01','2021-01-01',{valid_to_method:'sec_file_absent'});
  expect((await fails(q(`update public.issuer_securities set valid_to=null where issuer_id=$1 and ticker=$2`,[a,t]))).message).toMatch(/issuer_securities_to_method_iff_to/);
  await sec(a,t,'2021-01-01',null,{valid_from_method:'ticker_change'});
  expect(await q(`select valid_from::text,valid_from_method,valid_to_method from public.issuer_securities where ticker=$1 order by valid_from`,[t])).toEqual([
   {valid_from:'2020-01-01',valid_from_method:'first_observed',valid_to_method:'sec_file_absent'},
   {valid_from:'2021-01-01',valid_from_method:'ticker_change',valid_to_method:null},
  ]);
 });

 it('claims: ticker id_type, op check, detail object, nullable confidence, resolution invariant and the rebuilt pending key',async()=>{
  const a=await issuer();
  const claim=(over:Record<string,unknown>)=>insertRow('issuer_identifier_claims',{id:randomUUID(),issuer_id:a,id_type:'ticker',value:'ZZX',source:'test',status:'pending',op:'evidence_only',target_key:`evidence_only:${a}`,detail:'{}',...over});
  await claim({});
  expect((await fails(claim({}))).message).toMatch(/issuer_identifier_claims_pending_unique/);
  await claim({op:'attach_security',target_key:`attach_security:${a}`});              // same value, another op
  await claim({target_key:`evidence_only:${a}|ZZX|2020-01-01`});                        // same op, another target
  await claim({status:'rejected',resolved_by:randomUUID(),resolved_at:new Date().toISOString()});   // resolved rows may repeat
  expect((await fails(claim({id_type:'ric'}))).message).toMatch(/issuer_identifier_claims_id_type_check/);
  expect((await fails(claim({op:'merge',target_key:'merge:x'}))).message).toMatch(/issuer_identifier_claims_op_check/);
  expect((await fails(claim({value:'ZZY',detail:'[]'}))).message).toMatch(/issuer_identifier_claims_detail_object/);
  expect((await fails(claim({value:'ZZY',resolved_at:new Date().toISOString()}))).message).toMatch(/issuer_identifier_claims_pending_has_no_resolution/);
  expect((await fails(claim({value:'ZZY',target_key:''}))).message).toMatch(/issuer_identifier_claims_target_key_required/);
  expect((await fails(claim({value:'ZZY',target_key:'x'.repeat(257)}))).message).toMatch(/issuer_identifier_claims_target_key_check/);
  expect((await fails(claim({value:'ZZY',confidence:1.5}))).message).toMatch(/issuer_identifier_claims_confidence_check/);
  await claim({value:'ZZY',confidence:null});
  const legacy=randomUUID();
  await q(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei','L1','test',0.5)`,[legacy,a]);
  expect(await q(`select op,target_key,detail,status from public.issuer_identifier_claims where id=$1`,[legacy])).toEqual([{op:'legacy',target_key:'',detail:{},status:'pending'}]);
 });

 it('dq_reconciliations: kind/outcome checks, side constraints, cycle columns all-or-none, one result per cycle key',async()=>{
  const rec=(over:Record<string,unknown>)=>insertRow('dq_reconciliations',{id:randomUUID(),dataset:'reconcile.test',left_source:'l',right_source:'r',natural_key:'k:'+randomUUID(),tolerance:0,passed:true,pair:'us.companyfacts_vs_ixbrl',kind:'numeric',outcome:'compared',left_value:'10',right_value:'10',...over});
  await rec({});
  expect((await fails(rec({kind:'percent'}))).message).toMatch(/dq_reconciliations_kind_check/);
  expect((await fails(rec({outcome:'skipped'}))).message).toMatch(/dq_reconciliations_outcome_check/);
  for(const outcome of ['left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold'])await rec({outcome,left_value:null,right_value:null,passed:false});
  expect((await fails(rec({left_value:null}))).message).toMatch(/dq_reconciliations_numeric_sides/);
  expect((await fails(rec({kind:'text'}))).message).toMatch(/dq_reconciliations_nonnumeric_sides/);
  await rec({kind:'date',left_value:null,right_value:null,detail:JSON.stringify({left_text:'2026-01-02',right_text:'2026-01-02'})});
  expect((await fails(rec({kind:'date',left_value:null,right_value:null,rel_diff:'0'}))).message).toMatch(/dq_reconciliations_nonnumeric_sides/);
  expect((await fails(rec({detail:'[]'}))).message).toMatch(/dq_reconciliations_detail_object/);
  expect((await fails(rec({pair:''}))).message).toMatch(/dq_reconciliations_pair_check/);
  const iss=await issuer();
  expect((await fails(rec({cycle_id:'c1',issuer_id:iss,market:'US'}))).message).toMatch(/dq_reconciliations_cycle_cols/);   // attempt missing
  expect((await fails(rec({attempt:1}))).message).toMatch(/dq_reconciliations_cycle_cols/);
  const key='k:'+randomUUID();
  await rec({natural_key:key,cycle_id:'c-'+key,issuer_id:iss,market:'US',attempt:1});
  expect((await fails(rec({natural_key:key,cycle_id:'c-'+key,issuer_id:iss,market:'US',attempt:2}))).message).toMatch(/dq_reconciliations_cycle_key/);
  await rec({natural_key:key,cycle_id:'c2-'+key,issuer_id:iss,market:'US',attempt:1});   // the next cycle has its own key
  await rec({natural_key:key});                                                           // outside cycles the log is append-only
  await rec({natural_key:key});
  expect((await fails(rec({cycle_id:'c3-'+key,issuer_id:iss,market:'HK',attempt:1}))).message).toMatch(/dq_reconciliations_market_check/);
  expect((await fails(rec({cycle_id:'c4-'+key,issuer_id:iss,market:'US',attempt:0}))).message).toMatch(/dq_reconciliations_attempt_check/);
 });

 it('reconcile cycles and cursor: one running cycle per pair, terminal iff finished, drc_* invariants',async()=>{
  const pair='test.'+randomUUID().slice(0,8);
  const cycle=(id:string,status='running',finished:string|null=null,members='[]')=>insertRow('dq_reconcile_cycles',{pair,cycle_id:id,started_at:new Date().toISOString(),finished_at:finished,members,status,expected_total:0});
  await cycle('c1');
  expect((await fails(cycle('c2'))).message).toMatch(/dq_reconcile_cycles_running_uniq/);
  expect((await fails(cycle('c3','complete',new Date().toISOString(),'{}'))).message).toMatch(/dq_reconcile_cycles_members_array/);
  expect((await fails(cycle('c4','complete'))).message).toMatch(/dq_reconcile_cycles_finished_iff_terminal/);
  expect((await fails(cycle('c5','paused',new Date().toISOString()))).message).toMatch(/dq_reconcile_cycles_status_check/);
  await cycle('c0','complete_with_gaps',new Date().toISOString());
  const cursor=async(over:Record<string,unknown>)=>insertRow('dq_reconcile_cursor',{pair,cycle_id:'c1',issuer_id:await issuer(),market:'US',expected:2,...over});
  const first=await issuer();
  await cursor({issuer_id:first});
  expect((await fails(cursor({issuer_id:first}))).message).toMatch(/dq_reconcile_cursor_pkey/);
  expect((await fails(cursor({cycle_id:'nope'}))).message).toMatch(/dq_reconcile_cursor_cycle_fkey/);
  expect((await fails(cursor({expected:-1}))).message).toMatch(/drc_expected_nonneg/);
  expect((await fails(cursor({state:'running'}))).message).toMatch(/dq_reconcile_cursor_state_check/);
  expect((await fails(cursor({compared_failed:-1}))).message).toMatch(/drc_counters_nonneg/);
  expect((await fails(cursor({attempts:-1}))).message).toMatch(/dq_reconcile_cursor_attempts_check/);
  expect((await fails(cursor({market:'HK'}))).message).toMatch(/dq_reconcile_cursor_market_check/);
  // S5: a done row needs all three counters, non-null, summing to expected (NULL is never coalesced to 0)
  expect((await fails(cursor({state:'done',compared_passed:2,compared_failed:0}))).message).toMatch(/drc_done_accounted/);
  expect((await fails(cursor({state:'done',compared_passed:1,compared_failed:0,not_compared:0}))).message).toMatch(/drc_done_accounted/);
  await cursor({state:'done',compared_passed:1,compared_failed:0,not_compared:1,done_at:new Date().toISOString()});
  await cursor({state:'failed',attempts:3,last_error:'boom'});
  expect((await fails(q(`delete from public.dq_reconcile_cycles where pair=$1 and cycle_id='c1'`,[pair]))).message).toMatch(/dq_reconcile_cursor_cycle_fkey/);
 });

 it('calendar pass tables: one open pass per market, finished iff terminal, member checks',async()=>{
  await withCalendarLock(admin,async()=>{
   const b=await batch();
   const pass=async(market:string,status='running',finished:string|null=null)=>{
    const id=randomUUID();
    await insertRow('dq_calendar_passes',{market,pass_id:id,started_at:new Date().toISOString(),finished_at:finished,claimed_by:b,claim_until:new Date(Date.now()+600_000).toISOString(),status});
    return id;
   };
   const open=await pass('CN');
   expect((await fails(pass('CN'))).message).toMatch(/dq_calendar_passes_open_uniq/);
   expect((await fails(pass('HK'))).message).toMatch(/dq_calendar_passes_market_check/);
   expect((await fails(pass('US','complete'))).message).toMatch(/dcp_finished_iff_terminal/);
   expect((await fails(pass('US','running',new Date().toISOString()))).message).toMatch(/dcp_finished_iff_terminal/);
   expect((await fails(pass('US','paused',new Date().toISOString()))).message).toMatch(/dq_calendar_passes_status_check/);
   const member=async(over:Record<string,unknown>)=>insertRow('dq_calendar_pass_members',{market:'CN',pass_id:open,issuer_id:await issuer(),...over});
   const first=await issuer();
   await member({issuer_id:first});
   expect((await fails(member({issuer_id:first}))).message).toMatch(/dq_calendar_pass_members_pkey/);
   expect((await fails(member({attempts:-1}))).message).toMatch(/dq_calendar_pass_members_attempts_check/);
   expect((await fails(member({state:'claimed'}))).message).toMatch(/dq_calendar_pass_members_state_check/);
   expect((await fails(member({pass_id:randomUUID()}))).message).toMatch(/dq_calendar_pass_members_pass_fkey/);
   await member({state:'failed',attempts:3,last_error:'sec_unavailable'});
  });
 });

 it('dq_filing_expectations: every dfe_* combination, the other checks and the key',async()=>{
  const b=await batch('dq.calendar.us');const iss=await issuer();
  let n=0;
  // each row gets its own period_end unless the case sets one, so only the asserted constraint can fail
  const exp=(over:Record<string,unknown>)=>{
   n++;
   return insertRow('dq_filing_expectations',{issuer_id:iss,market:'US',report_kind:'10-K',period_end:`${2010+n}-12-31`,deadline_state:'statutory',due_date:'2027-03-01',due_rule:'10-K.large_accelerated.60d',upstream_lookup:'ok',disclosure_state:'pending',computed_at:new Date().toISOString(),batch_id:b,...over});
  };
  const filed=()=>({received_filing_id:randomUUID(),received_date:'2027-02-01'});
  await exp({});                                                                                    // statutory, pending
  await exp({deadline_state:'no_rule',due_date:null,due_rule:'none.src_only'});                       // no_rule, pending
  await exp({deadline_state:'no_rule',due_date:null,due_rule:'none.src_only',disclosure_state:'received',...filed()});   // no_rule rows may be received
  await exp({deadline_state:'estimated',period_end_estimated:true,detail:JSON.stringify({estimated_due_passed:true})});   // estimated past due stays pending
  await exp({disclosure_state:'overdue'});
  await exp({disclosure_state:'received_late',received_filing_id:randomUUID(),received_date:'2027-03-05'});
  await exp({disclosure_state:'filed_not_ingested',upstream_filed_date:'2027-02-20'});
  await exp({upstream_lookup:'unavailable',disclosure_state:'unknown_upstream'});
  await exp({upstream_lookup:'unavailable',disclosure_state:'received',...filed()});                  // received although the lookup was unavailable
  await exp({market:'CN',report_kind:'annual',upstream_lookup:'not_applicable',expected_date:'2027-04-20'});
  await exp({period_end:'2099-06-30'});
  const bad=async(over:Record<string,unknown>,constraint:RegExp)=>expect((await fails(exp(over))).message).toMatch(constraint);
  await bad({deadline_state:'no_rule'},/dfe_due_iff_known/);                                        // no_rule with a due date
  await bad({due_date:null},/dfe_due_iff_known/);                                                   // statutory without one
  await bad({disclosure_state:'received'},/dfe_received_iff/);                                      // received without the filing
  await bad({upstream_lookup:'unavailable',disclosure_state:'pending',received_filing_id:randomUUID()},/dfe_received_pair/);   // filing without a date
  await bad({upstream_lookup:'unavailable',disclosure_state:'pending',received_date:'2027-02-01'},/dfe_received_pair/);       // date without a filing
  await bad(filed(),/dfe_received_iff/);                                                            // pending yet carries a filing
  await bad({disclosure_state:'received',received_filing_id:randomUUID()},/dfe_received_iff/);     // missing received_date
  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'received_late',...filed()},/dfe_late_requires_due/);
  await bad({deadline_state:'estimated',disclosure_state:'overdue'},/dfe_overdue_requires_statutory/);
  await bad({deadline_state:'no_rule',due_date:null,disclosure_state:'overdue'},/dfe_overdue_requires_statutory/);
  await bad({disclosure_state:'unknown_upstream'},/dfe_unknown_upstream_iff/);                      // lookup was ok
  await bad({upstream_lookup:'unavailable'},/dfe_unknown_upstream_iff/);                            // unavailable, nothing received, not unknown_upstream
  await bad({market:'HK'},/dq_filing_expectations_market_check/);
  await bad({report_kind:'8-K'},/dq_filing_expectations_report_kind_check/);
  await bad({deadline_state:'late'},/dq_filing_expectations_deadline_state_check/);
  await bad({disclosure_state:'missing'},/dq_filing_expectations_disclosure_state_check/);
  await bad({upstream_lookup:'maybe'},/dq_filing_expectations_upstream_lookup_check/);
  await bad({detail:'[]'},/dq_filing_expectations_detail_object/);
  await bad({batch_id:randomUUID()},/dq_filing_expectations_batch_id_fkey/);
  await bad({period_end:'2099-06-30'},/dq_filing_expectations_pkey/);
 });

 it('issuer_filer_categories and issuer_filing_profiles: checks and composite keys',async()=>{
  const iss=await issuer();
  const cat=(over:Record<string,unknown>)=>insertRow('issuer_filer_categories',{issuer_id:iss,fiscal_year:2025,acceleration:'large_accelerated',smaller_reporting:false,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'0000320193-25-000079',evidence_sha256:SHA,as_of:'2026-11-05',...over});
  await cat({});
  await cat({fiscal_year:2024,acceleration:'non_accelerated',smaller_reporting:true,category_raw:'Non-accelerated Filer'});
  await cat({fiscal_year:2023,smaller_reporting:null});
  expect((await fails(cat({}))).message).toMatch(/issuer_filer_categories_pkey/);
  expect((await fails(cat({fiscal_year:2022,acceleration:'smaller_reporting'}))).message).toMatch(/issuer_filer_categories_acceleration_check/);
  expect((await fails(cat({fiscal_year:2021,source:'submissions'}))).message).toMatch(/issuer_filer_categories_source_check/);
  expect((await fails(cat({fiscal_year:2020,evidence_sha256:'xyz'}))).message).toMatch(/issuer_filer_categories_evidence_sha256_check/);
  const prof=(over:Record<string,unknown>)=>insertRow('issuer_filing_profiles',{issuer_id:iss,market:'US',category_raw_current:'Large accelerated filer',regime:'10-K',fiscal_year_end:'0927',week52_pattern:true,source:'sec_submissions',source_sha256:SHA,as_of:'2026-11-05',...over});
  await prof({});
  await prof({market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'tushare_stock_basic',source_sha256:null});
  expect((await fails(prof({}))).message).toMatch(/issuer_filing_profiles_pkey/);
  const other=await issuer();
  expect((await fails(prof({issuer_id:other,fiscal_year_end:'1332'}))).message).toMatch(/issuer_filing_profiles_fiscal_year_end_check/);
  expect((await fails(prof({issuer_id:other,fiscal_year_end:'927'}))).message).toMatch(/issuer_filing_profiles_fiscal_year_end_check/);
  expect((await fails(prof({issuer_id:other,regime:'8-K'}))).message).toMatch(/issuer_filing_profiles_regime_check/);
  expect((await fails(prof({issuer_id:other,market:'HK'}))).message).toMatch(/issuer_filing_profiles_market_check/);
  expect((await fails(prof({issuer_id:other,source_sha256:'zz'}))).message).toMatch(/issuer_filing_profiles_source_sha256_check/);
  await prof({issuer_id:other,fiscal_year_end:null});                                              // unknown fiscal year end stays missing
 });

 it('dq_freshness accepts the weekly cadence and still rejects unknown ones',async()=>{
  const d='reconcile.test-'+randomUUID().slice(0,8);
  await q(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'weekly','missing')`,[d]);
  expect((await fails(q(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'hourly','missing')`,[d+'x']))).message).toMatch(/dq_freshness_expected_cadence_check/);
 });
});
