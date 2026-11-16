// src/lib/industry/jobs.ts
// Job dispatch shared by /api/cron/industry-sync and scripts/industry/sync.ts (spec §9, §10), the
// production IndustryDeps, the activation gates of each job, argument parsing of the sync script, and
// the weekly replay sample of scripts/industry/replay-check.ts (spec §1.1 success criteria: 50 cells).
// `official` and `valuation` are the deferred I-3 pipeline (plan header: verification items 1/2 are
// open) and answer {skipped:'deferred_i3'} without touching anything. Gates (spec §4.10 V4, owner
// defaults A/E): Tushare jobs need TUSHARE_TOKEN; facts-scope needs FACTS_CN_INDUSTRY_UNIVERSE=1;
// aggregate needs FACTS_CN_ENABLED=1 (no CN facts feed → no aggregation in production).
import {createHash} from 'node:crypto';
import type {BatchCounts,BatchError,BatchStatus} from '../dq/batches';
import {supabaseTableClient} from '../db/table-client';
import {supabaseFactsDb} from '../facts/db';
import {reconcileScope} from '../facts/scope';
import {supabaseSnapshotStore} from '../facts/snapshot-store';
import type {SnapshotStore} from '../facts/snapshot-store';
import type {FactsDb} from '../facts/types';
import {getAdminSupabase} from '../supabase/admin';
import {runClassificationsSw} from './classifications';
import {supabaseIndustryDb} from './db';
import {industryCnUniverse} from './facts-scope';
import {runLoadAShare} from './load-a-share';
import {validateAShareTickers} from './a-share-selection';
import {supabaseManifestStore} from './manifest';
import {runMarks} from './marks';
import type {DailyBasicFetch} from './marks';
import {defaultTushareCall,fetchDailyBasic} from './providers/tushare-industry';
import type {SnapshotCapture,TushareCall} from './providers/tushare-industry';
import {replayFromManifest} from './replay';
import {reproduces} from './read';
import {runResolveMemberships} from './resolve-memberships';
import {runIndustryAggregation} from './run-aggregation';
import {runClassificationsSic,runMembershipsSic} from './sic';
import {runMembershipsSw} from './source-memberships';
import type {IndustryDb,IndustryDeps,ManifestStore,MetricCellRow,Scheme,SchemeVersion} from './types';

export const INDUSTRY_JOBS=['load-a-share','facts-scope','memberships-sw','memberships-sic','marks','official','aggregate','valuation'] as const;
export type IndustryJob=typeof INDUSTRY_JOBS[number];
export const DEFERRED_JOBS:ReadonlySet<IndustryJob>=new Set<IndustryJob>(['official','valuation']);
export const TUSHARE_JOBS:ReadonlySet<IndustryJob>=new Set<IndustryJob>(['load-a-share','memberships-sw','marks']);
export const isIndustryJob=(s:string):s is IndustryJob=>(INDUSTRY_JOBS as readonly string[]).includes(s);

/** What every job answers. The runners of Tasks 5–13 keep their own receipts; runIndustryJob maps them here. */
export interface RunnerReceipt{batchId:string|null;status:'success'|'partial'|'failed'|'dry_run';counts:Record<string,number>;errors:{code:string;key?:string;message?:string}[]}
export interface IndustryJobOptions{dryRun:boolean;triggeredBy:'cron'|'script';limit?:number;tickers?:string[];factsAsOf?:string;tradeDates?:string[];l1Codes?:string[];today?:string}
export type IndustryJobResult={job:IndustryJob;skipped:'deferred_i3'}|{job:IndustryJob;receipt:RunnerReceipt};
/** IndustryDeps plus the full plan-2 FactsDb surface facts-scope needs (reconcileScope; IndustryDeps.facts is read-only). */
/** `snapshots`: plan-2 raw-bytes store (bucket disclosure-raw). When set, every Tushare page the jobs fetch is stored before its rows are used (spec §4.4 evidence). */
export interface IndustryJobDeps extends IndustryDeps{scopeDb:Pick<FactsDb,'reconcileScope'|'scopeAll'>;snapshots?:SnapshotStore}
const captureOf=(deps:IndustryJobDeps):{snapshots?:SnapshotCapture}=>deps.snapshots?{snapshots:{store:deps.snapshots}}:{};

