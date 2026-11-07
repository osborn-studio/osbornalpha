// src/lib/industry/resolve-memberships.ts
// Resolution of SW2021 source records into issuer memberships (spec §4.4–§4.5, V10). For every CURRENT source
// record with issuer_id null (records with a resolution_error are retried, never skipped): resolveIssuer(tables,
// {ticker: ts_code}, {today}) (landed entities/resolve.ts; spec 3's asOf option is not landed, so
// resolution.method = 'today'). Records resolving to one issuer are applied together in ONE
// IndustryDb.applyMemberships call (rpc apply_industry_memberships: one transaction per issuer; three target
// rows per record — L1/L2/L3 with valid_from = available_date = in_date and, spec 7th draft K3 (out_date is the
// last member day, inclusive; delisting does not close an upstream window), valid_to = valid_to_available_date =
// min(out_date + 1 day, stock_basic.delist_date) (both null → null); provenance {availability:'effective_date_assumed',
// source_membership_id, raw_hash, locator}). A record with in_date >= delist_date is not applied: quarantined
// membership_after_delist + resolution_error (the window would be empty or after the delisting). delist dates come
// from stock_basic(list_status='D') fetched once per run (Task 5 adapter). reconcileDelistings then closes the
// still-open rows of records resolved in earlier runs whose stock has since delisted (same apply function).
// Correction path (a): a record that superseded an older one is applied like any other; the SQL function moves
// the older record's ok rows to 'superseded' (superseded_by → the new rows) in the same transaction.
// Failures: no issuer → recordResolutionError {code:'no_issuer'} + skipped_summary(no_issuer) (counted in
// n_unresolved); an IndustryDbError (membership_overlap / membership_conflict / …) → the issuer's transaction
// rolled back, recordResolutionError {code, at, detail} on its records + quarantine (reason = the error code)
// + skipped_summary(apply_failed); any other error → failed. Resolver exceptions other than the expected no_issuer /
// ambiguous_owner (e.g. a database error) are failures: resolution_error {code:'resolve_error', detail: message}, counts.failed
// and a non-info batch error (batch partial/failed, freshness not fresh). The whole body after startBatch is guarded so
// finishBatch / recordAttempt are always reached.
// Delisting dates (K4) are read from industry_security_delistings after the stock_basic(D) pass of this run has been persisted
// (delistings.ts); a 'D' row without a usable delist_date is NOT "no delisting": its records are not applied
// (resolution_error + quarantine delist_date_missing, non-info error). Delisting evidence (delist_date, raw_hash, batch_id,
// observed_at) is carried into provenance.delisting of every row whose window end the delisting determines — on insert, on
// in-place closure and on correction rows.
// A rejected replacement (no_issuer / ambiguous_owner / resolve_error / membership_after_delist / delist_date_missing) whose
// predecessor record was already resolved: the predecessor's ok rows are quarantined atomically through
// IndustryDb.quarantineMembershipLineage (rpc quarantine_industry_membership_lineage), so they no longer count as members. Correction path (b) (asOf re-resolution →
// membership_reassigned) waits for spec 3's asOf and is not implemented here.
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {resolveIssuer} from '../entities/resolve';
import {defaultTushareCall,fetchStockBasic,ymdToIso} from './providers/tushare-industry';
import {errorMessage,loaderOutcome,summarizeSkips,withSkippedSummary} from '../entities/load-sec';
import type {DelistingRow,IndustryDeps,MembershipTarget,SourceMembershipRow} from './types';
import {persistDelistings,scanDelistings} from './delistings';
import {IndustryDbError} from './types';

export const SW_MEMBERSHIPS_DATASET='industry.sw2021.memberships';
export const SW_RESOLVE_PRODUCER='industry-sw-resolve';

