// src/lib/documents/extract/isolate.ts
// Main-thread side of the extraction worker (codex plan round 3, R1-P2-7 final). extractInWorker starts
// one worker per job (the bundle build/extract-worker/extract-worker.mjs under the app root, located
// like pdfjsAssets: by process.cwd(); injectable for tests) and settles exactly once: the worker's answer; hardMs elapsed →
// worker.terminate() and ExtractTimeout ('extract_timeout') — this also stops a worker stuck inside one
// page or in a synchronous loop, which a budget checked between pages cannot; the signal aborted (the
// lease heartbeat stopped) → terminate and DocumentsDbError('lease_lost'); a worker error or an exit
// without an answer → Error. The main thread's event loop stays free, so the heartbeat keeps beating.
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {DocumentsDbError,EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from '../types';
import {ExtractTimeout,ExtractTooManyPages} from './pdf';
import type {ExtractJob,ExtractResult} from './worker-job';

/** Old-generation heap cap of one worker (an oversized PDF fails the document, not the function). */
export const WORKER_MAX_OLD_GEN_MB=1024;
export interface IsolateOptions{hardMs:number;signal?:AbortSignal;/** test-only: another worker script */entry?:string;/** test-only: smaller heap cap */maxOldGenerationSizeMb?:number}
type Reply={ok:true;result:ExtractResult}|{ok:false;error:{name:string;message:string;pages:number|null}};
/** The bundled worker (scripts/documents/build-extract-worker.ts) under the app root, located like pdfjsAssets (process.cwd()). */
export const workerEntry=(root:string=process.cwd())=>join(root,'build','extract-worker','extract-worker.mjs');
/** The manifest the build writes next to the bundle (scripts/documents/build-extract-worker.ts). */
export const workerManifestPath=(entry:string)=>entry.replace(/\.mjs$/,'.manifest.json');
export interface WorkerManifest{extractor_version:string;table_algo_version:string;source_hash:string}
/**
 * Setup check before any claim: 'worker_missing' (no bundle), 'worker_stale' (no readable manifest, or one
 * built for other extractor / table-algorithm versions than the running code — its output would be
 * labelled with versions it was not produced by), else null. The source hash is recorded for provenance
 * and checked where sources exist (extract.ts always rebuilds); a deployment carries only the bundle.
 */
export function workerPreflight(root:string=process.cwd()):'worker_missing'|'worker_stale'|null{
 const entry=workerEntry(root);
 if(!existsSync(entry))return 'worker_missing';
 try{
  const m=JSON.parse(readFileSync(workerManifestPath(entry),'utf8')) as Partial<WorkerManifest>;
  const ok=m.extractor_version===EXTRACTOR_VERSION&&m.table_algo_version===TABLE_ALGO_VERSION&&typeof m.source_hash==='string'&&/^[0-9a-f]{64}$/.test(m.source_hash);
  return ok?null:'worker_stale';
 }catch{return 'worker_stale';}
}
function errorOf(e:{name:string;message:string;pages:number|null}):Error{
 if(e.name==='ExtractTimeout')return new ExtractTimeout();
 if(e.name==='ExtractTooManyPages')return new ExtractTooManyPages(e.pages??0);
 return new Error(e.message);
}
export function extractInWorker(job:ExtractJob,opts:IsolateOptions):Promise<ExtractResult>{
 return new Promise<ExtractResult>((resolve,reject)=>{
  if(opts.signal?.aborted){reject(new DocumentsDbError('lease_lost','lease_lost: extraction not started'));return;}
  if(!Number.isFinite(opts.hardMs)){reject(new Error('invalid_hard_ms'));return;}   // an unbounded worker is never started
  if(!(opts.hardMs>0)){reject(new ExtractTimeout());return;}
  const hardMs=Math.min(opts.hardMs,2**31-1);                                     // setTimeout's maximum
  const worker=new Worker(opts.entry??workerEntry(),{workerData:job,resourceLimits:{maxOldGenerationSizeMb:opts.maxOldGenerationSizeMb??WORKER_MAX_OLD_GEN_MB}});
  let settled=false;
  const onAbort=()=>finish(()=>reject(new DocumentsDbError('lease_lost','lease_lost: extraction worker stopped')));
  const timer=setTimeout(()=>finish(()=>reject(new ExtractTimeout())),hardMs);
  function finish(settle:()=>void){
   if(settled)return;settled=true;
   clearTimeout(timer);opts.signal?.removeEventListener('abort',onAbort);
   void worker.terminate();
   settle();
  }
  opts.signal?.addEventListener('abort',onAbort,{once:true});
  worker.once('message',(m:Reply)=>finish(()=>m.ok?resolve(m.result):reject(errorOf(m.error))));
  worker.once('error',e=>finish(()=>reject((e as {code?:string}).code==='ERR_WORKER_OUT_OF_MEMORY'
  ?new Error(`extract_error: the extraction worker ran out of memory (heap limit ${opts.maxOldGenerationSizeMb??WORKER_MAX_OLD_GEN_MB} MB)`):e)));
  worker.once('exit',code=>finish(()=>reject(new Error(`extract_worker_exit:${code}`))));
 });
}
