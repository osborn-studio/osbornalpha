/**
 * Facts sync from the command line (spec §6.5). No deadline; dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/facts/sync.ts --market US|CN
 *        [--issuer <ticker>]... [--limit n] [--since-year y] [--apply]
 *   node --import tsx scripts/facts/sync.ts --market US --no-db --cik 320193 [--cik ...]
 *
 * Dry run: fetches, parses and plans against the database (read-only; no batch, no lease, no
 * writes). --apply records an ingest_batches receipt (dataset facts.us|facts.cn, triggered_by
 * script) and needs a code version (VERCEL_GIT_COMMIT_SHA or a git checkout). --issuer tickers
 * are resolved by today's ownership; unknown → exit 2. An issuer without a fact_sync_scope row is
 * handled by the core (round-1 #13): --apply seeds the row (reasons ['explicit']; the next cron
 * reconcile retires it unless a source lists the issuer), a dry run plans on a constructed row,
 * and an issuer without a derivable fetch key is reported as scope_unresolved (exit 1).
 * --no-db (US only, with --cik) runs the dry run against empty in-memory stores: a network-only
 * smoke that needs no environment at all.
 * CN is gated like the cron route: --market CN --apply needs FACTS_CN_ENABLED=1 (dry run is free). Do not run
 * --apply for a market while its cron may be running (scope reconcile is not concurrency-safe).
 * Exit 0 on success, 1 when the batch (or any issuer in a dry run) failed, 2 on bad arguments.
 * tsx does NOT load .env.local: use node --env-file as above (never commit that file).
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {memoryTableClient} from '../../src/lib/db/memory-table-client';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {productionSyncDeps,resolveCodeVersion} from '../../src/lib/facts/deps';
import {memoryFactsDb} from '../../src/lib/facts/memory-facts-db';
import {memorySnapshotStore} from '../../src/lib/facts/snapshot-store';
import {fetchCompanyFacts,parseCompanyFacts} from '../../src/lib/facts/providers/edgar-companyfacts';
import {fetchKey} from '../../src/lib/facts/scope';
import {runFactsSync} from '../../src/lib/facts/sync';
import type {SyncDeps} from '../../src/lib/facts/sync';
import type {Market} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: sync.ts --market US|CN [--issuer <ticker>]... [--cik <cik>]... [--limit n] [--since-year y] [--apply] [--no-db]';
interface Args{market:Market;issuers:string[];ciks:string[];limit:number;sinceYear?:number;apply:boolean;noDb:boolean}

function parseArgs(argv:string[]):Args{
 const a:Args={market:'US',issuers:[],ciks:[],limit:25,apply:false,noDb:false};let market:string|undefined;
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--market')market=next(i++);
  else if(x==='--issuer')a.issuers.push(next(i++));
  else if(x==='--cik')a.ciks.push(next(i++));
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--since-year')a.sinceYear=Number(next(i++));
  else if(x==='--apply')a.apply=true;
  else if(x==='--no-db')a.noDb=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(market!=='US'&&market!=='CN'){console.error(USAGE);process.exit(2);}
 a.market=market;
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>1000){console.error('--limit must be 1..1000');process.exit(2);}
 if(a.sinceYear!==undefined&&(!Number.isInteger(a.sinceYear)||a.sinceYear<1990||a.sinceYear>new Date().getUTCFullYear())){console.error('--since-year out of range');process.exit(2);}
 if(a.noDb&&(a.apply||a.market!=='US'||a.ciks.length===0||a.issuers.length>0)){console.error('--no-db needs --market US and --cik, and excludes --apply/--issuer');process.exit(2);}
 if(!a.noDb&&a.ciks.length>0){console.error('--cik is only for --no-db');process.exit(2);}
 return a;
}

/** Empty in-memory stores: every candidate plans as inserted; nothing persists. */
function memoryDeps(codeVersion:string):SyncDeps{
 return {db:memoryFactsDb(),tables:memoryTableClient(),storage:memorySnapshotStore(),
  fetchUs:(cik10,b)=>fetchCompanyFacts(cik10,b),
  fetchCn:async()=>{throw new Error('CN not supported with --no-db');},
  parseUs:(snapshot,o)=>parseCompanyFacts(snapshot,{sinceYear:o.sinceYear}),
  parseCn:()=>{throw new Error('CN not supported with --no-db');},
  now:()=>new Date(),deadline:null,codeVersion};
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 if(args.market==='CN'&&args.apply&&process.env.FACTS_CN_ENABLED!=='1'){console.error('CN --apply is disabled: set FACTS_CN_ENABLED=1');process.exit(2);}
 const codeVersion=resolveCodeVersion({allowGit:true})??(args.apply?null:'dry-run');
 if(!codeVersion){console.error('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');process.exit(2);}
 let deps:SyncDeps,issuerIds:string[]|undefined;
 if(args.noDb){
  deps=memoryDeps(codeVersion);
  // Seed the memory scope so the core finds the issuers: issuer ids are synthetic for the smoke.
  const rows=args.ciks.map((cik,i)=>({issuer_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,reasons:['cli'],priority:10,fetch_key:fetchKey('US',{cik})}));
  await deps.db.reconcileScope('US',rows);
  issuerIds=rows.map(r=>r.issuer_id);
 }else{
  deps=productionSyncDeps({deadline:null,codeVersion});
  if(args.issuers.length>0){
   const today=new Date().toISOString().slice(0,10);
   issuerIds=[];
   for(const t of args.issuers){
    const r=await resolveIssuer(supabaseTableClient(getAdminSupabase()),{ticker:t},{today});
    if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}
    issuerIds.push(r.issuer_id);
   }
  }
 }
 const receipt=await runFactsSync(deps,{market:args.market,limit:args.limit,issuerIds,dryRun:!args.apply,triggeredBy:'script',sinceYear:args.sinceYear});
 console.log(JSON.stringify({mode:args.apply?'apply':'dry-run (no batch written; pass --apply to write)',market:args.market,codeVersion,...receipt},null,1));
 const failed=args.apply?receipt.status!=='success':receipt.issuers.some(i=>i.outcome==='failed');
 process.exit(failed?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