const nextDay=(d:string)=>new Date(Date.parse(`${d}T00:00:00Z`)+86_400_000).toISOString().slice(0,10);
/** K3 window end: min(out_date + 1 day, delist_date); null when both are null. */
export function windowEnd(outDate:string|null,delistDate:string|null):string|null{
 const a=outDate===null?null:nextDay(outDate);
 return a===null?delistDate:delistDate===null?a:(a<delistDate?a:delistDate);
}
export type DelistingEvidence=Pick<DelistingRow,'delist_date'|'raw_hash'|'batch_id'|'observed_at'>;
/** The three membership rows (L1, L2, L3) one source record stands for (spec 7th draft K3 window); provenance.delisting when the delisting determines the end. */
export function targetsFor(s:SourceMembershipRow,delistDate:string|null=null,evidence:DelistingEvidence|null=null):MembershipTarget[]{
 const end=windowEnd(s.out_date,delistDate);
 const delisting=evidence!==null&&end!==null&&end===delistDate&&evidence.delist_date===delistDate?{delisting:{delist_date:evidence.delist_date,raw_hash:evidence.raw_hash,batch_id:evidence.batch_id,observed_at:evidence.observed_at}}:{};
 const provenance={availability:'effective_date_assumed' as const,source_membership_id:s.id,raw_hash:s.raw_hash,locator:s.locator,...delisting};
 return ([[1,s.l1_code],[2,s.l2_code],[3,s.l3_code]] as const).map(([level,code])=>({code,level,valid_from:s.in_date,valid_to:end,available_date:s.in_date,valid_to_available_date:end,source:s.source,provenance:{...provenance}}));
}

export interface ResolutionGroup{issuer_id:string;sourceIds:string[];tsCodes:string[];rows:MembershipTarget[]}
export type ResolvedValue=string|null|{error:string;detail?:string;failure?:boolean};
export interface ResolutionPlan{groups:ResolutionGroup[];unresolved:{id:string;ts_code:string;code:string;detail?:string;failure?:boolean}[];afterDelist:{id:string;ts_code:string;in_date:string;delist_date:string;issuer_id:string}[];
 /** records of a ts_code whose stock_basic 'D' row has no usable delist_date (not applied) */
 blocked:{id:string;ts_code:string;in_date:string}[]}

/**
 * Pure: unresolved current records + ts_code → issuer (null = none, or {error} = expected error / failure) + delist dates
 * (+ evidence per ts_code, + ts_codes whose delist_date is missing) → per-issuer groups.
 */
export function resolveSourceMemberships(sources:SourceMembershipRow[],resolved:Map<string,ResolvedValue>,delist:ReadonlyMap<string,string>=new Map(),
 opts:{evidence?:ReadonlyMap<string,DelistingEvidence>;blocked?:ReadonlySet<string>}={}):ResolutionPlan{
 const plan:ResolutionPlan={groups:[],unresolved:[],afterDelist:[],blocked:[]};
 const byIssuer=new Map<string,ResolutionGroup>();
 const ordered=[...sources].filter(s=>s.status==='current'&&s.issuer_id===null).sort((a,b)=>a.ts_code.localeCompare(b.ts_code)||a.in_date.localeCompare(b.in_date)||a.l3_code.localeCompare(b.l3_code));
 for(const s of ordered){
  if(opts.blocked?.has(s.ts_code)){plan.blocked.push({id:s.id,ts_code:s.ts_code,in_date:s.in_date});continue;}
  const r=resolved.get(s.ts_code);
  if(r===undefined||r===null){plan.unresolved.push({id:s.id,ts_code:s.ts_code,code:'no_issuer'});continue;}
  if(typeof r==='object'){plan.unresolved.push({id:s.id,ts_code:s.ts_code,code:r.error,...(r.detail!==undefined?{detail:r.detail}:{}),...(r.failure?{failure:true}:{})});continue;}
  const d=delist.get(s.ts_code)??null;
  if(d!==null&&s.in_date>=d){plan.afterDelist.push({id:s.id,ts_code:s.ts_code,in_date:s.in_date,delist_date:d,issuer_id:r});continue;}
  const g=byIssuer.get(r)??byIssuer.set(r,{issuer_id:r,sourceIds:[],tsCodes:[],rows:[]}).get(r)!;
  g.sourceIds.push(s.id);if(!g.tsCodes.includes(s.ts_code))g.tsCodes.push(s.ts_code);g.rows.push(...targetsFor(s,d,opts.evidence?.get(s.ts_code)??null));
 }
 plan.groups=[...byIssuer.values()].sort((a,b)=>a.issuer_id<b.issuer_id?-1:a.issuer_id>b.issuer_id?1:0);
 return plan;
}

