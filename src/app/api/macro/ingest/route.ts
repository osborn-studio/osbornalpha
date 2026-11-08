// src/app/api/macro/ingest/route.ts
// AKShare ingest endpoint (spec §4.4, §8, §11; §0.2 M9/M24/N2/N3; plan 第 4 稿 P1-6/P2-1/P2-2/P2-4; 第 5 稿 P1-3/P1-4/
// P1-5/P2-1/P2-2). Auth: MACRO_INGEST_SECRET bearer compared in constant time (authorizedCronRequest); unset secret → 503.
// Body ≤ 4 MB. Every chunk / finish carries the owner_token that start returned; every MacroDb mutation passes it, and a
// superseded token (takeover) answers 409 fenced — the collector then restarts the whole collection under a new batch.
//  start  → upserts the catalog mirror, starts batch producer 'py-akshare' / dataset 'macro.akshare', then takes the
//           single-writer lease atomically (claimIngest: 2 h max age, 10 min processing timeout, takeover only when the
//           body asks): runs it aborted whose batch still runs finish failed ('aborted'); a live holder → our batch
//           finishes rejected ('concurrent_batch') and 409 batch_running; else {batch_id, owner_token}.
//  chunk  → every evidence item's bytes must hash to its sha256 (else 400 before any claim or write); then claimChunk:
//           only the claiming request ingests (a done repeat returns the stored receipt, a processing repeat → 409
//           chunk_in_progress). Evidence must come from the series' official host and data path with HTTP 200 and a
//           plausible fetched_at; the TS parser extracts the points — Python numbers are never stored; claims are
//           compared by decimal equality inside ingestEvidence. completeChunk stores counts, sanitized errors and the
//           claim / location key sets.
//  finish → beginFinish (owner only; all chunks done, else 409) hands out a finish token; resumable and exclusive via
//           finish_progress: CN derivation (N3; skipped when no usable native row landed, Σ native_usable = 0) →
//           MacroDb.finalizeBatch (fenced by owner + finish token, 第 6 稿 P1-1) with native chunk + derived counts, failed
//           series (series_outcomes), every stored error, the batch-wide unlocated-claims summary and no_native_outcomes →
//           MacroDb.recordFreshness('macro.akshare', daily, ok = status !== 'failed' && usable native rows; the upsert and the
//           freshness_recorded checkpoint in one fenced transaction) → the Task 11 publish step (publishRegion CN, keyed + fenced) → stored receipt (run
//           finished, lease released). A retry skips completed steps; a finished run returns its stored receipt. Only this
//           route publishes CN.
// Responses carry codes, keys and counts only.
import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {emptyCounts,finishBatch,startBatch} from '@/lib/dq/batches';
import type {BatchError,BatchStatus} from '@/lib/dq/batches';
import type {Row} from '@/lib/db/table-client';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {authorizedCronRequest} from '@/lib/observability/cron-auth';
import {CATALOG_VERSION,MACRO_CATALOG} from '@/lib/macro/catalog';
import {productionMacroDeps} from '@/lib/macro/deps';
import type {MacroDeps} from '@/lib/macro/deps';
import {MacroDbError} from '@/lib/macro/db';
import {IngestAbort,abortError,addCounts,batchFinalizeInput,deriveAndWrite,emptyChunkCounts,ingestEvidence} from '@/lib/macro/ingest';
import type {Claim,IngestReceipt,RetrievalInput} from '@/lib/macro/ingest';
import {MAX_BODY_BYTES,parseIngestBody} from '@/lib/macro/ingest-schema';
import type {IngestBody,SeriesOutcome} from '@/lib/macro/ingest-schema';
import {claimPeriodEnd,parserFor} from '@/lib/macro/parsers';
import {MACRO_RULES_VERSION} from '@/lib/macro/quality';
import {publishRegion} from '@/lib/macro/snapshots';
import type {ChunkCounts,ChunkError,ChunkRecord,EvidenceInput,FinishProgress,FinishStep,ParsedPoint} from '@/lib/macro/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const INGEST_ROUTE_VERSION='macro-ingest/1';
const DATASET='macro.akshare',PRODUCER='py-akshare';
const LEASE_MS=2*3600_000,PROCESSING_TIMEOUT_MS=10*60_000,MAX_FUTURE_MS=5*60_000,MAX_AGE_MS=24*3600_000;   // maxDuration (300 s) < processing timeout
const NO_STORE={'Cache-Control':'no-store'};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:NO_STORE});
const err=(code:string,message:string,status:number,extra:Record<string,unknown>={})=>json({error:{code,message,...extra}},status);
/** Codes and keys only (messages may echo upstream text), except the skipped_summary INFO entry whose message is a count. */
const publicErrors=(errors:BatchError[])=>errors.map(e=>e.code==='skipped_summary'&&e.message?{code:e.code,key:e.key,message:e.message}:e.key===undefined?{code:e.code}:{code:e.code,key:e.key});
/** Stored chunk errors: code + key only, ≤ 500 per chunk (macro_complete_chunk limit). */
const storedErrors=(errors:BatchError[])=>errors.slice(0,500).map(e=>{
 const o:{code:string;key?:string;message?:string}={code:e.code};
 if(e.key!==undefined)o.key=e.key;
 if(e.code==='parse_failed'&&e.message)o.message=e.message.slice(0,500);   // T9-1: 'retrieval <id>: <parser code>' — an id and a code, never upstream text
 return o;
});

