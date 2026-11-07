// src/lib/dq/calendar-sync.ts
// Filing-calendar writer (spec §6.2; pass protocol T3/U1 via the migration-one functions). One
// ingest_batches row per run (producer filing-calendar, dataset dq.calendar.us|cn). A run claims the
// market's pass (claim_calendar_pass: a new pass freezes its members; an expired lease is taken over;
// a lease held by another worker → this run does nothing, skipped_summary(pass_claimed)). Within the
// budget it processes pending members, then failed members with attempts < 3, in issuer_id order:
// inputs (profile + issuer_filer_categories + filingsForCalendar + upstream list) → computeExpectations →
// replace_filing_expectations (atomic: rows replaced + the issuer profile upserted under the same fence + member done;
// a stale worker therefore writes neither rows nor profile).
// A member whose inputs fail → fail_calendar_member. Any fence_failed stops this worker at once.
// With nothing left to process the pass is settled by finish_calendar_pass (from persisted state only)
// and freshness is recorded: complete → ok, complete_with_failures or a pass older than 2 days → not ok.
// Upstream: US = SEC submissions (raw kept by the fetcher, Task 6); CN = Tushare disclosure_date via
// tushareCallRaw, response bytes into reconcile-raw (T15). Until the disclosure_date semantics are
// verified against a real response (CN_DISCLOSURE_VERIFIED), CN rows keep upstream_lookup='unavailable'.
import type {SupabaseClient} from '@supabase/supabase-js';
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {isCurrentSecurity} from '../entities/resolve';
import {TushareError} from '../data/sources/tushare';
import type {TushareRaw} from '../data/sources/tushare';
import type {Budget,FactsDb,Market} from '../facts/types';
import {emptyCounts,finishBatch,startBatch} from './batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
import {recordAttempt} from './freshness';
import {DATASETS} from './datasets';
import {RawStoreError} from './raw-store';
import type {RawStore} from './raw-store';
import {CALENDAR_RULES_VERSION,computeExpectations,filingsWindowStart} from './calendar';
import type {CalendarUpstream,CnScheduleRow,ExpectationRow,FilerCategoryRow,FilingProfile,UsUpstreamEntry} from './calendar';
import type {SubmissionsView} from './filer-categories';

/** Flip only after docs/audits/2026-11-05-data-foundation-3/verification.md records a real disclosure_date response check (spec §6.1 T15). */
export const CN_DISCLOSURE_VERIFIED=false;
export const DISCLOSURE_FIELDS='ts_code,ann_date,end_date,pre_date,actual_date,modify_date';
export const MIN_MEMBER_MS=60_000;
export const MAX_MEMBER_ATTEMPTS=3;
export const PASS_MAX_AGE_MS=2*86_400_000;

// ---------------------------------------------------------------- pass functions (C5)
export interface CalendarPassToken{market:Market;pass_id:string;batch_id:string}
export type CalendarPassErrorCode='fence_failed'|'pass_incomplete'|'member_not_claimable'|'invalid_rows'|'unknown';
export class CalendarPassError extends Error{constructor(public readonly code:CalendarPassErrorCode,message?:string){super(message??code);this.name='CalendarPassError';}}
const PASS_CODES:readonly CalendarPassErrorCode[]=['fence_failed','pass_incomplete','member_not_claimable','invalid_rows'];
/** SQL raises the code as the message (C5); PostgREST and node-postgres both surface it as error.message. */
export function toCalendarPassError(e:{message?:string}):CalendarPassError{
 const head=(e.message??'').split(/[\s:]/,1)[0];
 return new CalendarPassError((PASS_CODES as readonly string[]).includes(head)?head as CalendarPassErrorCode:'unknown',e.message);
}
export interface CalendarPassDb{
 claimPass(market:Market,batchId:string):Promise<CalendarPassToken|null>;
 /** `profile` is upserted in the same fenced transaction (replace_filing_expectations.p_profile); null leaves the stored profile untouched. */
 replaceExpectations(issuer:string,market:Market,rows:ExpectationRow[],token:CalendarPassToken,profile:FilingProfile|null):Promise<number>;
 failMember(token:CalendarPassToken,issuer:string,error:string):Promise<void>;
 finishPass(token:CalendarPassToken):Promise<'complete'|'complete_with_failures'>;
}
/** p_rows payload: every dq_filing_expectations column except issuer_id/market (the function's own args) and computed_at/batch_id (set by the function from now() and the token). */
export const expectationArgs=(rows:ExpectationRow[])=>rows.map(({issuer_id:_i,market:_m,...r})=>r);
/** p_profile payload: the issuer_filing_profiles columns except issuer_id/market (the function's own args). */
export const profileArgs=(p:FilingProfile|null)=>p?(({issuer_id:_i,market:_m,...r})=>r)(p):null;
export function supabaseCalendarPassDb(client:SupabaseClient):CalendarPassDb{
 const c=client as unknown as {rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message?:string}|null}>};
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw toCalendarPassError(error);return data as T;};
 return {
  claimPass:(market,batch)=>call<CalendarPassToken|null>('claim_calendar_pass',{p_market:market,p_batch:batch}),
  replaceExpectations:(issuer,market,rows,token,profile)=>call<number>('replace_filing_expectations',{p_issuer:issuer,p_market:market,p_rows:expectationArgs(rows),p_pass_token:token,p_profile:profileArgs(profile)}).then(Number),
  failMember:async(token,issuer,error)=>{await call('fail_calendar_member',{p_pass_token:token,p_issuer:issuer,p_error:error.slice(0,500)});},
  finishPass:(token)=>call<'complete'|'complete_with_failures'>('finish_calendar_pass',{p_pass_token:token}),
 };
}

