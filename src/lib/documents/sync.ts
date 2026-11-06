// src/lib/documents/sync.ts
// Document sync core (spec §6.1, §10). One ingest_batches row per call (producer documents-sync,
// dataset documents.<source>); the scheduled path reconciles the scope first (§6.4), then walks the
// due issuers until the budget has less than 90 s left (deadline_hit). Per issuer: lease → mode
// (backfill until backfill_done, then poll) → segments from the adapter → for each segment the
// complete ordered list → its items, resumed from the source_ref checkpoint (codex plan round 1
// P2-5; never an ordinal into the freshly fetched, mutable list): the cursor {segment, last_ref,
// settled, attempts, seq} names the furthest item processed in this segment pass, the refs processed
// without a stored row (404 / quarantined / exhausted) and the failed attempts per source_ref. On
// resume a settled ref, or a known (stored) ref at or before last_ref's position in the new list, is
// skipped; an unknown ref is always processed (an insertion is never skipped, a removal skips
// nothing); retries stay with their own source_ref. seq increases at every checkpoint and the SQL
// refuses a stale one (P2-4); the scope row is reread after the lease is claimed, so a batch that
// advanced and released between selection and claim is never regressed. The checkpoint is persisted
// before any network or write work on an item, so a crash resumes at that item. Per item: a known
// source_ref with refetch=false is a duplicate (no download, does
// not count against maxPerIssuer); otherwise fetch (≤ MAX_DOC_BYTES) → MIME → sha256 → object
// put (content-addressed, before the row) → assets (EDGAR index required, XBRL optional) →
// insert_document_version (document + assets in one transaction). too_large / unexpected_mime →
// quarantine and advance; 404 → skipped_summary(document_missing) and advance; fetch / put /
// required-asset failures do NOT advance: attempts[source_ref]+1, the issuer stops as failed, and the
// third failure quarantines document_fetch_exhausted and advances. A replacement version (an earlier
// version of the same source_ref exists) is available from the fetch instant, never back-dated
// (§5.2). Lease release: done → now+1 d; success but unfinished (item cap, deadline) → now;
// failed → now+6 h; lease_lost → no further database call for that issuer. Batch status always
// comes from batchStatusFromCounts; freshness ok = idle or at least one issuer success. Dry run:
// no batch, lease, cursor, object, quarantine or document write; fetches the bytes of the items it
// would process and plans their outcome against documentVersions.
import {createHash} from 'node:crypto';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {localDate} from '../research/ingest/collectors/shared';
import {classify} from './classify';
import {blobPath} from './object-store';
import {documentScopeRowFor,reconcileDocumentScope} from './scope';
import {DAY_MS,assetMime,makeDocBudget,sniffMime} from './sources/shared';
import type {Budget,FetchBytes,FetchedBytes,Listed,ListedAsset,SourceAdapter} from './sources/shared';
import {CLASSIFIER_GEN,DocumentsDbError,MAX_DOC_BYTES} from './types';
import type {Acquisition,AssetInsert,DocMarket,DocMime,DocScopeCursor,DocScopeInput,DocScopeRow,DocumentInsert,DocumentsDb,ListedSource,ObjectStore} from './types';

export interface SyncDeps{db:DocumentsDb;tables:TableClient;store:ObjectStore;adapter:SourceAdapter;fetchBytes:FetchBytes;now:()=>Date;deadline:Date|null;codeVersion:string|null;userAgent:string}
export interface SyncOptions{source:ListedSource;limit:number;issuerIds?:string[];sinceYear:number;refetch?:boolean;dryRun:boolean;triggeredBy:TriggeredBy;maxPerIssuer?:number}
export type IssuerOutcomeKind='success'|'failed'|'skipped'|'planned';
export interface DocIssuerOutcome{issuerId:string;fetchKey:string;outcome:IssuerOutcomeKind;code?:string;counts:BatchCounts;errors:BatchError[]}
export interface DocSyncReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];issuers:DocIssuerOutcome[];idle:boolean}
export class DocumentsSyncError extends Error{constructor(readonly code:string){super(code);this.name='DocumentsSyncError';}}