const fencedResponse=()=>err('fenced','This batch was taken over; restart the collection under a new batch',409);
/** The batch row; finishing:true also accepts a finished batch whose run is no longer open (a retried finish, P2-4). A batch
 *  whose run was aborted by a takeover answers fenced (第 5 稿 P1-3), so the collector restarts instead of giving up. */
async function batchRow(deps:MacroDeps,batchId:string,opts:{finishing?:boolean}={}):Promise<Row|NextResponse>{
 const [b]=await deps.tables.select('ingest_batches',{batch_id:batchId},{limit:1});
 if(!b||b.dataset!==DATASET||b.producer!==PRODUCER)return err('batch_not_found','Unknown batch',404);
 if(b.status!=='running'){
  const run=await deps.db.ingestRun(batchId);
  if(run?.state==='aborted')return fencedResponse();
  if(opts.finishing&&run&&run.state!=='open')return b;
  return err('batch_not_running','Batch is finished',409);
 }
 return b;
}
/** start's sweep of aborted / refused batches still uses the shared finishBatch; batch_not_running = finished elsewhere. */
const notRunning=(e:unknown)=>e instanceof Error&&e.message==='batch_not_running';

async function start(deps:MacroDeps,body:Extract<IngestBody,{action:'start'}>){
 await deps.db.upsertCatalog(MACRO_CATALOG,CATALOG_VERSION,MACRO_RULES_VERSION);
 const {batchId}=await startBatch(deps.tables,{producer:PRODUCER,dataset:DATASET,codeVersion:deps.codeVersion,triggeredBy:'script',
  toolVersions:{...body.tool_versions,ingest:INGEST_ROUTE_VERSION,catalog:CATALOG_VERSION,rules:MACRO_RULES_VERSION}});
 let claim:Awaited<ReturnType<MacroDeps['db']['claimIngest']>>;
 try{claim=await deps.db.claimIngest(batchId,DATASET,{maxAgeMs:LEASE_MS,processingTimeoutMs:PROCESSING_TIMEOUT_MS,takeover:body.takeover===true});}
 catch(e){
  // no orphan running batch: finalize the batch startBatch just created as failed (best effort, one retry, logged), then surface the error
  for(let attempt=0;attempt<2;attempt++){
   try{await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code:'claim_failed'}]});break;}
   catch(x){if(notRunning(x))break;if(attempt===1)console.error('[macro-ingest] finalizing the batch after a failed claim failed',batchId,x instanceof Error?x.message:x);}
  }
  throw e;
 }
 // Batches of aborted runs (第 5 稿 P1-3/P2-1): finish them failed. batch_not_running = finished elsewhere (idempotent); any other
 // failure is logged, never fatal here — claimIngest lists the batch again on the next start until it is finished.
 for(const id of claim.aborted){
  try{await finishBatch(deps.tables,id,{counts:emptyCounts(),errors:[{code:'aborted'}]});}
  catch(e){if(!notRunning(e))console.error('[macro-ingest] finishing aborted batch failed; retried on the next start',id,e instanceof Error?e.message:e);}
 }
 if(claim.status==='busy'){
  await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code:'concurrent_batch'}],rejected:true}).catch(()=>undefined);
  return err('batch_running','A macro.akshare batch is still running',409,{batch_id:claim.holder});
 }
 return json({batch_id:batchId,owner_token:claim.ownerToken});
}