const utcToday=(d:Date)=>d.toISOString().slice(0,10);
const ORDER:RunnerReceipt['status'][]=['dry_run','success','partial','failed'];
const receiptStatus=(s:BatchStatus|'dry_run'|null):RunnerReceipt['status']=>s==='dry_run'?'dry_run':s==='success'?'success':s==='partial'?'partial':'failed';
const prefixed=(m:Record<string,number>,prefix:string):Record<string,number>=>Object.fromEntries(Object.entries(m).map(([k,v])=>[prefix+k,v]));
const countsOf=(c:BatchCounts):Record<string,number>=>({...c});
/** Receipt of a runner that owns one batch (Tasks 5, 7, 8, 9). */
const batchReceipt=(r:{status:BatchStatus|'dry_run';batchId:string|null;counts:BatchCounts;errors:BatchError[]}):RunnerReceipt=>({batchId:r.batchId,status:receiptStatus(r.status),counts:countsOf(r.counts),errors:r.errors});
/** Jobs without a dry-run mode (their runners always write): a dry run reports this instead of running. */
const dryRunUnsupported=(job:IndustryJob):RunnerReceipt=>({batchId:null,status:'dry_run',counts:{},errors:[{code:'dry_run_unsupported',key:job,message:`${job} has no dry run; pass --apply`}]});
/** Multi-step jobs (skeleton 跨任务接口约定 B3: each step owns its batch): the worst status wins; counts and error keys are prefixed by step. */
export function combineReceipts(steps:{name:string;receipt:RunnerReceipt}[]):RunnerReceipt{
 return {
  batchId:steps.length?steps[steps.length-1].receipt.batchId:null,
  status:steps.reduce<RunnerReceipt['status']>((a,x)=>ORDER.indexOf(x.receipt.status)>ORDER.indexOf(a)?x.receipt.status:a,'dry_run'),
  counts:Object.assign({},...steps.map(x=>prefixed(x.receipt.counts,`${x.name}.`))),
  errors:steps.flatMap(x=>x.receipt.errors.map(e=>({...e,key:e.key===undefined?x.name:`${x.name}:${e.key}`}))),
 };
}
const stepFailed=(r:RunnerReceipt)=>r.status==='failed';

/** Task 5's daily_basic adapter (YYYYMMDD → TusharePage[]) as Task 13's injected MarksDeps.fetchDailyBasic (spec §6.1 evidence: page sha256 + row index). */
export function marksFetcher(call:TushareCall,snapshots?:SnapshotCapture):(tradeDate:string)=>Promise<DailyBasicFetch>{
 return async tradeDate=>{
  const pages=await fetchDailyBasic(call,{tradeDate:tradeDate.replaceAll('-','')},snapshots?{snapshots}:{});
  return {trade_date:tradeDate,pages:pages.length,
   rows:pages.flatMap(p=>p.rows.map((r,row)=>({ts_code:r.ts_code,trade_date:r.trade_date,close:r.close,total_share:r.total_share,free_share:r.free_share,total_mv:r.total_mv,page:p.page,row,page_sha256:p.raw_hash})))};
 };
}

