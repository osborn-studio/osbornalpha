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
import {build} from 'esbuild';
import {join,resolve} from 'node:path';

export const EXTRACT_WORKER_OUT=join('build','extract-worker','extract-worker.mjs');
const ENTRY=join('src','lib','documents','extract','worker-entry.ts');
/** Bundles the worker into `outfile` (relative to the app root = process.cwd()); returns its absolute path. */
export async function buildExtractWorker(outfile:string=EXTRACT_WORKER_OUT):Promise<string>{
 const out=resolve(outfile);
 await build({
  entryPoints:[resolve(ENTRY)],outfile:out,bundle:true,platform:'node',format:'esm',target:'node20',
  external:['@napi-rs/canvas','canvas'],legalComments:'none',logLevel:'warning',
  // CommonJS helpers inside bundled ESM need a require
  banner:{js:"import {createRequire as __f3CreateRequire} from 'node:module';const require=__f3CreateRequire(import.meta.url);"},
 });
 return out;
}
if(process.argv[1]?.endsWith('build-extract-worker.ts')){
 const at=process.argv.indexOf('--out');
 buildExtractWorker(at>0?process.argv[at+1]:undefined).then(p=>console.log(`extract worker: ${p}`)).catch(e=>{console.error((e as Error).message);process.exitCode=1;});
}