export interface ApplyResolutionsResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;records:{applied:number;unresolved:number;failed:number;afterDelist:number;delistClosed:number;delistCorrected:number;delistConflicts:number;delistMissing:number;predecessorQuarantined:number}}

/** Applies a plan: one applyMemberships per issuer; records errors on the source rows. Caller owns the batch. */
export async function applyResolutions(deps:Pick<IndustryDeps,'tables'|'db'|'now'>,batchId:string,plan:ResolutionPlan,opts:{today:string}):Promise<ApplyResolutionsResult>{
 const counts=emptyCounts();const errors:BatchError[]=[];const skips:string[]=[];
 const records={applied:0,unresolved:0,failed:0,afterDelist:0,delistClosed:0,delistCorrected:0,delistConflicts:0,delistMissing:0,predecessorQuarantined:0};
 const at=()=>deps.now().toISOString();
 const byCode=new Map<string,string[]>();
 for(const u of plan.unresolved){
  if(u.failure){   // an unexpected resolver exception is a failure, not a normal "no issuer"
   await deps.db.recordResolutionError([u.id],{code:u.code,at:at(),...(u.detail!==undefined?{detail:u.detail.slice(0,500)}:{})});
   counts.failed++;records.unresolved++;errors.push({code:u.code,key:u.ts_code,message:u.detail?.slice(0,500)});continue;
  }
  (byCode.get(u.code)??byCode.set(u.code,[]).get(u.code)!).push(u.id);
 }
 for(const [code,ids] of byCode){
  await deps.db.recordResolutionError(ids,{code,at:at()});
  skips.push(...ids.map(()=>code));records.unresolved+=ids.length;
 }
 for(const b of plan.blocked){
  await quarantine(deps.tables,{dataset:SW_MEMBERSHIPS_DATASET,table:'issuer_industry_memberships',naturalKey:`sw2021:2021:${b.ts_code}:${b.in_date}`,reasonCode:'delist_date_missing',
   detail:{ts_code:b.ts_code},payload:{source_id:b.id},batchId});
  await deps.db.recordResolutionError([b.id],{code:'delist_date_missing',at:at(),detail:'stock_basic list_status D without a usable delist_date'});
  counts.quarantined++;records.delistMissing++;
 }
 if(plan.blocked.length)errors.push({code:'delist_date_missing',message:`${new Set(plan.blocked.map(b=>b.ts_code)).size} ts_code(s) delisted without a usable delist_date`});
 for(const a of plan.afterDelist){
  await quarantine(deps.tables,{dataset:SW_MEMBERSHIPS_DATASET,table:'issuer_industry_memberships',naturalKey:`sw2021:2021:${a.ts_code}:${a.in_date}`,reasonCode:'membership_after_delist',
   detail:{in_date:a.in_date,delist_date:a.delist_date},payload:{source_id:a.id,issuer_id:a.issuer_id},batchId});
  await deps.db.recordResolutionError([a.id],{code:'membership_after_delist',at:at(),detail:`in_date ${a.in_date} >= delist_date ${a.delist_date}`});
  counts.quarantined++;records.afterDelist++;skips.push('membership_after_delist');
 }
 // a rejected replacement of an already-resolved record must not leave the predecessor's rows eligible (Codex batch 3 P1)
 const rejectedBy=new Map<string,string[]>();
 for(const u of plan.unresolved)(rejectedBy.get(u.code)??rejectedBy.set(u.code,[]).get(u.code)!).push(u.id);
 for(const a of plan.afterDelist)(rejectedBy.get('membership_after_delist')??rejectedBy.set('membership_after_delist',[]).get('membership_after_delist')!).push(a.id);
 for(const b of plan.blocked)(rejectedBy.get('delist_date_missing')??rejectedBy.set('delist_date_missing',[]).get('delist_date_missing')!).push(b.id);
 for(const [reason,ids] of [...rejectedBy].sort(([x],[y])=>x<y?-1:x>y?1:0)){
  try{
   const res=await deps.db.quarantineMembershipLineage(batchId,'sw2021','2021',ids,reason);
   records.predecessorQuarantined+=res.quarantined;
   for(const mid of res.membership_ids){
    errors.push({code:'membership_predecessor_quarantined',key:mid});
    try{
     await quarantine(deps.tables,{dataset:SW_MEMBERSHIPS_DATASET,table:'issuer_industry_memberships',naturalKey:`sw2021:2021:membership:${mid}`,reasonCode:'membership_predecessor_quarantined',
      detail:{reason},payload:{membership_id:mid,replacement_reason:reason},batchId});
    }catch(e){errors.push({code:'quarantine_error',key:mid,message:errorMessage(e)});}
   }
  }catch(e){counts.failed++;errors.push({code:'lineage_quarantine_error',key:reason,message:errorMessage(e).slice(0,500)});}
 }
 for(const g of plan.groups){
  counts.fetched+=g.sourceIds.length;
  try{
   const res=await deps.db.applyMemberships(batchId,g.issuer_id,'sw2021','2021',g.rows,g.sourceIds,{method:'today',resolved_at:at(),as_of:opts.today});
   records.applied+=g.sourceIds.length;
   if(res.inserted+res.closed+res.superseded===0)counts.duplicates+=g.sourceIds.length;
   else if(res.closed+res.superseded>0)counts.versioned+=g.sourceIds.length;
   else counts.inserted+=g.sourceIds.length;
  }catch(e){
   const code=e instanceof IndustryDbError?e.code:'apply_error';
   await deps.db.recordResolutionError(g.sourceIds,{code,at:at(),detail:errorMessage(e).slice(0,500)});
   records.failed+=g.sourceIds.length;
   if(e instanceof IndustryDbError){
    await quarantine(deps.tables,{dataset:SW_MEMBERSHIPS_DATASET,table:'issuer_industry_memberships',naturalKey:`sw2021:2021:${g.issuer_id}`,reasonCode:code,
     detail:{message:errorMessage(e).slice(0,500)},payload:{issuer_id:g.issuer_id,source_ids:g.sourceIds,ts_codes:g.tsCodes},batchId});
    counts.quarantined+=g.sourceIds.length;skips.push(...g.sourceIds.map(()=>'apply_failed'));
    errors.push({code,key:g.issuer_id});
   }else{counts.failed+=g.sourceIds.length;errors.push({code,key:g.issuer_id,message:errorMessage(e)});}
  }
 }
 const skippedSummary=summarizeSkips(skips);
 return {counts,errors:withSkippedSummary(errors,skippedSummary),skippedSummary,records};
}

