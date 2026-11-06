// src/lib/documents/extract/run.ts
// Extraction scheduler (spec §7.3 first bullet, §10). One ingest_batches row (producer
// documents-extract, dataset documents.extract). Documents: storedDue(limit) (status 'stored', lease
// free or expired, NOT filtered by attempts), or the given documentIds (only those still 'stored').
// Per document, while at least MIN_DOC_MS of budget remains (else deadline_hit):
//   claimExtractLease(doc, batch, 600) — the only attempt counter; false → skip every write for this
//   document (the claim may just have made it 'extract_failed' on the third attempt);
//   store.get(storage_path) and check its sha256 = content_sha256;
//   extractPdf (application/pdf) | extractHtml (text/html, application/xhtml+xml, application/xml,
//   text/xml); other MIME → failExtract('unsupported_mime'); a throw → failExtract('extract_error'),
//   the budget → failExtract('extract_timeout');
//   the layout runs under withLeaseHeartbeat (lease.ts; renewExtractLease every HEARTBEAT_MS while
//   pdf.js works, codex plan round 2) with at most DOC_EXTRACT_MS and MAX_PDF_PAGES (too_many_pages);
//   renewExtractLease again before each mutating phase (round 1 P2-7): a refused renewal → lease_lost,
//   nothing more is written;
//   buildPagesJson → store.put(pagesJsonPath(content_sha256, sha)) — a put failure leaves the lease to
//   expire (no failExtract, no finishExtract; the claim already counted the attempt);
//   finishExtract(doc, batch, extraction, pageInsertsOf(json)) (role/status decided in SQL).
// Counts: fetched = documents claimed; inserted = versions written (extracted or no_text_layer, the
// latter also reported as skipped_summary(no_text_layer)); failed = everything else. Freshness
// documents.extract (daily): ok when idle or at least one document got a version. A run that applies
// needs a code version (null → refused). deps.preflight runs first (R5-P2-1): a setup error such as
// worker_missing fails the batch with that code before any document is read or claimed. dryRun: no batch, no claim, no writes — reads and extracts
// the due documents and reports page counts.
import {emptyCounts,finishBatch,startBatch} from '../../dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../../dq/batches';
import {recordAttempt} from '../../dq/freshness';
import type {TableClient} from '../../db/table-client';
import {pagesJsonPath} from '../object-store';
import {DocumentsDbError,EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from '../types';
import type {DocumentRow,DocumentsDb,ObjectStore,PageLayout} from '../types';
import {buildPagesJson,pageInsertsOf,sha256Hex} from './pages-json';
import {FINAL_RESERVE_MS,HEARTBEAT_MS,withLeaseHeartbeat} from '../lease';
import {ExtractTimeout,ExtractTooManyPages} from './pdf';
import type {ExtractBudget} from './pdf';

export const EXTRACT_LEASE_TTL_S=600;
export const MIN_DOC_MS=90_000;
/** Per-document extraction budget, well under the 600 s lease (R1-P2-7 round 2); checked before every page. */
export const DOC_EXTRACT_MS=240_000;
/** Page cap of one PDF (bounded blocking work): more pages → failExtract('too_many_pages'). */
export const MAX_PDF_PAGES=1500;
/** Budget handed to the extractor: the deadline minus this reserve for the pages.json put and finishExtract. */
export const FINISH_RESERVE_MS=20_000;
const HTML_MIMES=new Set(['text/html','application/xhtml+xml','application/xml','text/xml']);

export interface ExtractDeps{
 db:DocumentsDb;tables:TableClient;store:ObjectStore;
 extractPdf:(bytes:Uint8Array,budget:ExtractBudget)=>Promise<{pages:PageLayout[];hasTextLayer:boolean}>;
 extractHtml:(bytes:Uint8Array,budget:ExtractBudget)=>PageLayout[]|Promise<PageLayout[]>;   // production: both run in a worker thread (extract/isolate.ts, round 3)
 now:()=>Date;deadline:Date|null;codeVersion:string|null;
 /** Setup check before any claim (codex plan round 5 R5-P2-1): null = ready, else a setup error code
  *  ('worker_missing' when the worker bundle is absent). Omitted (tests with injected extractors) = ready. */
 preflight?:()=>string|null;
}
export interface ExtractOptions{limit:number;documentIds?:string[];dryRun:boolean;triggeredBy:TriggeredBy}
export type DocOutcome='extracted'|'no_text_layer'|'failed'|'skipped'|'planned';
export interface DocExtractResult{documentId:string;outcome:DocOutcome;code?:string;pageCount?:number;extractionId?:string}
export interface ExtractReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];documents:DocExtractResult[];idle:boolean}

