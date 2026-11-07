// src/lib/macro/ingest.ts
// Write orchestration shared by /api/cron/macro-sync (FRED) and /api/macro/ingest (AKShare) — spec §4.4,
// §11, §0.2 M9/M10/N2/N3. Per retrieval: evidence bytes → private bucket (EvidenceStore.put) → one
// macro_retrievals receipt (MacroDb.putRetrieval) → macro quality rules (failures → dq_quarantine
// `rule_failed:<ruleId>`, not written) → adapter claim cross-check when claims are given (decimal
// inequality → `adapter_mismatch`, not written) → macro_write_observations (revisable from the catalog)
// → write conflicts → dq_quarantine. A failed upload or receipt fails every point of that retrieval
// (counted `failed`, nothing written: no observation without evidence). deriveAndWrite runs the
// region's derived series inside the same batch (N3). Counts follow dq/batches BatchCounts semantics.
// Values stay decimal text end to end; Number() happens only inside quality.ts.
// 第 5 稿: every MacroDb mutation carries the run's owner token (null for cron); `fenced` and an unbindable quarantined row
// throw IngestAbort (protocol aborts, never counted); previously_rejected conflicts are informational.
// 第 6 稿: receipts carry `usable` (written rows minus previously_rejected, P2-1); batchFinalizeInput mirrors finishBatch's status
// and error cap for MacroDb.finalizeBatch (P1-1/P2-4). quarantine() stays the shared, unfenced helper: an open item a fenced
// worker parked has no members (its link is fenced) and is harmless.
import {quarantine} from '../dq/quarantine';
import {UNACCOUNTED_ERROR,batchStatusFromCounts} from '../dq/batches';
import type {BatchError} from '../dq/batches';
import type {TableClient} from '../db/table-client';
import {MACRO_CATALOG,catalogById} from './catalog';
import {MacroDbError} from './db';
import type {MacroDb} from './db';
import {canonical,equals} from './decimal';
import {deriveSeries} from './derive';
import type {EvidenceStore} from './evidence';
import {validatePoint} from './quality';
import type {Adapter,ChunkCounts,EvidenceInput,FinalStatus,FinalizeInput,MacroSeriesDef,ObservationRow,ObservationWrite,ParsedPoint,Region,WriteConflictReason,WriteResult} from './types';

export interface IngestDeps{db:MacroDb;evidence:Pick<EvidenceStore,'put'>;tables:TableClient;codeVersion:string;now:()=>Date}
/** An adapter's own reading of one value (AKShare DataFrame), already mapped to period_end; cross-check only. */
export interface Claim{series_id:string;period_end:string;value_text:string}
export interface RetrievalInput{evidence:EvidenceInput;parsed:ParsedPoint[];claims?:Claim[]}
/** usable (第 6 稿 P2-1): inserted + versioned + duplicates minus previously_rejected — rows that are data; counts stay the six DQ counters. */
export interface IngestReceipt{counts:ChunkCounts;usable:number;errors:BatchError[];retrievalIds:string[]}
/** A protocol abort that must stop the request, never a counted data failure (第 5 稿): `fenced` — the run's owner token was
 *  superseded by a takeover (P1-3); `quarantine_link_failed` — a stored quarantined row could not be bound to an open item
 *  (P2-3). The ingest route answers 409 fenced / 500 without completing the chunk; cron closes its batch failed. */
export class IngestAbort extends Error{
 /** partial (四轮 P2-2): committed outcomes of the aborted call, attached by ingestEvidence / deriveAndWrite on the way out. */
 constructor(readonly code:'fenced'|'quarantine_link_failed',readonly key?:string,readonly partial?:IngestReceipt){super(key===undefined?code:`${code}:${key}`);this.name='IngestAbort';}
}
/** The batch error for an abort (callers push it once; partial.errors never contains it). */
export const abortError=(e:IngestAbort):BatchError=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key};
const isFenced=(e:unknown)=>e instanceof MacroDbError&&e.code==='fenced';