// ---------------------------------------------------------------- deps and receipt
export interface CalendarSyncDeps{
 tables:TableClient;db:Pick<FactsDb,'filingsForCalendar'>;passes:CalendarPassDb;raw:RawStore;
 /** US upstream + profile source; the production fetcher (Task 6 fetchSubmissions) stores the raw JSON and pages. */
 submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
 /** CN upstream: tushareCallRaw('disclosure_date', {ts_code}, DISCLOSURE_FIELDS). */
 disclosureDate:(tsCode:string,b:Budget)=>Promise<TushareRaw>;
 now:()=>Date;budget:Budget;codeVersion:string|null;
}
export interface CalendarSyncOptions{market:Market;limit:number;triggeredBy:TriggeredBy}
export interface CalendarDetail{pass_id:string|null;issuers_done:number;issuers_failed:number;rows:number;by_deadline_state:Record<string,number>;by_disclosure_state:Record<string,number>;upstream_unavailable:number;no_fiscal_year_end:number;no_category:number;no_profile:number}
export interface CalendarReceipt{batchId:string;status:BatchStatus;passId:string|null;passStatus:'running'|'complete'|'complete_with_failures'|null;counts:BatchCounts;errors:BatchError[];detail:CalendarDetail}

const iso=(d:Date)=>d.toISOString().slice(0,10);
const ymd=(s:unknown)=>typeof s==='string'&&/^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:null;
const bump=(m:Record<string,number>,k:string)=>{m[k]=(m[k]??0)+1;};
const errText=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);

