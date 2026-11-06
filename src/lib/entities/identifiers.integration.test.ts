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
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {SCHEMA_BOOTSTRAP_SQL} from '../../../scripts/s4/local-db';

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
const BOOTSTRAP=SCHEMA_BOOTSTRAP_SQL;

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
   allowed_mime_types:['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/zip'],
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
  await bad({upstream_lookup:'ok',disclosure_state:'pending',received_filing_id:randomUUID()},/dfe_received_pair/);   // filing without a date
  await bad({upstream_lookup:'ok',disclosure_state:'pending',received_date:'2027-02-01'},/dfe_received_pair/);       // date without a filing
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

// ================================================================ Task 1b: functions and topology guard
const REVIEWER=randomUUID();
const EVIDENCE={source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1'};
const randomLei=()=>hex(9)+'12';                         // matches the issuers.lei format check
const randomIsin=()=>'ZZ'+hex(5).slice(0,9)+'7';         // matches the issuer_securities.isin format check
const randomFigi=()=>'BBG'+hex(5).slice(0,9);
const randomCik=()=>String(1+Math.floor(Math.random()*9))+String(Math.floor(Math.random()*1e9)).padStart(9,'0');
/** claims.ts::claimTargetKey */
const targetKey=(op:string,t:Record<string,string>)=>t.ticker!==undefined?`${op}:${t.issuer_id}|${t.ticker}|${t.valid_from}`:`${op}:${t.issuer_id}`;
async function newClaim(c:{issuer:string;id_type:string;value:string;op:string;target:Record<string,string>;params?:Record<string,unknown>;over?:Record<string,unknown>;target_key?:string}):Promise<string>{
 const id=randomUUID();
 const detail={schema:'claim/1',evidence_kind:'hard_identifier',target:c.target,params:c.params??{},evidence:EVIDENCE,sources:[],...c.over};
 await insertRow('issuer_identifier_claims',{id,issuer_id:c.issuer,id_type:c.id_type,value:c.value,source:'test',status:'pending',op:c.op,target_key:c.target_key??targetKey(c.op,c.target),detail:JSON.stringify(detail)});
 return id;
}
const resolve=async(id:string,status:string,amend:unknown=null,by:string|null=REVIEWER,on:Pool|PoolClient=admin)=>
 (await on.query(`select public.resolve_identifier_claim($1,$2,$3,$4::jsonb) v`,[id,status,by,amend===null?null:JSON.stringify(amend)])).rows[0].v;
const claimState=async(id:string)=>(await q(`select status,op,value,resolved_by,(resolved_at is not null) resolved from public.issuer_identifier_claims where id=$1`,[id]))[0];
/** Topology changes in fixtures switch the transaction-local setting on, as set_merge/set_dissolved do. */
const topo=async(sql:string,params:unknown[]=[])=>{
 const c=await admin.connect();
 try{
  await c.query('begin');
  await c.query(`select set_config('entities.allow_topology_write','on',true)`);
  await c.query(sql,params);
  await c.query('commit');
 }catch(e){await c.query('rollback').catch(()=>{});throw e;}
 finally{c.release();}
};
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

describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 it('set_identifier on an issuer column writes value and provenance under the null guard; conflicts roll back',async()=>{
  const a=await issuer();const lei=randomLei();
  const pw={lei:{source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA}};
  const id=await newClaim({issuer:a,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:a},over:{provenance_written:pw}});
  expect(await resolve(id,'accepted')).toEqual({op:'set_identifier',applied:true,amended:false});
  expect(await q(`select lei,provenance from public.issuers where issuer_id=$1`,[a])).toEqual([{lei,provenance:pw}]);
  expect(await claimState(id)).toEqual({status:'accepted',op:'set_identifier',value:lei,resolved_by:REVIEWER,resolved:true});
  // the column is no longer null: a second set conflicts and nothing changes
  const again=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  expect((await fails(resolve(again,'accepted'))).message).toBe('value_conflict');
  expect(await claimState(again)).toMatchObject({status:'pending',resolved:false});
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[a])).toEqual([{lei}]);
  // another issuer holding the value (unique index) is value_conflict too
  const b=await issuer();
  const stolen=await newClaim({issuer:b,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:b}});
  expect((await fails(resolve(stolen,'accepted'))).message).toBe('value_conflict');
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[b])).toEqual([{lei:null}]);
  // without provenance_written the claim's evidence becomes the provenance entry
  const cik=randomCik();
  await resolve(await newClaim({issuer:b,id_type:'cik',value:cik,op:'set_identifier',target:{issuer_id:b}}),'accepted');
  expect(await q(`select cik,provenance->'cik' p from public.issuers where issuer_id=$1`,[b])).toEqual([{cik,p:EVIDENCE}]);
  // correct_identifier needs the current value to still match
  const lei2=randomLei();
  const stale=await newClaim({issuer:a,id_type:'lei',value:lei2,op:'correct_identifier',target:{issuer_id:a},params:{expected_current:randomLei(),new_value:lei2}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  await resolve(stale,'rejected');                       // the failed claim stays pending; clear it so the same-key correction can be filed
  const fix=await newClaim({issuer:a,id_type:'lei',value:lei2,op:'correct_identifier',target:{issuer_id:a},params:{expected_current:lei,new_value:lei2}});
  expect(await resolve(fix,'accepted')).toEqual({op:'correct_identifier',applied:true,amended:false});
  expect(await q(`select lei from public.issuers where issuer_id=$1`,[a])).toEqual([{lei:lei2}]);
 });

 it('set/correct_identifier on a security row: ISIN and FIGI under row guards; an ISIN held elsewhere is ownership_conflict',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker(),t2=await ticker();
  await sec(a,t,'2020-01-01',null);
  const isin=randomIsin();
  const target={issuer_id:a,ticker:t,valid_from:'2020-01-01'};
  expect(await resolve(await newClaim({issuer:a,id_type:'isin',value:isin,op:'set_identifier',target}),'accepted')).toEqual({op:'set_identifier',applied:true,amended:false});
  expect(await q(`select isin,provenance->'isin' p from public.issuer_securities where ticker=$1`,[t])).toEqual([{isin,p:EVIDENCE}]);
  // the same ISIN on another open row (any issuer) violates the ISIN no-overlap exclusion
  await sec(b,t2,'2021-01-01',null);
  const dup=await newClaim({issuer:b,id_type:'isin',value:isin,op:'set_identifier',target:{issuer_id:b,ticker:t2,valid_from:'2021-01-01'}});
  expect((await fails(resolve(dup,'accepted'))).message).toBe('ownership_conflict');
  expect(await q(`select isin from public.issuer_securities where ticker=$1`,[t2])).toEqual([{isin:null}]);
  expect(await claimState(dup)).toMatchObject({status:'pending',resolved:false});
  // FIGI: set, then correct only while expected_current still matches
  const [f1,f2,f3]=[randomFigi(),randomFigi(),randomFigi()];
  await resolve(await newClaim({issuer:a,id_type:'figi',value:f1,op:'set_identifier',target}),'accepted');
  const stale=await newClaim({issuer:a,id_type:'figi',value:f3,op:'correct_identifier',target,params:{expected_current:f2,new_value:f3}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  const fix=await newClaim({issuer:a,id_type:'figi',value:f2,op:'correct_identifier',target,params:{expected_current:f1,new_value:f2}});
  expect(await resolve(fix,'accepted')).toMatchObject({op:'correct_identifier',applied:true});
  expect(await q(`select figi from public.issuer_securities where ticker=$1`,[t])).toEqual([{figi:f2}]);
  // a target row that does not exist matches nothing → value_conflict
  const ghost=await newClaim({issuer:a,id_type:'figi',value:randomFigi(),op:'set_identifier',target:{issuer_id:a,ticker:t,valid_from:'1999-01-01'}});
  expect((await fails(resolve(ghost,'accepted'))).message).toBe('value_conflict');
 });

 it('never copies private evidence into public provenance: note and unsafe locators are dropped, unsafe provenance_written is invalid_claim',async()=>{
  const a=await issuer(),b=await issuer();
  const priv={...EVIDENCE,note:'private reviewer note, contact bob',locator:'https://x.example/doc?token=abc123'};
  const l1=randomLei();
  await resolve(await newClaim({issuer:a,id_type:'lei',value:l1,op:'set_identifier',target:{issuer_id:a},over:{evidence:priv}}),'accepted');
  const prov=(await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[a]))[0].p;
  expect(prov).toEqual({source:'test',as_of:'2026-11-05',evidence_sha256:SHA});
  expect(JSON.stringify(prov)).not.toMatch(/private|token|example/);
  // a safe locator is kept, a note is still dropped
  const l2=randomLei();
  await resolve(await newClaim({issuer:b,id_type:'lei',value:l2,op:'set_identifier',target:{issuer_id:b},over:{evidence:{...EVIDENCE,note:'secret note',locator:'row:1,col=B'}}}),'accepted');
  expect((await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[b]))[0].p).toEqual({source:'test',as_of:'2026-11-05',evidence_sha256:SHA,locator:'row:1,col=B'});
  // provenance_written is validated recursively
  const c=await issuer();
  const bad=[{lei:{source:'x',nested:{api_key:'k'}}},{lei:{source:'x',url:'https://x.example/a?b=1'}},{lei:{source:'x',who:randomUUID()}},{lei:{source:'x',list:[{password:'p'}]}},{lei:{source:'x',s:'token=abc'}}];
  for(const pw of bad){
   const id=await newClaim({issuer:c,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:c},over:{provenance_written:pw}});
   expect({pw,msg:(await fails(resolve(id,'accepted'))).message}).toEqual({pw,msg:'invalid_claim'});
   expect(await claimState(id)).toMatchObject({status:'pending'});
   await resolve(id,'rejected');
  }
  const ok=await newClaim({issuer:c,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:c},over:{provenance_written:{lei:{source:'gleif',as_of:'2026-11-05',evidence_sha256:SHA,row:{exchange:'XNAS'}}}}});
  expect(await resolve(ok,'accepted')).toMatchObject({applied:true});
 });

 it('attach_security takes params.ticker; an accession-valued evidence_only claim amended to attach_security inserts that ticker and keeps the accession',async()=>{
  const a=await issuer();const t=await ticker();
  const accession='0001234567-26-000002';
  const evParams={suggested_op:'attach_security',accession,form:'8-A12B',filing_date:'2026-02-20'};
  const mk=()=>newClaim({issuer:a,id_type:'ticker',value:accession,op:'evidence_only',target:{issuer_id:a},params:evParams,over:{evidence_kind:'filing_form'}});
  const attach=(over:Record<string,unknown>)=>({op:'attach_security',target:{issuer_id:a},params:{share_class:'common',valid_from:'2026-02-20',valid_from_method:'listing_date',source:'sec_8a',...over}});
  // no usable ticker: the accession is not a universe ticker; an unknown or malformed params.ticker is refused
  const first=await mk();
  expect((await fails(resolve(first,'accepted',attach({})))).message).toBe('invalid_claim');
  expect((await fails(resolve(first,'accepted',attach({ticker:'ZZNOSUCH'})))).message).toBe('invalid_claim');
  expect((await fails(resolve(first,'accepted',attach({ticker:'zz bad'})))).message).toBe('invalid_claim');
  expect(await claimState(first)).toMatchObject({status:'pending',op:'evidence_only'});
  expect(await resolve(first,'accepted',attach({ticker:t}))).toEqual({op:'attach_security',applied:true,amended:true});
  expect(await q(`select issuer_id,valid_from::text,valid_from_method from public.issuer_securities where ticker=$1`,[t])).toEqual([{issuer_id:a,valid_from:'2026-02-20',valid_from_method:'listing_date'}]);
  const row=(await q(`select op,value,detail from public.issuer_identifier_claims where id=$1`,[first]))[0];
  expect(row).toMatchObject({op:'attach_security',value:accession});
  expect(row.detail).toMatchObject({original_op:'evidence_only',original_params:evParams,params:{ticker:t}});
  // a direct attach_security claim without params.ticker still uses the claim value
  const t2=await ticker();
  expect(await resolve(await newClaim({issuer:a,id_type:'ticker',value:t2,op:'attach_security',target:{issuer_id:a},params:{share_class:'H',valid_from:'2026-01-01',valid_from_method:'curated',source:'x'}}),'accepted')).toMatchObject({applied:true});
  expect(await q(`select count(*)::int n from public.issuer_securities where ticker=$1`,[t2])).toEqual([{n:1}]);
 });

 it('fallback locator needs the character pattern AND the provenance guard: UUID and key: locators are omitted; provenance_written must carry the op key',async()=>{
  const a=await issuer();
  for(const locator of ['doc:550e8400-e29b-41d4-a716-446655440000','key:abc']){
   const lei=randomLei();
   const id=await newClaim({issuer:a,id_type:'lei',value:lei,op:'set_identifier',target:{issuer_id:a},over:{evidence:{...EVIDENCE,locator}}});
   const r=await resolve(id,'accepted');
   expect({locator,r}).toEqual({locator,r:{op:'set_identifier',applied:true,amended:false}});
   expect((await q(`select provenance->'lei' p from public.issuers where issuer_id=$1`,[a]))[0].p).toEqual({source:'test',as_of:'2026-11-05',evidence_sha256:SHA});
   await q(`update public.issuers set lei=null,provenance='{}' where issuer_id=$1`,[a]);
  }
  const b=await issuer();const t=await ticker();
  await sec(b,t,'2020-01-01',null);
  const cases:[string,Promise<string>][]=[
   ['empty',newClaim({issuer:b,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:b},over:{provenance_written:{}}})],
   ['wrong key',newClaim({issuer:b,id_type:'isin',value:randomIsin(),op:'set_identifier',target:{issuer_id:b,ticker:t,valid_from:'2020-01-01'},over:{provenance_written:{figi:EVIDENCE}}})],
   ['attach without valid_from',newClaim({issuer:b,id_type:'ticker',value:await ticker(),op:'attach_security',target:{issuer_id:b},params:{share_class:'H',valid_from:'2021-01-01',valid_from_method:'curated',source:'x'},over:{provenance_written:{isin:EVIDENCE}}})],
  ];
  for(const [name,idp] of cases){const id=await idp;expect({name,msg:(await fails(resolve(id,'accepted'))).message}).toEqual({name,msg:'invalid_claim'});}
 });

 it('attach_security inserts the open row with its method and provenance; a held ticker is ownership_conflict',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker();
  const params={share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'gleif_openfigi',isin:randomIsin()};
  const id=await newClaim({issuer:a,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:a},params,over:{evidence_kind:'name_match'}});
  expect(await resolve(id,'accepted')).toEqual({op:'attach_security',applied:true,amended:false});
  expect(await q(`select issuer_id,share_class,valid_from::text,valid_to,valid_from_method,valid_to_method,source,isin,is_primary,provenance from public.issuer_securities where ticker=$1`,[t])).toEqual([
   {issuer_id:a,share_class:'H',valid_from:'2004-06-16',valid_to:null,valid_from_method:'listing_date',valid_to_method:null,source:'gleif_openfigi',isin:params.isin,is_primary:false,provenance:{valid_from:EVIDENCE,isin:EVIDENCE}},
  ]);
  const held=await newClaim({issuer:b,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:b},params:{...params,isin:null,valid_from:'2026-01-01'}});
  expect((await fails(resolve(held,'accepted'))).message).toBe('ownership_conflict');
  expect(await claimState(held)).toMatchObject({status:'pending',resolved:false});
 });

 it('close_security closes an open row once; a second close is already_closed',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2020-01-01',null);
  const target={issuer_id:a,ticker:t,valid_from:'2020-01-01'};
  const first=await newClaim({issuer:a,id_type:'ticker',value:t,op:'close_security',target,params:{valid_to:'2026-03-01',valid_to_method:'delisting'},over:{evidence_kind:'filing_form'}});
  expect(await resolve(first,'accepted')).toEqual({op:'close_security',applied:true,amended:false});
  expect(await q(`select valid_to::text,valid_to_method,provenance->'valid_to' p from public.issuer_securities where ticker=$1`,[t])).toEqual([{valid_to:'2026-03-01',valid_to_method:'delisting',p:EVIDENCE}]);
  const again=await newClaim({issuer:a,id_type:'ticker',value:t,op:'close_security',target,params:{valid_to:'2026-04-01',valid_to_method:'curated'}});
  expect((await fails(resolve(again,'accepted'))).message).toBe('already_closed');
  expect(await claimState(again)).toMatchObject({status:'pending'});
 });

 it('backdate_window moves valid_from under the old-value guard; an overlap is ownership_conflict',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker();
  await sec(b,t,'2000-01-01','2005-01-01',{valid_to_method:'curated'});
  await sec(a,t,'2010-01-01',null);
  const target={issuer_id:a,ticker:t,valid_from:'2010-01-01'};
  const ok=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2006-03-01',valid_from_method:'listing_date'}});
  expect(await resolve(ok,'accepted')).toEqual({op:'backdate_window',applied:true,amended:false});
  expect(await q(`select valid_from::text,valid_from_method,provenance->'valid_from' p from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01',valid_from_method:'listing_date',p:EVIDENCE}]);
  // the old valid_from is gone → value_conflict
  const stale=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2007-01-01',valid_from_method:'curated'}});
  expect((await fails(resolve(stale,'accepted'))).message).toBe('value_conflict');
  // moving into b's closed window [2000,2005) → no-overlap exclusion → ownership_conflict, nothing moves
  const over=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target:{issuer_id:a,ticker:t,valid_from:'2006-03-01'},params:{new_valid_from:'2004-01-01',valid_from_method:'curated'}});
  expect((await fails(resolve(over,'accepted'))).message).toBe('ownership_conflict');
  expect(await q(`select valid_from::text from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t])).toEqual([{valid_from:'2006-03-01'}]);
 });

 it('evidence_only needs an amend to be accepted; the amend rewrites the claim and keeps the original',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2020-01-01',null);
  const params={suggested_op:'close_security',accession:'0001234567-26-000001',form:'25-NSE',filing_date:'2026-02-20',note:'Rule 12d2-2(d): delisting effective 10 days after filing; check the class named in the form'};
  const evidenceClaim=()=>newClaim({issuer:a,id_type:'ticker',value:t,op:'evidence_only',target:{issuer_id:a},params,over:{evidence_kind:'filing_form'}});
  const first=await evidenceClaim();
  expect((await fails(resolve(first,'accepted'))).message).toBe('amend_required');
  expect(await resolve(first,'rejected')).toEqual({op:'evidence_only',applied:false,amended:false});
  expect(await claimState(first)).toEqual({status:'rejected',op:'evidence_only',value:t,resolved_by:REVIEWER,resolved:true});
  const second=await evidenceClaim();
  const amend={op:'close_security',target:{issuer_id:a,ticker:t,valid_from:'2020-01-01'},params:{valid_to:'2026-03-02',valid_to_method:'delisting'}};
  expect(await resolve(second,'accepted',amend)).toEqual({op:'close_security',applied:true,amended:true});
  const row=(await q(`select op,value,target_key,detail from public.issuer_identifier_claims where id=$1`,[second]))[0];
  expect(row.op).toBe('close_security');
  expect(row.value).toBe(t);
  expect(row.target_key).toBe(`close_security:${a}|${t}|2020-01-01`);
  expect(row.detail).toMatchObject({target:amend.target,params:amend.params,original_op:'evidence_only',original_params:params,original_target:{issuer_id:a},amended_by:REVIEWER});
  expect(typeof row.detail.amended_at).toBe('string');
  expect(await q(`select valid_to::text,valid_to_method from public.issuer_securities where ticker=$1`,[t])).toEqual([{valid_to:'2026-03-02',valid_to_method:'delisting'}]);
  // an amend on another op, to a non-ticker op, or one that fails the claim/1 check is invalid_claim
  const other=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  expect((await fails(resolve(other,'accepted',amend))).message).toBe('invalid_claim');
  const third=await evidenceClaim();
  expect((await fails(resolve(third,'accepted',{op:'set_identifier',target:{issuer_id:a},params:{}}))).message).toBe('invalid_claim');
  expect((await fails(resolve(third,'accepted',{...amend,params:{valid_to:'2019-01-01',valid_to_method:'delisting'}}))).message).toBe('invalid_claim');
  expect(await claimState(third)).toMatchObject({status:'pending',op:'evidence_only'});
 });

 it('refuses resolved, legacy, malformed, mismatched, inactive and unknown claims, leaving them pending',async()=>{
  const a=await issuer(),b=await issuer();
  const done=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  await resolve(done,'rejected');
  expect((await fails(resolve(done,'accepted'))).message).toBe('already_resolved');
  const legacy=randomUUID();
  await q(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei',$3,'test',0.5)`,[legacy,a,randomLei()]);
  expect((await fails(resolve(legacy,'rejected'))).message).toBe('legacy_claim');
  const mismatch=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:b},target_key:`set_identifier:${a}`});
  const pairing=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'attach_security',target:{issuer_id:a},params:{share_class:'A',valid_from:'2020-01-01',valid_from_method:'listing_date',source:'x'}});
  const foreignProv=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},over:{provenance_written:{cik:{source:'x'}}}});
  const wrongKey=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},target_key:`set_identifier:${b}`});
  const badDate=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},over:{evidence:{...EVIDENCE,as_of:'2026-02-30'}}});
  const extraParam=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a},params:{expected_current:'x'}});
  for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect({id,msg:(await fails(resolve(id,'accepted'))).message}).toEqual({id,msg:'invalid_claim'});
  expect((await fails(resolve(badDate,'maybe'))).message).toBe('invalid_claim');
  expect((await fails(resolve(badDate,'accepted',null,null))).message).toBe('invalid_claim');
  expect((await fails(resolve(randomUUID(),'accepted'))).message).toBe('claim_not_found');
  for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect(await claimState(id)).toMatchObject({status:'pending',resolved:false});
  // rejection is a status flip: even claims that fail claim/1 validation can be cleared through the function
  for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect({id,r:await resolve(id,'rejected')}).toEqual({id,r:{op:expect.any(String),applied:false,amended:false}});
  for(const id of [mismatch,pairing,foreignProv,wrongKey,badDate,extraParam])expect(await claimState(id)).toMatchObject({status:'rejected',resolved:true});
  // a dissolved issuer cannot take writes, but its claims can still be rejected
  const gone=await issuer();
  const late=await newClaim({issuer:gone,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:gone}});
  await topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[gone]);
  expect((await fails(resolve(late,'accepted'))).message).toBe('issuer_not_active');
  expect(await resolve(late,'rejected')).toEqual({op:'set_identifier',applied:false,amended:false});
 });

 it('serialises concurrent resolutions on the claim row: the second waits, then sees already_resolved',async()=>{
  const a=await issuer();
  const id=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  await inTx(admin,async tx=>{
   expect(await resolve(id,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
   const second=fails(resolve(id,'rejected'));
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect((await second).message).toBe('already_resolved');
  });
  expect(await claimState(id)).toMatchObject({status:'accepted'});
 });

 it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
  const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)','public.patch_security_provenance(uuid,text,date,jsonb,text[])','public.close_security_absent(uuid,text,date,date,text,jsonb)'];
  const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
  for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
   const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
   expect({fn,role,ok}).toEqual({fn,role,ok:role==='service_role'&&FNS.includes(fn)});
  }
  expect(await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='replace_filing_expectations'`)).toEqual([{n:1}]);
  const a=await issuer();
  const id=await newClaim({issuer:a,id_type:'lei',value:randomLei(),op:'set_identifier',target:{issuer_id:a}});
  const c=await admin.connect();
  try{
   await c.query('set role authenticated');
   await expect(c.query(`select public.resolve_identifier_claim($1,'accepted',$2)`,[id,REVIEWER])).rejects.toThrow(/permission denied/);
   await c.query('reset role');
   await c.query('set role service_role');
   expect(await resolve(id,'rejected',null,REVIEWER,c)).toEqual({op:'set_identifier',applied:false,amended:false});
  }finally{await c.query('reset role').catch(()=>{});c.release();}
 });
});

describe.skipIf(!enabled)('plan 3 migration one: issuers_topology_guard',()=>{
 it('rejects a direct merge, dissolution or re-point on a brand-new connection where the setting was never defined',async()=>{
  const a=await issuer(),b=await issuer();
  const fresh=new Pool({connectionString:adminUrl,max:1});
  try{
   const c=await fresh.connect();
   try{
    expect((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v).toBeNull();
    expect(await fails(c.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]))).toMatchObject({message:'topology_write_forbidden',code:'23514'});
    expect((await fails(c.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[a]))).message).toBe('topology_write_forbidden');
    expect((await fails(c.query(`update public.issuers set merged_into=$2 where issuer_id=$1`,[a,b]))).message).toBe('topology_write_forbidden');
   }finally{c.release();}
  }finally{await fresh.end();}
  expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[a])).toEqual([{status:'active',merged_into:null}]);
 });

 it("still rejects on a connection whose earlier transaction switched the setting on locally ('' after commit)",async()=>{
  const a=await issuer(),b=await issuer();
  const c=await admin.connect();
  try{
   await c.query('begin');
   await c.query(`select set_config('entities.allow_topology_write','on',true)`);
   await c.query('commit');
   expect((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v).toBe('');
   expect((await fails(c.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]))).message).toBe('topology_write_forbidden');
  }finally{c.release();}
 });

 it('lets a transaction with the setting on change topology, with the plan-1 lifecycle triggers still enforced',async()=>{
  const a=await issuer(),b=await issuer(),dead=await issuer();
  await topo(`update public.issuers set status='dissolved' where issuer_id=$1`,[dead]);
  expect((await fails(topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,dead]))).message).toMatch(/merge_target_not_active/);
  await topo(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
  expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[a])).toEqual([{status:'merged',merged_into:b}]);
 });

 it('leaves non-topology updates, same-value writes and active inserts alone; an insert born merged/dissolved needs the setting (接口对齐记录 #7)',async()=>{
  const a=await issuer(),b=await issuer();
  await q(`update public.issuers set canonical_name_en='ZZ Renamed' where issuer_id=$1`,[a]);
  await q(`update public.issuers set status='active',merged_into=null where issuer_id=$1`,[a]);   // unchanged values: the guard skips them
  expect(await q(`select canonical_name_en,status from public.issuers where issuer_id=$1`,[a])).toEqual([{canonical_name_en:'ZZ Renamed',status:'active'}]);
  await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Born Active')`,[randomUUID()]);   // status active, merged_into null: not guarded
  expect(await fails(q(`insert into public.issuers(issuer_id,canonical_name_en,status,merged_into) values($1,'ZZ Born Merged','merged',$2)`,[randomUUID(),b]))).toMatchObject({message:'topology_write_forbidden',code:'23514'});
  expect((await fails(q(`insert into public.issuers(issuer_id,canonical_name_en,status) values($1,'ZZ Born Dissolved','dissolved')`,[randomUUID()]))).message).toBe('topology_write_forbidden');
  const born=randomUUID();
  await topo(`insert into public.issuers(issuer_id,canonical_name_en,status,merged_into) values($1,'ZZ Born Merged','merged',$2)`,[born,b]);
  expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[born])).toEqual([{status:'merged',merged_into:b}]);
 });
});

