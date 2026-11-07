// scripts/dq/calendar-sync.ts
/**
 * Filing calendar from the command line (spec §6.2). Preview by default.
 *
 *   node --env-file=.env.local --import tsx scripts/dq/calendar-sync.ts --market US|CN [--issuer <uuid>]... [--limit n] [--apply]
 *   node --import tsx scripts/dq/calendar-sync.ts --market US --no-db --cik 320193 [--cik ...]
 *
 * Preview: previewCalendar over the market scope (or the given issuers): fetches upstream, computes
 * the rows and prints them; no batch, no pass, no profile, no bucket write (memory raw store).
 * --apply runs the pass protocol exactly like the cron (claims the market pass, processes members,
 * settles it when done) with an 8-minute budget, below the 10-minute pass lease; run it again to
 * continue a pass. --issuer is preview-only (a pass always works on its frozen members).
 * --no-db (US, with --cik): memory stores, synthetic issuer ids, no stored filings; filer categories
 * are first derived from the live 10-K covers (syncFilerCategories into the memory tables), so the
 * printed rows show real deadlines and every SEC-listed report as filed_not_ingested — a network-only
 * check of the rules against AAPL/COST/WMT-style filers (spec §14 question 5).
 * Exit 0 on success, 1 when the batch failed (or a preview issuer had errors), 2 on bad arguments.
 */
import {memoryTableClient} from '../../src/lib/db/memory-table-client';
import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
import {productionCalendarDeps} from '../../src/lib/dq/calendar-deps';
import {previewCalendar,runCalendarSync} from '../../src/lib/dq/calendar-sync';
import type {CalendarSyncDeps} from '../../src/lib/dq/calendar-sync';
import {fetchSecDocument,submissionsView,syncFilerCategories} from '../../src/lib/dq/filer-categories';
import {filingsWindowStart} from '../../src/lib/dq/calendar';
import {memoryRawStore} from '../../src/lib/dq/raw-store';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {padCik} from '../../src/lib/facts/providers/shared';
import {makeBudget} from '../../src/lib/facts/sync';
import type {Market,ScopeRow} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: calendar-sync.ts --market US|CN [--issuer <uuid>]... [--limit n] [--apply] | --market US --no-db --cik <cik> [--cik ...]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const APPLY_BUDGET_MS=8*60_000;
interface Args{market:Market;issuers:string[];ciks:string[];limit:number;apply:boolean;noDb:boolean}
function parseArgs(argv:string[]):Args{
 const a:Args={market:'US',issuers:[],ciks:[],limit:200,apply:false,noDb:false};let market:string|undefined;
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--market')market=next(i++);
  else if(x==='--issuer'){const v=next(i++);if(!UUID.test(v)){console.error('--issuer takes an issuer_id uuid');process.exit(2);}a.issuers.push(v);}
  else if(x==='--cik')a.ciks.push(next(i++));
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--apply')a.apply=true;
  else if(x==='--no-db')a.noDb=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(market!=='US'&&market!=='CN'){console.error(USAGE);process.exit(2);}
 a.market=market;
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>5000){console.error('--limit must be 1..5000');process.exit(2);}
 if(a.apply&&a.issuers.length>0){console.error('--issuer is preview-only');process.exit(2);}
 if(a.noDb&&(a.apply||a.market!=='US'||a.ciks.length===0||a.issuers.length>0)){console.error('--no-db needs --market US and --cik, and excludes --apply/--issuer');process.exit(2);}
 if(!a.noDb&&a.ciks.length>0){console.error('--cik is only for --no-db');process.exit(2);}
 if(a.ciks.some(c=>!/^\d{1,10}$/.test(c))){console.error('--cik must be digits');process.exit(2);}
 return a;
}

async function noDbDeps(ciks:string[],codeVersion:string):Promise<CalendarSyncDeps>{
 const tables=memoryTableClient({issuer_filer_categories:['issuer_id','fiscal_year'],issuer_filing_profiles:['issuer_id','market']});
 const raw=memoryRawStore();const budget=makeBudget(null);const now=()=>new Date();
 const scope:ScopeRow[]=[];
 for(const [i,c] of ciks.entries()){
  const issuer_id=`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
  await tables.insert('issuers',{issuer_id,canonical_name_en:`CIK ${c}`,status:'active'});
  await tables.insert('fact_sync_scope',{issuer_id,market:'US',priority:10,fetch_key:padCik(c)});
  scope.push({issuer_id,market:'US',reasons:['cli'],priority:10,fetch_key:padCik(c),next_due_at:now().toISOString(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
 }
 const submissions=async(cik10:string,b:typeof budget)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:filingsWindowStart(new Date().toISOString().slice(0,10))}));
 // Real covers → memory issuer_filer_categories, so the preview shows real deadlines.
 await syncFilerCategories({tables,db:{scopeAll:async()=>scope},raw,submissions,fetchDocument:(u,b)=>fetchSecDocument(u,b),now,budget,codeVersion},{limit:ciks.length,dryRun:false,triggeredBy:'script'});
 return {tables,raw,db:{filingsForCalendar:async()=>[]},
  passes:{claimPass:async()=>null,replaceExpectations:async()=>0,failMember:async()=>{},finishPass:async()=>'complete'},
  submissions,disclosureDate:async()=>{throw new Error('CN not supported with --no-db');},now,budget,codeVersion};
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const codeVersion=resolveCodeVersion({allowGit:true})??(args.apply?null:'dry-run');
 if(!codeVersion){console.error('code version unavailable; refusing --apply');process.exit(2);}
 if(args.noDb){
  const deps=await noDbDeps(args.ciks,codeVersion);
  const out=await previewCalendar(deps,{market:'US',limit:args.ciks.length});
  console.log(JSON.stringify({mode:'preview --no-db (memory stores; stored filings are empty)',out},null,1));
  process.exit(out.some(o=>o.errors.length>0)?1:0);
 }
 const admin=getAdminSupabase();
 if(!args.apply){
  const deps=productionCalendarDeps({deadline:null,codeVersion,admin,raw:memoryRawStore()});
  const out=await previewCalendar(deps,{market:args.market,issuerIds:args.issuers.length?args.issuers:undefined,limit:args.limit});
  console.log(JSON.stringify({mode:'preview (nothing written; pass --apply)',market:args.market,out},null,1));
  process.exit(out.some(o=>o.errors.length>0)?1:0);
 }
 const deps=productionCalendarDeps({deadline:new Date(Date.now()+APPLY_BUDGET_MS),codeVersion,admin});
 const receipt=await runCalendarSync(deps,{market:args.market,limit:args.limit,triggeredBy:'script'});
 console.log(JSON.stringify({mode:'apply',market:args.market,codeVersion,...receipt},null,1));
 process.exit(receipt.status==='success'?0:1);
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