/** MMDD against a leap-year calendar (0229 allowed; 0231 / 0431 are not days). */
const validMmdd=(s:string|null):s is string=>{
 if(s===null||!/^\d{4}$/.test(s))return false;
 const m=+s.slice(0,2),d=+s.slice(2);
 return m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(2000,m,0)).getUTCDate();   // 2000 is a leap year
};
/** Profile from SEC submissions: regime = latest original annual form; week52 when the fiscal year end is not a month end or a recent annual period end is not one. */
export function profileFromSubmissions(issuerId:string,v:SubmissionsView,today:string):FilingProfile|null{
 const annual=v.entries.filter(e=>e.form==='10-K'||e.form==='20-F'||e.form==='40-F').sort((a,b)=>b.filingDate.localeCompare(a.filingDate));
 if(annual.length===0)return null;
 const fye=validMmdd(v.fiscalYearEnd)?v.fiscalYearEnd:null;
 const lastDay=(mm:number)=>new Date(Date.UTC(2001,mm,0)).getUTCDate();   // 2001: Feb 28 (29 checked below)
 const fyeIsMonthEnd=fye===null||+fye.slice(2)===lastDay(+fye.slice(0,2))||fye==='0229';
 const reportEndsOff=annual.slice(0,3).some(e=>{if(!e.reportDate)return false;const d=new Date(`${e.reportDate}T00:00:00Z`);return new Date(d.getTime()+86_400_000).getUTCDate()!==1;});
 return {issuer_id:issuerId,market:'US',category_raw_current:v.category,regime:annual[0].form as FilingProfile['regime'],fiscal_year_end:fye,week52_pattern:!fyeIsMonthEnd||reportEndsOff,source:'sec_submissions',source_sha256:v.sha256,as_of:today};
}
export const cnProfile=(issuerId:string,today:string):FilingProfile=>({issuer_id:issuerId,market:'CN',category_raw_current:null,regime:'cn',fiscal_year_end:'1231',week52_pattern:false,source:'cn_statutory',source_sha256:null,as_of:today});
const profileFromRow=(r:Row):FilingProfile=>({issuer_id:String(r.issuer_id),market:r.market as Market,category_raw_current:r.category_raw_current==null?null:String(r.category_raw_current),regime:r.regime as FilingProfile['regime'],fiscal_year_end:r.fiscal_year_end==null?null:String(r.fiscal_year_end),week52_pattern:r.week52_pattern===true,source:String(r.source),source_sha256:r.source_sha256==null?null:String(r.source_sha256),as_of:String(r.as_of)});
const categoryFromRow=(r:Row):FilerCategoryRow=>({issuer_id:String(r.issuer_id),fiscal_year:Number(r.fiscal_year),acceleration:r.acceleration as FilerCategoryRow['acceleration'],smaller_reporting:r.smaller_reporting==null?null:r.smaller_reporting===true,category_raw:String(r.category_raw),source:'ixbrl_dei',accession:String(r.accession),evidence_sha256:String(r.evidence_sha256),as_of:String(r.as_of)});
/** disclosure_date rows from a raw response (field order from the response, dates → ISO). */
export function parseDisclosureDate(raw:Pick<TushareRaw,'fields'|'items'>):CnScheduleRow[]{
 const at=(name:string)=>raw.fields.indexOf(name);
 const [e,a,p,ac,mo]=['end_date','ann_date','pre_date','actual_date','modify_date'].map(at);
 if(e<0)return [];
 return raw.items.flatMap(it=>{const end=ymd(it[e]);return end?[{end_date:end,ann_date:a<0?null:ymd(it[a]),pre_date:p<0?null:ymd(it[p]),actual_date:ac<0?null:ymd(it[ac]),modify_date:mo<0?null:ymd(it[mo])}]:[];});
}

/**
 * Per-period US upstream coverage (plan audit Q1; spec §6.1 "recent 最早条目早于 period_end").
 * The submissions list can prove "nothing filed" for a period only when its earliest entry is before that
 * period's end (every filing for the period comes after the period ends). For each row:
 * - covered (earliest filingDate < period_end) → kept as computed;
 * - positive evidence (received / received_late / filed_not_ingested, i.e. a matching filing or a matching
 *   upstream entry) → kept as computed, whatever the coverage;
 * - otherwise (pending / overdue without coverage) → unknown_upstream, upstream_lookup 'unavailable',
 *   detail.upstream_incomplete=true, detail.upstream_covered_from=earliest filingDate (null for an empty list).
 * Only those rows change; one uncovered old period never rewrites a recent row.
 */
export function applyUpstreamCoverage(rows:ExpectationRow[],entries:readonly UsUpstreamEntry[]):ExpectationRow[]{
 const earliest=entries.map(e=>e.filingDate).sort()[0]??null;
 return rows.map((r):ExpectationRow=>{
  if(earliest!==null&&earliest<r.period_end)return r;
  if(r.disclosure_state!=='pending'&&r.disclosure_state!=='overdue')return r;
  const {estimated_due_passed:_e,...detail}=r.detail;
  return {...r,upstream_lookup:'unavailable',upstream_filed_date:null,disclosure_state:'unknown_upstream',detail:{...detail,upstream_incomplete:true,upstream_covered_from:earliest}};
 });
}