/**
 * K3 for records resolved in EARLIER runs (Codex plan audit round 1 #3): upstream keeps a delisted stock's window
 * open (out_date null, same payload), so a delisting that happens after resolution never reaches the resolver.
 * For every current, resolved record whose ts_code has a delist_date: when its ok rows are still open and the K3
 * window now ends (windowEnd(out_date, delist_date) not null), re-apply the SAME record with the bounded targets —
 * apply_industry_memberships step 3 closes open ok rows (valid_to, valid_to_available_date) in one transaction,
 * keeping the stored issuer and membership ids. A stored, already-closed window that differs from the K3 end
 * (the delisting was learned after the window closed) is superseded through IndustryDb.correctMembershipWindows —
 * the old rows become superseded (superseded_by → the corrected rows), so no incorrect ok row stays eligible
 * (Codex plan audit round 2 R2-2); a correction the DB rejects is quarantined membership_delist_conflict. A K3 end on or
 * before the window start (no valid interval, open or closed) makes the same call quarantine the ok rows atomically
 * (status quarantined, so aggregation excludes them) and records dq_quarantine membership_after_delist (round 3 R3-1).
 */
export async function reconcileDelistings(deps:Pick<IndustryDeps,'tables'|'db'|'now'>,batchId:string,delist:ReadonlyMap<string,string>,result:ApplyResolutionsResult,evidence:ReadonlyMap<string,DelistingEvidence>=new Map()):Promise<void>{
 if(delist.size===0)return;
 const resolvedCurrent=(await deps.db.currentSourceMemberships({})).filter(s=>s.issuer_id!==null&&delist.has(s.ts_code));
 const byIssuer=new Map<string,SourceMembershipRow[]>();
 for(const s of resolvedCurrent)(byIssuer.get(s.issuer_id!)??byIssuer.set(s.issuer_id!,[]).get(s.issuer_id!)!).push(s);
 for(const [issuer,records] of [...byIssuer].sort(([a],[b])=>a<b?-1:a>b?1:0)){
  const rows=(await deps.db.membershipsOfIssuer(issuer,{scheme:'sw2021'})).filter(m=>m.status==='ok');
  for(const s of records){
   const end=windowEnd(s.out_date,delist.get(s.ts_code)!);
   const mine=rows.filter(m=>m.source_membership_id===s.id);
   if(end===null||mine.length===0||mine.every(m=>m.valid_to===end&&m.valid_to_available_date===end))continue;
   const empty=end<=s.in_date;   // delisted on or before the window start: no valid interval remains (Codex round 3 R3-1)
   if(empty||mine.some(m=>m.valid_to!==null&&m.valid_to!==end)){
    // an already-closed window that ends after the K3 end (delisting learned late; Codex round 2 R2-2): the stored rows
    // are superseded by a corrected, K3-bounded version of the same record in one transaction (lineage kept)
    try{
     const res=await deps.db.correctMembershipWindows(batchId,issuer,'sw2021','2021',s.id,targetsFor(s,delist.get(s.ts_code)!,evidence.get(s.ts_code)??null));
     if(res.superseded>0){result.counts.versioned++;result.records.delistCorrected++;}
     if(res.quarantined>0){   // the ok rows were quarantined in that transaction: aggregation no longer counts them
      await quarantine(deps.tables,{dataset:SW_MEMBERSHIPS_DATASET,table:'issuer_industry_memberships',naturalKey:`sw2021:2021:${s.ts_code}:${s.in_date}`,reasonCode:'membership_after_delist',
       detail:{in_date:s.in_date,delist_date:delist.get(s.ts_code)!,membership_ids:res.membership_ids},payload:{source_id:s.id,issuer_id:issuer},batchId});
      result.counts.quarantined++;result.records.afterDelist++;
     }
     continue;
    }catch(e){
     if(!(e instanceof IndustryDbError))throw e;
    }
    await quarantine(deps.tables,{dataset:SW_MEMBERSHIPS_DATASET,table:'issuer_industry_memberships',naturalKey:`sw2021:2021:${s.ts_code}:${s.in_date}`,reasonCode:'membership_delist_conflict',
     detail:{stored_valid_to:mine.map(m=>m.valid_to),k3_end:end},payload:{source_id:s.id,issuer_id:issuer},batchId});
    result.counts.quarantined++;result.records.delistConflicts++;result.errors.push({code:'membership_delist_conflict',key:s.ts_code});
    continue;
   }
   try{
    const res=await deps.db.applyMemberships(batchId,issuer,'sw2021','2021',targetsFor(s,delist.get(s.ts_code)!,evidence.get(s.ts_code)??null),[s.id],{...s.resolution,delist_reconciled_at:deps.now().toISOString()});
    result.counts.versioned+=res.closed>0?1:0;result.records.delistClosed+=res.closed>0?1:0;
   }catch(e){
    result.counts.failed++;result.errors.push({code:e instanceof IndustryDbError?e.code:'apply_error',key:s.ts_code,message:errorMessage(e).slice(0,500)});
   }
  }
 }
}