export async function runIndustryJob(job:IndustryJob,deps:IndustryJobDeps,opts:IndustryJobOptions):Promise<IndustryJobResult>{
 if(opts.tickers!==undefined){
  if(job!=='load-a-share')throw new Error('--ticker is only supported by load-a-share');
  validateAShareTickers(opts.tickers);
 }
 if(DEFERRED_JOBS.has(job))return {job,skipped:'deferred_i3'};
 const triggeredBy=opts.triggeredBy;
 switch(job){
  case 'load-a-share':{
   // --limit caps the cninfo org-id lookups of one run (Task 5 maxLookups)
   const r=await runLoadAShare(deps,{apply:!opts.dryRun,triggeredBy,today:opts.today,maxLookups:opts.limit,...(opts.tickers===undefined?{}:{tickers:opts.tickers}),...captureOf(deps)});
   return {job,receipt:{batchId:r.batchId,status:receiptStatus(r.status),counts:r.apply?countsOf(r.apply.counts):{candidates:r.plan.candidates,...prefixed(r.plan.skipped,'skipped.'),...prefixed(r.plan.rejected,'rejected.')},errors:r.apply?.errors??[]}};
  }
  case 'facts-scope':{
   // spec §4.10: not a separate upsert job — the industry universe is merged into desiredCn (Task 6 INDUSTRY block)
   const today=opts.today??utcToday(deps.now());
   if(opts.dryRun){
    const skipped:Record<string,number>={};
    const rows=await industryCnUniverse(deps.tables,today,skipped);
    return {job,receipt:{batchId:null,status:'dry_run',counts:{industry_universe:rows.length,...prefixed(skipped,'skipped.')},errors:[]}};
   }
   const r=await reconcileScope({tables:deps.tables,db:deps.scopeDb},'CN',{today});
   return {job,receipt:{batchId:null,status:'success',counts:{desired:r.desired,retired:r.retired,changed:r.changed,...prefixed(r.skipped,'skipped.')},errors:[]}};
  }
  case 'memberships-sw':{
   // B3 composition: classifications → source records → resolution (each its own batch, weekly freshness)
   if(opts.dryRun)return {job,receipt:batchReceipt(await runMembershipsSw(deps,{apply:false,l1Codes:opts.l1Codes,triggeredBy,...captureOf(deps)}))};
   const steps:{name:string;receipt:RunnerReceipt}[]=[{name:'classifications',receipt:batchReceipt(await runClassificationsSw(deps,{triggeredBy,...captureOf(deps)}))}];
   if(!stepFailed(steps[0].receipt)){
    steps.push({name:'source',receipt:batchReceipt(await runMembershipsSw(deps,{apply:true,l1Codes:opts.l1Codes,triggeredBy,...captureOf(deps)}))});
    steps.push({name:'memberships',receipt:batchReceipt(await runResolveMemberships(deps,{triggeredBy,today:opts.today,...captureOf(deps)}))});
   }
   return {job,receipt:combineReceipts(steps)};
  }
  case 'memberships-sic':{
   if(opts.dryRun)return {job,receipt:dryRunUnsupported(job)};
   const steps:{name:string;receipt:RunnerReceipt}[]=[{name:'classifications',receipt:batchReceipt(await runClassificationsSic(deps,{triggeredBy}))}];
   if(!stepFailed(steps[0].receipt)){
    const m=await runMembershipsSic(deps,{limit:opts.limit,triggeredBy});
    steps.push({name:'memberships',receipt:{...batchReceipt(m),counts:{...countsOf(m.counts),processed:m.processed,added:m.added,retired:m.retired}}});
   }
   return {job,receipt:combineReceipts(steps)};
  }
  case 'marks':{
   if(opts.dryRun)return {job,receipt:dryRunUnsupported(job)};
   if(!opts.tradeDates?.length)return {job,receipt:{batchId:null,status:'failed',counts:{},errors:[{code:'trade_dates_required',message:'pass --trade-date (trade_cal is deferred with I-3)'}]}};
   const r=await runMarks({tables:deps.tables,db:deps.db,now:deps.now,codeVersion:deps.codeVersion,fetchDailyBasic:marksFetcher(deps.tushare??defaultTushareCall({fetch:deps.fetch}),deps.snapshots?{store:deps.snapshots}:undefined)},{tradeDates:opts.tradeDates,triggeredBy});
   if(r.status==='rejected')return {job,receipt:{batchId:null,status:'failed',counts:{},errors:[{code:r.code??'rejected'}]}};
   return {job,receipt:{batchId:r.batchId,status:receiptStatus(r.batchStatus),counts:countsOf(r.counts),errors:r.errors}};
  }
  case 'aggregate':{
   if(opts.dryRun)return {job,receipt:dryRunUnsupported(job)};
   const r=await runIndustryAggregation(deps,{scheme:'sw2021',version:'2021',level:1,factsAsOf:opts.factsAsOf??utcToday(deps.now()),triggeredBy});
   return {job,receipt:{batchId:r.batchId,status:r.status==='active'?receiptStatus(r.batchStatus):'failed',
    counts:{groups:r.groups,reused_groups:r.reusedGroups,cells_ok:r.cells.ok,cells_missing:r.cells.missing,manifest_mismatches:r.manifestMismatches,read_truncated:r.truncatedIssuers.length},
    errors:r.code?[{code:r.code,...(r.runId?{key:r.runId}:{})}]:[]}};
  }
 }
 throw new Error(`unknown_job:${job}`);
}