const duplicateReceipt=(batchId:string,c:ChunkRecord)=>json({status:'duplicate',batch_id:batchId,seq:c.seq,counts:c.counts,errors:publicErrors(c.errors)});

async function chunk(deps:MacroDeps,body:Extract<IngestBody,{action:'chunk'}>){
 const b=await batchRow(deps,body.batch_id);
 if(b instanceof NextResponse)return b;
 const decoded=body.evidence.map(e=>({e,bytes:new Uint8Array(Buffer.from(e.bytes_b64,'base64'))}));
 for(const {e,bytes} of decoded)if(createHash('sha256').update(bytes).digest('hex')!==e.sha256)return err('sha256_mismatch','Evidence bytes do not match sha256',400,{series_id:e.series_id});
 const claim=await deps.db.claimChunk(body.batch_id,body.seq,body.total,body.owner_token);   // throws fenced / chunk_total_mismatch / batch_not_open
 if(claim.status==='processing')return err('chunk_in_progress','This chunk is being processed; retry later',409,{seq:body.seq});
 if(claim.status==='done')return duplicateReceipt(body.batch_id,claim.chunk);
 const batchTools=(b.tool_versions&&typeof b.tool_versions==='object'?b.tool_versions:{}) as Record<string,string>;
 const now=deps.now().getTime();
 let counts=emptyChunkCounts();const errors:BatchError[]=[];
 const retrievals:RetrievalInput[]=[];const located=new Set<string>();
 for(const {e,bytes} of decoded){
  const parser=parserFor(e.series_id);
  if(!parser){counts.failed+=1;errors.push({code:'unknown_series',key:e.series_id});continue;}
  let url:URL;
  try{url=new URL(e.url);}catch{counts.failed+=1;errors.push({code:'evidence_not_allowed',key:e.series_id});continue;}
  const fetched=Date.parse(e.fetched_at);
  // host (with port) must equal the allowed host exactly, and no userinfo
  if(url.host!==parser.spec.fetch_host||url.username!==''||url.password!==''||url.pathname!==parser.spec.evidence_path||e.status!==200){counts.failed+=1;errors.push({code:'evidence_not_allowed',key:e.series_id});continue;}
  if(fetched>now+MAX_FUTURE_MS||now-fetched>MAX_AGE_MS){counts.failed+=1;errors.push({code:'fetched_at_out_of_range',key:e.series_id});continue;}
  const evidenceInput:EvidenceInput={sha256:e.sha256,bytes,adapter:'akshare',fetchUrl:e.url,fetchHost:url.hostname,httpStatus:e.status,contentType:e.content_type,
   fetchedAt:new Date(fetched).toISOString(),toolVersions:{...batchTools,parser:parser.version}};
  let parsed:ParsedPoint[];
  try{parsed=parser.parse(bytes);}
  catch(x){
   // T9-1: hash-verified official bytes are kept even when the parser rejects them — store them and the retrieval receipt, and carry the
   // retrieval id in the chunk error so the failure can be investigated and replayed
   counts.failed+=1;
   const reason=(x as {code?:string}).code??'unparseable';
   let note=`retrieval unavailable: ${reason}`;
   try{
    const {objectPath}=await deps.evidence.put(evidenceInput);
    const id=await deps.db.putRetrieval({sha256:e.sha256,object_path:objectPath,adapter:'akshare',content_type:e.content_type,byte_length:bytes.byteLength},
     {fetch_url:e.url,fetch_host:url.hostname,http_status:e.status,fetched_at:evidenceInput.fetchedAt,batch_id:body.batch_id,tool_versions:evidenceInput.toolVersions},body.owner_token);
    note=`retrieval ${id}: ${reason}`;
   }catch(y){
    if(y instanceof MacroDbError&&y.code==='fenced')throw y;
   }
   errors.push({code:'parse_failed',key:e.series_id,message:note});
   continue;
  }
  const claims:Claim[]=[];
  for(const c of body.claims){
   if(c.series_id!==e.series_id)continue;
   const pe=claimPeriodEnd(c.period_label,parser.spec.period);
   if(pe)claims.push({series_id:c.series_id,period_end:pe,value_text:c.value_text});
  }
  for(const p of parsed)located.add(`${p.seriesId}|${p.periodEnd}`);
  retrievals.push({evidence:evidenceInput,parsed,claims});
 }
 // Claim identities: the batch-wide unlocated summary is computed at finish from these sets (P2-1), never per chunk.
 const claimKeys=[...new Set(body.claims.map(c=>{const p=parserFor(c.series_id),pe=p?claimPeriodEnd(c.period_label,p.spec.period):null;return pe?`${c.series_id}|${pe}`:`${c.series_id}|?${c.period_label}`;}))].sort();
 let rec:IngestReceipt;
 try{rec=await ingestEvidence(deps,{batchId:body.batch_id,adapter:'akshare',retrievals,ownerToken:body.owner_token});}
 catch(e){
  // 四轮 P2-2: an unbindable quarantined row aborts after committed writes. Merge the committed outcomes (partial) exactly once and
  // store them with the abort error through completeChunk — the chunk's single write; a retry gets the stored receipt — so finish
  // forces the batch failed with true counts. fenced (or no partial) propagates: 409 / 500 without completeChunk.
  if(!(e instanceof IngestAbort)||e.code!=='quarantine_link_failed'||!e.partial)throw e;
  counts=addCounts(counts,e.partial.counts);
  await deps.db.completeChunk(body.batch_id,body.seq,{counts,nativeUsable:e.partial.usable,errors:storedErrors([abortError(e),...errors,...e.partial.errors]),claimKeys,locatedKeys:[...located].sort()},body.owner_token);
  return err('quarantine_link_failed','A quarantined value could not be bound; the chunk is recorded and the batch will finish failed',500);
 }
 counts=addCounts(counts,rec.counts);errors.push(...rec.errors);
 // native_usable (第 6 稿 P2-1): rows that are data — previously_rejected redeliveries count as duplicates but not as usable
 const stored=await deps.db.completeChunk(body.batch_id,body.seq,{counts,nativeUsable:rec.usable,errors:storedErrors(errors),claimKeys,locatedKeys:[...located].sort()},body.owner_token);
 return json({status:'accepted',batch_id:body.batch_id,seq:body.seq,counts:stored.counts,errors:publicErrors(errors)});
}