export const DATASET_OF:Record<Adapter,'macro.fred'|'macro.akshare'>={fred_csv:'macro.fred',akshare:'macro.akshare'};
export const DATASET_OF_REGION:Record<Region,'macro.fred'|'macro.akshare'>={US:'macro.fred',CN:'macro.akshare'};
export const WRITE_CHUNK=1000;
/** Input periods read per derived series (complete history; daily inputs since 2000 are ≈ 7 000). */
export const DERIVE_MAX_ROWS=20000;
/** Conflicts that park the row in dq_quarantine; missing_evidence / missing_input are failures instead. */
const QUARANTINE_REASONS:readonly WriteConflictReason[]=['unexpected_revision','conflicting_rows','stale_delivery'];
const TABLE='macro_observations';

export const emptyChunkCounts=():ChunkCounts=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0});
export function addCounts(a:ChunkCounts,b:ChunkCounts):ChunkCounts{
 return {fetched:a.fetched+b.fetched,inserted:a.inserted+b.inserted,duplicates:a.duplicates+b.duplicates,versioned:a.versioned+b.versioned,quarantined:a.quarantined+b.quarantined,failed:a.failed+b.failed};
}
const keyOf=(seriesId:string,periodEnd:string)=>`${seriesId}|${periodEnd}`;

/** finishBatch's limits (src/lib/dq/batches.ts, private capErrors): macro_finalize_batch stores errors as given, so they are capped here. */
export const MAX_BATCH_ERRORS=100,MAX_ERROR_MESSAGE=500;
export function capBatchErrors(errors:readonly BatchError[]):BatchError[]{
 const kept=errors.slice(0,MAX_BATCH_ERRORS).map(e=>e.message!==undefined&&e.message.length>MAX_ERROR_MESSAGE?{...e,message:e.message.slice(0,MAX_ERROR_MESSAGE)}:e);
 return errors.length>MAX_BATCH_ERRORS?[...kept,{code:'truncated',message:`${errors.length-MAX_BATCH_ERRORS} more`}]:kept;
}
/**
 * The FinalizeInput finishBatch would write (第 6 稿 P1-1/P2-4): status from batchStatusFromCounts unless `force` (a fatal
 * abort passes 'failed', so native rows already written never make the batch 'partial'), the unaccounted marker finishBatch
 * prepends, errors capped like finishBatch. Throws invalid_now / invalid_counts like finishBatch.
 */
export function batchFinalizeInput(result:{counts:ChunkCounts;errors:BatchError[];rejected?:boolean},now:Date,force?:FinalStatus):FinalizeInput{
 const computed=batchStatusFromCounts(result.counts,result.errors,{rejected:result.rejected});
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_now');
 if(computed==='running')throw new Error('invalid_status');
 const c=result.counts;
 const unaccounted=!result.rejected&&c.fetched>0&&c.inserted+c.duplicates+c.versioned+c.quarantined+c.failed===0;
 return {status:force??computed,counts:{...c},errors:capBatchErrors(unaccounted?[UNACCOUNTED_ERROR,...result.errors]:result.errors),finishedAt:now.toISOString()};
}

/**
 * Splits rows into calls of about `size` rows without ever separating one (series_id, period_end) group,
 * so a duplicated period in one evidence is always judged inside one RPC call (conflicting_rows).
 */
export function chunkWrites<T extends {series_id:string;period_end:string}>(rows:readonly T[],size=WRITE_CHUNK):T[][]{
 const sorted=[...rows].sort((a,b)=>a.series_id<b.series_id?-1:a.series_id>b.series_id?1:a.period_end<b.period_end?-1:a.period_end>b.period_end?1:0);
 const out:T[][]=[];let cur:T[]=[];
 for(const r of sorted){
  const last=cur[cur.length-1];
  if(cur.length>=size&&last&&keyOf(last.series_id,last.period_end)!==keyOf(r.series_id,r.period_end)){out.push(cur);cur=[];}
  cur.push(r);
 }
 if(cur.length)out.push(cur);
 return out;
}

