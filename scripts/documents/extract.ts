/**
 * Document extraction from the command line (spec §6.3, §7.3). No deadline; dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/documents/extract.ts [--limit n] [--document <uuid>]... [--apply]
 *
 * Dry run: reads the due documents (or the listed ones that are still 'stored'), downloads their
 * bytes and extracts them in memory — no batch, no lease, no pages.json, no rows; prints page counts.
 * --apply runs runDocumentsExtract (ingest_batches dataset documents.extract, triggered_by script)
 * and needs a code version (VERCEL_GIT_COMMIT_SHA or a git checkout, '-dirty' when the tree has
 * changes). This is the extraction path while DOCUMENTS_EXTRACT_ENABLED is off (spec §12). The
 * worker bundle (build/extract-worker/extract-worker.mjs + manifest) is always rebuilt first (T10 review).
 * Exit 0 on success, 1 when the batch (or any document in a dry run) failed, 2 on bad arguments.
 */
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {productionExtractDeps} from '../../src/lib/documents/extract/deps';
import {runDocumentsExtract} from '../../src/lib/documents/extract/run';
import {buildExtractWorker} from './build-extract-worker';

const USAGE='usage: extract.ts [--limit n] [--document <uuid>]... [--apply]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Args{limit:number;documentIds:string[];apply:boolean}

function parseArgs(argv:string[]):Args{
 const a:Args={limit:25,documentIds:[],apply:false};
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--document')a.documentIds.push(next(i++));
  else if(x==='--apply')a.apply=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>1000){console.error('--limit must be 1..1000');process.exit(2);}
 if(a.documentIds.some(id=>!UUID.test(id))){console.error('--document must be a uuid');process.exit(2);}
 return a;
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const codeVersion=resolveCodeVersion({allowGit:true});
 if(args.apply&&!codeVersion){console.error('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');process.exit(2);}
 // R5-P2-1: a fresh checkout has no worker bundle (build/ is gitignored, only prebuild/predev make it): build it first
 // T10 review: ALWAYS rebuild (a bundle left from older sources would label old output with the current versions)
 console.error(`building the extraction worker: ${await buildExtractWorker()}`);
 const receipt=await runDocumentsExtract(productionExtractDeps({deadline:null,codeVersion}),{limit:Math.max(args.limit,args.documentIds.length),documentIds:args.documentIds.length?args.documentIds:undefined,dryRun:!args.apply,triggeredBy:'script'});
 console.log(JSON.stringify({batchId:receipt.batchId,status:receipt.status,counts:receipt.counts,idle:receipt.idle,documents:receipt.documents,errors:receipt.errors},null,1));
 const failed=receipt.status==='dry_run'?receipt.documents.some(d=>d.outcome==='failed'):receipt.status==='failed'||receipt.status==='partial';
 process.exit(failed?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