/** Native outcomes of THIS collection = the chunk counts (chunks carry evidence only; 第 5 稿 P2-2). */
const nativeOf=(chunks:ChunkRecord[])=>chunks.reduce((acc,c)=>addCounts(acc,c.counts),emptyChunkCounts());
/** Usable native rows (第 6 稿 P2-1): the derivation / publication / freshness gate. Not the duplicates counter — it includes
 *  previously_rejected redeliveries. */
const usableOf=(chunks:ChunkRecord[])=>chunks.reduce((n,c)=>n+c.native_usable,0);
/** Batch totals for finalizeBatch: native chunks + derivation + failed series; every stored error plus the distinct unlocated-claims
 *  summary, and no_native_outcomes (non-INFO) when no usable native row landed (第 5 稿 P2-2, 第 6 稿 P2-1). */
function summarise(chunks:ChunkRecord[],derived:{counts:ChunkCounts;errors:ChunkError[]},outcomes:SeriesOutcome[],nativeUsable:number):{counts:ChunkCounts;errors:BatchError[];failedSeries:string[]}{
 const native=nativeOf(chunks);
 let counts=addCounts(native,derived.counts);
 const failed=outcomes.filter(o=>!o.ok);
 counts={...counts,failed:counts.failed+failed.length};
 const errors:BatchError[]=chunks.flatMap(c=>c.errors);
 const located=new Set(chunks.flatMap(c=>c.located_keys));
 const unlocated=new Set(chunks.flatMap(c=>c.claim_keys).filter(k=>!located.has(k))).size;
 // Owner ruling: an AKShare claim whose period has no TS-parsed raw value is NOT quarantined (no raw value to hold); it is
 // counted once per batch (distinct keys) under the existing INFO code skipped_summary, which does not degrade the batch.
 if(unlocated>0)errors.push({code:'skipped_summary',key:'unlocated_claims',message:`${unlocated} claims without a located raw value`});
 errors.push(...derived.errors);
 for(const o of failed)errors.push({code:o.code??'collect_failed',key:o.series_id});
 if(nativeUsable===0)errors.push({code:'no_native_outcomes'});
 return {counts,errors,failedSeries:failed.map(o=>o.series_id)};
}

