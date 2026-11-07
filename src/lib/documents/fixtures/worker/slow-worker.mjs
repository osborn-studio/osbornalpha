// src/lib/documents/fixtures/worker/slow-worker.mjs
// Test-only stand-in for the bundled worker (isolate.test.ts; no pdf.js, no network). workerData.mode:
// 'slow-final-page' — three quick pages, then a final page that never finishes (an awaited 10-minute
// step); 'block' — a synchronous infinite loop (the worker's event loop never turns); 'fail' — answers
// with an extractor error; 'ok' — answers with one empty page.
import {parentPort,workerData} from 'node:worker_threads';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(workerData.mode==='slow-final-page'){
 for(let n=1;n<=3;n++)await sleep(5);
 await sleep(600_000);
 parentPort.postMessage({ok:true,result:{pages:[],hasTextLayer:false}});
}else if(workerData.mode==='block'){
 for(;;){/* never yields */}
}else if(workerData.mode==='oom'){
 const hold=[];for(;;)hold.push(new Array(1_000_000).fill(hold.length));   // grows the heap until the resource limit
}else if(workerData.mode==='fail'){
 parentPort.postMessage({ok:false,error:{name:'Error',message:'bad xref',pages:null}});
}else{
 parentPort.postMessage({ok:true,result:{pages:[{page_no:1,width:null,height:null,text:'',lines:[],tables:[]}],hasTextLayer:false}});
}
