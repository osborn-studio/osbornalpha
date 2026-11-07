// src/lib/documents/extract/isolate.test.ts
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {buildExtractWorker} from '../../../../scripts/documents/build-extract-worker';
import {withLeaseHeartbeat} from '../lease';
import {EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from '../types';
import {extractInWorker,workerEntry,workerManifestPath,workerPreflight} from './isolate';
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

describe('extractInWorker limits (T10 review)',()=>{
 it('requires a finite hardMs (never starts an unbounded worker) and clamps a huge one to the timer maximum',async()=>{
  for(const hardMs of [Number.POSITIVE_INFINITY,Number.NaN])await expect(extractInWorker(job('block'),{hardMs,entry:SLOW})).rejects.toThrow('invalid_hard_ms');
  await expect(extractInWorker(job('ok'),{hardMs:Number.MAX_SAFE_INTEGER,entry:SLOW})).resolves.toMatchObject({hasTextLayer:false});   // clamped: no immediate timeout
 },20_000);
 it('a worker that exhausts its heap limit is an extract_error with a clear message, not a crash of the caller',async()=>{
  const e=await extractInWorker(job('oom'),{hardMs:60_000,entry:SLOW,maxOldGenerationSizeMb:32}).then(()=>null,(x:unknown)=>x);
  expect(e).toBeInstanceOf(Error);
  expect((e as Error).message).toMatch(/^extract_error: the extraction worker ran out of memory \(heap limit 32 MB\)/);
 },90_000);
});

describe('workerPreflight (T10 review: stale bundle guard)',()=>{
 const roots:string[]=[];
 const rootWith=(manifest:unknown,bundle=true)=>{
  const root=mkdtempSync(join(tmpdir(),'f3-preflight-'));roots.push(root);
  if(bundle){mkdirSync(join(root,'build','extract-worker'),{recursive:true});writeFileSync(workerEntry(root),'// bundle');}
  if(manifest!==undefined)writeFileSync(workerManifestPath(workerEntry(root)),typeof manifest==='string'?manifest:JSON.stringify(manifest));
  return root;
 };
 afterAll(()=>{for(const r of roots)rmSync(r,{recursive:true,force:true});});
 const fresh={extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,source_hash:'a'.repeat(64)};
 it('worker_missing without a bundle; ok with a manifest of the running versions',()=>{
  expect(workerPreflight(rootWith(undefined,false))).toBe('worker_missing');
  expect(workerPreflight(rootWith(fresh))).toBeNull();
 });
 it('worker_stale: manifest missing, unreadable, other extractor/table versions, or a malformed source hash',()=>{
  expect(workerPreflight(rootWith(undefined))).toBe('worker_stale');
  expect(workerPreflight(rootWith('{not json'))).toBe('worker_stale');
  expect(workerPreflight(rootWith({...fresh,extractor_version:'docs-extract/0.9'}))).toBe('worker_stale');
  expect(workerPreflight(rootWith({...fresh,table_algo_version:'tables/0.1'}))).toBe('worker_stale');
  expect(workerPreflight(rootWith({...fresh,source_hash:'nope'}))).toBe('worker_stale');
 });
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
  const manifest=JSON.parse(readFileSync(workerManifestPath(entry),'utf8')) as Record<string,string>;
  expect(manifest).toEqual({extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,source_hash:expect.stringMatching(/^[0-9a-f]{64}$/)});   // the build wrote its manifest next to the bundle
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
