// src/lib/industry/load-a-share.ts
// A-share whole-universe issuer load (spec §4.7, V10 call signatures, V11 issuers_cninfo_idx). Does NOT use
// upsertIssuerByIdentifiers (it requires LEI/CIK/USCI). Per stock_basic row of the a_stock universe:
//  1. orgId = lookupOrgId(symbol) (巨潮 topSearch, landed collectors/cninfo.ts::resolveOrgId; paced here,
//     resolveOrgId itself does not pace); none → skipped_summary(no_org_id).
//  2. match: (a) issuers.cninfo_org_id = orgId; (b) the issuer owning the CURRENT issuer_securities row of
//     ts_code: null cninfo_org_id → backfilled (guarded update + provenance), a different one → no write,
//     fileClaim(issuer of that security, cninfo_org_id) + skipped_summary(org_id_mismatch); (c) new issuer
//     {canonical_name_zh: fullname ?? name, cninfo_org_id, status active}; a 23505 from issuers_cninfo_idx
//     (concurrent creator) → re-read and continue as (a).
//  3. attachSecurity(tables,{issuer_id, ticker: ts_code, share_class 'A', is_primary true, valid_from: list_date ??
//     observed date, source 'tushare:stock_basic', provenance {list_date, exchange, list_status}}): 'duplicate' never
//     backfills valid_from (spec 3 F3-2 owns that); 'conflict' (another issuer holds the ticker) → fileClaim(…,
//     source 'tushare:stock_basic') + skipped_summary(claim_pending). The issuer already holds another current
//     A-share ticker (code change) → not attached, fileClaim + skipped_summary(claim_pending).
//  4. list_status 'D' → skipped_summary(delisted) only (window closing is spec 3's valid_to_method='delisting').
//  5. receipt producer 'load-a-share', dataset 'issuers.a_stock', recordAttempt cadence daily (cron 30 22 * * *).
// Fast path: a ts_code whose current security row belongs to an issuer that already has a cninfo_org_id is a
// duplicate without a network lookup (re-checking orgIds is the job of a full run: opts.recheckOrgIds).
// Outcome per row: inserted (security attached), duplicates (already attached), skipped (reason, informational),
// failed (exception). Issuer creations/backfills are reported in `issuers` (not BatchCounts).
import {randomUUID} from 'node:crypto';
import {TableError,selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {fileClaim} from '../entities/claims';
import {attachSecurity} from '../entities/securities';
import {isCurrentSecurity} from '../entities/resolve';
import {errorMessage,loaderOutcome,summarizeSkips,withSkippedSummary} from '../entities/load-sec';
import {resolveOrgId} from '../research/ingest/collectors/cninfo';
import type {OrgLookup} from '../research/ingest/collectors/cninfo';
import type {IndustryDeps} from './types';
import type {SnapshotCapture,StockBasicRow,TusharePage} from './providers/tushare-industry';
import {IndustryProviderError,defaultTushareCall,fetchStockBasic,ymdToIso} from './providers/tushare-industry';

export const A_SHARE_DATASET='issuers.a_stock';
export const A_SHARE_PRODUCER='load-a-share';
export const STOCK_BASIC_SOURCE='tushare:stock_basic';
export const CNINFO_SOURCE='cninfo:topSearch';
export const ORG_LOOKUP_INTERVAL_MS=500;
const TS_CODE=/^(\d{6})\.(SH|SZ|BJ)$/;
const B_SHARE=/^(900\d{3}\.SH|200\d{3}\.SZ)$/;
const CN_TICKER=/^\d{6}\.(SH|SZ|BJ)$/;

export interface AShareCandidate{ts_code:string;symbol:string;name_zh:string;list_date:string|null;exchange:string|null;list_status:string}
export interface AShareLoadPlan{observedDate:string;candidates:AShareCandidate[];skipped:string[];rejected:string[];fetched:number}

/** Pure: stock_basic rows (all list statuses) + the active a_stock universe → candidates, skips, rejects. */
export function planAShareLoad(rows:StockBasicRow[],universe:ReadonlySet<string>,observedDate:string):AShareLoadPlan{
 const plan:AShareLoadPlan={observedDate,candidates:[],skipped:[],rejected:[],fetched:rows.length};
 const seen=new Set<string>();
 for(const r of rows){
  const ts=(r.ts_code??'').trim().toUpperCase();
  const m=TS_CODE.exec(ts);
  if(!m){plan.rejected.push(`rejected_ts_code:${r.ts_code}`);continue;}
  if(seen.has(ts)){plan.skipped.push(`repeated_row:${ts}`);continue;}
  seen.add(ts);
  if(r.list_status==='D'){
   // delisted only with a delist_date; a 'D' row without one is anomalous evidence and is rejected, never attached as listed
   if(r.delist_date?.trim()){plan.skipped.push(`delisted:${ts}`);continue;}
   plan.rejected.push(`rejected_delist_date:${ts}`);continue;
  }
  if(B_SHARE.test(ts)){plan.skipped.push(`b_share:${ts}`);continue;}
  if(!universe.has(ts)){plan.skipped.push(`not_in_universe:${ts}`);continue;}
  const listDate=ymdToIso(r.list_date);
  if(listDate===undefined){plan.rejected.push(`rejected_list_date:${ts}`);continue;}
  const name=r.fullname?.trim()||r.name?.trim();
  if(!name){plan.rejected.push(`rejected_name:${ts}`);continue;}
  plan.candidates.push({ts_code:ts,symbol:r.symbol?.trim()||m[1],name_zh:name,list_date:listDate,exchange:r.exchange??null,list_status:r.list_status??'L'});
 }
 return plan;
}

export interface AShareApplyOptions{batchId:string;observedAt:string;lookupOrgId:(symbol:string)=>Promise<OrgLookup|null>;sleep?:(ms:number)=>Promise<void>;maxLookups?:number;recheckOrgIds?:boolean}
export interface AShareApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;rejectedSummary:Record<string,number>;issuers:{created:number;backfilled:number};lookups:number}

