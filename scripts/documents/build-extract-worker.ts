// scripts/documents/build-extract-worker.ts
// Builds the self-contained extraction worker (codex plan round 4, R4-P2-1): esbuild bundles
// src/lib/documents/extract/worker-entry.ts with everything it imports — worker-job.ts, extract/*.ts,
// types.ts and pdfjs-dist's legacy pdf.mjs + pdf.worker.mjs — into one ESM file for Node, so the
// worker started by extract/isolate.ts loads no TypeScript and no node_modules at run time. Only
// pdf.js's optional canvas back ends stay external (pdf.js imports them in a try and only warns).
// Output: build/extract-worker/extract-worker.mjs (build/ is gitignored; never committed). Run by
// `npm run prebuild` (before next build, locally and on Vercel; next.config.mjs traces the file) and
// by isolate.test.ts, which builds into a temporary directory.
//   npx tsx scripts/documents/build-extract-worker.ts [--out <file>]
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {build,version as esbuildVersion} from 'esbuild';
import {join,resolve} from 'node:path';
import {workerManifestPath} from '../../src/lib/documents/extract/isolate';
import type {WorkerManifest} from '../../src/lib/documents/extract/isolate';
import {EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from '../../src/lib/documents/types';

export const EXTRACT_WORKER_OUT=join('build','extract-worker','extract-worker.mjs');
const ENTRY=join('src','lib','documents','extract','worker-entry.ts');
/** sha256 over the sorted first-party input sources of the bundle (path + bytes), the pdfjs-dist version and esbuild's. */
export function sourceHashOf(inputs:string[]):string{
 const h=createHash('sha256');
 for(const f of inputs.filter(f=>!f.includes('node_modules/')).sort())h.update(`${f}\0`).update(readFileSync(resolve(f))).update('\0');
 const pdfjs=(JSON.parse(readFileSync(resolve('node_modules','pdfjs-dist','package.json'),'utf8')) as {version:string}).version;
 return h.update(`pdfjs-dist@${pdfjs}\0esbuild@${esbuildVersion}`).digest('hex');
}
/** Bundles the worker into `outfile` (relative to the app root = process.cwd()) and writes the manifest next to it; returns its absolute path. */
export async function buildExtractWorker(outfile:string=EXTRACT_WORKER_OUT):Promise<string>{
 const out=resolve(outfile);
 const result=await build({
  entryPoints:[resolve(ENTRY)],outfile:out,bundle:true,platform:'node',format:'esm',target:'node20',
  external:['@napi-rs/canvas','canvas'],legalComments:'none',logLevel:'warning',metafile:true,
  // CommonJS helpers inside bundled ESM need a require
  // pdf.js prints two warnings at load when the optional canvas back end is absent (it is never needed for text extraction); drop exactly those
  banner:{js:"import {createRequire as __f3CreateRequire} from 'node:module';const require=__f3CreateRequire(import.meta.url);const __f3Log=console.log.bind(console);console.log=(...a)=>{if(typeof a[0]==='string'&&/^Warning: Cannot (load \"@napi-rs.canvas\"|polyfill)/.test(a[0]))return;__f3Log(...a);};"},
 });
 const manifest:WorkerManifest={extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,source_hash:sourceHashOf(Object.keys(result.metafile.inputs))};
 writeFileSync(workerManifestPath(out),`${JSON.stringify(manifest,null,1)}\n`);
 return out;
}
if(process.argv[1]?.endsWith('build-extract-worker.ts')){
 const at=process.argv.indexOf('--out');
 buildExtractWorker(at>0?process.argv[at+1]:undefined).then(p=>console.log(`extract worker: ${p}`)).catch(e=>{console.error((e as Error).message);process.exitCode=1;});
}