interface MemberResult{profile:FilingProfile|null;rows:ExpectationRow[];upstreamUnavailable:boolean;noProfile:boolean;noFye:boolean;noCategory:boolean;errors:BatchError[];scheduleReason?:string}
async function display(tables:TableClient,issuerId:string,scope:Row|undefined,market:Market,today:string):Promise<{ticker:string|null;name:string|null}>{
 const [issuer]=await tables.select('issuers',{issuer_id:issuerId},{limit:1});
 let ticker:string|null=market==='CN'?(scope?.fetch_key==null?null:String(scope.fetch_key)):null;
 if(market==='US'){const secs=(await selectAll(tables,'issuer_securities',{issuer_id:issuerId},'ticker')).filter(r=>isCurrentSecurity(r,today));ticker=String((secs.find(r=>r.is_primary===true)??secs[0])?.ticker??'')||null;}
 const name=issuer?(issuer.canonical_name_en??issuer.canonical_name_zh??null) as string|null:null;
 return {ticker,name};
}

async function computeMember(deps:CalendarSyncDeps,market:Market,issuerId:string,today:string):Promise<MemberResult>{
 const [scope]=await deps.tables.select('fact_sync_scope',{issuer_id:issuerId,market},{limit:1});
 const fetchKey=scope?.fetch_key==null?'':String(scope.fetch_key);
 const errors:BatchError[]=[];
 let profile:FilingProfile|null=null;let upstream:CalendarUpstream;let scheduleReason:string|undefined;
 let fresh:FilingProfile|null=null;   // written with the fenced replace call only when computed from a live fetch (stored profile reuse → null)
 let view:SubmissionsView|null=null;
 if(market==='US'){
  try{if(!/^\d{10}$/.test(fetchKey))throw new Error('no_cik');view=await deps.submissions(fetchKey,deps.budget);}
  catch(e){errors.push({code:'sec_unavailable',key:issuerId,message:errText(e)});}
  if(view){
   profile=profileFromSubmissions(issuerId,view,today);
   fresh=profile;
   upstream={lookup:'ok',us:view.entries.map(e=>({form:e.form,reportDate:e.reportDate,filingDate:e.filingDate,accessionNumber:e.accessionNumber})),sha256:view.sha256};
  }else upstream={lookup:'unavailable'};
  if(!profile){const [stored]=await deps.tables.select('issuer_filing_profiles',{issuer_id:issuerId,market},{limit:1});if(stored)profile=profileFromRow(stored);}
 }else{
  profile=fresh=cnProfile(issuerId,today);
  upstream={lookup:'unavailable'};
  try{
   if(!/^\d{6}\.(SH|SZ|BJ)$/.test(fetchKey))throw new Error('no_ts_code');
   const raw=await deps.disclosureDate(fetchKey,deps.budget);
   if(raw.code!==0)scheduleReason=`api_code_${raw.code}`;
   else{
    // a storage failure is a real error (member failed, retryable), not an informational upstream gap
    const stored=await deps.raw.put({kind:'tushare-disclosure',bytes:raw.bytes,contentType:'application/json',meta:{api:'disclosure_date',ts_code:fetchKey}},deps.budget).catch((e:unknown)=>{throw e instanceof RawStoreError?e:new RawStoreError('raw_upload_failed',errText(e));});
    if(CN_DISCLOSURE_VERIFIED)upstream={lookup:'ok',cn:parseDisclosureDate(raw),sha256:stored.sha256};
    else{upstream={lookup:'unavailable',sha256:stored.sha256};scheduleReason='unverified';}
   }
  }catch(e){if(e instanceof RawStoreError)throw e;scheduleReason=e instanceof TushareError&&e.code===-1?'no_token':e instanceof Error&&(e.message==='no_ts_code')?'no_ts_code':'error';}
 }
 if(!profile)return {profile:null,rows:[],upstreamUnavailable:upstream.lookup==='unavailable',noProfile:true,noFye:false,noCategory:false,errors,scheduleReason};
 const categories=market==='US'?(await selectAll(deps.tables,'issuer_filer_categories',{issuer_id:issuerId},'fiscal_year')).map(categoryFromRow):[];
 const filings=await deps.db.filingsForCalendar(issuerId,market,{fromPeriodEnd:filingsWindowStart(today)});
 let rows=computeExpectations({profile,categories,filings,upstream,today});
 // US: coverage is per expected period (plan audit Q1); positive evidence is never discarded.
 if(upstream.lookup==='ok'&&market==='US')rows=applyUpstreamCoverage(rows,upstream.us??[]);
 const shown=await display(deps.tables,issuerId,scope,market,today);
 // US: a positive-evidence row cites the submissions page that holds its entry (historical pages have their own bytes); the manifest lists every page used
 // keyed by (accession, filingDate): conflicting copies of one accession can sit on different pages and the selected copy is the one whose date is upstream_filed_date
 const pageOf=new Map<string,SubmissionsView['entries'][number]>();
 for(const e of view?.entries??[]){const k=`${e.accessionNumber}|${e.filingDate}`;if(!pageOf.has(k))pageOf.set(k,e);}
 const manifest=view?(view.pages??[{name:'recent',sha256:view.sha256}]):null;
 rows=rows.map(r=>{
  const hit=typeof r.detail.upstream_accession==='string'?pageOf.get(`${r.detail.upstream_accession}|${r.upstream_filed_date}`):undefined;
  const cite=hit&&hit.pageSha256?{upstream_sha256:hit.pageSha256,upstream_page:hit.page}:upstream.sha256?{upstream_sha256:upstream.sha256,...(manifest?{upstream_page:manifest[0]?.name??'recent'}:{})}:{};
  return {...r,detail:{...r.detail,display:shown,...cite,...(manifest?{upstream_pages:manifest}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}};
 });
 return {profile:fresh,rows,upstreamUnavailable:rows.some(r=>r.upstream_lookup==='unavailable'),noProfile:false,noFye:profile.fiscal_year_end===null,noCategory:rows.some(r=>r.detail.no_category===true),errors,scheduleReason};
}

/**
 * Any throw after startBatch (claim RPC, member-list read, failMember/finishPass storage errors, freshness
 * write) must not leave the batch 'running': the error is recorded as run_aborted, the batch is finished
 * (best effort: the storage that failed may be the batch table itself) and the error rethrown. The pass is
 * never finished on an infrastructure error — it stays leased/resumable and the next run takes it over.
 */
export async function runCalendarSync(deps:CalendarSyncDeps,opts:CalendarSyncOptions):Promise<CalendarReceipt>{
 const aborted:{counts:BatchCounts;errors:BatchError[];batchId:string|null}={counts:emptyCounts(),errors:[],batchId:null};
 try{return await runCalendarSyncInner(deps,opts,aborted);}
 catch(e){
  if(aborted.batchId){
   aborted.errors.push({code:'run_aborted',message:errText(e)});
   try{await finishBatch(deps.tables,aborted.batchId,{counts:aborted.counts,errors:aborted.errors},deps.now());}catch{/* batch already finished or storage down: the original error wins */}
  }
  throw e;
 }
}
async function runCalendarSyncInner(deps:CalendarSyncDeps,opts:CalendarSyncOptions,shared:{counts:BatchCounts;errors:BatchError[];batchId:string|null}):Promise<CalendarReceipt>{
 const {market}=opts;

 const {counts,errors}=shared;const schedule:Record<string,number>={};
 const detail:CalendarDetail={pass_id:null,issuers_done:0,issuers_failed:0,rows:0,by_deadline_state:{},by_disclosure_state:{},upstream_unavailable:0,no_fiscal_year_end:0,no_category:0,no_profile:0};
 const {batchId}=await startBatch(deps.tables,{producer:'filing-calendar',dataset:DATASETS.calendar(market),toolVersions:{rules:CALENDAR_RULES_VERSION,market},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy});
 shared.batchId=batchId;
 const finish=async(passId:string|null,passStatus:CalendarReceipt['passStatus']):Promise<CalendarReceipt>=>{
  if(Object.keys(schedule).length)errors.push({code:'skipped_summary',key:'schedule_unavailable',message:JSON.stringify(schedule)});
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  return {batchId,status,passId,passStatus,counts,errors,detail};
 };
 const token=await deps.passes.claimPass(market,batchId);
 if(!token){errors.push({code:'skipped_summary',key:'pass',message:JSON.stringify({pass_claimed:1})});return finish(null,null);}
 detail.pass_id=token.pass_id;
 const now=deps.now();const today=iso(now);
 const members=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
 const todo=[...members.filter(m=>m.state==='pending'),...members.filter(m=>m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)].map(m=>String(m.issuer_id)).slice(0,opts.limit);
 let fenced=false;
 for(const [i,issuer] of todo.entries()){
  if(deps.budget.remainingMs()<MIN_MEMBER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:todo.length-i})});break;}
  counts.fetched++;
  let result:MemberResult;
  try{result=await computeMember(deps,market,issuer,today);}
  catch(e){
   counts.failed++;detail.issuers_failed++;errors.push({code:e instanceof RawStoreError?'raw_upload_failed':'member_failed',key:issuer,message:errText(e)});
   try{await deps.passes.failMember(token,issuer,errText(e));}
   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
   continue;
  }
  try{await deps.passes.replaceExpectations(issuer,market,result.rows,token,result.profile);}
  catch(e){
   if(e instanceof CalendarPassError&&e.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}
   counts.failed++;detail.issuers_failed++;errors.push({code:'member_failed',key:issuer,message:errText(e)});
   try{await deps.passes.failMember(token,issuer,errText(e));}
   catch(f){if(f instanceof CalendarPassError&&f.code==='fence_failed'){fenced=true;errors.push({code:'fence_failed',key:issuer});break;}throw f;}
   continue;
  }
  counts.inserted++;detail.issuers_done++;detail.rows+=result.rows.length;
  errors.push(...result.errors);
  if(result.scheduleReason)bump(schedule,result.scheduleReason);
  if(result.upstreamUnavailable)detail.upstream_unavailable++;
  if(result.noProfile)detail.no_profile++;
  if(result.noFye)detail.no_fiscal_year_end++;
  if(result.noCategory)detail.no_category++;
  for(const r of result.rows){bump(detail.by_deadline_state,r.deadline_state);bump(detail.by_disclosure_state,r.disclosure_state);}
 }
 if(fenced)return finish(token.pass_id,'running');
 const after=await selectAll(deps.tables,'dq_calendar_pass_members',{market,pass_id:token.pass_id},'issuer_id');
 if(after.some(m=>m.state==='pending'||(m.state==='failed'&&Number(m.attempts)<MAX_MEMBER_ATTEMPTS)))return finish(token.pass_id,'running');
 let passStatus:'complete'|'complete_with_failures';
 try{passStatus=await deps.passes.finishPass(token);}
 catch(e){if(e instanceof CalendarPassError&&(e.code==='fence_failed'||e.code==='pass_incomplete')){errors.push({code:e.code,key:token.pass_id});return finish(token.pass_id,'running');}throw e;}
 const [pass]=await deps.tables.select('dq_calendar_passes',{market,pass_id:token.pass_id},{limit:1});
 const startedAt=String(pass?.started_at??now.toISOString()),finishedAt=String(pass?.finished_at??deps.now().toISOString());
 const tooLong=Date.parse(finishedAt)-Date.parse(startedAt)>PASS_MAX_AGE_MS;
 await recordAttempt(deps.tables,DATASETS.calendar(market),{ok:passStatus==='complete'&&!tooLong,cadence:'daily',now:deps.now(),detail:{pass_id:token.pass_id,started_at:startedAt,finished_at:finishedAt,status:passStatus,...(tooLong?{pass_too_long:true}:{})}});
 return finish(token.pass_id,passStatus);
}

/** Read-only preview for scripts (no batch, no pass, no profile write; deps.raw should be a memory store): the rows each scope member would get. */
export async function previewCalendar(deps:CalendarSyncDeps,opts:{market:Market;issuerIds?:string[];limit:number}):Promise<{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]>{
 const now=deps.now();
 const scope=(await selectAll(deps.tables,'fact_sync_scope',{market:opts.market},'issuer_id')).filter(r=>opts.issuerIds?opts.issuerIds.includes(String(r.issuer_id)):Number(r.priority)>0);
 const out:{issuerId:string;rows:ExpectationRow[];errors:BatchError[]}[]=[];
 for(const r of scope.slice(0,opts.issuerIds?undefined:opts.limit)){
  const m=await computeMember(deps,opts.market,String(r.issuer_id),iso(now));
  out.push({issuerId:String(r.issuer_id),rows:m.rows,errors:m.errors});
 }
 return out;
}