const str=(v:unknown)=>typeof v==='string'&&v.length>0?v:null;
const provOf=(row:Row|undefined)=>(row?.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
/**
 * Persists the stock_basic listing evidence (list_date, source, observed_at) into the provenance of an EXISTING current
 * security row without touching valid_from (spec 3 owns window reconciliation). Idempotent: unchanged evidence is not rewritten.
 */
async function recordListingEvidence(tables:TableClient,sec:Row,c:AShareCandidate,observedAt:string):Promise<void>{
 if(c.list_date===null)return;
 const prov=provOf(sec);
 const have=(prov.listing&&typeof prov.listing==='object'?prov.listing:{}) as Record<string,unknown>;
 if(have.list_date===c.list_date&&have.exchange===c.exchange&&have.list_status===c.list_status&&have.source===STOCK_BASIC_SOURCE)return;
 await tables.update('issuer_securities',{issuer_id:String(sec.issuer_id),ticker:String(sec.ticker),valid_from:String(sec.valid_from)},
  {provenance:{...prov,listing:{list_date:c.list_date,exchange:c.exchange,list_status:c.list_status,source:STOCK_BASIC_SOURCE,observed_at:observedAt}}});
}
const isUniqueViolation=(e:unknown)=>e instanceof TableError&&e.code==='23505';

async function issuerByOrgId(tables:TableClient,orgId:string):Promise<Row|null>{
 return (await tables.select('issuers',{cninfo_org_id:orgId},{limit:1}))[0]??null;
}
/** The issuer owning ts_code's current security row (landed validity predicate), with that row. */
async function currentOwner(tables:TableClient,ts:string,today:string):Promise<{issuer:Row;security:Row}|null>{
 const sec=(await tables.select('issuer_securities',{ticker:ts})).find(r=>isCurrentSecurity(r,today));
 if(!sec)return null;
 const issuer=(await tables.select('issuers',{issuer_id:String(sec.issuer_id)},{limit:1}))[0];
 return issuer?{issuer,security:sec}:null;
}

/** Writes the plan (spec §4.7 steps 1–4). The caller owns the batch. */
export async function applyAShareLoad(tables:TableClient,plan:AShareLoadPlan,opts:AShareApplyOptions):Promise<AShareApplyResult>{
 const counts=emptyCounts();counts.fetched=plan.fetched;
 const errors:BatchError[]=[];const skips=[...plan.skipped];
 const issuers={created:0,backfilled:0};
 const wait=opts.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 const maxLookups=opts.maxLookups??Number.POSITIVE_INFINITY;
 const today=plan.observedDate;
 let lookups=0;
 for(const c of plan.candidates){
  try{
   const owner=await currentOwner(tables,c.ts_code,today);
   if(owner&&owner.issuer.status==='active'&&str(owner.issuer.cninfo_org_id)&&!opts.recheckOrgIds){   // fast path, no network
    await recordListingEvidence(tables,owner.security,c,opts.observedAt);
    counts.duplicates++;continue;
   }
   if(lookups>=maxLookups){skips.push(`lookup_deferred:${c.ts_code}`);continue;}
   if(lookups>0)await wait(ORG_LOOKUP_INTERVAL_MS);
   lookups++;
   const hit=await opts.lookupOrgId(c.symbol);
   if(!hit){skips.push(`no_org_id:${c.ts_code}`);continue;}
   const orgId=hit.orgId;
   // (a) / (b) / (c)
   let issuer=await issuerByOrgId(tables,orgId);
   if(!issuer&&owner){
    const stored=str(owner.issuer.cninfo_org_id);
    if(stored&&stored!==orgId){
     await fileClaim(tables,{issuer_id:String(owner.issuer.issuer_id),id_type:'cninfo_org_id',value:orgId,source:CNINFO_SOURCE});
     skips.push(`org_id_mismatch:${c.ts_code}`);continue;
    }
    // backfill a null cninfo_org_id; a lost race (row changed or orgId taken) re-reads by orgId
    const id=String(owner.issuer.issuer_id);
    let n=0;
    try{
     n=await tables.update('issuers',{issuer_id:id,status:'active',cninfo_org_id:null},
      {cninfo_org_id:orgId,provenance:{...provOf(owner.issuer),cninfo_org_id:{source:CNINFO_SOURCE,observed_at:opts.observedAt}},updated_at:opts.observedAt});
    }catch(e){if(!isUniqueViolation(e))throw e;}
    if(n>0){issuers.backfilled++;issuer={...owner.issuer,cninfo_org_id:orgId};}
    else{
     issuer=await issuerByOrgId(tables,orgId);
     if(!issuer){skips.push(`issuer_not_active:${c.ts_code}`);continue;}
    }
   }
   if(!issuer){
    const now=opts.observedAt;
    const row:Row={issuer_id:randomUUID(),canonical_name_zh:c.name_zh,canonical_name_en:null,country_code:null,lei:null,cik:null,usci:null,cninfo_org_id:orgId,
     hkex_stock_code_primary:null,status:'active',merged_into:null,created_at:now,updated_at:now,
     provenance:{cninfo_org_id:{source:CNINFO_SOURCE,observed_at:now},canonical_name_zh:{source:STOCK_BASIC_SOURCE,observed_at:now}}};
    try{await tables.insert('issuers',row);issuer=row;issuers.created++;}
    catch(e){
     if(!isUniqueViolation(e))throw e;
     issuer=await issuerByOrgId(tables,orgId);   // issuers_cninfo_idx: a concurrent creator won → continue as (a)
     if(!issuer)throw e;
    }
   }
   const issuerId=String(issuer.issuer_id);
   if(issuer.status!=='active'){skips.push(`issuer_not_active:${c.ts_code}`);continue;}
   // code change: the issuer already has another current A-share ticker → never auto-attach a second one
   const other=(await tables.select('issuer_securities',{issuer_id:issuerId})).find(r=>isCurrentSecurity(r,today)&&CN_TICKER.test(String(r.ticker))&&!B_SHARE.test(String(r.ticker))&&String(r.ticker)!==c.ts_code);
   if(other){
    await fileClaim(tables,{issuer_id:issuerId,id_type:'cninfo_org_id',value:orgId,source:STOCK_BASIC_SOURCE});
    skips.push(`claim_pending:${c.ts_code}`);continue;
   }
   const res=await attachSecurity(tables,{issuer_id:issuerId,ticker:c.ts_code,share_class:'A',is_primary:true,valid_from:c.list_date??today,source:STOCK_BASIC_SOURCE,
    provenance:{list_date:c.list_date,exchange:c.exchange,list_status:c.list_status,
     listing:{list_date:c.list_date,exchange:c.exchange,list_status:c.list_status,source:STOCK_BASIC_SOURCE,observed_at:opts.observedAt}}});
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate'){
    const mine=(await tables.select('issuer_securities',{issuer_id:issuerId,ticker:c.ts_code})).find(r=>isCurrentSecurity(r,today));
    if(mine)await recordListingEvidence(tables,mine,c,opts.observedAt);
    counts.duplicates++;
   }
   else{
    await fileClaim(tables,{issuer_id:issuerId,id_type:'cninfo_org_id',value:orgId,source:STOCK_BASIC_SOURCE});
    skips.push(`claim_pending:${c.ts_code}`);
   }
  }catch(e){counts.failed++;errors.push({code:'a_share_error',key:c.ts_code,message:errorMessage(e)});}
 }
 const skippedSummary=summarizeSkips(skips);
 const rejectedSummary=summarizeSkips(plan.rejected);
 return {counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary,issuers,lookups};
}

