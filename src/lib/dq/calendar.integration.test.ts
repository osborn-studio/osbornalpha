// src/lib/dq/calendar.integration.test.ts
// F3-7 (spec §6.1/§6.2, §9.3; critical): the filing calendar end to end on real PostgreSQL — the
// migration-one pass functions (claim / replace / fail / finish), pgFactsDb.filingsForCalendar, profile
// writes and the rules: filed_not_ingested (a staged filing is not received), unknown_upstream (SEC
// down → stored profile; CN without a Tushare token), a 52/53-week estimated row replaced by the actual
// period end on the next pass, and a second worker that cannot take an active pass (the old lease
// holder is fenced out after the takeover). Rows are never cleaned up: test:db creates a fresh
// database per run and every test uses its own issuers.
// The calendar pass is global per market and test:db runs files in parallel: this suite holds the
// session advisory lock CALENDAR_TEST_LOCK for its whole run (every suite that claims calendar passes
// must do the same, plan 3 Part E contract note 7) and first drains any pass another suite left open.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {TushareError} from '../data/sources/tushare';
import {pgFactsDb} from '../facts/pg-facts-db';
import type {Market} from '../facts/types';
import {expectationArgs,profileArgs,runCalendarSync,toCalendarPassError} from './calendar-sync';
import type {CalendarPassDb,CalendarPassToken,CalendarReceipt,CalendarSyncDeps} from './calendar-sync';
import type {SubmissionsEntryView,SubmissionsView} from './filer-categories';
import {memoryRawStore} from './raw-store';

const enabled=!!process.env.S4_TEST_STATE;
const CALENDAR_TEST_LOCK=724_311_001;
const NOW=new Date('2026-11-05T01:00:00Z');
// the profile/evidence sha256 columns require real 64-hex digests
const SHA_X='a'.repeat(64),SHA_Z='b'.repeat(64);

/** The four pass functions over node-postgres, errors mapped exactly like the Supabase adapter. */
function pgPasses(pool:Pool):CalendarPassDb{
 const fn=async<T>(call:string,values:unknown[]):Promise<T>=>{
  try{return (await pool.query(`select ${call} as v`,values)).rows[0].v as T;}
  catch(e){throw toCalendarPassError(e as {message?:string});}
 };
 return {
  claimPass:(market,batch)=>fn<CalendarPassToken|null>('public.claim_calendar_pass($1,$2)',[market,batch]),
  replaceExpectations:(issuer,market,rows,token,profile)=>fn<number>('public.replace_filing_expectations($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)',[issuer,market,JSON.stringify(expectationArgs(rows)),JSON.stringify(token),profile?JSON.stringify(profileArgs(profile)):null]).then(Number),
  failMember:async(token,issuer,error)=>{await fn('public.fail_calendar_member($1::jsonb,$2,$3)',[JSON.stringify(token),issuer,error]);},
  finishPass:(token)=>fn<'complete'|'complete_with_failures'>('public.finish_calendar_pass($1::jsonb)',[JSON.stringify(token)]),
 };
}
const entry=(form:string,reportDate:string,filingDate:string,accn=randomUUID()):SubmissionsEntryView=>({accessionNumber:accn,filingDate,reportDate,form,primaryDocument:`${accn}.htm`,isInlineXBRL:true});