export const DEADLINE_MS=240_000;
export const LEASE_TTL_S=600;
export const LEASE_RENEW_MS=120_000;
export const MIN_ISSUER_MS=90_000;
/** Budget below which no new item starts: one fetch needs the 20 s reserve plus room to write. */
export const MIN_ITEM_MS=25_000;
export const DEFAULT_MAX_PER_ISSUER=50;
export const MAX_ITEM_ATTEMPTS=3;
export const NEXT_DUE_DONE_MS=DAY_MS;
export const NEXT_DUE_FAIL_MS=6*3600_000;
const COUNTERS=['fetched','inserted','duplicates','versioned','quarantined','failed'] as const;
const MARKET:Record<ListedSource,DocMarket>={edgar:'US',cninfo:'CN',hkexnews:'HK'};
/** Document MIME types accepted per source (anything else is quarantined unexpected_mime). */
export const ALLOWED_MIMES:Record<ListedSource,readonly DocMime[]>={edgar:['text/html','application/xhtml+xml','application/xml','text/xml','application/pdf'],cninfo:['application/pdf'],hkexnews:['application/pdf']};
const NY_DATE=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
/** available_date = calendar day of available_at in the source's zone: US America/New_York, CN/HK UTC+8 (spec §5.2). */
export function availableDateOf(source:ListedSource,iso:string):string{return source==='edgar'?NY_DATE.format(new Date(iso)):localDate(iso,8);}
const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
const sha256Hex=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const isLeaseLost=(e:unknown)=>e instanceof DocumentsDbError&&e.code==='lease_lost';

interface RunCtx{deps:SyncDeps;source:ListedSource;batchId:string|null;sinceYear:number;refetch:boolean;maxPerIssuer:number;budget:Budget}
type ItemResult={advance:true;stored:boolean}|{advance:false;code:string;message:string};
const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
class RetryItem extends Error{constructor(readonly code:string,message:string){super(message);}}

function acquisitionOf(got:FetchedBytes,userAgent:string):Acquisition{
 const len=Number(got.headers['content-length']);
 return {fetched_at:got.fetchedAt,http_status:got.status,content_type:got.headers['content-type']??null,content_length:got.headers['content-length']!==undefined&&Number.isFinite(len)?len:null,
  etag:got.headers.etag??null,last_modified:got.headers['last-modified']??null,user_agent:userAgent};
}