describe.skipIf(!enabled)('plan 3 migration one: calendar pass functions',()=>{
 const CAL='CN';
 type Token={market:string;pass_id:string;batch_id:string};
 // next_due_at far in the future: no facts sync in another suite ever picks these scope rows up
 const scopeRow=(iss:string)=>q(`insert into public.fact_sync_scope(issuer_id,market,reasons,priority,fetch_key,next_due_at) values($1,$2,'["test"]',5,'df3cal','2999-01-01') on conflict (issuer_id,market) do update set priority=5`,[iss,CAL]);
 const claimPass=async(b:string)=>(await q(`select public.claim_calendar_pass($1,$2) v`,[CAL,b]))[0].v as Token|null;
 const replace=async(tok:unknown,iss:string,rows:unknown,market=CAL)=>(await q(`select public.replace_filing_expectations($1,$2,$3::jsonb,$4::jsonb) v`,[iss,market,JSON.stringify(rows),JSON.stringify(tok)]))[0].v as number;
 const failMember=(tok:unknown,iss:string,err='boom')=>q(`select public.fail_calendar_member($1::jsonb,$2,$3)`,[JSON.stringify(tok),iss,err]);
 const finish=async(tok:unknown)=>(await q(`select public.finish_calendar_pass($1::jsonb) v`,[JSON.stringify(tok)]))[0].v as string;
 const members=(passId:string)=>q(`select issuer_id,state,attempts,last_error from public.dq_calendar_pass_members where market=$1 and pass_id=$2 order by issuer_id`,[CAL,passId]);
 const member=async(passId:string,iss:string)=>(await members(passId)).find(m=>m.issuer_id===iss);
 /** In-scope issuers other suites created are members too: settle them with an empty replacement. */
 const drain=async(tok:Token,except:string[]=[])=>{for(const m of await members(tok.pass_id))if(m.state==='pending'&&!except.includes(m.issuer_id))await replace(tok,m.issuer_id,[]);};
 const expRow=(over:Record<string,unknown>={})=>({report_kind:'annual',period_end:'2025-12-31',period_end_estimated:false,deadline_state:'statutory',due_date:'2026-04-30',due_rule:'cn.annual.4m',expected_date:null,upstream_lookup:'ok',upstream_filed_date:null,disclosure_state:'pending',received_filing_id:null,received_date:null,profile_as_of:null,detail:{},...over});

 it('creates one pass per market, freezes the in-scope members and leases it to one worker',async()=>{
  await withCalendarLock(admin,async()=>{
   const i1=await issuer(),i2=await issuer();await scopeRow(i1);await scopeRow(i2);
   const b1=await batch(),b2=await batch();
   const tok=(await claimPass(b1))!;
   expect(tok).toEqual({market:CAL,pass_id:expect.any(String),batch_id:b1});
   for(const i of [i1,i2])expect(await member(tok.pass_id,i)).toMatchObject({state:'pending',attempts:0});
   expect(await claimPass(b2)).toBeNull();                                  // leased to b1
   expect((await claimPass(b1))!.pass_id).toBe(tok.pass_id);                // the holder renews its own lease
   expect(await q(`select (claim_until > clock_timestamp() + interval '9 minutes') fresh from public.dq_calendar_passes where market=$1 and pass_id=$2`,[CAL,tok.pass_id])).toEqual([{fresh:true}]);
   const i3=await issuer();await scopeRow(i3);
   expect(await member(tok.pass_id,i3)).toBeUndefined();                    // frozen: scope changes wait for the next pass
   await drain(tok);
   expect(await finish(tok)).toBe('complete');
   const next=(await claimPass(b2))!;
   expect(next.pass_id).not.toBe(tok.pass_id);
   for(const i of [i1,i2,i3])expect(await member(next.pass_id,i)).toMatchObject({state:'pending'});
   await drain(next);await finish(next);
  });
 },60000);

 it('lets exactly one of two concurrent claimers create and lease the pass: both wait on the advisory lock',async()=>{
  await withCalendarLock(admin,async()=>{
   const i=await issuer();await scopeRow(i);
   const b1=await batch(),b2=await batch();
   await inTx(admin,async tx=>{
    await tx.c.query(`select pg_advisory_xact_lock(hashtext('dq_calendar_pass:'||$1))`,[CAL]);
    const got=Promise.all([claimPass(b1),claimPass(b2)]);
    await stillBlockedBehind(admin,tx.pid,got);
    await tx.commit();
    const res=await got;
    expect(res.filter(Boolean)).toHaveLength(1);
    expect(await q(`select count(*)::int n from public.dq_calendar_passes where market=$1 and finished_at is null`,[CAL])).toEqual([{n:1}]);
    const tok=(res[0]??res[1])!;
    await drain(tok);await finish(tok);
   });
  });
 });

 it("replace_filing_expectations swaps an issuer's rows atomically under the fence and marks the member done once",async()=>{
  await withCalendarLock(admin,async()=>{
   const i=await issuer(),j=await issuer();await scopeRow(i);await scopeRow(j);
   const b=await batch();
   const tok=(await claimPass(b))!;
   expect(await replace(tok,i,[expRow(),expRow({report_kind:'semiannual',period_end:'2025-06-30',due_date:'2025-08-31',due_rule:'cn.semiannual.2m'})])).toBe(2);
   expect(await q(`select report_kind,period_end::text,batch_id from public.dq_filing_expectations where issuer_id=$1 and market=$2 order by period_end`,[i,CAL])).toEqual([
    {report_kind:'semiannual',period_end:'2025-06-30',batch_id:b},{report_kind:'annual',period_end:'2025-12-31',batch_id:b}]);
   expect(await member(tok.pass_id,i)).toMatchObject({state:'done',attempts:0});
   expect((await fails(replace(tok,i,[expRow()]))).message).toBe('member_not_claimable');        // done is final within a pass
   // invalid rows write nothing and keep the member pending
   expect((await fails(replace(tok,j,[expRow({deadline_state:'no_rule'})]))).message).toBe('invalid_rows');   // dfe_due_iff_known
   expect((await fails(replace(tok,j,[{...expRow(),issuer_id:i}]))).message).toBe('invalid_rows');            // a row for another issuer
   expect((await fails(replace(tok,j,[expRow(),expRow()]))).message).toBe('invalid_rows');                    // duplicate key in one call
   expect((await fails(replace(tok,j,{}))).message).toBe('invalid_rows');                                     // not an array
   expect(await q(`select count(*)::int n from public.dq_filing_expectations where issuer_id=$1`,[j])).toEqual([{n:0}]);
   expect(await member(tok.pass_id,j)).toMatchObject({state:'pending'});
   // not a member; another market in the call; a token naming another batch; a malformed token
   expect((await fails(replace(tok,await issuer(),[]))).message).toBe('member_not_claimable');
   expect((await fails(replace(tok,j,[],'US'))).message).toBe('fence_failed');
   expect((await fails(replace({...tok,batch_id:randomUUID()},j,[expRow()]))).message).toBe('fence_failed');
   expect((await fails(replace({market:CAL},j,[expRow()]))).message).toBe('fence_failed');
   await drain(tok);
   expect(await finish(tok)).toBe('complete');
   // the next pass replaces the whole set for the issuer
   const tok2=(await claimPass(b))!;
   expect(await replace(tok2,i,[expRow({report_kind:'semiannual',period_end:'2026-06-30',due_date:'2026-08-31',due_rule:'cn.semiannual.2m'})])).toBe(1);
   expect(await q(`select period_end::text from public.dq_filing_expectations where issuer_id=$1`,[i])).toEqual([{period_end:'2026-06-30'}]);
   await drain(tok2);await finish(tok2);
  });
 },60000);

 it('fail_calendar_member retries up to three attempts; finish_calendar_pass settles only from persisted state',async()=>{
  await withCalendarLock(admin,async()=>{
   const i=await issuer(),k=await issuer();await scopeRow(i);await scopeRow(k);
   const b=await batch();const tok=(await claimPass(b))!;
   await drain(tok,[i,k]);
   await failMember(tok,i,'sec_unavailable');
   expect(await member(tok.pass_id,i)).toMatchObject({state:'failed',attempts:1,last_error:'sec_unavailable'});
   expect((await fails(finish(tok))).message).toBe('pass_incomplete');      // i may still be retried, k is pending
   expect(await replace(tok,i,[expRow()])).toBe(1);                          // a retry that succeeds is simply done
   expect(await member(tok.pass_id,i)).toMatchObject({state:'done',attempts:1});
   for(let n=0;n<3;n++)await failMember(tok,k,`boom ${n}`);
   expect(await member(tok.pass_id,k)).toMatchObject({state:'failed',attempts:3,last_error:'boom 2'});
   expect((await fails(failMember(tok,k))).message).toBe('member_not_claimable');        // terminal
   expect((await fails(replace(tok,k,[expRow()]))).message).toBe('member_not_claimable');
   expect((await fails(failMember(tok,i))).message).toBe('member_not_claimable');        // done members cannot fail
   expect(await finish(tok)).toBe('complete_with_failures');
   expect(await q(`select status,(finished_at is not null) finished from public.dq_calendar_passes where market=$1 and pass_id=$2`,[CAL,tok.pass_id])).toEqual([{status:'complete_with_failures',finished:true}]);
   expect((await fails(finish(tok))).message).toBe('fence_failed');                       // a finished pass is closed to every function
   expect((await fails(replace(tok,i,[]))).message).toBe('fence_failed');
  });
 },60000);

 it('an expired worker cannot change the progress of the worker that took the pass over',async()=>{
  await withCalendarLock(admin,async()=>{
   const i=await issuer();await scopeRow(i);
   const b1=await batch(),b2=await batch();
   const old=(await claimPass(b1))!;
   await q(`update public.dq_calendar_passes set claim_until=clock_timestamp()-interval '1 second' where market=$1 and pass_id=$2`,[CAL,old.pass_id]);
   expect((await fails(replace(old,i,[expRow()]))).message).toBe('fence_failed');          // expired even before anyone takes over
   const cur=(await claimPass(b2))!;
   expect(cur).toEqual({market:CAL,pass_id:old.pass_id,batch_id:b2});                     // takeover keeps the pass and its frozen members
   expect((await fails(replace(old,i,[expRow()]))).message).toBe('fence_failed');
   expect((await fails(failMember(old,i))).message).toBe('fence_failed');
   expect((await fails(finish(old))).message).toBe('fence_failed');
   expect(await member(cur.pass_id,i)).toMatchObject({state:'pending',attempts:0});
   expect(await q(`select count(*)::int n from public.dq_filing_expectations where issuer_id=$1`,[i])).toEqual([{n:0}]);
   expect(await replace(cur,i,[expRow()])).toBe(1);
   await drain(cur);
   expect(await finish(cur)).toBe('complete');
  });
 },60000);
});