/** Why a job may not run now, or null. Deferred jobs are not gated: they answer skipped. */
export function jobGate(job:IndustryJob,env:Record<string,string|undefined>,opts:{apply:boolean}):{code:'tushare_unavailable'|'job_disabled';message:string}|null{
 if(DEFERRED_JOBS.has(job))return null;
 if(TUSHARE_JOBS.has(job)&&!env.TUSHARE_TOKEN)return {code:'tushare_unavailable',message:'TUSHARE_TOKEN not configured'};
 if(!opts.apply)return null;   // dry runs write nothing
 if(job==='facts-scope'&&env.FACTS_CN_INDUSTRY_UNIVERSE!=='1')return {code:'job_disabled',message:'FACTS_CN_INDUSTRY_UNIVERSE is not 1 (owner decision E)'};
 if(job==='aggregate'&&env.FACTS_CN_ENABLED!=='1')return {code:'job_disabled',message:'FACTS_CN_ENABLED is not 1 (spec §4.10 V4: no CN facts feed yet)'};
 return null;
}

export interface ProductionIndustryDepsOptions{codeVersion:string|null;now?:()=>Date;/** reuse an existing admin client (scripts hold one) */admin?:ReturnType<typeof getAdminSupabase>}
/** Service-role wiring. `tushare` stays unset: the adapters fall back to defaultTushareCall (Task 5, tushareCallRaw). */
export function productionIndustryDeps(opts:ProductionIndustryDepsOptions):IndustryJobDeps{
 const sb=opts.admin??getAdminSupabase();
 const db=supabaseIndustryDb(sb);const facts=supabaseFactsDb(sb);
 return {tables:supabaseTableClient(sb),db,facts,scopeDb:facts,manifests:supabaseManifestStore(sb,db),snapshots:supabaseSnapshotStore(sb),now:opts.now??(()=>new Date()),codeVersion:opts.codeVersion,fetch:globalThis.fetch};
}

