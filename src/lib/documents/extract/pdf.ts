// src/lib/documents/extract/pdf.ts
// PDF text layer → PageLayout[] (spec §7.1–7.2, EXTRACTOR_VERSION 'docs-extract/1.0').
// pdfjs-dist legacy build, in-process: importing pdf.worker.mjs first sets globalThis.pdfjsWorker,
// which pdf.js uses as its "fake worker" (no worker thread, no workerSrc, no canvas). Per page:
// getTextContent() items → normalised (NFKC, whitespace folded, trimmed; whitespace-only items
// dropped) → an item holding several words is split at its spaces into word pieces whose x range is
// interpolated by code-point position → pieces clustered into lines (same line: |Δy| <= 0.5 × the
// item height; pieces sorted by y descending, then x) → within a line sorted by x, one space where
// the gap to the previous piece exceeds SPACE_EM × height (a "space width"), an identical piece
// drawn again within half a height (fake bold) dropped → lines joined with '\n' in descending y.
// Offsets are code points recorded during concatenation (assemblePage). Coordinates are PDF user
// space (pt, origin bottom-left, page.view), as pdf.js reports them, rounded to 0.01 pt. hasTextLayer = some page has
// text; an all-empty document is 'no_text_layer' upstream. The budget is checked before each page
// (ExtractTimeout → 'extract_timeout'; every page awaits pdf.js, so timers such as the lease
// heartbeat run between pages) and budget.maxPages caps the page count (ExtractTooManyPages).
// CMaps: HKEX / cninfo reports use CID-keyed CJK fonts whose text pdf.js can only map to Unicode with
// the packed CMaps; without cMapUrl a real 0268.HK interim report extracted 0 Chinese characters
// (pdftotext had them). getDocument therefore always gets cMapUrl + cMapPacked + standardFontDataUrl:
// directories inside node_modules/pdfjs-dist (pdfjsAssets; on Vercel next.config.mjs ships them with
// outputFileTracingIncludes, Task 10). The pdf.js loader and the asset locations are injectable
// (tests assert the options without parsing a CID font).
import {join,sep} from 'node:path';
import type {LayoutLine,PageLayout} from '../types';
import {assemblePage,cpLength,normalizeText} from './pages-json';
import type {LinePiece} from './pages-json';
import {detectTables} from './tables';

/** maxPages: refuse a document with more pages before reading any (ExtractTooManyPages; R1-P2-7 round 2 bounds the blocking work). */
export interface ExtractBudget{remainingMs():number;maxPages?:number;/** aborted when the lease heartbeat stops (round 3: the worker is terminated) */signal?:AbortSignal}
export class ExtractTimeout extends Error{constructor(){super('extract_timeout');this.name='ExtractTimeout';}}
export class ExtractTooManyPages extends Error{constructor(readonly pages:number){super('too_many_pages');this.name='ExtractTooManyPages';}}
/** One text item as pdf.js reports it: string, origin (transform[4], transform[5]), advance width, height. */
export interface RawItem{str:string;x:number;y:number;w:number;h:number}
export const SPACE_EM=0.25;
/** Coordinates are kept to 0.01 pt: enough for clustering, and pages.json stays compact and stable. */
const r2=(v:number)=>Math.round(v*100)/100;

type PdfJs=typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise:Promise<PdfJs>|null=null;
function loadPdfJs():Promise<PdfJs>{
 pdfjsPromise??=(async()=>{
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  return import('pdfjs-dist/legacy/build/pdf.mjs');
 })();
 return pdfjsPromise;
}
export interface PdfJsAssets{cMapUrl:string;cMapPacked:true;standardFontDataUrl:string}
/** CMap and standard-font directories of pdfjs-dist under `root` (default: the process cwd, which is the app root locally and on Vercel); trailing separator as pdf.js expects. */
export function pdfjsAssets(root:string=process.cwd()):PdfJsAssets{
 const base=join(root,'node_modules','pdfjs-dist');
 return {cMapUrl:join(base,'cmaps')+sep,cMapPacked:true,standardFontDataUrl:join(base,'standard_fonts')+sep};
}
export interface ExtractPdfOptions{loader?:()=>Promise<Pick<PdfJs,'getDocument'>>;assets?:PdfJsAssets}

