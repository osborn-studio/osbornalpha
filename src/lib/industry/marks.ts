// src/lib/industry/marks.ts
// Security-level marks (spec §6.1): close and total share per A-share ticker per trade date, written
// only through apply_observations('marks') as versioned observations. runMarks, per trade date (the
// caller passes the expected dates explicitly; trade_cal is deferred with I-3):
//  1. beginFetchEvent('marks', {trade_date}, batch) ONCE — a new network fetch is a new event;
//  2. fetchDailyBasic(date) (injected: Task 5's providers/tushare-industry.ts adapter in production,
//     fixtures in tests); an empty response → skipped_summary(no_rows);
//  3. planMarkRows (pure): tickers not in stocks_universe → skipped (not_in_universe); unknown
//     exchange suffix → skipped (unknown_exchange); missing/non-positive close or total_share →
//     rejected (the table CHECKs close > 0, total_share > 0); total_share 万股 × 10000 → shares
//     (transform wan_to_unit, exact decimal; total_share = all classes A+H+B, spec 7th draft K2); free_share
//     万股 × 10000 into security_marks.free_share (null when missing/non-positive; K1) — part of the observation
//     content, so a free_share revision is a new observation; upstream from the ts_code suffix SH→sse, SZ→szse, BJ→bse;
//     rules identityRule('mcap_vs_tushare', close×total_share, total_mv×10000, 0.001) (same-source
//     arithmetic consistency, not an independent check) and rangeRule('close_range', close, 0.01,
//     100000) — a failure keeps the row as an observation with status 'quarantined' and parks a
//     dq_quarantine item (mcap_mismatch / close_range); rule evaluation is the only place a JS number
//     is used (rules.ts takes numbers), stored values stay decimal strings; raw_hash =
//     sha256(canonical {api, page_sha256, page, row}) is evidence only, never identity;
//  4. revisions (content differs from the current ok observation) are quarantined as mark_revised by
//     apply_observations itself, in the same transaction (Task 2 SQL / Task 3 memory) — not here;
//  5. applyObservations('marks', event, rows) in chunks; a failed chunk is retried with the SAME event
//     (retryFetchEvent, attempt + 1) up to maxApplyAttempts: receipts make already-applied keys
//     duplicates (V7); fetch_event_payload_changed is never retried.
// recordAttempt('industry.marks', weekly) and finishBatch close the receipt. Counts: fetched = rows
// received; inserted/versioned/duplicates from the apply results; quarantined = rule failures
// parked (those rows are also observations); failed = rejected rows and failed dates.
import type {TriggeredBy,BatchCounts,BatchError,BatchStatus} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {identityRule,rangeRule} from '../dq/rules';
import type {RuleResult} from '../dq/rules';
import {selectAll} from '../db/table-client';
import {canonicalDecimal} from '../facts/json-numbers';
import {canonicalJson,sha256Hex} from './canonical-json';
import {decCmp,decMul,isDecimal} from './decimal';
import {assertDay} from './method';
import {IndustryDbError} from './types';
import type {IndustryDeps,MarkInput,ObservationResult} from './types';

export const MARKS_DATASET='industry.marks';
export const MARKS_SOURCE='tushare:daily_basic';
export const MARKS_JOB='marks';
const APPLY_CHUNK=500;

/** One daily_basic row as the adapter decoded it (numbers as canonical decimal strings, never JS numbers). */
export interface DailyBasicRow{ts_code:string;trade_date:string;close:string|null;total_share:string|null;free_share:string|null;total_mv:string|null;page:number;row:number;page_sha256:string}
export interface DailyBasicFetch{trade_date:string;rows:DailyBasicRow[];pages:number}
export type MarksDeps=Pick<IndustryDeps,'tables'|'db'|'now'|'codeVersion'>&{fetchDailyBasic:(tradeDate:string)=>Promise<DailyBasicFetch>};
export interface MarksOptions{tradeDates:string[];triggeredBy?:TriggeredBy;maxApplyAttempts?:number}
export interface PlannedQuarantine{ticker:string;trade_date:string;reason:'mcap_mismatch'|'close_range';detail:Record<string,unknown>}
export interface MarkPlan{rows:MarkInput[];quarantined:PlannedQuarantine[];skipped:Record<string,number>;rejected:{ticker:string;reason:string}[]}
export interface MarksDateOutcome{trade_date:string;fetch_event_id:string|null;fetched:number;result:ObservationResult|null;attempts:number;skipped:Record<string,number>;error?:string}
export interface MarksReceipt{status:'done'|'rejected';code?:string;batchId:string|null;batchStatus:BatchStatus|null;counts:BatchCounts;errors:BatchError[];dates:MarksDateOutcome[]}