const outcomesKey=(o:readonly SeriesOutcome[])=>JSON.stringify([...o].map(x=>[x.series_id,x.ok,x.code??null]).sort((a,b)=>String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0));

async function finish(deps:MacroDeps,body:Extract<IngestBody,{action:'finish'}>){
 const b=await batchRow(deps,body.batch_id,{finishing:true});
 if(b instanceof NextResponse)return b;
 const begun=await deps.db.beginFinish(body.batch_id,body.total,body.owner_token);   // another owner / aborted run → fenced
 if(begun.status==='incomplete')return err('chunks_incomplete','Not every chunk has arrived',409,{missing:begun.missing.slice(0,50)});
 if(begun.status==='finished')return begun.progress.receipt?json(begun.progress.receipt):err('batch_not_running','Batch is finished',409);   // replay, re-run nothing
 // Only the holder of the latest finish token may record steps: a concurrent finish of the same owner is fenced at its next step.
 const fence={ownerToken:body.owner_token,finishToken:begun.finishToken};
 const step=(name:FinishStep,data:Record<string,unknown>)=>deps.db.recordFinishStep(body.batch_id,name,data,fence);
 let p:FinishProgress=begun.progress;
 const chunks=await deps.db.chunksOf(body.batch_id);
 const native=nativeOf(chunks);const nativeUsable=usableOf(chunks);const nativeLanded=nativeUsable>0;   // 第 6 稿 P2-1
 if(!p.derived){
  // idempotent by nature: a retry after a crash past deriveAndWrite writes duplicates only
  if(nativeLanded){
   let d:IngestReceipt;
   try{d=await deriveAndWrite(deps,'CN',body.batch_id,body.owner_token);}
   catch(e){
    // 四轮 P2-2: a derivation abort keeps its committed outcomes — merged exactly once through the 'derived' checkpoint (a retry
    // reads it back, never re-derives), with the abort error first so it survives the cap; finalize below is forced failed
    if(!(e instanceof IngestAbort)||e.code!=='quarantine_link_failed'||!e.partial)throw e;
    d={...e.partial,errors:[abortError(e),...e.partial.errors]};
   }
   // T9-2/T9-3: the outcome counts and the collector's series_outcomes are frozen in the very call that marks 'derived'
   p=await step('derived',{counts:d.counts,errors:storedErrors(d.errors),usable:d.usable,series_outcomes:body.series_outcomes});
  }else p=await step('derived',{skipped:'no_native_outcomes',series_outcomes:body.series_outcomes});                                       // 第 5 稿 P2-2
 }
 const derived='counts' in p.derived!?p.derived!:{counts:emptyChunkCounts(),errors:[]};
 // T9-3: retries use the frozen outcomes; a different payload is refused (checkpoints written before this field existed keep the request's)
 const frozen=p.derived!.series_outcomes;
 if(frozen&&outcomesKey(frozen)!==outcomesKey(body.series_outcomes))return err('finish_payload_conflict','series_outcomes differ from the first finish of this batch',409);
 const outcomes=frozen??body.series_outcomes;
 const {counts,errors,failedSeries}=summarise(chunks,derived,outcomes,nativeUsable);
 if(!p.batch_finished){
  // fenced side effect (第 6 稿 P1-1): written only under the current finish token and only while the batch runs; finalized:false =
  // an earlier attempt of this run finished it — the stored status is read back, never finished twice
  const fatal=errors.some(e=>e.code==='quarantine_link_failed');                                     // a chunk or the derivation aborted (四轮 P2-2)
  const fin=await deps.db.finalizeBatch(body.batch_id,batchFinalizeInput({counts,errors},deps.now(),fatal?'failed':undefined),fence);
  p=await step('batch_finished',{status:fin.status,date:deps.now().toISOString().slice(0,10)});
 }
 const batchStatus=p.batch_finished!.status as BatchStatus;
 const today=p.batch_finished!.date;
 const ok=batchStatus!=='failed'&&nativeLanded;
 if(!p.freshness_recorded){
  // the dq_freshness upsert and the freshness_recorded checkpoint commit together under the finish token (第 6 稿 P1-1): a crash
  // either loses both (the retry writes once) or keeps both (the retry skips) — never a double count, never a lost attempt
  p=await deps.db.recordFreshness(body.batch_id,{dataset:DATASET,ok,cadence:'daily',now:deps.now().toISOString(),
   detail:{batch_id:body.batch_id,batch_status:batchStatus,failed_series:failedSeries}},fence);
 }
 // Task 11 (spec §0.2 M24/N3; 第 4 稿 P2-4; 第 5 稿 P1-3/P1-4/P1-5/P2-2): CN publishes only here, after the batch's derivation,
 // keyed 'ingest:<batch_id>' and fenced by the owner + finish tokens, so a retry after a crash past the publish replays the same
 // snapshot. A failed batch or one without native outcomes is an intentional terminal skip. Any other non-published outcome is
 // retryable: recorded as a publish_attempt, the run stays finishing and the collector retries finish (503 publish_pending).
 // 'published' is checkpointed only after success (incl. replay) or an intentional skip.
 let publish=p.published;
 if(!publish){
  if(batchStatus==='failed'||!nativeLanded)publish={status:'skipped',region:'CN',reason:nativeLanded?'batch_failed':'no_native_outcomes'};
  else{
   const r=await publishRegion({db:deps.db,onPublished:deps.onPublished},'CN',today,{publishKey:`ingest:${body.batch_id}`,fence:{batchId:body.batch_id,ownerToken:body.owner_token,finishToken:begun.finishToken}});
   if(r.status!=='published'){
    await step('publish_attempt',{at:deps.now().toISOString(),status:r.status,reason:r.status==='failed'?r.reason:null});
    return err('publish_pending','CN publication did not complete; retry finish with the same owner token',503,{publish:r.status});
   }
   publish={...r};
  }
  p=await step('published',publish);
 }
 const receipt={batch_id:body.batch_id,status:batchStatus,date:today,counts,native_counts:native,native_usable:nativeUsable,derived_counts:derived.counts,errors:publicErrors(errors),publish};
 await step('receipt',receipt);
 return json(receipt);
}

