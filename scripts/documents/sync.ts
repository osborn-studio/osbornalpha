/**
 * Document sync from the command line (spec §6.3). No deadline; dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/documents/sync.ts --source edgar|cninfo|hkexnews
 *        [--issuer <issuer_id|ticker>]... [--limit n] [--since-year y] [--forms F1,F2]
 *        [--all-announcements] [--refetch] [--apply]
 *
 * Dry run: lists, downloads the items it would process and plans duplicate / versioned / inserted
 * against the database (read-only: no batch, lease, cursor, object, quarantine or document write).
 * --apply records an ingest_batches receipt (dataset documents.<source>, triggered_by script) and needs
 * a code version (VERCEL_GIT_COMMIT_SHA or a git checkout). --issuer takes an issuer uuid or a ticker
 * resolved by today's ownership (unknown → exit 2); an issuer without a document_sync_scope row is
 * seeded by the core on --apply (reasons ['explicit']; the next cron reconcile retires it unless a
 * source lists it). --forms adds EDGAR forms to the default set (edgar only). --all-announcements
 * stores every cninfo/HKEX announcement instead of periodic reports only (owner decision B; not edgar).
 * --refetch downloads known source_refs again (hkexnews always does by default; spec §15 q2).
 * Do not run --apply while the cron for the same source is running (leases make it safe, not useful).
 * Exit 0 on success, 1 when the batch (or any issuer of a dry run) failed, 2 on bad arguments.
 * tsx does NOT load .env.local: use node --env-file as above (never commit that file).
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {documentsCodeVersion,productionDocumentsDeps} from '../../src/lib/documents/deps';
import {runDocumentsSync} from '../../src/lib/documents/sync';
import type {ListedSource} from '../../src/lib/documents/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: sync.ts --source edgar|cninfo|hkexnews [--issuer <issuer_id|ticker>]... [--limit n] [--since-year y] [--forms F1,F2] [--all-announcements] [--refetch] [--apply]';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Args{source:ListedSource;issuers:string[];limit:number;sinceYear:number;forms:string[];allAnnouncements:boolean;refetch:boolean;apply:boolean}

function usage(msg?:string):never{console.error(msg??USAGE);process.exit(2);}
function parseArgs(argv:string[]):Args{
 const thisYear=new Date().getUTCFullYear();
 const a:Args={source:'hkexnews',issuers:[],limit:25,sinceYear:thisYear-10,forms:[],allAnnouncements:false,refetch:false,apply:false};let source:string|undefined;
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--'))usage();return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--source'){if(source!==undefined)usage('--source may be given once');source=next(i++);}
  else if(x==='--issuer')a.issuers.push(next(i++));
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--since-year')a.sinceYear=Number(next(i++));
  else if(x==='--forms')a.forms.push(...next(i++).split(',').map(f=>f.trim().toUpperCase()).filter(f=>f.length>0));
  else if(x==='--all-announcements')a.allAnnouncements=true;
  else if(x==='--refetch')a.refetch=true;
  else if(x==='--apply')a.apply=true;
  else usage();
 }
 if(source!=='edgar'&&source!=='cninfo'&&source!=='hkexnews')usage();
 a.source=source;
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>1000)usage('--limit must be 1..1000');
 if(!Number.isInteger(a.sinceYear)||a.sinceYear<1990||a.sinceYear>thisYear)usage('--since-year out of range');
 if(a.forms.length>0&&a.source!=='edgar')usage('--forms is for --source edgar only');
 if(a.allAnnouncements&&a.source==='edgar')usage('--all-announcements is for cninfo/hkexnews only');
 return a;
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const codeVersion=documentsCodeVersion({allowGit:true})??(args.apply?null:'dry-run');
 if(!codeVersion)usage('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');
 const admin=getAdminSupabase();
 const deps=productionDocumentsDeps(args.source,{deadline:null,codeVersion,admin,extraForms:args.forms,allAnnouncements:args.allAnnouncements});
 let issuerIds:string[]|undefined;
 if(args.issuers.length>0){
  const tables=supabaseTableClient(admin);const today=new Date().toISOString().slice(0,10);
  issuerIds=[];
  for(const t of args.issuers){
   if(UUID.test(t)){issuerIds.push(t.toLowerCase());continue;}
   const r=await resolveIssuer(tables,{ticker:t},{today});
   if(!r)usage(`unknown ticker: ${t}`);
   issuerIds.push(r.issuer_id);
  }
 }
 const receipt=await runDocumentsSync(deps,{source:args.source,limit:args.limit,issuerIds,sinceYear:args.sinceYear,refetch:args.refetch||undefined,dryRun:!args.apply,triggeredBy:'script'});
 console.log(JSON.stringify({mode:args.apply?'apply':'dry-run (no batch written; pass --apply to write)',source:args.source,codeVersion,...receipt},null,1));
 const failed=args.apply?receipt.status!=='success':receipt.issuers.some(i=>i.outcome==='failed');
 process.exit(failed?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