// Plan audit round 1, P3/P4: the two row-locking jsonb patches. Each concurrent case holds the row in
// one transaction and proves the second writer waits on it and then keeps the first writer's keys.
describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (append_claim_evidence, patch_quarantine_detail)',()=>{
 const ev=(sha:string)=>({source:'test',as_of:'2026-11-05',evidence_sha256:sha});
 const append=(k:{issuer:string;value:string},e:unknown,on:Pool|PoolClient=admin)=>
  on.query(`select public.append_claim_evidence($1,'lei',$2,'set_identifier',$3,$4::jsonb) v`,[k.issuer,k.value,`set_identifier:${k.issuer}`,JSON.stringify(e)]).then(r=>r.rows[0].v as string);
 const sources=async(id:string)=>(await q(`select detail->'sources' s from public.issuer_identifier_claims where id=$1`,[id]))[0].s;
 it('append_claim_evidence dedupes against the evidence and the sources, patches only detail.sources and leaves resolved claims alone',async()=>{
  const a=await issuer();const value=randomLei();const k={issuer:a,value};
  const id=await newClaim({issuer:a,id_type:'lei',value,op:'set_identifier',target:{issuer_id:a}});
  expect(await append(k,EVIDENCE)).toBe('duplicate');                                   // the claim's own evidence
  expect(await append(k,ev('b'.repeat(64)))).toBe('appended');
  expect(await append(k,ev('b'.repeat(64)))).toBe('duplicate');                        // already a source
  expect(await sources(id)).toEqual([ev('b'.repeat(64))]);
  expect((await q(`select detail->'evidence' e,detail->'target' t,detail->'params' p from public.issuer_identifier_claims where id=$1`,[id]))[0]).toEqual({e:EVIDENCE,t:{issuer_id:a},p:{}});
  expect((await fails(append(k,{source:'test',as_of:'2026-11-05',evidence_sha256:'nope'}))).message).toBe('invalid_evidence');
  await resolve(id,'rejected');
  expect(await append(k,ev('c'.repeat(64)))).toBe('not_found');
  expect(await sources(id)).toEqual([ev('b'.repeat(64))]);
 });
 it('two concurrent appenders both keep their evidence: the second waits on the claim row lock',async()=>{
  const a=await issuer();const value=randomLei();const k={issuer:a,value};
  const id=await newClaim({issuer:a,id_type:'lei',value,op:'set_identifier',target:{issuer_id:a}});
  await inTx(admin,async tx=>{
   expect(await append(k,ev('1'.repeat(64)),tx.c)).toBe('appended');
   const second=append(k,ev('2'.repeat(64)));
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('appended');
  });
  expect(await sources(id)).toEqual([ev('1'.repeat(64)),ev('2'.repeat(64))]);
 });
 it('patch_quarantine_detail replaces only its key: a hook write interleaved with a newer latest_result and a resolution keeps both',async()=>{
  const id=randomUUID();const b=await batch('facts.us','dq-resolver');
  await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload,detail) values($1,'facts.us','financial_facts',$2,'reconcile_mismatch',$3,'{}'::jsonb,$4::jsonb)`,
   [id,`test:${id}`,b,JSON.stringify({pair:'test',latest_result:{passed:false,reconciliation_id:'r1'},hook:{stage:'materialize',state:'pending'}})]);
  const patch=(key:string,value:unknown,on:Pool|PoolClient=admin)=>on.query(`select public.patch_quarantine_detail($1,$2,$3::jsonb) v`,[id,key,JSON.stringify(value)]).then(r=>r.rows[0].v as boolean);
  await inTx(admin,async tx=>{
   // a newer verdict (apply_reconcile_result / restore_reconciled) holds the item row
   await tx.c.query(`update public.dq_quarantine set detail=detail||'{"latest_result":{"passed":true,"reconciliation_id":"r2"}}'::jsonb,status='resolved_accept',resolved_by=$2,resolved_at=now() where id=$1`,[id,REVIEWER]);
   const hook=patch('hook',{stage:'done',state:'done',at:'2026-11-05T00:00:00.000Z'});
   await stillBlockedBehind(admin,tx.pid,hook);
   await tx.commit();
   expect(await hook).toBe(true);
  });
  expect(await patch('audit_written',true)).toBe(true);
  expect((await q(`select status,resolved_by,detail from public.dq_quarantine where id=$1`,[id]))[0]).toEqual({status:'resolved_accept',resolved_by:REVIEWER,
   detail:{pair:'test',latest_result:{passed:true,reconciliation_id:'r2'},hook:{stage:'done',state:'done',at:'2026-11-05T00:00:00.000Z'},audit_written:true}});
  expect((await fails(patch('latest_result',{passed:false}))).message).toBe('invalid_detail_key');
  expect(await admin.query(`select public.patch_quarantine_detail($1,'hook','{}'::jsonb) v`,[randomUUID()]).then(r=>r.rows[0].v)).toBe(false);
 });

 // Plan audit round 3, R2: the guarded identifier write and its provenance key land in one locked UPDATE.
 const setId=(k:{issuer:string;ticker:string},col:string,value:string,prov:unknown,on:Pool|PoolClient=admin)=>
  on.query(`select public.set_security_identifier($1,$2,'2020-01-01'::date,$3,$4,$5::jsonb) v`,[k.issuer,k.ticker,col,value,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
 const secState=async(t:string)=>(await q(`select isin,figi,provenance from public.issuer_securities where ticker=$1`,[t]))[0];
 const PI={isin:{source:'gleif_openfigi',as_of:'2026-11-05',evidence_sha256:'1'.repeat(64)}};
 const PF={figi:{source:'openfigi',as_of:'2026-11-05',evidence_sha256:'2'.repeat(64)}};
 it('set_security_identifier: written / duplicate (completing a missing key) / conflict / not_found; exactly one provenance key; other keys kept',async()=>{
  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const isin=randomIsin(),figi=randomFigi();
  expect(await setId(k,'isin',isin,PI)).toBe('written');
  expect(await setId(k,'isin',isin,PI)).toBe('duplicate');
  expect(await setId(k,'isin',randomIsin(),PI)).toBe('conflict');
  await q(`update public.issuer_securities set figi=$2 where ticker=$1`,[t,figi]);                    // value present, provenance key missing
  expect(await setId(k,'figi',figi,PF)).toBe('duplicate');
  expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,...PF}});
  expect(await setId({issuer:a,ticker:await ticker()},'isin',randomIsin(),PI)).toBe('not_found');
  for(const bad of [()=>setId(k,'lei',randomLei(),{lei:{}}),()=>setId(k,'isin',randomIsin(),PF),()=>setId(k,'isin',randomIsin(),{...PI,...PF}),()=>setId(k,'figi','',PF)])
   expect(await fails(bad())).toMatchObject({message:'invalid_identifier_write',code:'22023'});
 });
 it('concurrent ISIN and FIGI writes on one row both keep their value and their provenance key: the second waits on the row lock',async()=>{
  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const isin=randomIsin(),figi=randomFigi();
  await inTx(admin,async tx=>{
   expect(await setId(k,'isin',isin,PI,tx.c)).toBe('written');
   const second=setId(k,'figi',figi,PF);
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('written');
  });
  expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,...PF}});
 });
 it('an identifier write interleaved with a claim resolution on the same row keeps both values and both evidence keys, in either order',async()=>{
  for(const claimFirst of [true,false]){
   const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
   await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
   const isin=randomIsin(),figi=randomFigi();
   const id=await newClaim({issuer:a,id_type:'figi',value:figi,op:'set_identifier',target:{issuer_id:a,ticker:t,valid_from:'2020-01-01'}});   // provenance = {figi: EVIDENCE}
   await inTx(admin,async tx=>{
    if(claimFirst)expect(await resolve(id,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
    else expect(await setId(k,'isin',isin,PI,tx.c)).toBe('written');
    const second=claimFirst?setId(k,'isin',isin,PI):resolve(id,'accepted');
    await stillBlockedBehind(admin,tx.pid,second);
    await tx.commit();
    expect(await second).toEqual(claimFirst?'written':{op:'set_identifier',applied:true,amended:false});
   });
   expect(await secState(t)).toEqual({isin,figi,provenance:{exchange:'Nasdaq',...PI,figi:EVIDENCE}});
  }
 });
 it('set_security_identifier locks the issuer before the security row: it waits behind an issuer lock held by a claim-resolution-order writer, with no deadlock',async()=>{
  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
  await sec(a,t,'2020-01-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const isin=randomIsin();
  await inTx(admin,async tx=>{
   // session A follows resolve_identifier_claim's order: issuer FOR UPDATE first, security row second
   await tx.c.query(`select 1 from public.issuers where issuer_id=$1 for no key update`,[a]);
   const second=setId(k,'isin',isin,PI);
   await stillBlockedBehind(admin,tx.pid,second);     // would not block at all if B took the security row first
   await tx.c.query(`update public.issuer_securities set figi=$2 where ticker=$1 and valid_to is null`,[t,'BBG000000001']);
   await tx.commit();
   expect(await second).toBe('written');
  });
  expect(await secState(t)).toEqual({isin,figi:'BBG000000001',provenance:{exchange:'Nasdaq',...PI}});
 });

 // Task 5a: evidenced window writes land date + method + one provenance key in one locked UPDATE.
 const setWin=(a:string,t:string,from:string,side:string,date:string,prov:unknown,on:Pool|PoolClient=admin)=>
  on.query(`select public.set_security_window($1,$2,$3::date,$4,$5::date,$6::jsonb) v`,[a,t,from,side,date,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
 const winState=async(t:string)=>(await q(`select to_char(valid_from,'YYYY-MM-DD') valid_from,to_char(valid_to,'YYYY-MM-DD') valid_to,valid_from_method,valid_to_method,provenance from public.issuer_securities where ticker=$1`,[t]))[0];
 const WF={valid_from:{source:'stocks_universe.list_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{list_date:'2001-08-27'}}};
 const WT={valid_to:{source:'stocks_universe.delist_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{delist_date:'2026-06-30'}}};
 it('set_security_window: from/to written, duplicate, state guards conflict, not_found, invalid; provenance merged',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'SSE'})});
  expect(await setWin(a,t,'2024-03-01','from','2025-01-01',WF)).toBe('conflict');          // listing date after valid_from
  expect(await setWin(a,t,'2024-03-01','to','2024-03-01',WT)).toBe('conflict');            // delisting on valid_from
  expect(await setWin(a,t,'2024-03-01','from','2001-08-27',WF)).toBe('written');
  expect(await setWin(a,t,'2001-08-27','from','2001-08-27',WF)).toBe('duplicate');
  expect(await setWin(a,t,'2001-08-27','from','2000-01-01',WF)).toBe('conflict');          // already listing_date at another date
  expect(await setWin(a,t,'2001-08-27','to','2026-06-30',WT)).toBe('written');
  expect(await setWin(a,t,'2001-08-27','to','2026-06-30',WT)).toBe('duplicate');
  expect(await setWin(a,t,'2001-08-27','to','2026-07-01',WT)).toBe('conflict');            // already closed
  expect(await winState(t)).toEqual({valid_from:'2001-08-27',valid_to:'2026-06-30',valid_from_method:'listing_date',valid_to_method:'delisting',provenance:{exchange:'SSE',...WF,...WT}});
  const c=await ticker();
  await sec(a,c,'2024-03-01','2025-01-01',{valid_to_method:'unrecorded'});
  expect(await setWin(a,c,'2024-03-01','from','2025-01-01',WF)).toBe('conflict');          // listing date after valid_from
  await q(`update public.issuer_securities set valid_from_method='ticker_change' where ticker=$1`,[c]);
  expect(await setWin(a,c,'2024-03-01','from','2020-01-01',WF)).toBe('conflict');          // method not first_observed/curated
  expect(await setWin(a,await ticker(),'2024-03-01','from','2001-08-27',WF)).toBe('not_found');
  expect(await setWin(randomUUID(),t,'2001-08-27','to','2026-06-30',WT)).toBe('not_found');
  for(const bad of [()=>setWin(a,t,'2001-08-27','from','2000-01-01',WT),()=>setWin(a,t,'2001-08-27','from','2000-01-01',{...WF,...WT}),()=>setWin(a,t,'2001-08-27','x','2000-01-01',WF),
   ()=>setWin(a,t,'2001-08-27','from','2000-01-01',{valid_from:{url:'https://a.example/p?token=1'}}),()=>setWin(a,t,'2001-08-27','from','2000-01-01',{isin:{}})])
   expect(await fails(bad())).toMatchObject({message:'invalid_window_write',code:'22023'});
 });
 const patchProv=(a:string,t:string,from:string,set:unknown,remove:string[],on:Pool|PoolClient=admin)=>
  on.query(`select public.patch_security_provenance($1,$2,$3::date,$4::jsonb,$5::text[]) v`,[a,t,from,JSON.stringify(set),remove]).then(r=>r.rows[0].v as string);
 const PC={pending_change:{first_missing_as_of:'2026-11-02',first_missing_sha256:'a'.repeat(64),first_missing_fetched_at:'2026-11-02T06:00:00.000Z',replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']}};
 it('patch_security_provenance: written / duplicate / not_found / invalid; set and remove only pending_change; closed rows are not found; sec_file_absent close keeps pending_change',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  expect(await patchProv(a,t,'2024-03-01',PC,[])).toBe('written');
  expect(await patchProv(a,t,'2024-03-01',PC,[])).toBe('duplicate');
  expect((await winState(t)).provenance).toEqual({exchange:'Nasdaq',...PC});
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',PC.pending_change.first_missing_sha256,{valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}})).toBe('written');
  expect(await winState(t)).toMatchObject({valid_to:'2026-11-02',valid_to_method:'sec_file_absent',provenance:{exchange:'Nasdaq',...PC,valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}}});
  expect(await patchProv(a,t,'2024-03-01',{},['pending_change'])).toBe('not_found');   // closed
  const u=await ticker();
  await sec(a,u,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  await patchProv(a,u,'2024-03-01',PC,[]);
  expect(await patchProv(a,u,'2024-03-01',{},['pending_change'])).toBe('written');
  expect(await patchProv(a,u,'2024-03-01',{},['pending_change'])).toBe('duplicate');
  expect((await winState(u)).provenance).toEqual({exchange:'Nasdaq'});
  expect(await patchProv(a,await ticker(),'2024-03-01',PC,[])).toBe('not_found');
  expect(await patchProv(randomUUID(),u,'2024-03-01',PC,[])).toBe('not_found');
  for(const bad of [()=>patchProv(a,u,'2024-03-01',{isin:'x'},[]),()=>patchProv(a,u,'2024-03-01',{},['exchange']),()=>patchProv(a,u,'2024-03-01',{pending_change:{url:'https://a.example/p?token=1'}},[]),
  ])
   expect(await fails(bad())).toMatchObject({message:expect.stringMatching(/invalid_(provenance_patch|window_write)/),code:'22023'});
  // set_security_window cannot close as sec_file_absent: there is no method argument any more
  await expect(admin.query(`select public.set_security_window($1,$2,'2024-03-01'::date,'to','2025-01-01'::date,'{"valid_to":{"source":"x"}}'::jsonb,'sec_file_absent')`,[a,u])).rejects.toThrow(/does not exist/);
 });
 const closeAbs=(a:string,t:string,from:string,to:string,sha:string,prov:unknown,on:Pool|PoolClient=admin)=>
  on.query(`select public.close_security_absent($1,$2,$3::date,$4::date,$5,$6::jsonb) v`,[a,t,from,to,sha,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
 const CV={valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}};
 it('close_security_absent: conditional on the pending marker; reappearance between read and close -> conflict; duplicate; invalid; not_found; pending_change kept',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const sha=PC.pending_change.first_missing_sha256;
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',sha,CV)).toBe('conflict');        // no marker yet
  await patchProv(a,t,'2024-03-01',PC,[]);
  expect(await closeAbs(a,t,'2024-03-01','2026-11-03',sha,CV)).toBe('conflict');        // marker's first_missing_as_of differs
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02','b'.repeat(64),CV)).toBe('conflict');   // another run's marker
  await patchProv(a,t,'2024-03-01',{},['pending_change']);                              // reappearance clears the marker after the run read it
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',sha,CV)).toBe('conflict');
  expect(await winState(t)).toMatchObject({valid_to:null,valid_to_method:null,provenance:{exchange:'Nasdaq'}});
  await patchProv(a,t,'2024-03-01',PC,[]);
  expect(await closeAbs(a,t,'2024-03-01','2024-03-01',sha,CV)).toBe('conflict');        // not after valid_from
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',sha,CV)).toBe('written');
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',sha,CV)).toBe('duplicate');
  expect(await winState(t)).toMatchObject({valid_to:'2026-11-02',valid_to_method:'sec_file_absent',provenance:{exchange:'Nasdaq',...PC,...CV}});
  expect(await closeAbs(a,await ticker(),'2024-03-01','2026-11-02',sha,CV)).toBe('not_found');
  expect(await closeAbs(randomUUID(),t,'2024-03-01','2026-11-02',sha,CV)).toBe('not_found');
  for(const bad of [()=>closeAbs(a,t,'2024-03-01','2026-11-02',sha,{isin:{}}),()=>closeAbs(a,t,'2024-03-01','2026-11-02',sha,{...CV,isin:{}}),()=>closeAbs(a,t,'2024-03-01','2026-11-02',sha,{valid_to:{url:'https://a.example/p?token=1'}})])
   expect(await fails(bad())).toMatchObject({message:'invalid_window_write',code:'22023'});
 });
 it('close_security_absent waits behind a concurrent marker removal (row lock) and then conflicts',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const sha=PC.pending_change.first_missing_sha256;
  await patchProv(a,t,'2024-03-01',PC,[]);
  await inTx(admin,async tx=>{
   expect(await patchProv(a,t,'2024-03-01',{},['pending_change'],tx.c)).toBe('written');
   const closing=closeAbs(a,t,'2024-03-01','2026-11-02',sha,CV);
   await stillBlockedBehind(admin,tx.pid,closing);
   await tx.commit();
   expect(await closing).toBe('conflict');
  });
  expect((await winState(t)).valid_to).toBeNull();
 });
 it('set_security_window leaves ONE function after the signature change; a window close is always delisting',async()=>{
  expect(await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='set_security_window'`)).toEqual([{n:1}]);
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null);
  expect(await setWin(a,t,'2024-03-01','to','2025-01-01',{valid_to:{source:'x'}})).toBe('written');
  expect((await winState(t)).valid_to_method).toBe('delisting');
 });
 it('patch_security_provenance interleaved with set_security_identifier (isin) keeps both provenance keys',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const isin='US'+String(Math.floor(Math.random()*1e9)).padStart(9,'0')+'0';
  await Promise.all([patchProv(a,t,'2024-03-01',PC,[]),admin.query(`select public.set_security_identifier($1,$2,'2024-03-01'::date,'isin',$3,$4::jsonb)`,[a,t,isin,JSON.stringify(PI)])]);
  const prov=(await winState(t)).provenance as Record<string,unknown>;
  expect(Object.keys(prov).sort()).toEqual(['exchange',...Object.keys(PI),'pending_change'].sort());
 });
 it('a window write interleaved with an ISIN identifier write on the same row: ISIN first keeps both provenance keys; window first moves the key so the ISIN write finds no row',async()=>{
  const setIsin=(a:string,t:string,from:string,isin:string,on:Pool|PoolClient=admin)=>
   on.query(`select public.set_security_identifier($1,$2,$3::date,'isin',$4,$5::jsonb) v`,[a,t,from,isin,JSON.stringify(PI)]).then(r=>r.rows[0].v as string);
  for(const isinFirst of [true,false]){
   const a=await issuer();const t=await ticker();
   await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'SSE'})});
   const isin=randomIsin();
   await inTx(admin,async tx=>{
    if(isinFirst)expect(await setIsin(a,t,'2024-03-01',isin,tx.c)).toBe('written');
    else expect(await setWin(a,t,'2024-03-01','from','2001-08-27',WF,tx.c)).toBe('written');
    const second=isinFirst?setWin(a,t,'2024-03-01','from','2001-08-27',WF):setIsin(a,t,'2024-03-01',isin);
    await stillBlockedBehind(admin,tx.pid,second);
    await tx.commit();
    expect(await second).toBe(isinFirst?'written':'not_found');
   });
   expect(await winState(t)).toMatchObject({valid_from:'2001-08-27',valid_from_method:'listing_date',provenance:isinFirst?{exchange:'SSE',...PI,...WF}:{exchange:'SSE',...WF}});
   expect((await secState(t)).isin).toBe(isinFirst?isin:null);
  }
 });
 it('set_security_window from: an earlier non-overlapping holding of the ticker (any issuer) that appeared after planning makes it conflict; the advisory lock serialises window writers',async()=>{
  const a=await issuer(),b=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null);
  await sec(b,t,'1990-01-01','1995-01-01',{valid_to_method:'unrecorded'});     // appears between planning and applying
  expect(await setWin(a,t,'2024-03-01','from','2001-08-27',WF)).toBe('conflict');
  expect((await q(`select to_char(valid_from,'YYYY-MM-DD') f from public.issuer_securities where issuer_id=$1 and ticker=$2`,[a,t]))[0].f).toBe('2024-03-01');
  const t2=await ticker();
  await sec(a,t2,'2024-03-01',null);
  await inTx(admin,async tx=>{
   await tx.c.query(`select pg_advisory_xact_lock(hashtext('issuer_securities_ticker:'||$1::text))`,[t2]);
   const second=setWin(a,t2,'2024-03-01','from','2001-08-27',WF);
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('written');
  });
 });
 it('claim attach_security / backdate_window and set_security_window on one ticker serialise on the per-ticker advisory lock (issuer -> row -> advisory)',async()=>{
  // attach: the claim inserts a holding of ANOTHER issuer while it holds the lock; the window write waits for it (an attach is open-ended, so it can only follow)
  const a=await issuer(),b=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01','2025-01-01',{valid_to_method:'curated'});
  const id=await newClaim({issuer:b,id_type:'ticker',value:t,op:'attach_security',target:{issuer_id:b},params:{share_class:'A',valid_from:'2030-01-01',valid_from_method:'curated',source:'x'}});
  await inTx(admin,async tx=>{
   expect(await resolve(id,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
   const second=setWin(a,t,'2024-03-01','from','2001-08-27',WF);
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('written');
  });
  expect((await q(`select issuer_id from public.issuer_securities where ticker=$1 and valid_from_method='listing_date'`,[t])).map(r=>r.issuer_id)).toEqual([a]);   // only the earliest row is marked
  // backdate: the claim holds the lock after locking its row
  const c=await issuer(),d=await issuer();const t2=await ticker();
  await sec(c,t2,'2024-03-01',null);
  await sec(d,t2,'1990-01-01','1995-01-01',{valid_to_method:'curated'});
  const bd=await newClaim({issuer:d,id_type:'ticker',value:t2,op:'backdate_window',target:{issuer_id:d,ticker:t2,valid_from:'1990-01-01'},params:{new_valid_from:'1980-01-01',valid_from_method:'curated'}});
  await inTx(admin,async tx=>{
   expect(await resolve(bd,'accepted',null,REVIEWER,tx.c)).toMatchObject({applied:true});
   const second=setWin(c,t2,'2024-03-01','from','2001-08-27',WF);
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('conflict');
  });
  expect((await q(`select count(*)::int n from public.issuer_securities where ticker=$1 and valid_from_method='listing_date'`,[t2]))[0].n).toBe(0);
 });
 it('set_security_window refuses a backdate into an earlier holding of the same ticker (earliest-row guard, before the exclusion constraint)',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2010-01-01','2015-01-01',{valid_to_method:'unrecorded'});
  await sec(a,t,'2015-01-01',null);
  expect(await setWin(a,t,'2015-01-01','from','2012-01-01',WF)).toBe('conflict');
  expect((await q(`select to_char(valid_from,'YYYY-MM-DD') f from public.issuer_securities where ticker=$1 order by valid_from`,[t])).map(r=>r.f)).toEqual(['2010-01-01','2015-01-01']);
 });
 // Task 4b review P1: the orgId write and its provenance key land in one locked UPDATE.
 const setOrg=(issuerId:string,value:string,prov:unknown,on:Pool|PoolClient=admin,col='cninfo_org_id')=>
  on.query(`select public.set_issuer_identifier($1,$2,$3,$4::jsonb) v`,[issuerId,col,value,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
 const PO={source:'cninfo_topsearch',as_of:'2026-11-05',evidence_sha256:'3'.repeat(64)};
 const issuerState=async(id:string)=>(await q(`select cninfo_org_id,provenance from public.issuers where issuer_id=$1`,[id]))[0];
 it('set_issuer_identifier: written / duplicate / conflict (own value, other issuer holds it) / not_found / not_active / invalid; provenance merged',async()=>{
  const a=await issuer(),b=await issuer();
  await q(`update public.issuers set provenance=$2::jsonb where issuer_id=$1`,[a,JSON.stringify({usci:{source:'test'}})]);
  const org='gssh'+hex(4);
  expect(await setOrg(a,org,PO)).toBe('written');
  expect(await setOrg(a,org,PO)).toBe('duplicate');
  expect(await setOrg(a,'gssh'+hex(4),PO)).toBe('conflict');
  expect(await issuerState(a)).toEqual({cninfo_org_id:org,provenance:{usci:{source:'test'},cninfo_org_id:PO}});
  expect(await setOrg(b,org,PO)).toBe('conflict');                       // unique index: another issuer holds it
  expect((await issuerState(b)).cninfo_org_id).toBeNull();
  expect(await setOrg(randomUUID(),'gssh'+hex(4),PO)).toBe('not_found');
  const c=await issuer();
  await inTx(admin,async tx=>{
   await tx.c.query(`select set_config('entities.allow_topology_write','on',true)`);
   await tx.c.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[c]);
   await tx.commit();
  });
  expect(await setOrg(c,'gssh'+hex(4),PO)).toBe('not_active');
  expect(await fails(setOrg(b,'gssh'+hex(4),PO,admin,'lei'))).toMatchObject({message:'invalid_column',code:'22023'});
  expect(await fails(setOrg(b,'gssh'+hex(4),{source:'x',url:'https://a.example/p?token=1'}))).toMatchObject({message:'invalid_identifier_write',code:'22023'});
  expect(await fails(setOrg(b,'  ',PO))).toMatchObject({message:'invalid_identifier_write'});
 });
 it('set_issuer_identifier interleaved with a provenance update for lei keeps both provenance keys, in either order',async()=>{
  for(const orgFirst of [true,false]){
   const a=await issuer();const org='gssh'+hex(4);
   await q(`update public.issuers set provenance=$2::jsonb where issuer_id=$1`,[a,JSON.stringify({usci:{source:'test'}})]);
   const lei={lei:{source:'later'}};
   await inTx(admin,async tx=>{
    if(orgFirst)expect(await setOrg(a,org,PO,tx.c)).toBe('written');
    else await tx.c.query(`update public.issuers set provenance=provenance||$2::jsonb where issuer_id=$1`,[a,JSON.stringify(lei)]);
    const second=orgFirst?admin.query(`update public.issuers set provenance=provenance||$2::jsonb where issuer_id=$1`,[a,JSON.stringify(lei)]):setOrg(a,org,PO);
    await stillBlockedBehind(admin,tx.pid,second);
    await tx.commit();
    await second;
   });
   expect(await issuerState(a)).toEqual({cninfo_org_id:org,provenance:{usci:{source:'test'},cninfo_org_id:PO,...lei}});
  }
 });
 it('two transactions writing different ISINs to the same empty row: the second returns conflict and the first value stays',async()=>{
  const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
  await sec(a,t,'2020-01-01',null);
  const i1=randomIsin(),i2=randomIsin();
  await inTx(admin,async tx=>{
   expect(await setId(k,'isin',i1,PI,tx.c)).toBe('written');
   const second=setId(k,'isin',i2,PI);
   await stillBlockedBehind(admin,tx.pid,second);
   await tx.commit();
   expect(await second).toBe('conflict');
  });
  expect((await secState(t)).isin).toBe(i1);
 });
});