export async function POST(request:Request):Promise<NextResponse>{
 const secret=process.env.MACRO_INGEST_SECRET;
 if(!secret)return err('ingest_unavailable','Ingest unavailable',503);
 if(!authorizedCronRequest(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const declared=Number(request.headers.get('content-length')??'0');
 if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)return err('body_too_large','Body exceeds 4 MB',413);
 const raw=new Uint8Array(await request.arrayBuffer());
 if(raw.byteLength>MAX_BODY_BYTES)return err('body_too_large','Body exceeds 4 MB',413);
 let value:unknown;
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{return err('invalid_json','Body is not JSON',400);}
 const parsed=parseIngestBody(value);
 if(!parsed.ok)return err(parsed.error,'Invalid body',400);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const deps=productionMacroDeps({codeVersion});
 try{
  const body=parsed.body;
  return body.action==='start'?await start(deps,body):body.action==='chunk'?await chunk(deps,body):await finish(deps,body);
 }catch(e){
  // 第 5 稿 P1-3/P2-3: a superseded owner token → 409 fenced (the collector restarts under a new batch); an unbindable quarantined
  // row → 500 with the chunk left 'processing' (never completed), which the collector's stall path also restarts
  if(e instanceof IngestAbort)return e.code==='fenced'?fencedResponse():err('quarantine_link_failed','A quarantined value could not be bound; the chunk was not completed',500);
  if(e instanceof MacroDbError&&e.code==='fenced')return fencedResponse();
  // protocol refusals from the lease / chunk RPCs (MacroDbError rpc_failed with the SQL code as message) → 409
  const m=e instanceof MacroDbError||e instanceof Error?e.message:'';
  if(['chunk_total_mismatch','batch_not_open','batch_not_claimed','run_not_finishing'].includes(m))return err(m,'Ingest protocol refusal',409);
  return err('ingest_failed','Macro ingest failed',500);
 }
}