async function syncIssuer(ctx:RunCtx,selected:DocScopeRow):Promise<DocIssuerOutcome>{
 const {deps,source,batchId,budget}=ctx;const {db}=deps;const dry=batchId===null;
 const issuer=selected.issuer_id;
 const out:DocIssuerOutcome={issuerId:issuer,fetchKey:selected.fetch_key,outcome:'skipped',counts:emptyCounts(),errors:[]};
 const skips=new Map<string,number>();
 const skip=(reason:string)=>skips.set(reason,(skips.get(reason)??0)+1);
 const finish=(outcome:IssuerOutcomeKind,code?:string)=>{
  out.outcome=outcome;if(code!==undefined)out.code=code;
  for(const [reason,n] of skips)out.errors.push({code:'skipped_summary',key:`${issuer}:${reason}`,message:JSON.stringify({[reason]:n})});
  return out;
 };
 const [issuerRow]=await deps.tables.select('issuers',{issuer_id:issuer},{limit:1});
 if(issuerRow?.status==='merged'){skip('issuer_merged');return finish('skipped','issuer_merged');}
 if(!dry&&!await db.claimSyncLease(issuer,source,batchId,LEASE_TTL_S)){skip('leased');return finish('skipped','leased');}
 // P2-4: the selection's snapshot may be stale (another batch may have advanced and released in
 // between); mode and cursors come from the row reread under our lease
 const scope=dry?selected:(await db.scopeRows(source,[issuer]))[0]??selected;
 let leaseUntil=deps.now().getTime()+LEASE_TTL_S*1000;let released=false;
 const renew=async()=>{
  if(dry||leaseUntil-deps.now().getTime()>=LEASE_RENEW_MS)return;
  if(!await db.claimSyncLease(issuer,source,batchId!,LEASE_TTL_S))throw new DocumentsDbError('lease_lost');
  leaseUntil=deps.now().getTime()+LEASE_TTL_S*1000;
 };
 const release=async(outcome:'success'|'failed',delayMs:number)=>{
  if(dry||released)return;released=true;
  try{await db.releaseSyncLease(issuer,source,batchId!,outcome,new Date(deps.now().getTime()+delayMs).toISOString());}
  catch(e){out.errors.push({code:isLeaseLost(e)?'lease_lost':'cleanup_failed',key:issuer,message:`release: ${errMsg(e)}`});}
 };
 const mode:'backfill'|'poll'=scope.backfill_done?'poll':'backfill';
 const segments=deps.adapter.segments(scope,mode,ctx.sinceYear,deps.now());
 const stored=(mode==='backfill'?scope.backfill_cursor:scope.poll_cursor) as Partial<DocScopeCursor>;
 let seq=typeof stored.seq==='number'&&Number.isSafeInteger(stored.seq)&&stored.seq>=0?stored.seq:0;
 let seg=segments.findIndex(s=>s.id===stored.segment);
 let lastRef:string|null=null;let settled=new Set<string>();let attempts=new Map<string,number>();
 if(seg<0)seg=0;
 else{
  lastRef=typeof stored.last_ref==='string'?stored.last_ref:null;
  settled=new Set(Array.isArray(stored.settled)?stored.settled.filter((x):x is string=>typeof x==='string'):[]);
  if(isRecord(stored.attempts))for(const [ref,n] of Object.entries(stored.attempts))if(typeof n==='number'&&Number.isInteger(n)&&n>0)attempts.set(ref,n);
 }
 let dirty=false;
 const persist=async()=>{
  if(dry||!dirty||seg>=segments.length)return;
  await renew();
  seq++;
  await db.advanceCursor(issuer,source,batchId!,mode,{segment:segments[seg].id,last_ref:lastRef,settled:[...settled],attempts:Object.fromEntries(attempts),seq},false);
  dirty=false;
 };
 const park=async(reason:string,item:Listed,payload:Record<string,unknown>)=>{
  if(!dry)await quarantine(deps.tables,{dataset:`documents.${source}`,table:'disclosure_documents',naturalKey:`${source}:${item.source_ref}`,reasonCode:reason,batchId:batchId!,payload:{issuer_id:issuer,source_ref:item.source_ref,url:item.source_url,...payload}});
  out.counts.fetched++;out.counts.quarantined++;
 };
 /** One item; a RetryItem means "do not advance". */
 const processItem=async(item:Listed):Promise<ItemResult>=>{
  let got:FetchedBytes|'too_large'|'not_found';
  try{got=await deps.fetchBytes(item.source_url,budget,MAX_DOC_BYTES);}
  catch(e){return {advance:false,code:'fetch_failed',message:errMsg(e)};}
  if(got==='not_found'){skip('document_missing');return {advance:true,stored:false};}
  if(got==='too_large'){await park('document_too_large',item,{max_bytes:MAX_DOC_BYTES});return {advance:true,stored:false};}
  const mime=sniffMime(got.mime,got.bytes);
  if(mime===null||!ALLOWED_MIMES[source].includes(mime)){await park('unexpected_mime',item,{declared:got.mime,sniffed:mime});return {advance:true,stored:false};}
  const sha=sha256Hex(got.bytes);
  const prior=await db.documentVersions(source,item.source_ref,{limit:1000});
  if(dry){
   out.counts.fetched++;
   if(prior.rows.some(r=>r.content_sha256===sha))out.counts.duplicates++;else if(prior.rows.length>0)out.counts.versioned++;else out.counts.inserted++;
   return {advance:true,stored:true};
  }
  try{
   await deps.store.put(blobPath(sha,mime),got.bytes,mime);
  }catch(e){return {advance:false,code:'object_put_failed',message:errMsg(e)};}
  let assets:AssetInsert[];
  try{assets=await fetchAssets(item);}
  catch(e){if(e instanceof RetryItem)return {advance:false,code:e.code,message:e.message};throw e;}
  const cls=classify(source,{form_type:item.form_type,title:item.title,headline:item.headline,source_ref:item.source_ref});
  // A replacement is visible from the moment we saw it, not from the original release (spec §5.2).
  // The sync lease serialises this issuer/source; a source_ref listed under two issuers can race and
  // is then still versioned correctly by the SQL function (only available_at could be the release time).
  const replacement=prior.rows.length>0&&!prior.rows.some(r=>r.content_sha256===sha);
  const availableAt=replacement?got.fetchedAt:new Date(item.published_at).toISOString();
  const doc:DocumentInsert={
   issuer_id:issuer,source,market:MARKET[source],source_ref:item.source_ref,form_type:item.form_type,doc_class:cls.doc_class,classifier_gen:CLASSIFIER_GEN,
   title:item.title,language:cls.language,source_url:item.source_url,content_sha256:sha,bytes:got.bytes.length,mime,storage_path:blobPath(sha,mime),
   acquisition:acquisitionOf(got,deps.userAgent),published_at:new Date(item.published_at).toISOString(),published_at_precision:item.precision,
   available_at:availableAt,available_date:availableDateOf(source,availableAt),fiscal_year:cls.fiscal_year,fiscal_period:cls.fiscal_period,period_end:cls.period_end,
   filing_source_ref:cls.filing_source_ref,permission:'public',owner_user_id:null,license_ref:null,batch_id:batchId!,code_version:deps.codeVersion!,
  };
  await renew();
  const r=await db.insertDocumentVersion(issuer,source,batchId!,doc,assets);
  out.counts.fetched++;
  if(r.outcome==='inserted')out.counts.inserted++;else if(r.outcome==='versioned')out.counts.versioned++;else out.counts.duplicates++;
  return {advance:true,stored:true};
 };
 /** Required assets failing → RetryItem; optional ones → skipped_summary(xbrl_skipped). The index may name more assets. */
 const fetchAssets=async(item:Listed):Promise<AssetInsert[]>=>{
  const specs:ListedAsset[]=[...(item.assets??[])];const rows:AssetInsert[]=[];
  const optionalMiss=(a:ListedAsset,code:string,message:string)=>{if(a.required)throw new RetryItem(code,`${a.filename}: ${message}`);skip('xbrl_skipped');};
  for(let i=0;i<specs.length;i++){
   const a=specs[i];
   let r:FetchedBytes|'too_large'|'not_found';
   try{r=await deps.fetchBytes(a.url,budget,MAX_DOC_BYTES);}catch(e){optionalMiss(a,'asset_fetch_failed',errMsg(e));continue;}
   if(typeof r==='string'){optionalMiss(a,'asset_fetch_failed',r);continue;}
   const m=assetMime(r.mime,a.filename);
   if(m===null){optionalMiss(a,'asset_fetch_failed','asset_mime');continue;}
   const sha=sha256Hex(r.bytes);
   try{await deps.store.put(blobPath(sha,m),r.bytes,m);}catch(e){optionalMiss(a,'object_put_failed',errMsg(e));continue;}
   rows.push({role:a.role,filename:a.filename,source_url:a.url,content_sha256:sha,bytes:r.bytes.length,mime:m,storage_path:blobPath(sha,m),acquisition:acquisitionOf(r,deps.userAgent)});
   if(a.role==='filing_index'&&deps.adapter.assetsFromIndex){
    let more:ListedAsset[]=[];
    try{more=deps.adapter.assetsFromIndex(item,r.bytes);}catch{skip('xbrl_skipped');}
    for(const x of more)if(!specs.some(s=>s.role===x.role&&s.filename===x.filename))specs.push(x);
   }
  }
  return rows;
 };
 try{
  let newItems=0;let stop:null|'limit'|'deadline'=null;
  segLoop:
  for(;seg<segments.length;seg++,lastRef=null,settled=new Set(),attempts=new Map(),dirty=true){
   const segment=segments[seg];
   let items:Listed[];
   try{items=await deps.adapter.list(scope,segment,budget);}
   catch(e){
    await persist();
    out.counts.failed++;out.errors.push({code:'list_failed',key:`${issuer}:${segment.id}`,message:errMsg(e)});
    await release('failed',NEXT_DUE_FAIL_MS);return finish('failed','list_failed');
   }
   const known=await db.knownSourceRefs(issuer,source,items.map(i=>i.source_ref));
   // furthest position of this pass in the NEW list (-1: fresh pass, or the checkpoint item is gone)
   let reached=lastRef===null?-1:items.findIndex(i=>i.source_ref===lastRef);
   for(let i=0;i<items.length;i++){
    const item=items[i];const ref=item.source_ref;const isKnown=known.has(ref);
    const passed=()=>{if(i>reached){reached=i;lastRef=ref;}attempts.delete(ref);dirty=true;};
    if(settled.has(ref))continue;                                   // processed in this pass without a stored row
    if(isKnown&&i<=reached)continue;                                // stored and already passed in this pass
    if(isKnown&&!ctx.refetch){out.counts.fetched++;out.counts.duplicates++;passed();continue;}
    if(!isKnown&&newItems>=ctx.maxPerIssuer){stop='limit';break segLoop;}
    if(budget.remainingMs()<MIN_ITEM_MS){stop='deadline';break segLoop;}
    await persist();
    const r=await processItem(item);
    if(!isKnown)newItems++;
    if(r.advance){if(!r.stored)settled.add(ref);passed();continue;}
    const n=(attempts.get(ref)??0)+1;
    if(n>=MAX_ITEM_ATTEMPTS){
     await park('document_fetch_exhausted',item,{attempts:n,last_error:{code:r.code,message:r.message}});
     settled.add(ref);passed();continue;
    }
    attempts.set(ref,n);dirty=true;await persist();
    out.counts.fetched++;out.counts.failed++;out.errors.push({code:r.code,key:`${issuer}:${item.source_ref}`,message:r.message});
    await release('failed',NEXT_DUE_FAIL_MS);return finish('failed',r.code);
   }
  }
  if(stop!==null){
   await persist();
   if(stop==='deadline')out.errors.push({code:'deadline_hit',key:issuer,message:JSON.stringify({segment:segments[seg]?.id??null,last_ref:lastRef})});
   await release('success',0);return finish(dry?'planned':'success',stop==='limit'?'item_limit':'deadline_hit');
  }
  // Every segment done.
  const gap=mode==='backfill'?deps.adapter.coverageGap:null;
  if(gap!==null)out.errors.push({code:'coverage_summary',key:issuer,message:JSON.stringify({gap,segments:segments.map(s=>s.id)})});
  if(!dry){
   await renew();
   // backfill with a coverage gap restarts its (cheap: known items are duplicates) segments next time and never claims
   // completeness: an explicit reset, since migration one refuses to clear a backfill cursor otherwise (recheck N1)
   const restart=mode==='backfill'&&gap!==null;
   await db.advanceCursor(issuer,source,batchId!,mode,null,mode==='backfill'&&gap===null,restart);
  }
  await release('success',NEXT_DUE_DONE_MS);
  return finish(dry?'planned':'success');
 }catch(e){
  if(isLeaseLost(e)){out.counts.fetched++;out.counts.failed++;out.errors.push({code:'lease_lost',key:issuer});return finish('failed','lease_lost');}
  const code=e instanceof DocumentsDbError?e.code:'unknown';
  out.counts.fetched++;out.counts.failed++;out.errors.push({code,key:issuer,message:errMsg(e)});
  await release('failed',NEXT_DUE_FAIL_MS);return finish('failed',code);
 }
}