const remaining=(deps:ExtractDeps)=>deps.deadline===null?Number.POSITIVE_INFINITY:deps.deadline.getTime()-deps.now().getTime();
const errCode=(e:unknown)=>e instanceof DocumentsDbError?e.code:e instanceof ExtractTimeout?'extract_timeout':e instanceof ExtractTooManyPages?'too_many_pages':'extract_error';

async function dueDocuments(db:DocumentsDb,opts:ExtractOptions,errors:BatchError[]):Promise<DocumentRow[]>{
 if(!opts.documentIds)return db.storedDue(opts.limit);
 const out:DocumentRow[]=[];
 for(const id of opts.documentIds.slice(0,opts.limit)){
  const d=await db.documentById(id);
  if(d&&d.status==='stored')out.push(d);else errors.push({code:'skipped_summary',key:id,message:d?`not_stored:${d.status}`:'not_found'});
 }
 return out;
}

/** Bytes → layout by MIME; throws ExtractTimeout / any extractor error; 'unsupported_mime' as an Error message. */
async function layoutOf(deps:ExtractDeps,doc:DocumentRow,bytes:Uint8Array,signal?:AbortSignal):Promise<{pages:PageLayout[];hasTextLayer:boolean}>{
 // the run deadline less the finish reserve, at most DOC_EXTRACT_MS for this document, 0 once the lease heartbeat stopped;
 // production extractors enforce it as a hard worker deadline (extract/isolate.ts) and abort on the signal
 const until=deps.now().getTime()+DOC_EXTRACT_MS;
 const budget:ExtractBudget={remainingMs:()=>signal?.aborted?0:Math.min(remaining(deps)-FINISH_RESERVE_MS,until-deps.now().getTime()),maxPages:MAX_PDF_PAGES,...(signal?{signal}:{})};
 if(doc.mime==='application/pdf')return deps.extractPdf(bytes,budget);
 if(HTML_MIMES.has(doc.mime)){const pages=await deps.extractHtml(bytes,budget);return {pages,hasTextLayer:pages.some(p=>p.text!=='')};}
 throw new Error('unsupported_mime');
}