export interface SyncArgs{job:IndustryJob;apply:boolean;limit?:number;tickers?:string[];factsAsOf?:string;tradeDates:string[];l1Codes:string[];recomputeFrom?:string}
export const SYNC_USAGE='usage: sync.ts --job <load-a-share|facts-scope|memberships-sw|memberships-sic|marks|official|aggregate|valuation> [--apply] [--limit n] [--ticker <canonical-CN-ticker>]... [--facts-as-of YYYY-MM-DD] [--trade-date YYYY-MM-DD]... [--l1 <code>]... [--recompute-from YYYY-MM-DD]';
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const VALUE_FLAGS=new Set(['--job','--limit','--ticker','--facts-as-of','--trade-date','--l1','--recompute-from']);
/** Pure argv parser of scripts/industry/sync.ts; errors carry the message printed before exit 2. */
export function parseSyncArgs(argv:string[]):{ok:true;args:SyncArgs}|{ok:false;error:string}{
 let job:string|undefined;const a:Omit<SyncArgs,'job'>={apply:false,tradeDates:[],l1Codes:[]};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--apply'){a.apply=true;continue;}
  if(!VALUE_FLAGS.has(x))return {ok:false,error:`unknown argument ${x}\n${SYNC_USAGE}`};
  const val=argv[i+1];
  if(val===undefined||val.startsWith('--'))return {ok:false,error:`${x} needs a value\n${SYNC_USAGE}`};
  i++;
  if(x==='--job')job=val;
  else if(x==='--limit'){const n=Number(val);if(!Number.isInteger(n)||n<1||n>5000)return {ok:false,error:'--limit must be 1..5000'};a.limit=n;}
  else if(x==='--ticker'){(a.tickers??=[]).push(val);}
  else if(x==='--facts-as-of'){if(!DATE_RE.test(val))return {ok:false,error:'--facts-as-of must be YYYY-MM-DD'};a.factsAsOf=val;}
  else if(x==='--trade-date'){if(!DATE_RE.test(val))return {ok:false,error:'--trade-date must be YYYY-MM-DD'};a.tradeDates.push(val);}
  else if(x==='--l1'){if(!/^[0-9]{6}\.SI$/.test(val))return {ok:false,error:'--l1 must look like 801120.SI'};a.l1Codes.push(val);}
  else{if(!DATE_RE.test(val))return {ok:false,error:'--recompute-from must be YYYY-MM-DD'};a.recomputeFrom=val;}
 }
 if(job===undefined||!isIndustryJob(job))return {ok:false,error:SYNC_USAGE};
 if(a.tickers!==undefined){
  if(job!=='load-a-share')return {ok:false,error:'--ticker is only supported by load-a-share'};
  try{validateAShareTickers(a.tickers);}catch(e){return {ok:false,error:(e as Error).message};}
 }
 if(a.limit!==undefined&&job!=='load-a-share'&&job!=='memberships-sic')return {ok:false,error:'--limit is only supported by load-a-share (cninfo lookups) and memberships-sic (issuer processing); it does not bound the whole job'};
 if(a.recomputeFrom!==undefined&&job!=='valuation')return {ok:false,error:'--recompute-from belongs to the (deferred) valuation job'};
 return {ok:true,args:{job,...a}};
}

export interface ReplayCheckResult{runId:string;sampled:number;reproduced:number;mismatches:{code:string;metric:string;duration:string;periodEnd:string;manifestHash:string;reason:'value_differs'|'manifest_unreadable'}[]}
/** Deterministic sample: order ok cells by sha256(seed + cell key) and take n. */
export function sampleCells(cells:MetricCellRow[],n:number,seed:string):MetricCellRow[]{
 const key=(c:MetricCellRow)=>createHash('sha256').update(`${seed}|${c.code}|${c.metric}|${c.duration}|${c.period_start}|${c.period_end}`).digest('hex');
 return cells.filter(c=>c.status==='ok'&&c.manifest_hash!==null).map(c=>({c,k:key(c)})).sort((a,b)=>a.k<b.k?-1:a.k>b.k?1:0).slice(0,n).map(x=>x.c);
}
/** Spec §1.1: sample ok cells of a run, replay each manifest offline, compare with the stored value. */
export async function replayCheck(deps:{db:Pick<IndustryDb,'activeMetricRun'|'metricRowsOfRun'|'metricRun'>;manifests:Pick<ManifestStore,'get'>},opts:{runId?:string;sample:number;seed:string;scheme?:Scheme;version?:SchemeVersion}):Promise<ReplayCheckResult|{error:'unknown_run'|'no_active_run'}>{
 const run=opts.runId?await deps.db.metricRun(opts.runId):await deps.db.activeMetricRun(opts.scheme??'sw2021',opts.version??'2021',1);
 if(!run)return {error:opts.runId?'unknown_run':'no_active_run'};
 const picked=sampleCells(await deps.db.metricRowsOfRun(run.run_id),opts.sample,opts.seed);
 const out:ReplayCheckResult={runId:run.run_id,sampled:picked.length,reproduced:0,mismatches:[]};
 for(const c of picked){
  const miss=(reason:'value_differs'|'manifest_unreadable')=>out.mismatches.push({code:c.code,metric:c.metric,duration:c.duration,periodEnd:c.period_end,manifestHash:c.manifest_hash!,reason});
  let cells;
  try{cells=replayFromManifest(await deps.manifests.get(c.manifest_hash!)).cells;}catch{miss('manifest_unreadable');continue;}
  if(reproduces(cells.find(x=>x.metric===c.metric&&x.duration===c.duration&&x.period_start===c.period_start),c))out.reproduced+=1;else miss('value_differs');
 }
 return out;
}