/** unit (四轮 P2-2): the retrieval / derived series in progress — its size and the outcome total when it began. */
interface Ctx{deps:IngestDeps;dataset:string;batchId:string;ownerToken:string|null;counts:ChunkCounts;usable:number;errors:BatchError[];unit:{size:number;base:number}|null}
const outcomesOf=(c:ChunkCounts)=>c.inserted+c.duplicates+c.versioned+c.quarantined+c.failed;
const beginUnit=(ctx:Ctx,n:number)=>{ctx.counts.fetched+=n;ctx.unit={size:n,base:outcomesOf(ctx.counts)};};
/** Committed outcomes so far: fetched leaves out the aborted unit's points that never got an outcome. */
function partialOf(ctx:Ctx,retrievalIds:readonly string[]):IngestReceipt{
 const unanswered=ctx.unit?Math.max(0,ctx.unit.size-(outcomesOf(ctx.counts)-ctx.unit.base)):0;
 return {counts:{...ctx.counts,fetched:ctx.counts.fetched-unanswered},usable:ctx.usable,errors:[...ctx.errors],retrievalIds:[...retrievalIds]};
}
/** Runs the body; an IngestAbort leaves with the partial receipt attached (四轮 P2-2). */
async function withPartial(ctx:Ctx,retrievalIds:readonly string[],body:()=>Promise<void>):Promise<void>{
 try{await body();}
 catch(e){if(e instanceof IngestAbort&&!e.partial)throw new IngestAbort(e.code,e.key,partialOf(ctx,retrievalIds));throw e;}
}

/** quarantine() that never aborts the batch: a failed insert into dq_quarantine is a failed row. Returns the (possibly
 *  reused) item id when parked, else null. */
async function park(ctx:Ctx,naturalKey:string,reasonCode:string,detail:Record<string,unknown>,payload:Record<string,unknown>):Promise<string|null>{
 try{
  return await quarantine(ctx.deps.tables,{dataset:ctx.dataset,table:TABLE,naturalKey,reasonCode,detail,payload,batchId:ctx.batchId});
 }catch{
  ctx.errors.push({code:'quarantine_failed',key:naturalKey});
  return null;
 }
}
/** Binds the stored quarantined row to its dq_quarantine item (macro_link_quarantine; 第 4 稿 P1-4, 第 5 稿 P2-3). The SQL
 *  locks the item row. A closed item whose exact member (this row) its resolution already accepted / rejected returns 0: the
 *  link is complete (第 6 稿 P2-3). quarantine_closed = the row is still quarantined but a resolution closed the item after
 *  quarantine() returned it → park again (quarantine() now opens a NEW item, the old one is no longer open) and link once
 *  more. Anything else, or a second failure, aborts: a quarantined row must never stay unbound. */
async function link(ctx:Ctx,itemId:string,observationId:string,naturalKey:string,repark:()=>Promise<string|null>):Promise<void>{
 const fence={batchId:ctx.batchId,ownerToken:ctx.ownerToken};
 try{await ctx.deps.db.linkQuarantine(itemId,[observationId],fence);return;}
 catch(e){
  if(isFenced(e))throw new IngestAbort('fenced',naturalKey);
  if(!(e instanceof MacroDbError&&e.code==='quarantine_closed'))throw new IngestAbort('quarantine_link_failed',naturalKey);
 }
 const again=await repark();
 if(!again)throw new IngestAbort('quarantine_link_failed',naturalKey);
 try{await ctx.deps.db.linkQuarantine(again,[observationId],fence);}
 catch(e){throw new IngestAbort(isFenced(e)?'fenced':'quarantine_link_failed',naturalKey);}
}

async function writeAll(ctx:Ctx,rows:ObservationWrite[]):Promise<void>{
 for(const chunk of chunkWrites(rows)){
  let res:WriteResult;
  try{res=await ctx.deps.db.writeObservations(ctx.batchId,ctx.deps.codeVersion,chunk,ctx.ownerToken);}
  catch(e){
   if(isFenced(e))throw new IngestAbort('fenced',chunk[0].series_id);
   ctx.counts.failed+=chunk.length;
   ctx.errors.push({code:e instanceof MacroDbError?`write_${e.code}`:'write_failed',key:chunk[0].series_id});
   continue;
  }
  ctx.counts.inserted+=res.inserted;ctx.counts.duplicates+=res.duplicates;ctx.counts.versioned+=res.versioned;ctx.counts.quarantined+=res.quarantined;
  ctx.usable+=res.inserted+res.duplicates+res.versioned-res.conflicts.filter(c=>c.reason==='previously_rejected').length;   // 第 6 稿 P2-1
  for(const c of res.conflicts){
   const key=keyOf(c.series_id,c.period_end);
   if(c.reason==='previously_rejected')continue;   // informational: the RPC counted it as a duplicate; a rejected value is final (第 5 稿 P1-2)
   if(QUARANTINE_REASONS.includes(c.reason)){
    // The RPC already stored the row as quarantined (and counted it). conflicting_rows stores nothing (observation_id null):
    // a failed park only adds an error. A stored row must end up bound to an open item, else the request aborts (P2-3).
    const repark=()=>park(ctx,key,c.reason,{value_text:c.value_text,current_value_text:c.current_value_text},{value_text:c.value_text});
    const itemId=await repark();
    if(c.observation_id){
     if(!itemId)throw new IngestAbort('quarantine_link_failed',key);
     await link(ctx,itemId,c.observation_id,key,repark);
    }
   }else{
    ctx.counts.failed+=1;ctx.errors.push({code:c.reason,key});
   }
  }
 }
}

