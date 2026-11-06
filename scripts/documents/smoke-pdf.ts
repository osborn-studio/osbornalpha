/**
 * Local pdfjs-dist smoke (document pipeline spec §7.1, §15 question 3; plan F3 Task 4).
 *
 *   npx tsx scripts/documents/smoke-pdf.ts <file.pdf> [--max-pages <n>]
 *
 * Loads the Node build `pdfjs-dist/legacy/build/pdf.mjs` (no canvas, no worker file: pdf.js runs
 * its fake worker in-process under Node), opens the PDF, calls getTextContent() on every page (or
 * the first n) and prints ONE JSON line:
 *   {file, bytes, sha256, pdfjsVersion, node, pages, pagesRead, textItems, pagesWithText, loadMs, totalMs, rssMb, peakRssMb, heapUsedMb}
 * `pages` is the number the Vercel preview smoke must reproduce (spec §7.1 pass criterion);
 * peakRssMb is sampled after every page. No network, no database, no writes. Exit 1 on a load or
 * parse failure (the error message is printed as {error}), 2 on bad arguments.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';

const USAGE='usage: smoke-pdf.ts <file.pdf> [--max-pages <n>]';
const mb=(n:number)=>Math.round(n/1048576*10)/10;

async function main(){
 const argv=process.argv.slice(2);let file:string|undefined;let maxPages=Infinity;
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--max-pages'){const n=Number(argv[++i]);if(!Number.isInteger(n)||n<1){console.error(USAGE);process.exit(2);}maxPages=n;}
  else if(!x.startsWith('--')&&file===undefined)file=x;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!file){console.error(USAGE);process.exit(2);}
 const raw=readFileSync(file);
 const t0=performance.now();
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 // getDocument takes ownership of (and may transfer) the buffer it is given: pass a copy.
 const doc=await pdfjs.getDocument({data:new Uint8Array(raw),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,verbosity:0}).promise;
 const loadMs=Math.round(performance.now()-t0);
 const pages=doc.numPages;
 let textItems=0,pagesWithText=0,pagesRead=0,peak=process.memoryUsage().rss;
 try{
  for(let p=1;p<=pages&&p<=maxPages;p++){
   const page=await doc.getPage(p);
   const content=await page.getTextContent();
   const items=content.items.filter(it=>'str' in it&&it.str.trim()!=='').length;
   textItems+=items;if(items>0)pagesWithText++;pagesRead++;
   page.cleanup();
   peak=Math.max(peak,process.memoryUsage().rss);
  }
 }finally{await doc.destroy();}
 const m=process.memoryUsage();
 console.log(JSON.stringify({file:basename(file),bytes:raw.byteLength,sha256:createHash('sha256').update(raw).digest('hex'),pdfjsVersion:pdfjs.version,node:process.version,
  pages,pagesRead,textItems,pagesWithText,loadMs,totalMs:Math.round(performance.now()-t0),rssMb:mb(m.rss),peakRssMb:mb(peak),heapUsedMb:mb(m.heapUsed)}));
}
main().catch(e=>{console.log(JSON.stringify({error:(e as Error).message}));process.exitCode=1;});
