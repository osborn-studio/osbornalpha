// src/lib/documents/extract/worker-entry.ts
// Worker-thread entry of the extraction (codex plan round 3, R1-P2-7 final; round 4 R4-P2-1). It is
// NOT run from source: scripts/documents/build-extract-worker.ts bundles it with esbuild — together
// with worker-job.ts, extract/*.ts and pdfjs-dist (pdf.mjs and pdf.worker.mjs inlined) — into one
// self-contained ESM file, build/extract-worker/extract-worker.mjs (gitignored; built by `prebuild`
// and by the tests that need it). The bundle needs no node_modules at run time; pdf.js's CMaps and
// standard fonts are read from the directories the job names (job.assets, from pdfjsAssets() on the
// main thread). It runs the one job in workerData and answers with one message: {ok:true,result} or
// {ok:false,error:{name,message,pages}}. The main thread (isolate.ts) owns the deadline and
// terminates this thread; nothing here writes anywhere.
import {parentPort,workerData} from 'node:worker_threads';
import {runExtractJob} from './worker-job';
import type {ExtractJob} from './worker-job';

const port=parentPort;
if(port===null)throw new Error('extract worker-entry runs only in a worker thread');
try{
 port.postMessage({ok:true,result:await runExtractJob(workerData as ExtractJob)});
}catch(e){
 const x=e as {name?:unknown;message?:unknown;pages?:unknown};
 port.postMessage({ok:false,error:{name:typeof x?.name==='string'?x.name:'Error',message:String(x?.message??e),pages:typeof x?.pages==='number'?x.pages:null}});
}