const RULE_REASON:Record<string,PlannedQuarantine['reason']>={mcap_vs_tushare:'mcap_mismatch',close_range:'close_range'};
const norm=(t:string)=>t.trim().toUpperCase();
/** Exchange of an A-share ts_code from its suffix; null for anything else. */
export function upstreamOf(tsCode:string):'sse'|'szse'|'bse'|null{
 const t=norm(tsCode);return t.endsWith('.SH')?'sse':t.endsWith('.SZ')?'szse':t.endsWith('.BJ')?'bse':null;
}
const ymd=(d:string)=>/^\d{8}$/.test(d)?`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`:d;
const positive=(v:string|null):v is string=>v!==null&&isDecimal(v)&&decCmp(v,'0')>0;

/** Pure: one fetched day → observation rows, rule outcomes, skips and rejections (sorted by ticker). */
export function planMarkRows(fetch:DailyBasicFetch,universe:ReadonlySet<string>):MarkPlan{
 const plan:MarkPlan={rows:[],quarantined:[],skipped:{},rejected:[]};
 const skip=(k:string)=>{plan.skipped[k]=(plan.skipped[k]??0)+1;};
 const seen=new Set<string>();
 for(const r of fetch.rows){
  const ticker=norm(r.ts_code);
  if(!universe.has(ticker)){skip('not_in_universe');continue;}
  const upstream=upstreamOf(ticker);
  if(!upstream){skip('unknown_exchange');continue;}
  if(ymd(r.trade_date)!==fetch.trade_date){plan.rejected.push({ticker,reason:'date_mismatch'});continue;}
  if(seen.has(ticker)){plan.rejected.push({ticker,reason:'duplicate_row'});continue;}
  seen.add(ticker);
  if(!positive(r.close)||!positive(r.total_share)){plan.rejected.push({ticker,reason:'invalid_value'});continue;}
  const close=canonicalDecimal(r.close),totalShare=decMul(r.total_share,'10000');   // 万股 → shares (A+H+B, K2)
  const freeShare=positive(r.free_share)?decMul(r.free_share,'10000'):null;          // 万股 → shares; missing/non-positive → null (K1)
  const mcap=decMul(close,totalShare);
  const tushareMcap=r.total_mv!==null&&isDecimal(r.total_mv)?decMul(r.total_mv,'10000'):null;   // 万元 → yuan
  const results:RuleResult[]=[identityRule('mcap_vs_tushare',Number(mcap),tushareMcap===null?null:Number(tushareMcap),0.001),rangeRule('close_range',Number(close),0.01,100000)];
  const failed=results.filter(x=>!x.passed);
  for(const f of failed)plan.quarantined.push({ticker,trade_date:fetch.trade_date,reason:RULE_REASON[f.ruleId],detail:{rule:f.ruleId,...(f.detail??{}),close,total_share:totalShare,market_cap:mcap,tushare_market_cap:tushareMcap}});
  const locator={api:'daily_basic',trade_date:fetch.trade_date,page:r.page,row:r.row,page_sha256:r.page_sha256,transform:'wan_to_unit'};
  plan.rows.push({ticker,trade_date:fetch.trade_date,close,total_share:totalShare,free_share:freeShare,source:MARKS_SOURCE,upstream,raw_hash:sha256Hex(canonicalJson({api:'daily_basic',page_sha256:r.page_sha256,page:r.page,row:r.row})),locator,status:failed.length>0?'quarantined':'ok'});
 }
 plan.rows.sort((a,b)=>a.ticker<b.ticker?-1:a.ticker>b.ticker?1:0);
 return plan;
}

const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,300);
const add=(a:ObservationResult,b:ObservationResult):ObservationResult=>({inserted:a.inserted+b.inserted,duplicates:a.duplicates+b.duplicates,superseded:a.superseded+b.superseded});