type Selected={scope:DocScopeRow}|{unresolved:string};
/**
 * Scheduled path: due rows. Explicit issuers: their rows by id in the given order; a missing row is
 * built by documentScopeRowFor — seeded through reconcileScope when applying (reasons ['explicit']),
 * constructed in memory for a dry run — and an issuer without a fetch key is reported scope_unresolved.
 */
async function selectScopes(deps:SyncDeps,opts:SyncOptions):Promise<Selected[]>{
 if(opts.issuerIds===undefined)return (await deps.db.scopeDue(opts.source,deps.now().toISOString(),opts.limit)).map(scope=>({scope}));
 const ids=[...new Set(opts.issuerIds)];
 const have=new Map((await deps.db.scopeRows(opts.source,ids)).map(s=>[s.issuer_id,s]));
 const today=deps.now().toISOString().slice(0,10);const seed:DocScopeInput[]=[];
 for(const id of ids){
  if(have.has(id))continue;
  const row=await documentScopeRowFor(deps.tables,opts.source,id,{today});
  if(row===null)continue;
  const at=deps.now().toISOString();
  if(opts.dryRun)have.set(id,{...row,source:opts.source,backfill_cursor:{},backfill_done:false,poll_cursor:{},next_due_at:at,lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:at});
  else seed.push(row);
 }
 if(seed.length>0){
  await deps.db.reconcileScope(opts.source,seed);
  for(const s of await deps.db.scopeRows(opts.source,seed.map(r=>r.issuer_id)))have.set(s.issuer_id,s);
 }
 return ids.map(id=>{const scope=have.get(id);return scope?{scope}:{unresolved:id};});
}
const unresolvedOutcome=(issuerId:string):DocIssuerOutcome=>({issuerId,fetchKey:'',outcome:'failed',code:'scope_unresolved',counts:{...emptyCounts(),fetched:1,failed:1},errors:[{code:'scope_unresolved',key:issuerId}]});

