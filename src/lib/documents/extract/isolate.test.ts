// src/lib/documents/extract/isolate.test.ts
import {cpSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {buildExtractWorker} from '../../../../scripts/documents/build-extract-worker';
import {withLeaseHeartbeat} from '../lease';
import {extractInWorker} from './isolate';
import {ExtractTimeout} from './pdf';
import type {ExtractJob} from './worker-job';

const SLOW=join(process.cwd(),'src/lib/documents/fixtures/worker/slow-worker.mjs');
const job=(mode:string):ExtractJob=>({kind:'pdf',bytes:new Uint8Array(),maxPages:10,softMs:60_000,mode} as ExtractJob);
/** Runs the worker under a 50 ms heartbeat on the main thread; returns the error and how many beats happened. */
async function underHeartbeat(mode:string,hardMs:number){
 let beats=0;const t0=Date.now();
 const err=await withLeaseHeartbeat(async()=>{beats++;return true;},signal=>extractInWorker(job(mode),{hardMs,signal,entry:SLOW}),{intervalMs:50}).then(()=>null,(e:unknown)=>e);
 return {err,beats,ms:Date.now()-t0};
}

describe('extractInWorker (codex plan round 3, R1-P2-7 final)',()=>{
 it('a slow final page is terminated at the hard deadline while the main-thread heartbeat keeps beating',async()=>{
  const r=await underHeartbeat('slow-final-page',800);
  expect(r.err).toBeInstanceOf(ExtractTimeout);
  expect(r.ms).toBeLessThan(5_000);
  expect(r.beats).toBeGreaterThanOrEqual(8);
 },20_000);
 it('a worker whose event loop is blocked forever is terminated at the hard deadline; the heartbeat keeps beating',async()=>{
  const r=await underHeartbeat('block',800);
  expect(r.err).toBeInstanceOf(ExtractTimeout);
  expect(r.ms).toBeLessThan(5_000);
  expect(r.beats).toBeGreaterThanOrEqual(8);
 },20_000);
 it('an aborted heartbeat terminates the worker with lease_lost; answers and errors pass through',async()=>{
  const ac=new AbortController();setTimeout(()=>ac.abort(),100);
  await expect(extractInWorker(job('block'),{hardMs:30_000,signal:ac.signal,entry:SLOW})).rejects.toMatchObject({name:'DocumentsDbError',code:'lease_lost'});
  await expect(extractInWorker(job('fail'),{hardMs:5_000,entry:SLOW})).rejects.toThrow('bad xref');
  await expect(extractInWorker(job('ok'),{hardMs:5_000,entry:SLOW})).resolves.toMatchObject({pages:[{page_no:1}],hasTextLayer:false});
  await expect(extractInWorker(job('ok'),{hardMs:0,entry:SLOW})).rejects.toBeInstanceOf(ExtractTimeout);
 },20_000);
});

describe('the bundled extraction worker (codex plan round 4, R4-P2-1)',()=>{
 // A deployment stand-in: a temporary directory outside the checkout holding ONLY the bundle and the
 // traced pdf.js assets — no node_modules, no TypeScript sources, nothing to resolve from.
 let dir='';let entry='';let assets={cMapUrl:'',cMapPacked:true as const,standardFontDataUrl:''};
 beforeAll(async()=>{
  dir=mkdtempSync(join(tmpdir(),'f3-extract-worker-'));
  entry=await buildExtractWorker(join(dir,'extract-worker.mjs'));
  const pdfjs=join(process.cwd(),'node_modules','pdfjs-dist');
  cpSync(join(pdfjs,'cmaps'),join(dir,'assets','cmaps'),{recursive:true});
  cpSync(join(pdfjs,'standard_fonts'),join(dir,'assets','standard_fonts'),{recursive:true});
  cpSync(join(pdfjs,'legacy','build','pdf.worker.mjs'),join(dir,'assets','pdf.worker.mjs'));
  assets={cMapUrl:join(dir,'assets','cmaps')+'/',cMapPacked:true,standardFontDataUrl:join(dir,'assets','standard_fonts')+'/'};
 },120_000);
 afterAll(()=>{if(dir)rmSync(dir,{recursive:true,force:true});});
 it('runs from an isolated directory (bundle + assets only) and extracts the PDF and HTML fixtures; the page cap holds',async()=>{
  expect(readFileSync(entry,'utf8')).not.toMatch(/from\s*["'](?!node:)[^"']*pdfjs-dist/);   // pdf.js is inside the bundle
  const pdf=new Uint8Array(readFileSync('src/lib/documents/fixtures/pdf/minimal-two-pages.pdf'));
  const r=await extractInWorker({kind:'pdf',bytes:pdf,maxPages:10,softMs:30_000,assets},{hardMs:60_000,entry});
  expect(r.pages).toHaveLength(2);expect(r.hasTextLayer).toBe(true);
  expect(r.pages[0].text).toContain('Revenue');
  await expect(extractInWorker({kind:'pdf',bytes:pdf,maxPages:1,softMs:30_000,assets},{hardMs:60_000,entry})).rejects.toMatchObject({name:'ExtractTooManyPages',pages:2});
  const html=await extractInWorker({kind:'html',bytes:new TextEncoder().encode('<p>one</p><hr/><p>two</p>'),maxPages:10,softMs:30_000},{hardMs:60_000,entry});
  expect(html.pages.map(p=>p.text)).toEqual(['one','two']);
 },120_000);
});