describe.skipIf(!enabled)('F3-7 filing calendar on real PostgreSQL',()=>{
 let admin:Pool;let lock:PoolClient;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const newBatch=async(producer:string,dataset:string)=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,$2,$3)`,[id,producer,dataset]);return id;};
 const newIssuer=async(name:string)=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
 const inScope=(market:Market,issuer:string,fetchKey:string)=>q(`insert into public.fact_sync_scope(issuer_id,market,reasons,priority,fetch_key) values($1,$2,'["test"]'::jsonb,10,$3)`,[issuer,market,fetchKey]);
 const category=(issuer:string,fy:number,acceleration='large_accelerated')=>q(`insert into public.issuer_filer_categories(issuer_id,fiscal_year,acceleration,smaller_reporting,category_raw,source,accession,evidence_sha256,as_of) values($1,$2,$3,null,'Large Accelerated Filer','ixbrl_dei',$4,$5,'2026-11-01')`,[issuer,fy,acceleration,`acc-${fy}`,'e'.repeat(64)]);
 /** One run for the issuer: lease → begin → stage filings (+ one fact each) → publish and release, or leave staged. */
 async function filingRun(issuer:string,filings:{form:string;periodEnd:string;available:string}[],publish:boolean):Promise<string[]>{
  const b=await newBatch('facts-sync','facts.us');
  expect((await q(`select public.claim_fact_sync_lease($1,'US',$2,600) v`,[issuer,b]))[0].v).toBe(true);
  const run=(await q(`select public.begin_sync_run($1,'US',$2,1) v`,[issuer,b]))[0].v as string;
  const rows=filings.map(f=>({filing_id:randomUUID(),source:'edgar',origin:'sec',form_type:f.form,fiscal_year:null,fiscal_period:null,period_end:f.periodEnd,available_date:f.available,source_ref:randomUUID(),url:null}));
  const map=(await q(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify(rows)]))[0].v as Record<string,string>;
  const ids=rows.map(r=>map[r.source_ref]);
  const facts=rows.map((r,i)=>({fact_id:randomUUID(),filing_id:ids[i],concept:'total_assets',source_concept:'Assets',statement:'BS',period_start:null,period_end:r.period_end,duration:'INSTANT',value:'1',unit:'USD',consolidation:'consolidated',available_date:r.available_date,mapping_version:'facts-map/1',raw_hash:'h'}));
  await q(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(facts)]);
  if(publish){
   await q(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,ids]);
   await q(`select public.release_fact_sync_lease($1,'US',$2,'success',now() + interval '7 days')`,[issuer,b]);
  }
  return ids;
 }
 const deps=(submissions:Record<string,SubmissionsView>):CalendarSyncDeps=>({
  tables:pgTableClient(admin),db:pgFactsDb(admin),passes:pgPasses(admin),raw:memoryRawStore(),
  submissions:async(cik10)=>{const v=submissions[cik10];if(!v)throw new Error('sec_unavailable: not in fixture');return v;},
  disclosureDate:async()=>{throw new TushareError(-1,'TUSHARE_TOKEN not configured');},
  now:()=>NOW,budget:{remainingMs:()=>3_600_000,signal:new AbortController().signal},codeVersion:'c'.repeat(40),
 });
 /** Expire any open pass lease of the market (we hold CALENDAR_TEST_LOCK) and run until the pass settles. */
 async function drain(market:Market,d:CalendarSyncDeps):Promise<CalendarReceipt>{
  for(let i=0;i<6;i++){
   await q(`update public.dq_calendar_passes set claim_until = clock_timestamp() - interval '1 second' where market = $1 and finished_at is null`,[market]);
   const r=await runCalendarSync(d,{market,limit:1000,triggeredBy:'script'});
   if(r.passStatus==='complete'||r.passStatus==='complete_with_failures')return r;
  }
  throw new Error(`calendar pass for ${market} did not settle`);
 }
 const rows=async(issuer:string)=>q(`select report_kind, period_end::text, period_end_estimated, deadline_state, due_date::text, due_rule, upstream_lookup, upstream_filed_date::text, disclosure_state, received_filing_id, detail from public.dq_filing_expectations where issuer_id = $1 order by period_end desc`,[issuer]);
 const at=(rs:Record<string,any>[],pe:string)=>{const r=rs.find(x=>x.period_end===pe);if(!r)throw new Error(`no row ${pe}: ${rs.map(x=>x.period_end).join(',')}`);return r;};

 let X:string,Y:string,Z:string,W:string;let xPublished:string;
 const CIK={X:'0000000901',Y:'0000000902',Z:'0000000903'};
 const coverage=entry('10-Q','2023-09-30','2023-11-01');   // proves the upstream list reaches back before every expected period
 const submissions:Record<string,SubmissionsView>={};

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  lock=await admin.connect();
  await lock.query('select pg_advisory_lock($1)',[CALENDAR_TEST_LOCK]);
  for(const m of ['US','CN'] as Market[])
   if((await q(`select 1 from public.dq_calendar_passes where market = $1 and finished_at is null`,[m])).length)await drain(m,deps({}));
  // X: month-end filer; Q2 2026 received, Q1 2026 only staged but listed by SEC.
  X=await newIssuer('ZZ Calendar X');await inScope('US',X,CIK.X);await category(X,2024);await category(X,2025);
  [xPublished]=await filingRun(X,[{form:'10-Q',periodEnd:'2026-06-30',available:'2026-08-03'}],true);
  await filingRun(X,[{form:'10-Q',periodEnd:'2026-03-31',available:'2026-05-01'}],false);
  submissions[CIK.X]={cik10:CIK.X,sha256:SHA_X,category:'Large accelerated filer',fiscalYearEnd:'1231',entries:[entry('10-Q','2026-06-30','2026-08-03'),entry('10-Q','2026-03-31','2026-05-01'),entry('10-K','2025-12-31','2026-02-20'),coverage]};
  // Y: SEC unavailable, a profile stored by an earlier run.
  Y=await newIssuer('ZZ Calendar Y');await inScope('US',Y,CIK.Y);await category(Y,2024);await category(Y,2025);
  await q(`insert into public.issuer_filing_profiles(issuer_id,market,category_raw_current,regime,fiscal_year_end,week52_pattern,source,source_sha256,as_of) values($1,'US',null,'10-K','1231',false,'sec_submissions','${'0'.repeat(64)}','2026-10-01')`,[Y]);
  // Z: 52/53-week filer (fiscal year ends late September).
  Z=await newIssuer('ZZ Calendar Z');await inScope('US',Z,CIK.Z);await category(Z,2024);await category(Z,2025);
  await filingRun(Z,[{form:'10-K',periodEnd:'2025-09-27',available:'2025-10-31'},{form:'10-Q',periodEnd:'2025-06-28',available:'2025-08-01'},{form:'10-Q',periodEnd:'2025-03-29',available:'2025-05-02'},{form:'10-Q',periodEnd:'2024-12-28',available:'2025-01-31'}],true);
  submissions[CIK.Z]={cik10:CIK.Z,sha256:SHA_Z,category:'Large accelerated filer',fiscalYearEnd:'0927',entries:[entry('10-K','2025-09-27','2025-10-31'),entry('10-Q','2025-06-28','2025-08-01'),coverage]};
  // W: CN issuer, no Tushare token.
  W=await newIssuer('ZZ Calendar W');await inScope('CN',W,'600999.SH');
 },120_000);
 afterAll(async()=>{
  if(lock){await lock.query('select pg_advisory_unlock($1)',[CALENDAR_TEST_LOCK]).catch(()=>{});lock.release();}
  await admin?.end();
 });

 it('a second worker cannot take an active pass; after the lease lapses it takes over and the old holder is fenced out',async()=>{
  const a=await newBatch('filing-calendar','dq.calendar.us');
  const tokenA=(await q(`select public.claim_calendar_pass('US',$1) v`,[a]))[0].v as CalendarPassToken;
  expect(tokenA).toMatchObject({market:'US',batch_id:a});
  const members=(await q(`select issuer_id from public.dq_calendar_pass_members where market = 'US' and pass_id = $1`,[tokenA.pass_id])).map(r=>r.issuer_id);
  expect(members).toEqual(expect.arrayContaining([X,Y,Z]));
  const d=deps(submissions);
  const blocked=await runCalendarSync(d,{market:'US',limit:1000,triggeredBy:'script'});
  expect(blocked).toMatchObject({passId:null,passStatus:null,status:'success'});
  expect(blocked.errors).toContainEqual({code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})});
  expect(Number((await q(`select count(*)::int n from public.dq_filing_expectations where issuer_id = any($1::uuid[])`,[[X,Y,Z]]))[0].n)).toBe(0);
  const done=await drain('US',d);
  expect(done.passId).toBe(tokenA.pass_id);
  await expect(pgPasses(admin).replaceExpectations(X,'US',[],tokenA,null)).rejects.toMatchObject({code:'fence_failed'});
  await expect(pgPasses(admin).finishPass(tokenA)).rejects.toMatchObject({code:'fence_failed'});
  const fresh=(await q(`select detail from public.dq_freshness where dataset = 'dq.calendar.us'`))[0];
  expect(fresh.detail.pass_id).toBe(tokenA.pass_id);
 },120_000);

 it('filed_not_ingested when SEC lists a report whose filing is only staged; received, pending and overdue around it; profile written',async()=>{
  const r=await rows(X);
  expect(r.map(x=>x.period_end)).toEqual(['2026-09-30','2026-06-30','2026-03-31','2025-12-31','2025-09-30','2025-06-30']);
  expect(at(r,'2026-06-30')).toMatchObject({disclosure_state:'received',received_filing_id:xPublished,upstream_lookup:'ok'});
  expect(at(r,'2026-03-31')).toMatchObject({disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-05-01',received_filing_id:null});
  expect(at(r,'2025-12-31')).toMatchObject({report_kind:'10-K',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-02-20'});
  expect(at(r,'2026-09-30')).toMatchObject({disclosure_state:'pending',deadline_state:'statutory',due_date:'2026-11-09',due_rule:'us.laf/1'});
  expect(at(r,'2025-09-30').disclosure_state).toBe('overdue');
  expect(at(r,'2026-09-30').detail).toMatchObject({rules_version:'filing-calendar/1',display:{name:'ZZ Calendar X'},upstream_sha256:SHA_X});
  const profile=(await q(`select regime, fiscal_year_end, week52_pattern, category_raw_current, source_sha256 from public.issuer_filing_profiles where issuer_id = $1 and market = 'US'`,[X]))[0];
  expect(profile).toEqual({regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,category_raw_current:'Large accelerated filer',source_sha256:SHA_X});
 });

 it('unknown_upstream, never overdue: SEC down (stored profile) and CN without a Tushare token',async()=>{
  const y=await rows(Y);
  expect(y).toHaveLength(6);
  expect(y.every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable')).toBe(true);
  expect((await q(`select source_sha256 from public.issuer_filing_profiles where issuer_id = $1 and market = 'US'`,[Y]))[0].source_sha256).toBe('0'.repeat(64));   // stored profile untouched when SEC is down (p_profile null)
  const done=await drain('CN',deps({}));
  expect(done.passStatus).toBe('complete');
  const w=await rows(W);
  expect(w.map(x=>x.report_kind)).toEqual(['q3','semiannual','q1','annual','q3','semiannual']);
  expect(w.every(x=>x.disclosure_state==='unknown_upstream'&&x.deadline_state==='statutory'&&x.detail.schedule_unavailable==='no_token')).toBe(true);
  expect(at(w,'2025-12-31')).toMatchObject({due_date:'2026-04-30',due_rule:'cn.annual/1'});
  expect(done.errors).toContainEqual(expect.objectContaining({code:'skipped_summary',key:'schedule_unavailable'}));
 },120_000);

 it('52/53-week: the estimated row is replaced by the actual period end once the filing is received',async()=>{
  const before=await rows(Z);
  expect(at(before,'2026-06-27')).toMatchObject({period_end_estimated:true,deadline_state:'estimated',due_rule:'us.laf/1/est',disclosure_state:'pending'});
  expect(at(before,'2026-06-27').detail.estimated_due_passed).toBe(true);
  expect(before.some(x=>x.disclosure_state==='overdue'&&x.period_end_estimated)).toBe(false);
  const [actual]=await filingRun(Z,[{form:'10-Q',periodEnd:'2026-07-03',available:'2026-08-05'}],true);
  await drain('US',deps(submissions));
  const after=await rows(Z);
  expect(after.find(x=>x.period_end==='2026-06-27')).toBeUndefined();
  expect(at(after,'2026-07-03')).toMatchObject({period_end_estimated:false,deadline_state:'statutory',due_rule:'us.laf/1',due_date:'2026-08-12',disclosure_state:'received',received_filing_id:actual});
 },120_000);

 it('replace_filing_expectations refuses a member that is already done in the current pass (no second advance)',async()=>{
  const b=await newBatch('filing-calendar','dq.calendar.us');
  const token=(await q(`select public.claim_calendar_pass('US',$1) v`,[b]))[0].v as CalendarPassToken;
  expect(token).not.toBeNull();
  const p=pgPasses(admin);
  expect(await p.replaceExpectations(X,'US',[],token,null)).toBe(0);
  await expect(p.replaceExpectations(X,'US',[],token,null)).rejects.toMatchObject({code:'member_not_claimable'});
  await drain('US',deps(submissions));   // settle the pass so later suites start clean
 },120_000);
});
