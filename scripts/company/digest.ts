/**
 * Company digest from the command line (spec §6.3 item 5). Dry run by default (no batch, no writes).
 *
 *   node --env-file=.env.local --import tsx scripts/company/digest.ts [--full] [--issuer <ticker>]...
 *        [--market US|CN] [--limit n] [--apply]
 *
 * --full rebuilds every stream (or the --issuer streams) regardless of next_attempt_at — run it after
 * EVENTS_VERSION, MAPPING_GEN or FORMULA_VERSION changes, or after fixing an invalid_event bug. Without
 * --full it is one incremental cron pass (--limit, default 200). --issuer needs --full and resolves by
 * today's ownership (unknown → exit 2). --apply needs a code version (VERCEL_GIT_COMMIT_SHA or a git
 * checkout). Never run it while the cron is running (recordAttempt assumes one producer).
 * Exit 0 success, 1 when the batch (apply) is not success or any stream failed (dry run), 2 bad arguments.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {productionDigestDeps} from '../../src/lib/company/deps';
import {runCompanyDigest} from '../../src/lib/company/digest';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import type {Market} from '../../src/lib/facts/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: digest.ts [--full] [--issuer <ticker>]... [--market US|CN] [--limit n] [--apply]';
interface Args{full:boolean;issuers:string[];market?:Market;limit:number;apply:boolean}
function parseArgs(argv:string[]):Args{
 const a:Args={full:false,issuers:[],limit:200,apply:false};
 const next=(i:number)=>{const v=argv[i+1];if(v===undefined||v.startsWith('--')){console.error(USAGE);process.exit(2);}return v;};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--full')a.full=true;
  else if(x==='--issuer')a.issuers.push(next(i++));
  else if(x==='--market'){const m=next(i++);if(m!=='US'&&m!=='CN'){console.error(USAGE);process.exit(2);}a.market=m;}
  else if(x==='--limit')a.limit=Number(next(i++));
  else if(x==='--apply')a.apply=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!Number.isInteger(a.limit)||a.limit<1||a.limit>1000){console.error('--limit must be 1..1000');process.exit(2);}
 if(a.issuers.length>0&&!a.full){console.error('--issuer needs --full');process.exit(2);}
 return a;
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 const codeVersion=resolveCodeVersion({allowGit:true});
 if(args.apply&&!codeVersion){console.error('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');process.exit(2);}
 const admin=getAdminSupabase();
 const deps=productionDigestDeps({deadline:null,codeVersion,admin});
 let issuerIds:string[]|undefined;
 if(args.issuers.length>0){
  const tables=supabaseTableClient(admin);const today=new Date().toISOString().slice(0,10);issuerIds=[];
  for(const t of args.issuers){const r=await resolveIssuer(tables,{ticker:t},{today});if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}issuerIds.push(r.issuer_id);}
 }
 const receipt=await runCompanyDigest(deps,{mode:args.full?'full':'incremental',issuerIds,market:args.market,limit:args.limit,dryRun:!args.apply,triggeredBy:'script'});
 console.log(JSON.stringify({mode:args.apply?'apply':'dry-run (no batch written; pass --apply to write)',codeVersion,...receipt},null,1));
 const failed=args.apply?receipt.status!=='success':receipt.streams.some(s=>s.outcome==='failed');
 process.exit(failed?1:0);
}
main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