const collectable=(def:MacroSeriesDef|undefined,adapter:Adapter):def is MacroSeriesDef=>
 !!def&&def.status==='active'&&!def.derive&&!def.aliasOf&&def.source?.adapter===adapter;

/** ownerToken: the AKShare run's token (第 5 稿 P1-3); omitted / null for cron (its batch has no run row). */
export async function ingestEvidence(deps:IngestDeps,input:{batchId:string;adapter:Adapter;retrievals:RetrievalInput[];ownerToken?:string|null}):Promise<IngestReceipt>{
 const ctx:Ctx={deps,dataset:DATASET_OF[input.adapter],batchId:input.batchId,ownerToken:input.ownerToken??null,counts:emptyChunkCounts(),usable:0,errors:[],unit:null};
 const retrievalIds:string[]=[];
 await withPartial(ctx,retrievalIds,async()=>{
 for(const r of input.retrievals){
  const e=r.evidence,n=r.parsed.length;
  const label=[...new Set(r.parsed.map(p=>p.seriesId))].join(',')||e.fetchUrl.slice(0,120);
  beginUnit(ctx,n);
  if(e.adapter!==input.adapter){ctx.counts.failed+=n;ctx.errors.push({code:'evidence_adapter_mismatch',key:label});continue;}
  let objectPath:string;
  try{({objectPath}=await deps.evidence.put(e));}
  catch{ctx.counts.failed+=n;ctx.errors.push({code:'evidence_upload_failed',key:label});continue;}
  let retrievalId:string;
  try{
   retrievalId=await deps.db.putRetrieval(
    {sha256:e.sha256,object_path:objectPath,adapter:e.adapter,content_type:e.contentType,byte_length:e.bytes.byteLength},
    {fetch_url:e.fetchUrl,fetch_host:e.fetchHost,http_status:e.httpStatus,fetched_at:e.fetchedAt,batch_id:input.batchId,tool_versions:e.toolVersions},ctx.ownerToken);
  }catch(x){
   if(isFenced(x))throw new IngestAbort('fenced',label);
   ctx.counts.failed+=n;ctx.errors.push({code:'retrieval_failed',key:label});continue;
  }
  retrievalIds.push(retrievalId);
  const claims=new Map<string,string[]>();
  for(const c of r.claims??[]){const k=keyOf(c.series_id,c.period_end);claims.set(k,[...(claims.get(k)??[]),c.value_text]);}
  const bySeries=new Map<string,ParsedPoint[]>();
  for(const p of r.parsed)bySeries.set(p.seriesId,[...(bySeries.get(p.seriesId)??[]),p]);
  const writes:ObservationWrite[]=[];
  for(const [seriesId,points] of bySeries){
   const def=catalogById(seriesId);
   if(!collectable(def,input.adapter)){ctx.counts.failed+=points.length;ctx.errors.push({code:'unknown_series',key:seriesId});continue;}
   // 第 7 稿 T6-1: distinct canonical values for one period across ALL points, judged before quality / claim filtering —
   // the whole group is quarantined (conflicting_rows), none of it is written or used as the jump baseline.
   const seen=new Map<string,Set<string>>();
   for(const p of points){let c:string;try{c=canonical(p.valueText);}catch{continue;}seen.set(p.periodEnd,(seen.get(p.periodEnd)??new Set<string>()).add(c));}
   const conflicting=new Set<string>();
   for(const [periodEnd,vals] of seen){
    if(vals.size<2)continue;
    conflicting.add(periodEnd);
    const valueTexts=[...vals].sort();
    if(await park(ctx,keyOf(seriesId,periodEnd),'conflicting_rows',{value_texts:valueTexts},{value_texts:valueTexts})!==null)ctx.counts.quarantined+=1;else ctx.counts.failed+=1;
   }
   let prev:string|null=null;
   for(const p of [...points].sort((a,b)=>a.periodEnd<b.periodEnd?-1:a.periodEnd>b.periodEnd?1:0)){
    const key=keyOf(seriesId,p.periodEnd);
    if(conflicting.has(p.periodEnd))continue;
    let value:string;
    try{value=canonical(p.valueText);}catch{ctx.counts.failed+=1;ctx.errors.push({code:'invalid_value',key});continue;}
    const payload={value_text:value,retrieval_id:retrievalId,locator:p.locator};
    const q=validatePoint(def,value,prev);
    if(!q.passed){
     let parked=false;
     for(const f of q.failed)parked=(await park(ctx,key,`rule_failed:${f.ruleId}`,{...(f.detail??{}),rules_version:q.version},payload))!==null||parked;
     if(parked)ctx.counts.quarantined+=1;else ctx.counts.failed+=1;
     continue;
    }
    const claimed=claims.get(key);
    if(claimed&&claimed.some(c=>{try{return !equals(c,value);}catch{return true;}})){
     if(await park(ctx,key,'adapter_mismatch',{value_text:value,claim_value_texts:claimed},payload)!==null)ctx.counts.quarantined+=1;else ctx.counts.failed+=1;
     continue;
    }
    prev=value;
    writes.push({series_id:seriesId,period_end:p.periodEnd,value_text:value,available_at:e.fetchedAt,revisable:def.revisionPolicy==='revisable',retrieval_id:retrievalId,locator:p.locator});
   }
  }
  await writeAll(ctx,writes);
  ctx.unit=null;
 }
 });
 return {counts:ctx.counts,usable:ctx.usable,errors:ctx.errors,retrievalIds};
}