export interface RunLoadAShareOptions{apply:boolean;triggeredBy?:TriggeredBy;today?:string;maxLookups?:number;recheckOrgIds?:boolean;lookupOrgId?:(symbol:string)=>Promise<OrgLookup|null>;sleep?:(ms:number)=>Promise<void>;snapshots?:SnapshotCapture}
export interface RunLoadAShareResult{status:BatchStatus|'dry_run';batchId:string|null;plan:{candidates:number;skipped:Record<string,number>;rejected:Record<string,number>};apply:AShareApplyResult|null;exitCode:0|1}

/** Reads the active a_stock universe (security_universe_memberships; PK (ticker, universe) → ticker unique within it). */
export async function aStockUniverse(tables:TableClient):Promise<Set<string>>{
 return new Set((await selectAll(tables,'security_universe_memberships',{universe:'a_stock',is_active:true},'ticker')).map(r=>String(r.ticker).trim().toUpperCase()));
}

/** Job entry (cron / script): stock_basic L, P and D passes → plan → (apply) → receipt + freshness. Apply mode opens the batch BEFORE fetching, so a failed fetch or plan is receipted (failed + ok:false attempt); a dry run writes nothing. */
export async function runLoadAShare(deps:IndustryDeps,opts:RunLoadAShareOptions):Promise<RunLoadAShareResult>{
 if(opts.apply&&!deps.codeVersion)throw new Error('code_version_missing');
 const call=deps.tushare??defaultTushareCall({fetch:deps.fetch});
 const now=deps.now();const today=opts.today??now.toISOString().slice(0,10);
 const batchId=opts.apply?(await startBatch(deps.tables,{producer:A_SHARE_PRODUCER,dataset:A_SHARE_DATASET,codeVersion:deps.codeVersion!,triggeredBy:opts.triggeredBy??'script'})).batchId:null;
 const fail=async(e:unknown,fetched:number,candidates:number)=>{
  await finishBatch(deps.tables,batchId!,{counts:{...emptyCounts(),fetched,failed:Math.max(1,candidates)},errors:[{code:e instanceof IndustryProviderError?e.code:'a_share_error',message:errorMessage(e)}]},deps.now());
  await recordAttempt(deps.tables,A_SHARE_DATASET,{ok:false,cadence:'daily',now:deps.now()});
 };
 let plan:AShareLoadPlan;
 try{
  const pages:TusharePage<StockBasicRow>[]=[];
  for(const s of ['L','P','D'] as const)pages.push(...await fetchStockBasic(call,{listStatus:s},{sleep:opts.sleep,now:deps.now,snapshots:batchId?opts.snapshots:undefined}));
  plan=planAShareLoad(pages.flatMap(p=>p.rows),await aStockUniverse(deps.tables),today);
 }catch(e){
  if(batchId)await fail(e,0,0);
  throw e;
 }
 const planSummary={candidates:plan.candidates.length,skipped:summarizeSkips(plan.skipped),rejected:summarizeSkips(plan.rejected)};
 if(!batchId)return {status:'dry_run',batchId:null,plan:planSummary,apply:null,exitCode:0};
 let result:AShareApplyResult;
 try{
  result=await applyAShareLoad(deps.tables,plan,{batchId,observedAt:now.toISOString(),lookupOrgId:opts.lookupOrgId??(symbol=>resolveOrgId(symbol,{fetch:deps.fetch})),sleep:opts.sleep,maxLookups:opts.maxLookups,recheckOrgIds:opts.recheckOrgIds});
 }catch(e){
  await fail(e,plan.fetched,plan.candidates.length);
  throw e;
 }
 const status=await finishBatch(deps.tables,batchId,{counts:result.counts,errors:result.errors},deps.now());
 const outcome=loaderOutcome(status,result.counts,result.rejectedSummary);
 await recordAttempt(deps.tables,A_SHARE_DATASET,{ok:outcome.ok,cadence:'daily',now:deps.now(),detail:{issuers:result.issuers,lookups:result.lookups}});
 return {status,batchId,plan:planSummary,apply:result,exitCode:outcome.exitCode};
}
