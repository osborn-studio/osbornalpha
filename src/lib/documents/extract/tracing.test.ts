// src/lib/documents/extract/tracing.test.ts
// T10 recheck N1: what next.config.mjs ships with the extraction routes must be enough for workerPreflight to pass.
// A deployment stand-in holds exactly the traced asset list (bundle + manifest + pdf.js assets) and nothing else.
import {cpSync,existsSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {buildExtractWorker} from '../../../../scripts/documents/build-extract-worker';
import {pdfjsAssets} from './pdf';
import {workerEntry,workerManifestPath,workerPreflight} from './isolate';

const dirs:string[]=[];
const tmp=(p:string)=>{const d=mkdtempSync(join(tmpdir(),p));dirs.push(d);return d;};
afterAll(()=>{for(const d of dirs)rmSync(d,{recursive:true,force:true});});

describe('outputFileTracingIncludes carries a complete worker deployment',()=>{
 let routes:Record<string,string[]>={};let built='';
 beforeAll(async()=>{
  const cfg=(await import('../../../../next.config.mjs')) as {default:{outputFileTracingIncludes?:Record<string,string[]>}};
  routes=cfg.default.outputFileTracingIncludes??{};
  built=tmp('f3-trace-src-');
  await buildExtractWorker(workerEntry(built));
 },120_000);
 it('every extracting route lists the same assets, manifest included',()=>{
  const extractingRoutes=['/api/admin/documents/[id]/reprocess','/api/cron/documents-candidates','/api/cron/documents-extract'];
  for(const route of extractingRoutes){
   const files=routes[route];
   expect(files).toBeDefined();
   expect(files).toEqual(routes['/api/cron/documents-extract']);
   expect(files).toContain('./build/extract-worker/extract-worker.mjs');
   expect(files).toContain('./build/extract-worker/extract-worker.manifest.json');
  }
 });
 it('workerPreflight passes on a directory holding exactly the traced files, and fails (worker_stale) without the manifest entry',()=>{
  const files=routes['/api/cron/documents-extract'];
  const stage=(list:string[])=>{
   const root=tmp('f3-trace-deploy-');
   for(const pattern of list){
    const rel=pattern.replace(/^\.\//,'');
    const src=join(rel.startsWith('build/')?built:process.cwd(),rel.replace(/\/\*\*\/\*$/,''));
    const dst=join(root,rel.replace(/\/\*\*\/\*$/,''));
    mkdirSync(dirname(dst),{recursive:true});
    cpSync(src,dst,{recursive:true});
   }
   return root;
  };
  const root=stage(files);
  expect(existsSync(workerManifestPath(workerEntry(root)))).toBe(true);
  expect(workerPreflight(root)).toBeNull();
  const a=pdfjsAssets(root);
  expect(existsSync(a.cMapUrl)&&existsSync(a.standardFontDataUrl)).toBe(true);
  expect(workerPreflight(stage(files.filter(f=>!f.endsWith('.manifest.json'))))).toBe('worker_stale');   // what N1 was: bundle without manifest
 });
});