/** Derived series of a region whose input is native come first, so a derived input is written before its dependants. */
export function derivedOf(region:Region):MacroSeriesDef[]{
 const defs=MACRO_CATALOG.filter(d=>d.region===region&&d.status==='active'&&d.derive);
 const depth=(d:MacroSeriesDef,seen=0):number=>{const input=d.derive?catalogById(d.derive.from):undefined;return input?.derive&&seen<8?1+depth(input,seen+1):0;};
 return [...defs].sort((a,b)=>depth(a)-depth(b));
}

/**
 * Recomputes every derived series of `region` from the inputs' COMPLETE eligible history (plus rows of the open batch
 * `batchId`) and writes it in that batch (spec §0.2 N3; 第 4 稿 P1-5/P1-7). No window: a revised input three years
 * back must reach its derived period and, for yoy, period + 12; unchanged rows return as duplicates.
 */
export async function deriveAndWrite(deps:IngestDeps,region:Region,batchId:string,ownerToken:string|null=null):Promise<IngestReceipt>{
 const ctx:Ctx={deps,dataset:DATASET_OF_REGION[region],batchId,ownerToken,counts:emptyChunkCounts(),usable:0,errors:[],unit:null};
 const now=deps.now();
 await withPartial(ctx,[],async()=>{
 for(const def of derivedOf(region)){
  const input=catalogById(def.derive!.from);
  if(!input){ctx.errors.push({code:'missing_derive_input',key:def.id});continue;}
  let history:ObservationRow[];
  try{history=await deps.db.eligibleHistory(input.id,{includeBatch:batchId,maxRows:DERIVE_MAX_ROWS});}
  catch(e){ctx.errors.push({code:e instanceof MacroDbError?`history_${e.code}`:'history_failed',key:def.id});continue;}
  let writes:ObservationWrite[];
  try{writes=deriveSeries(def,history,{now});}
  catch{ctx.errors.push({code:'derive_failed',key:def.id});continue;}
  beginUnit(ctx,writes.length);
  await writeAll(ctx,writes);
  ctx.unit=null;
 }
 });
 return {counts:ctx.counts,usable:ctx.usable,errors:ctx.errors,retrievalIds:[]};
}