/** Splits a normalised item into word pieces; x0/x1 interpolated by code-point position within the item. */
function piecesOf(it:RawItem):LinePiece[]{
 const text=normalizeText(it.str);
 if(text==='')return [];
 const total=cpLength(text);const words=text.split(' ');const out:LinePiece[]=[];let at=0;
 for(const [k,w] of words.entries()){
  const n=cpLength(w);
  out.push({text:w,x0:r2(it.x+it.w*at/total),x1:r2(it.x+it.w*(at+n)/total),y:r2(it.y),h:r2(it.h),spaceBefore:k>0});
  at+=n+1;
 }
 return out;
}

/** Pure layout step (unit-tested without pdf.js): raw items of one page → page text and lines. */
export function layoutFromItems(raw:RawItem[]):{text:string;lines:LayoutLine[]}{
 const pieces=raw.flatMap(piecesOf).sort((a,b)=>b.y-a.y||a.x0-b.x0);
 const rows:{y:number;h:number;pieces:LinePiece[]}[]=[];
 for(const p of pieces){
  const row=rows.at(-1);
  if(row&&Math.abs(p.y-row.y)<=0.5*(p.h>0?p.h:row.h))row.pieces.push(p);
  else rows.push({y:p.y,h:p.h,pieces:[p]});
 }
 for(const row of rows){
  const sorted=[...row.pieces].sort((a,b)=>a.x0-b.x0);const kept:LinePiece[]=[];
  for(const p of sorted){
   const prev=kept.at(-1);
   if(prev&&prev.text===p.text&&Math.abs(prev.x0-p.x0)<0.5*Math.max(prev.h,p.h,1))continue;
   if(prev&&!p.spaceBefore)p.spaceBefore=p.x0-prev.x1>SPACE_EM*Math.max(prev.h,p.h);   // words after the first of one item keep their space
   kept.push(p);
  }
  row.pieces=kept;
 }
 return assemblePage(rows);
}

export async function extractPdf(bytes:Uint8Array,budget:ExtractBudget,opts:ExtractPdfOptions={}):Promise<{pages:PageLayout[];hasTextLayer:boolean}>{
 if(budget.remainingMs()<=0)throw new ExtractTimeout();
 const pdfjs=await (opts.loader??loadPdfJs)();
 // pdf.js may transfer (detach) the buffer it is given: hand it a copy. CMaps: see the header.
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,verbosity:0,...(opts.assets??pdfjsAssets())});
 try{
  const doc=await task.promise;
  if(budget.maxPages!==undefined&&doc.numPages>budget.maxPages)throw new ExtractTooManyPages(doc.numPages);
  const pages:PageLayout[]=[];
  for(let n=1;n<=doc.numPages;n++){
   if(budget.remainingMs()<=0)throw new ExtractTimeout();
   const page=await doc.getPage(n);
   const content=await page.getTextContent();
   const raw:RawItem[]=[];
   for(const it of content.items){
    if(!('str' in it))continue;   // TextMarkedContent
    const t=it.transform as number[];
    raw.push({str:it.str,x:t[4],y:t[5],w:it.width,h:it.height>0?it.height:Math.hypot(t[2],t[3])});
   }
   const {text,lines}=layoutFromItems(raw);
   const [vx0,vy0,vx1,vy1]=page.view;
   pages.push({page_no:n,width:vx1-vx0,height:vy1-vy0,text,lines,tables:detectTables(lines)});
   page.cleanup();
  }
  return {pages,hasTextLayer:pages.some(p=>p.text!=='')};
 }finally{
  await task.destroy();
 }
}