export interface RunResolveOptions{triggeredBy?:TriggeredBy;today?:string}
export interface RunResolveResult{status:BatchStatus;batchId:string;counts:BatchCounts;errors:BatchError[];records:ApplyResolutionsResult['records'];exitCode:0|1}

/** Job step after runMembershipsSw: resolve every unresolved current record, apply per issuer, weekly freshness. */
export async function runResolveMemberships(deps:IndustryDeps,opts:RunResolveOptions={}):Promise<RunResolveResult>{
 if(!deps.codeVersion)throw new Error('code_version_missing');
 const today=opts.today??deps.now().toISOString().slice(0,10);
 const {batchId}=await startBatch(deps.tables,{producer:SW_RESOLVE_PRODUCER,dataset:SW_MEMBERSHIPS_DATASET,codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy??'script'});
 const noRecords={applied:0,unresolved:0,failed:0,afterDelist:0,delistClosed:0,delistCorrected:0,delistConflicts:0,delistMissing:0,predecessorQuarantined:0};
 let result:ApplyResolutionsResult|null=null;
 const pre:BatchError[]=[];
 try{
  const sources=await deps.db.currentSourceMemberships({unresolvedOnly:true});
  // K3/K4: delisting dates bound every window. The stock_basic(D) pass is persisted first (evidence kept); the resolver then works from the
  // stored rows, so already-resolved records are reconciled against later delistings too (Codex plan audit round 1 #3).
  const call=deps.tushare??defaultTushareCall({fetch:deps.fetch});
  const scan=scanDelistings(await fetchStockBasic(call,{listStatus:'D'},{now:deps.now}));
  await persistDelistings(deps,batchId,SW_MEMBERSHIPS_DATASET,scan,pre);
  const blocked=new Set(scan.missing);   // 'D' without a usable delist_date: never "no delisting"
  const delist=new Map<string,string>();const evidence=new Map<string,DelistingEvidence>();
  for(const r of await deps.db.delistings()){
   if(blocked.has(r.ts_code))continue;
   delist.set(r.ts_code,r.delist_date);evidence.set(r.ts_code,{delist_date:r.delist_date,raw_hash:r.raw_hash,batch_id:r.batch_id,observed_at:r.observed_at});
  }
  const resolved=new Map<string,ResolvedValue>();
  for(const ts of [...new Set(sources.map(s=>s.ts_code))].sort()){
   try{resolved.set(ts,(await resolveIssuer(deps.tables,{ticker:ts},{today}))?.issuer_id??null);}
   catch(e){
    const msg=errorMessage(e);
    resolved.set(ts,msg==='ambiguous_owner'?{error:'ambiguous_owner'}:{error:'resolve_error',detail:msg,failure:true});
   }
  }
  result=await applyResolutions(deps,batchId,resolveSourceMemberships(sources,resolved,delist,{evidence,blocked}),{today});
  await reconcileDelistings(deps,batchId,delist,result,evidence);
 }catch(e){
  const code=typeof (e as {code?:unknown}).code==='string'?(e as {code:string}).code:'resolve_run_error';
  result??={counts:emptyCounts(),errors:[],skippedSummary:{},records:{...noRecords}};
  result.counts.failed=Math.max(1,result.counts.failed);
  result.errors.push({code,message:errorMessage(e)});
 }
 result.errors.push(...pre);
 const status=await finishBatch(deps.tables,batchId,{counts:result.counts,errors:result.errors},deps.now());
 const outcome=loaderOutcome(status,result.counts);
 await recordAttempt(deps.tables,SW_MEMBERSHIPS_DATASET,{ok:outcome.ok,cadence:'weekly',now:deps.now(),detail:{records:result.records}});
 return {status,batchId,counts:result.counts,errors:result.errors,records:result.records,exitCode:result.counts.failed>0&&outcome.exitCode===0?1:outcome.exitCode};
}
