// src/lib/documents/extract/isolate.ts
// Main-thread side of the extraction worker (codex plan round 3, R1-P2-7 final). extractInWorker starts
// one worker per job (the bundle build/extract-worker/extract-worker.mjs under the app root, located
// like pdfjsAssets: by process.cwd(); injectable for tests) and settles exactly once: the worker's answer; hardMs elapsed →
// worker.terminate() and ExtractTimeout ('extract_timeout') — this also stops a worker stuck inside one
// page or in a synchronous loop, which a budget checked between pages cannot; the signal aborted (the
// lease heartbeat stopped) → terminate and DocumentsDbError('lease_lost'); a worker error or an exit
// without an answer → Error. The main thread's event loop stays free, so the heartbeat keeps beating.
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {DocumentsDbError} from '../types';
import {ExtractTimeout,ExtractTooManyPages} from './pdf';
import type {ExtractJob,ExtractResult} from './worker-job';

export interface IsolateOptions{hardMs:number;signal?:AbortSignal;/** test-only: another worker script */entry?:string}
type Reply={ok:true;result:ExtractResult}|{ok:false;error:{name:string;message:string;pages:number|null}};
/** The bundled worker (scripts/documents/build-extract-worker.ts) under the app root, located like pdfjsAssets (process.cwd()). */
export const workerEntry=(root:string=process.cwd())=>join(root,'build','extract-worker','extract-worker.mjs');
function errorOf(e:{name:string;message:string;pages:number|null}):Error{
 if(e.name==='ExtractTimeout')return new ExtractTimeout();
 if(e.name==='ExtractTooManyPages')return new ExtractTooManyPages(e.pages??0);
 return new Error(e.message);
}
export function extractInWorker(job:ExtractJob,opts:IsolateOptions):Promise<ExtractResult>{
 return new Promise<ExtractResult>((resolve,reject)=>{
  if(opts.signal?.aborted){reject(new DocumentsDbError('lease_lost','lease_lost: extraction not started'));return;}
  if(!(opts.hardMs>0)){reject(new ExtractTimeout());return;}
  const worker=new Worker(opts.entry??workerEntry(),{workerData:job});
  let settled=false;
  const onAbort=()=>finish(()=>reject(new DocumentsDbError('lease_lost','lease_lost: extraction worker stopped')));
  const timer=setTimeout(()=>finish(()=>reject(new ExtractTimeout())),opts.hardMs);
  function finish(settle:()=>void){
   if(settled)return;settled=true;
   clearTimeout(timer);opts.signal?.removeEventListener('abort',onAbort);
   void worker.terminate();
   settle();
  }
  opts.signal?.addEventListener('abort',onAbort,{once:true});
  worker.once('message',(m:Reply)=>finish(()=>m.ok?resolve(m.result):reject(errorOf(m.error))));
  worker.once('error',e=>finish(()=>reject(e)));
  worker.once('exit',code=>finish(()=>reject(new Error(`extract_worker_exit:${code}`))));
 });
}
