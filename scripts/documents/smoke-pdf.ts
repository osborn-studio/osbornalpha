/**
 * Local pdfjs-dist smoke (document pipeline spec §7.1, §15 question 3; plan F3 Task 4).
 *
 *   npx tsx scripts/documents/smoke-pdf.ts <file.pdf> [--max-pages <n>]
 *
 * Loads the Node build `pdfjs-dist/legacy/build/pdf.mjs` (no canvas, no worker file: pdf.js runs
 * its fake worker in-process under Node), opens the PDF, calls getTextContent() on every page (or
 * the first n) and prints ONE JSON line:
 *   {file, bytes, sha256, pdfjsVersion, node, pages, pagesRead, textItems, pagesWithText, importMs, loadMs, totalMs, rssMb, peakRssMb, heapUsedMb}
 * `pages` is the number the Vercel preview smoke must reproduce (spec §7.1 pass criterion);
 * peakRssMb is sampled after every page. No network, no database, no writes. Exit 1 on a load or
 * parse failure (the error message is printed as {error}), 2 on bad arguments. Files over the
 * bucket limit (52428800 bytes) are refused before reading. Packed CMaps and the standard font
 * data are passed explicitly so CJK and non-embedded fonts extract as they would in production.
 */
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {basename,dirname,join,sep} from 'node:path';

const USAGE='usage: smoke-pdf.ts <file.pdf> [--max-pages <n>]';
const MAX_BYTES=52428800;
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
 if(statSync(file).size>MAX_BYTES){console.log(JSON.stringify({error:`file exceeds ${MAX_BYTES} bytes`}));process.exit(1);}
 const raw=readFileSync(file);
 const ti=performance.now();
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const importMs=Math.round(performance.now()-ti);
 const t0=performance.now();
 const pkgDir=dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
 // pdfjs-dist 4.10.38's Node factories read these with fs.readFile: absolute filesystem paths with a trailing separator, never file:// URLs.
 const dirPath=(d:string)=>`${join(pkgDir,d)}${sep}`;
 // getDocument takes ownership of (and may transfer) the buffer it is given: pass a copy.
 const doc=await pdfjs.getDocument({data:new Uint8Array(raw),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,cMapUrl:dirPath('cmaps'),cMapPacked:true,standardFontDataUrl:dirPath('standard_fonts'),verbosity:0}).promise;
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
  pages,pagesRead,textItems,pagesWithText,importMs,loadMs,totalMs:Math.round(performance.now()-t0),rssMb:mb(m.rss),peakRssMb:mb(peak),heapUsedMb:mb(m.heapUsed)}));
}
main().catch(e=>{console.log(JSON.stringify({error:(e as Error).message}));process.exitCode=1;});
