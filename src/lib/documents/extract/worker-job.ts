// src/lib/documents/extract/worker-job.ts
// The extraction job a worker thread runs (codex plan round 3, R1-P2-7 final): pdf.js (extract/pdf.ts,
// page cap + a soft per-page budget) or the HTML parser (extract/html.ts) — both block the event loop,
// which is why they run off the main thread. The result (pages with lines/tables, hasTextLayer) is a
// plain structured-cloneable object.
import type {PageLayout} from '../types';
import {extractHtml} from './html';
import {extractPdf} from './pdf';
import type {PdfJsAssets} from './pdf';

export type ExtractJobKind='pdf'|'html';
/** softMs: the worker's own budget (ExtractTimeout before the main thread's hard deadline); assets: pdf.js CMaps / standard fonts (the main thread's pdfjsAssets(); the bundled worker resolves nothing itself). */
export interface ExtractJob{kind:ExtractJobKind;bytes:Uint8Array;maxPages:number;softMs:number;assets?:PdfJsAssets}
export interface ExtractResult{pages:PageLayout[];hasTextLayer:boolean}
export async function runExtractJob(job:ExtractJob):Promise<ExtractResult>{
 const until=Date.now()+job.softMs;
 const budget={remainingMs:()=>until-Date.now()};
 if(job.kind==='pdf')return extractPdf(job.bytes,{...budget,maxPages:job.maxPages},job.assets?{assets:job.assets}:{});
 if(job.kind==='html'){const pages=extractHtml(job.bytes,budget);return {pages,hasTextLayer:pages.some(p=>p.text!=='')};}
 throw new Error('unsupported_job');
}