export async function runMarks(deps:MarksDeps,opts:MarksOptions):Promise<MarksReceipt>{
 const dates=[...new Set(opts.tradeDates)].sort();
 for(const d of dates)assertDay('tradeDate',d);
 const counts=emptyCounts();const errors:BatchError[]=[];const outcomes:MarksDateOutcome[]=[];
 if(!deps.codeVersion)return {status:'rejected',code:'code_version_missing',batchId:null,batchStatus:null,counts,errors,dates:[]};
 const maxAttempts=Math.max(1,opts.maxApplyAttempts??2);
 const {tables,db}=deps;
 const {batchId}=await startBatch(tables,{producer:'industry-marks',dataset:MARKS_DATASET,toolVersions:{source:MARKS_SOURCE,transform:'wan_to_unit'},codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy??'script'});
 let hardFailures=0;
 try{
  const universe=new Set((await selectAll(tables,'stocks_universe',{},'ticker')).map(r=>norm(String(r.ticker))));
  for(const date of dates){
   const out:MarksDateOutcome={trade_date:date,fetch_event_id:null,fetched:0,result:null,attempts:0,skipped:{}};outcomes.push(out);
   const eventId=await db.beginFetchEvent(MARKS_JOB,{trade_date:date},batchId);out.fetch_event_id=eventId;
   let fetched:DailyBasicFetch;
   try{fetched=await deps.fetchDailyBasic(date);}
   catch(e){
    const code=typeof (e as {code?:unknown}).code==='string'?(e as {code:string}).code:'fetch_failed';
    out.error=code;errors.push({code,key:date,message:errMsg(e)});counts.failed++;hardFailures++;
    if(code==='quota_exhausted')break;   // spec §11: the job stops on quota
    continue;
   }
   out.fetched=fetched.rows.length;counts.fetched+=fetched.rows.length;
   if(fetched.rows.length===0){out.skipped={no_rows:1};errors.push({code:'skipped_summary',key:date,message:JSON.stringify({no_rows:1})});continue;}
   const plan=planMarkRows({...fetched,trade_date:date},universe);
   out.skipped=plan.skipped;
   if(Object.keys(plan.skipped).length>0)errors.push({code:'skipped_summary',key:date,message:JSON.stringify(plan.skipped)});
   if(plan.rejected.length>0){counts.failed+=plan.rejected.length;errors.push({code:'rejected_summary',key:date,message:JSON.stringify(plan.rejected.slice(0,20))});}
   let result:ObservationResult={inserted:0,duplicates:0,superseded:0};let ok=true;
   for(let i=0;i<plan.rows.length&&ok;i+=APPLY_CHUNK){
    const chunk=plan.rows.slice(i,i+APPLY_CHUNK);
    for(let attempt=1;;attempt++){
     out.attempts++;
     try{result=add(result,await db.applyObservations('marks',eventId,chunk));break;}
     catch(e){
      const fatal=e instanceof IndustryDbError&&e.code==='fetch_event_payload_changed';
      if(fatal||attempt>=maxAttempts){ok=false;out.error=e instanceof IndustryDbError?e.code:'apply_failed';errors.push({code:out.error,key:date,message:errMsg(e)});counts.failed+=plan.rows.length-i;hardFailures++;break;}
      await db.retryFetchEvent(eventId);   // same event, attempt + 1: the retry carries the same fetched payload
     }
    }
   }
   out.result=result;
   counts.inserted+=result.inserted;counts.versioned+=result.superseded;counts.duplicates+=result.duplicates;
   if(!ok)continue;
   for(const q of plan.quarantined){
    await quarantine(tables,{dataset:MARKS_DATASET,table:'security_marks',naturalKey:`${q.ticker}:${q.trade_date}`,reasonCode:q.reason,detail:q.detail,batchId});
    counts.quarantined++;
   }
  }
 }catch(e){errors.push({code:'marks_failed',message:errMsg(e)});counts.failed++;hardFailures++;}
 try{await recordAttempt(tables,MARKS_DATASET,{ok:hardFailures===0,cadence:'weekly',now:deps.now(),detail:{dates:dates.length,inserted:counts.inserted,versioned:counts.versioned}});}
 catch(e){errors.push({code:'freshness_failed',message:errMsg(e)});}
 const batchStatus=await finishBatch(tables,batchId,{counts,errors},deps.now());
 return {status:'done',batchId,batchStatus,counts,errors,dates:outcomes};
}