export async function runDocumentsExtract(deps:ExtractDeps,opts:ExtractOptions):Promise<ExtractReceipt>{
 const {db,tables,store}=deps;
 if(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>1000)throw new Error('invalid_limit');
 const counts=emptyCounts();const errors:BatchError[]=[];const documents:DocExtractResult[]=[];
 // R5-P2-1: a setup failure (e.g. the worker bundle was never built) is reported before any document
 // is claimed, so no attempt is consumed and no valid document drifts towards extract_failed
 const setup=deps.preflight?.()??null;
 if(setup!==null&&opts.dryRun)return {batchId:null,status:'dry_run',counts,errors:[{code:setup,message:'setup'}],documents:[],idle:false};
 if(opts.dryRun){
  const due=await dueDocuments(db,opts,errors);
  for(const doc of due){
   if(remaining(deps)<MIN_DOC_MS){errors.push({code:'deadline_hit',message:`${due.length-documents.length} documents not started`});break;}
   try{const l=await layoutOf(deps,doc,await store.get(doc.storage_path));documents.push({documentId:doc.document_id,outcome:'planned',pageCount:l.pages.length});}
   catch(e){documents.push({documentId:doc.document_id,outcome:'failed',code:e instanceof Error&&e.message==='unsupported_mime'?'unsupported_mime':errCode(e)});}
  }
  return {batchId:null,status:'dry_run',counts,errors,documents,idle:due.length===0};
 }
 const codeVersion=deps.codeVersion;
 if(!codeVersion)throw new Error('code_version_unavailable');
 const {batchId}=await startBatch(tables,{producer:'documents-extract',dataset:'documents.extract',toolVersions:{extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION},codeVersion,triggeredBy:opts.triggeredBy});
 if(setup!==null){
  errors.push({code:setup,message:'setup: nothing claimed (build the extraction worker: npx tsx scripts/documents/build-extract-worker.ts)'});
  counts.failed=1;
  const status=await finishBatch(tables,batchId,{counts,errors},deps.now());
  await recordAttempt(tables,'documents.extract',{ok:false,cadence:'daily',now:deps.now(),detail:{batch_id:batchId,setup}});
  return {batchId,status,counts,errors,documents:[],idle:false};
 }
 const due=await dueDocuments(db,opts,errors);
 const fail=async(doc:DocumentRow,code:string,message?:string,callFail=true)=>{
  counts.failed++;errors.push({code,key:doc.document_id,...(message?{message}:{})});documents.push({documentId:doc.document_id,outcome:'failed',code});
  if(callFail){try{await db.failExtract(doc.document_id,batchId,code);}catch(e){errors.push({code:errCode(e),key:doc.document_id,message:'fail_extract'});}}
 };
 /** P2-7: the holder renews before a mutating phase; taken over (false) or a failing call → the document fails, nothing more is written. */
 const keep=async(doc:DocumentRow):Promise<boolean>=>{
  let ok=false;let code='lease_lost';
  try{ok=await db.renewExtractLease(doc.document_id,batchId,EXTRACT_LEASE_TTL_S);}catch(e){code=errCode(e);}
  if(!ok){counts.failed++;errors.push({code,key:doc.document_id});documents.push({documentId:doc.document_id,outcome:'failed',code});}
  return ok;
 };
 let started=0;
 for(const doc of due){
  if(remaining(deps)<MIN_DOC_MS){errors.push({code:'deadline_hit',message:`${due.length-started} documents not started`});break;}
  started++;
  let claimed:boolean;
  try{claimed=await db.claimExtractLease(doc.document_id,batchId,EXTRACT_LEASE_TTL_S);}
  catch(e){counts.failed++;errors.push({code:errCode(e),key:doc.document_id,message:'claim'});documents.push({documentId:doc.document_id,outcome:'failed',code:errCode(e)});continue;}
  if(!claimed){errors.push({code:'skipped_summary',key:doc.document_id,message:'leased_or_exhausted'});documents.push({documentId:doc.document_id,outcome:'skipped',code:'leased_or_exhausted'});continue;}
  counts.fetched++;
  let bytes:Uint8Array;
  try{bytes=await store.get(doc.storage_path);}
  catch{await fail(doc,'object_get_failed');continue;}
  if(sha256Hex(bytes)!==doc.content_sha256){await fail(doc,'content_hash_mismatch');continue;}
  let layout:{pages:PageLayout[];hasTextLayer:boolean};
  // R1-P2-7 round 2: the lease is renewed on a timer DURING the extraction; a refused renewal → lease_lost, nothing written
  try{layout=await withLeaseHeartbeat(()=>db.renewExtractLease(doc.document_id,batchId,EXTRACT_LEASE_TTL_S),signal=>layoutOf(deps,doc,bytes,signal),
   {intervalMs:HEARTBEAT_MS,remainingMs:()=>remaining(deps),reserveMs:FINAL_RESERVE_MS});}
  catch(e){
   if(e instanceof DocumentsDbError&&e.code==='lease_lost'){counts.failed++;errors.push({code:'lease_lost',key:doc.document_id});documents.push({documentId:doc.document_id,outcome:'failed',code:'lease_lost'});continue;}
   const code=e instanceof Error&&e.message==='unsupported_mime'?'unsupported_mime':errCode(e);
   await fail(doc,code,code==='extract_error'&&e instanceof Error?e.message:undefined);continue;
  }
  const built=buildPagesJson({content_sha256:doc.content_sha256,code_version:codeVersion,has_text_layer:layout.hasTextLayer,pages:layout.pages});
  const path=pagesJsonPath(doc.content_sha256,built.sha256);
  if(!await keep(doc))continue;
  try{await store.put(path,built.bytes,'application/json');}
  catch{await fail(doc,'object_put_failed',undefined,false);continue;}
  if(!await keep(doc))continue;
  try{
   const extractionId=await db.finishExtract(doc.document_id,batchId,{extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:codeVersion,
    has_text_layer:layout.hasTextLayer,page_count:layout.pages.length,pages_json_path:path,pages_json_sha256:built.sha256},pageInsertsOf(built.json));
   counts.inserted++;
   if(!layout.hasTextLayer)errors.push({code:'skipped_summary',key:doc.document_id,message:'no_text_layer'});
   documents.push({documentId:doc.document_id,outcome:layout.hasTextLayer?'extracted':'no_text_layer',pageCount:layout.pages.length,extractionId});
  }catch(e){await fail(doc,errCode(e),undefined,false);}
 }
 const idle=due.length===0;
 const status=await finishBatch(tables,batchId,{counts,errors},deps.now());
 await recordAttempt(tables,'documents.extract',{ok:idle||counts.inserted>0,cadence:'daily',now:deps.now(),detail:{batch_id:batchId,idle}});
 return {batchId,status,counts,errors,documents,idle};
}
