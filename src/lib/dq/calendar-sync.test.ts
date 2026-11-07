// src/lib/dq/calendar-sync.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {TushareError} from '../data/sources/tushare';
import type {TushareRaw} from '../data/sources/tushare';
import type {Budget,CalendarFiling,Market} from '../facts/types';
import {memoryRawStore} from './raw-store';
import type {ExpectationRow} from './calendar';
import {CalendarPassError,applyUpstreamCoverage,expectationArgs,parseDisclosureDate,previewCalendar,profileFromSubmissions,runCalendarSync,toCalendarPassError} from './calendar-sync';
import type {CalendarPassDb,CalendarPassToken,CalendarSyncDeps} from './calendar-sync';
import type {SubmissionsView} from './filer-categories';

const A='00000000-0000-4000-8000-0000000000a1',B='00000000-0000-4000-8000-0000000000a2',C='00000000-0000-4000-8000-0000000000a3';
const NOW=new Date('2026-11-05T01:00:00Z');
const budget=(ms=300_000):Budget=>({remainingMs:()=>ms,signal:new AbortController().signal});

/** In-memory model of the four pass functions (same rules as the SQL: one unfinished pass per market, lease, fence on every write). */
function memoryPasses(tables:ReturnType<typeof memoryTableClient>,scope:()=>string[]){
 let leaseValid=true;
 const passes:{market:Market;pass_id:string;claimed_by:string;finished:boolean;status:string}[]=[];
 const fence=(t:CalendarPassToken)=>{const p=passes.find(x=>x.market===t.market&&x.pass_id===t.pass_id);if(!p||p.finished||p.claimed_by!==t.batch_id||!leaseValid)throw new CalendarPassError('fence_failed');return p;};
 const member=async(t:CalendarPassToken,issuer:string)=>(await tables.select('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer}))[0];
 const db:CalendarPassDb&{expire():void;holdBy(market:Market,batch:string):Promise<void>;passes:typeof passes}={
  passes,
  expire(){leaseValid=false;},
  async holdBy(market,batch){await db.claimPass(market,batch);},
  async claimPass(market,batch){
   const open=passes.find(p=>p.market===market&&!p.finished);
   if(open){if(leaseValid&&open.claimed_by!==batch)return null;if(!leaseValid){open.claimed_by=batch;leaseValid=true;return {market,pass_id:open.pass_id,batch_id:batch};}return null;}
   const pass_id=`p${passes.length+1}`;passes.push({market,pass_id,claimed_by:batch,finished:false,status:'running'});leaseValid=true;
   await tables.insert('dq_calendar_passes',{market,pass_id,started_at:NOW.toISOString(),finished_at:null,status:'running'});
   for(const issuer_id of scope())await tables.insert('dq_calendar_pass_members',{market,pass_id,issuer_id,state:'pending',attempts:0});
   return {market,pass_id,batch_id:batch};
  },
  async replaceExpectations(issuer,market,rows,t){
   fence(t);const m=await member(t,issuer);
   if(!m||!(m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<3)))throw new CalendarPassError('member_not_claimable');
   for(const r of tables.rows('dq_filing_expectations').filter(r=>r.issuer_id===issuer&&r.market===market))await tables.update('dq_filing_expectations',{issuer_id:issuer,market,report_kind:r.report_kind,period_end:r.period_end},{deleted:true});
   for(const r of rows)await tables.insert('dq_filing_expectations',{...r,batch_id:t.batch_id});
   await tables.update('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer},{state:'done'});
   return rows.length;
  },
  async failMember(t,issuer,error){fence(t);const m=await member(t,issuer);await tables.update('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id,issuer_id:issuer},{state:'failed',attempts:Number(m.attempts)+1,last_error:error});},
  async finishPass(t){
   const p=fence(t);const ms=await tables.select('dq_calendar_pass_members',{market:t.market,pass_id:t.pass_id});
   if(ms.some(m=>m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<3)))throw new CalendarPassError('pass_incomplete');
   p.finished=true;p.status=ms.every(m=>m.state==='done')?'complete':'complete_with_failures';
   await tables.update('dq_calendar_passes',{market:t.market,pass_id:t.pass_id},{status:p.status,finished_at:NOW.toISOString()});
   return p.status as 'complete'|'complete_with_failures';
  },
 };
 return db;
}

const view=(p:Partial<SubmissionsView>={}):SubmissionsView=>({cik10:'0000000001',sha256:'sub-sha',category:'Large accelerated filer',fiscalYearEnd:'1231',entries:[
 {accessionNumber:'0000000001-26-000020',filingDate:'2026-08-04',reportDate:'2026-06-30',form:'10-Q',primaryDocument:'q2.htm',isInlineXBRL:true},
 {accessionNumber:'0000000001-26-000005',filingDate:'2026-02-20',reportDate:'2025-12-31',form:'10-K',primaryDocument:'k.htm',isInlineXBRL:true},
 {accessionNumber:'0000000001-24-000001',filingDate:'2024-01-10',reportDate:'2023-09-30',form:'10-Q',primaryDocument:'old.htm',isInlineXBRL:true}],...p});
// complete C4 CalendarFiling (FilingRow incl. acceptance_source) before the override spread (plan audit P9)
const published=(issuer:string,form:CalendarFiling['form_type'],periodEnd:string,available:string,p:Partial<CalendarFiling>={}):CalendarFiling=>({filing_id:`f-${issuer.slice(-2)}-${periodEnd}`,issuer_id:issuer,market:'US',source:'edgar',origin:'sec',form_type:form,fiscal_year:null,fiscal_period:null,period_end:periodEnd,available_date:available,source_ref:`ref-${periodEnd}`,url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:`${available}T00:00:00Z`,run_status:'published',accepted_at:null,acceptance_source:null,...p});

async function harness(o:{market?:Market;members?:string[];filings?:Record<string,CalendarFiling[]>;submissions?:(cik:string)=>Promise<SubmissionsView>;disclosure?:(ts:string)=>Promise<TushareRaw>;budgetMs?:number}={}){
 const market=o.market??'US';const members=o.members??[A,B];
 const tables=memoryTableClient({issuer_filing_profiles:['issuer_id','market'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
 for(const [i,id] of members.entries()){
  await tables.insert('issuers',{issuer_id:id,canonical_name_en:`Issuer ${i}`,status:'active'});
  await tables.insert('fact_sync_scope',{issuer_id:id,market,priority:10,fetch_key:market==='US'?`000000000${i+1}`:`60000${i}.SH`});
  if(market==='US')await tables.insert('issuer_securities',{issuer_id:id,ticker:`T${i}`,is_primary:true,valid_from:'2020-01-01',valid_to:null});
  await tables.insert('issuer_filer_categories',{issuer_id:id,fiscal_year:2024,acceleration:'large_accelerated',smaller_reporting:null,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'x',evidence_sha256:'e',as_of:'2026-11-01'});
  await tables.insert('issuer_filer_categories',{issuer_id:id,fiscal_year:2025,acceleration:'large_accelerated',smaller_reporting:null,category_raw:'Large Accelerated Filer',source:'ixbrl_dei',accession:'y',evidence_sha256:'e',as_of:'2026-11-01'});
 }
 const passes=memoryPasses(tables,()=>members);
 const raw=memoryRawStore();
 const deps:CalendarSyncDeps={tables,passes,raw,
  db:{filingsForCalendar:async(issuer,_m,opts)=>{expect(opts.fromPeriodEnd).toBe('2017-11-23');return o.filings?.[issuer]??[];}},
  submissions:o.submissions??(async()=>view()),
  disclosureDate:o.disclosure??(async()=>{throw new TushareError(-1,'TUSHARE_TOKEN not configured');}),
  now:()=>NOW,budget:budget(o.budgetMs),codeVersion:'c'.repeat(40)};
 return {deps,tables,passes,raw,market};
}
const rowsOf=(tables:ReturnType<typeof memoryTableClient>,issuer:string)=>tables.rows('dq_filing_expectations').filter(r=>r.issuer_id===issuer&&!r.deleted) as unknown as ExpectationRow[];

describe('runCalendarSync (US)',()=>{
 it('claims a pass, writes profiles and rows for every member, settles complete and records fresh',async()=>{
  const h=await harness({filings:{[A]:[published(A,'10-Q','2026-06-30','2026-08-03')]}});
  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'success',passId:'p1',passStatus:'complete',counts:{fetched:2,inserted:2,failed:0}});
  expect(h.tables.rows('issuer_filing_profiles').map(p=>[p.issuer_id,p.regime,p.fiscal_year_end,p.week52_pattern,p.category_raw_current,p.source_sha256])).toEqual([[A,'10-K','1231',false,'Large accelerated filer','sub-sha'],[B,'10-K','1231',false,'Large accelerated filer','sub-sha']]);
  const a=rowsOf(h.tables,A);
  expect(a).toHaveLength(6);
  expect(a.find(x=>x.period_end==='2026-06-30')).toMatchObject({disclosure_state:'received',upstream_lookup:'ok'});
  expect(rowsOf(h.tables,B).find(x=>x.period_end==='2026-06-30')).toMatchObject({disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-08-04'});
  expect(a[0].detail).toMatchObject({display:{ticker:'T0',name:'Issuer 0'},upstream_sha256:'sub-sha',rules_version:'filing-calendar/1'});
  expect(r.detail).toMatchObject({pass_id:'p1',issuers_done:2,rows:12,upstream_unavailable:0,no_category:0,no_fiscal_year_end:0,no_profile:0});
  expect(r.detail.by_disclosure_state.received).toBe(1);
  expect(h.tables.rows('dq_freshness')[0]).toMatchObject({dataset:'dq.calendar.us',expected_cadence:'daily',status:'fresh'});
  expect(h.tables.rows('ingest_batches')[0]).toMatchObject({producer:'filing-calendar',dataset:'dq.calendar.us',triggered_by:'cron',tool_versions:{rules:'filing-calendar/1',market:'US'}});
 });
 it('a lease held by another worker → nothing is processed, skipped_summary(pass_claimed), success',async()=>{
  const h=await harness();
  await h.passes.holdBy('US','other-batch');
  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r).toMatchObject({passId:null,passStatus:null,status:'success',counts:{fetched:0}});
  expect(r.errors).toEqual([{code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})}]);
  expect(h.tables.rows('dq_filing_expectations')).toHaveLength(0);
  h.passes.expire();
  const again=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(again).toMatchObject({passId:'p1',passStatus:'complete'});   // expired lease taken over
 });
 it('SEC unavailable → unknown_upstream rows from the stored profile, sec_unavailable makes the batch partial; no profile at all → no rows',async()=>{
  const h=await harness({submissions:async()=>{throw new Error('sec_unavailable: http_503');}});
  await h.tables.upsert('issuer_filing_profiles',{issuer_id:A,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'old',as_of:'2026-10-01'},'issuer_id,market');
  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r.status).toBe('partial');expect(r.passStatus).toBe('complete');
  expect(rowsOf(h.tables,A).every(x=>x.disclosure_state==='unknown_upstream'&&x.profile_as_of==='2026-10-01')).toBe(true);
  expect(rowsOf(h.tables,B)).toHaveLength(0);
  expect(r.detail).toMatchObject({no_profile:1,upstream_unavailable:2});
  expect(r.errors.filter(e=>e.code==='sec_unavailable').map(e=>e.key)).toEqual([A,B]);
 });
 it('upstream coverage is per period: only uncovered periods without evidence read as unavailable (plan audit Q1)',async()=>{
  // earliest entry 2026-02-20: periods ending after it are covered; older ones are not
  const h=await harness({members:[A],submissions:async()=>view({entries:view().entries.slice(0,2)})});
  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  const rows=rowsOf(h.tables,A);
  const at=(pe:string)=>rows.find(x=>x.period_end===pe)!;
  expect(at('2026-06-30')).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-08-04'});
  expect(at('2026-09-30')).toMatchObject({upstream_lookup:'ok',disclosure_state:'pending'});          // covered, nothing filed yet
  expect(at('2026-09-30').detail.upstream_incomplete).toBeUndefined();
  expect(at('2025-12-31')).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-02-20'});   // uncovered, positive evidence kept
  const old=rows.filter(x=>x.period_end<'2025-12-31');
  expect(old.length).toBeGreaterThan(0);
  expect(old.every(x=>x.upstream_lookup==='unavailable'&&x.disclosure_state==='unknown_upstream'&&x.detail.upstream_incomplete===true&&x.detail.upstream_covered_from==='2026-02-20')).toBe(true);
 });
 it('20-F with known 2025/2024 filings and incomplete older history keeps the 2025 and 2024 evidence (plan audit Q1 regression)',async()=>{
  const f20=view({fiscalYearEnd:'1231',category:null,entries:[
   {accessionNumber:'0000000001-26-000003',filingDate:'2026-04-15',reportDate:'2025-12-31',form:'20-F',primaryDocument:'f25.htm',isInlineXBRL:true},
   {accessionNumber:'0000000001-25-000004',filingDate:'2025-04-20',reportDate:'2024-12-31',form:'20-F',primaryDocument:'f24.htm',isInlineXBRL:true}]});
  const h=await harness({members:[A],submissions:async()=>f20});
  await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  const rows=rowsOf(h.tables,A);
  expect(rows.map(x=>x.period_end)).toEqual(['2025-12-31','2024-12-31','2023-12-31','2022-12-31','2021-12-31','2020-12-31']);   // six annual periods reach 2020
  expect(rows.every(x=>x.report_kind==='20-F')).toBe(true);
  expect(rows[0]).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-04-15'});   // was unknown_upstream before Q1
  expect(rows[1]).toMatchObject({upstream_lookup:'ok',disclosure_state:'filed_not_ingested',upstream_filed_date:'2025-04-20'});
  expect(rows.slice(2).every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable'&&x.detail.upstream_incomplete===true)).toBe(true);
  expect(rows.some(x=>x.disclosure_state==='overdue')).toBe(false);
 });
 it('applyUpstreamCoverage: received rows and covered rows unchanged; an empty list leaves only evidence-bearing rows',()=>{
  const row=(pe:string,state:ExpectationRow['disclosure_state'],o:Partial<ExpectationRow>={}):ExpectationRow=>({issuer_id:A,market:'US',report_kind:'10-Q',period_end:pe,period_end_estimated:false,deadline_state:'statutory',due_date:null,due_rule:'r',expected_date:null,upstream_lookup:'ok',upstream_filed_date:null,disclosure_state:state,received_filing_id:null,received_date:null,profile_as_of:null,detail:{estimated_due_passed:true},...o});
  const rows=[row('2026-06-30','overdue'),row('2025-06-30','received',{received_filing_id:'f',received_date:'2025-08-01'}),row('2025-03-31','overdue')];
  const out=applyUpstreamCoverage(rows,[{form:'10-Q',reportDate:'2025-12-31',filingDate:'2026-02-01',accessionNumber:'a'}]);
  expect(out[0]).toBe(rows[0]);expect(out[1]).toBe(rows[1]);
  expect(out[2]).toMatchObject({disclosure_state:'unknown_upstream',upstream_lookup:'unavailable',detail:{upstream_incomplete:true,upstream_covered_from:'2026-02-01'}});
  expect(out[2].detail.estimated_due_passed).toBeUndefined();
  expect(applyUpstreamCoverage(rows,[]).map(r=>r.disclosure_state)).toEqual(['unknown_upstream','received','unknown_upstream']);
 });
 it('budget and limit: unprocessed members keep the pass running; a later run finishes it',async()=>{
  const h=await harness();
  const first=await runCalendarSync(h.deps,{market:'US',limit:1,triggeredBy:'cron'});
  expect(first).toMatchObject({passStatus:'running',counts:{fetched:1,inserted:1}});
  expect(h.tables.rows('dq_freshness')).toHaveLength(0);
  const low=await harness({budgetMs:59_000});
  const none=await runCalendarSync(low.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(none.errors).toContainEqual({code:'deadline_hit',message:JSON.stringify({not_started:2})});
  h.passes.expire();   // the first run's lease lapses before the next run (cron is hours apart)
  const second=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(second).toMatchObject({passId:'p1',passStatus:'complete',counts:{fetched:1}});
 });
 it('a failing member is failed (attempts+1), retried by later runs, and the pass ends complete_with_failures after 3 attempts',async()=>{
  let calls=0;
  const h=await harness({members:[A,B]});
  h.deps.db={filingsForCalendar:async(issuer)=>{if(issuer===B){calls++;throw new Error('boom');}return [];}};
  const r1=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r1).toMatchObject({passStatus:'running',status:'partial',counts:{fetched:2,inserted:1,failed:1}});
  expect(r1.errors).toContainEqual({code:'member_failed',key:B,message:'boom'});
  h.passes.expire();const r2=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r2.counts.fetched).toBe(1);
  h.passes.expire();const r3=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r3.passStatus).toBe('complete_with_failures');
  expect(calls).toBe(3);
  expect(h.tables.rows('dq_freshness')[0]).toMatchObject({dataset:'dq.calendar.us',consecutive_errors:1});
 });
 it('fence_failed on a write stops the worker immediately',async()=>{
  const h=await harness();
  const real=h.passes.replaceExpectations;
  h.passes.replaceExpectations=async(...a)=>{h.passes.expire();return real(...a);};
  const r=await runCalendarSync(h.deps,{market:'US',limit:100,triggeredBy:'cron'});
  expect(r.passStatus).toBe('running');
  expect(r.errors).toContainEqual({code:'fence_failed',key:A});
  expect(r.counts.fetched).toBe(1);
 });
});

describe('runCalendarSync (CN)',()=>{
 it('without TUSHARE_TOKEN every unreceived row is unknown_upstream and the reason is summarised',async()=>{
  const h=await harness({market:'CN',members:[C]});
  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect(r).toMatchObject({status:'success',passStatus:'complete'});
  const rows=rowsOf(h.tables,C);
  expect(rows.map(x=>x.report_kind)).toEqual(['q3','semiannual','q1','annual','q3','semiannual']);
  expect(rows.every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable'&&x.deadline_state==='statutory'&&x.expected_date===null)).toBe(true);
  expect(rows[0].detail).toMatchObject({schedule_unavailable:'no_token',display:{ticker:'600000.SH',name:'Issuer 0'}});
  expect(r.errors).toContainEqual({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify({no_token:1})});
  expect(h.tables.rows('issuer_filing_profiles')[0]).toMatchObject({regime:'cn',fiscal_year_end:'1231',source:'cn_statutory'});
 });
 it('a real response is kept in the bucket with its sha256 but stays unavailable until the semantics are verified',async()=>{
  const bytes=new TextEncoder().encode('{"code":0}');
  const h=await harness({market:'CN',members:[C],disclosure:async(ts)=>{expect(ts).toBe('600000.SH');return {bytes,sha256:'x',httpStatus:200,requestId:null,code:0,msg:'',fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600000.SH','20260701','20260930','20261028',null,null]],hasMore:false};}});
  await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect([...h.raw.objects.keys()].filter(k=>!k.endsWith('.meta.json'))).toHaveLength(1);   // landed raw-store also writes a .meta.json sidecar
  const rows=rowsOf(h.tables,C);
  expect(rows.every(x=>x.upstream_lookup==='unavailable'&&x.detail.schedule_unavailable==='unverified'&&typeof x.detail.upstream_sha256==='string')).toBe(true);
 });
 it('a Tushare API error code (积分不足) is unavailable with the code as reason',async()=>{
  const h=await harness({market:'CN',members:[C],disclosure:async()=>({bytes:new Uint8Array(),sha256:'x',httpStatus:200,requestId:null,code:40203,msg:'',fields:[],items:[],hasMore:false})});
  const r=await runCalendarSync(h.deps,{market:'CN',limit:100,triggeredBy:'cron'});
  expect(r.errors).toContainEqual({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify({api_code_40203:1})});
  expect(h.raw.objects.size).toBe(0);
 });
});

describe('previewCalendar',()=>{
 it('computes rows for scope members without a batch, a pass or a profile write',async()=>{
  const h=await harness();
  const out=await previewCalendar(h.deps,{market:'US',limit:1});
  expect(out.map(o=>[o.issuerId,o.rows.length])).toEqual([[A,6]]);
  expect(h.tables.rows('ingest_batches')).toHaveLength(0);
  expect(h.tables.rows('issuer_filing_profiles')).toHaveLength(0);
  expect(h.tables.rows('dq_calendar_passes')).toHaveLength(0);
 });
});

describe('helpers',()=>{
 it('maps SQL messages to pass error codes',()=>{
  expect(toCalendarPassError({message:'fence_failed'}).code).toBe('fence_failed');
  expect(toCalendarPassError({message:'pass_incomplete'}).code).toBe('pass_incomplete');
  expect(toCalendarPassError({message:'permission denied'}).code).toBe('unknown');
 });
 it('expectationArgs drops issuer_id/market only',()=>{
  const row={issuer_id:A,market:'US',report_kind:'10-K',period_end:'2025-12-31'} as unknown as ExpectationRow;
  expect(expectationArgs([row])).toEqual([{report_kind:'10-K',period_end:'2025-12-31'}]);
 });
 it('parses disclosure_date rows by field name, dates to ISO',()=>{
  expect(parseDisclosureDate({fields:['ts_code','ann_date','end_date','pre_date','actual_date','modify_date'],items:[['600519.SH','20260115','20251231','20260403','20260403',null],['600519.SH',null,'bad',null,null,null]]}))
   .toEqual([{end_date:'2025-12-31',ann_date:'2026-01-15',pre_date:'2026-04-03',actual_date:'2026-04-03',modify_date:null}]);
 });
 it('profile: regime from the latest annual form, 52/53-week detection, no annual form → null',()=>{
  expect(profileFromSubmissions(A,view(),'2026-11-05')).toMatchObject({regime:'10-K',fiscal_year_end:'1231',week52_pattern:false});
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0927',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'0930',entries:[{accessionNumber:'k',filingDate:'2025-10-31',reportDate:'2025-09-27',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.week52_pattern).toBe(true);
  expect(profileFromSubmissions(A,view({entries:[{accessionNumber:'f',filingDate:'2026-04-01',reportDate:'2025-12-31',form:'20-F',primaryDocument:'f',isInlineXBRL:true},{accessionNumber:'k',filingDate:'2025-03-01',reportDate:'2024-12-31',form:'10-K',primaryDocument:'k',isInlineXBRL:true}]}),'2026-11-05')?.regime).toBe('20-F');
  expect(profileFromSubmissions(A,view({entries:[]}),'2026-11-05')).toBeNull();
  expect(profileFromSubmissions(A,view({fiscalYearEnd:'1331'}),'2026-11-05')?.fiscal_year_end).toBeNull();
 });
});