export async function runDocumentsSync(deps:SyncDeps,opts:SyncOptions):Promise<DocSyncReceipt>{
 const {source}=opts;const dataset=`documents.${source}`;
 if(deps.adapter.source!==source)throw new DocumentsSyncError('adapter_mismatch');
 if(!opts.dryRun&&(deps.codeVersion===null||deps.codeVersion===''))throw new DocumentsSyncError('code_version_unavailable');
 const budget=makeDocBudget(deps.deadline,deps.now);
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:DocIssuerOutcome[]=[];
 let idle=false,succeeded=0;
 const loop=async(batchId:string|null)=>{
  const ctx:RunCtx={deps,source,batchId,sinceYear:opts.sinceYear,refetch:opts.refetch??source==='hkexnews',maxPerIssuer:opts.maxPerIssuer??DEFAULT_MAX_PER_ISSUER,budget};
  const selected=await selectScopes(deps,opts);
  idle=selected.length===0;
  for(let i=0;i<selected.length;i++){
   const sel=selected[i];
   if(budget.remainingMs()<MIN_ISSUER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:selected.length-i})});break;}
   const r='unresolved' in sel?unresolvedOutcome(sel.unresolved):await syncIssuer(ctx,sel.scope);
   issuers.push(r);for(const k of COUNTERS)counts[k]+=r.counts[k];errors.push(...r.errors);
   if(r.outcome==='success')succeeded++;
  }
 };
 if(opts.dryRun){
  await loop(null);
  return {batchId:null,status:'dry_run',counts,errors,issuers,idle};
 }
 const {batchId}=await startBatch(deps.tables,{producer:'documents-sync',dataset,toolVersions:{classifier_gen:String(CLASSIFIER_GEN),source},codeVersion:deps.codeVersion!,triggeredBy:opts.triggeredBy});
 try{
  // Scheduled path reconciles the scope first; explicit issuers (scripts, tests) skip it.
  if(opts.issuerIds===undefined)await reconcileDocumentScope({tables:deps.tables,db:deps.db},source,{today:deps.now().toISOString().slice(0,10)});
  await loop(batchId);
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  await recordAttempt(deps.tables,dataset,{ok:idle||succeeded>0,cadence:'daily',now:deps.now(),detail:{attempted:issuers.length,succeeded,idle}});
  return {batchId,status,counts,errors,issuers,idle};
 }catch(e){
  errors.push({code:'unknown',message:errMsg(e)});
  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; runbook SQL closes it */}
  try{await recordAttempt(deps.tables,dataset,{ok:false,cadence:'daily',now:deps.now(),detail:{error:errMsg(e)}});}catch{/* same */}
  throw e;
 }
}
