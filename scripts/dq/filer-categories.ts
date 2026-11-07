// scripts/dq/filer-categories.ts
/**
 * Filer categories from 10-K covers (spec §6.1). Dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/dq/filer-categories.ts [--issuer <issuer_uuid>]... [--limit n] [--apply]
 *   node --import tsx scripts/dq/filer-categories.ts --no-db --cik 320193 [--cik ...]
 *
 * Dry run: reads the US scope, fetches submissions + the latest three 10-K primary documents, parses
 * the covers and prints the rows; documents go to an in-memory raw store; nothing is written. --apply
 * writes the raw documents to bucket reconcile-raw, upserts issuer_filer_categories, records
 * sec.filer_category, finishes an ingest_batches receipt (triggered_by script) and needs a code
 * version. --no-db (with --cik) needs no environment at all: synthetic issuer ids, memory stores.
 * Exit 0 on success, 1 when the batch (or, in a dry run, any issuer) failed, 2 on bad arguments.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {memoryTableClient} from '../../src/lib/db/memory-table-client';
import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
import {fetchSecDocument,submissionsView,syncFilerCategories} from '../../src/lib/dq/filer-categories';
import type {FilerCategoryDeps} from '../../src/lib/dq/filer-categories';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import {supabaseFactsDb} from '../../src/lib/facts/db';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {padCik} from '../../src/lib/facts/providers/shared';
import {makeBudget} from '../../src/lib/facts/sync';
import type {ScopeRow} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: filer-categories.ts [--issuer <uuid>]... [--limit n] [--apply] | --no-db --cik <cik> [--cik ...]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
interface Args{issuers:string[];ciks:string[];limit:number;apply:boolean;noDb:boolean}
function parseArgs(argv:string[]):Args{
 const a:Args={issuers:[],ciks:[],limit:500,apply:false,noDb:false};
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--issuer'){const v=next(i++);if(!UUID.test(v)){console.error('--issuer takes an issuer_id uuid');process.exit(2);}a.issuers.push(v);}
  else if(x==='--cik')a.ciks.push(next(i++));
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--apply')a.apply=true;
  else if(x==='--no-db')a.noDb=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>5000){console.error('--limit must be 1..5000');process.exit(2);}
 if(a.noDb&&(a.apply||a.ciks.length===0||a.issuers.length>0)){console.error('--no-db needs --cik and excludes --apply/--issuer');process.exit(2);}
 if(!a.noDb&&a.ciks.length>0){console.error('--cik is only for --no-db');process.exit(2);}
 if(a.ciks.some(c=>!/^\d{1,10}$/.test(c))){console.error('--cik must be digits');process.exit(2);}
 return a;
}
const scopeRow=(issuer_id:string,cik10:string):ScopeRow=>({issuer_id,market:'US',reasons:['cli'],priority:10,fetch_key:cik10,next_due_at:new Date().toISOString(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const codeVersion=resolveCodeVersion({allowGit:true})??(args.apply?null:'dry-run');
 if(!codeVersion){console.error('code version unavailable; refusing --apply');process.exit(2);}
 const budget=makeBudget(null);
 let deps:FilerCategoryDeps;
 if(args.noDb){
  const rows=args.ciks.map((c,i)=>scopeRow(`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,padCik(c)));
  const raw=memoryRawStore();
  deps={tables:memoryTableClient({issuer_filer_categories:['issuer_id','fiscal_year']}),db:{scopeAll:async()=>rows},raw,
   submissions:async(cik10,b)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:`${new Date().getUTCFullYear()-4}-01-01`})),
   fetchDocument:(url,b)=>fetchSecDocument(url,b),now:()=>new Date(),budget,codeVersion};
 }else{
  const admin=getAdminSupabase();
  const raw=args.apply?supabaseRawStore(admin):memoryRawStore();
  deps={tables:supabaseTableClient(admin),db:supabaseFactsDb(admin),raw,
   submissions:async(cik10,b)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:`${new Date().getUTCFullYear()-4}-01-01`})),
   fetchDocument:(url,b)=>fetchSecDocument(url,b),now:()=>new Date(),budget,codeVersion};
 }
 const receipt=await syncFilerCategories(deps,{issuerIds:args.issuers.length?args.issuers:undefined,limit:args.limit,dryRun:!args.apply,triggeredBy:'script'});
 console.log(JSON.stringify({mode:args.apply?'apply':'dry-run (nothing written; pass --apply)',codeVersion,...receipt},null,1));
 process.exit(args.apply?(receipt.status==='success'?0:1):(receipt.counts.failed>0?1:0));
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
