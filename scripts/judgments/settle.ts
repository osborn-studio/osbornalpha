/**
 * Judgment settlement from the command line (spec §7.1); same core as /api/cron/judgments-settle.
 *
 *   node --env-file=.env.local --import tsx scripts/judgments/settle.ts [--apply] [--deadline-ms n]
 *
 * Default is a preview: reads the due queue (no claim, no lease, no batch, no writes), runs the resolvers and
 * prints the decisions it would take. --apply runs the real core (repair_stale_batches, compensation scan,
 * batch dataset judgments.settle with triggered_by script, settlements as actor 'script') and needs a code
 * version (VERCEL_GIT_COMMIT_SHA or a git checkout). --deadline-ms defaults to 280000 (the cron budget);
 * claiming stops at 200 s or when the remaining budget is under the batch worst case + 30 s.
 * Exit 0 on success or preview, 1 when the applied batch is not success, 2 on bad arguments.
 * tsx does NOT load .env.local: use node --env-file as above (never commit that file).
 */
import {productionJudgmentDeps,resolveCodeVersion} from '../../src/lib/judgments/deps';
import {DEADLINE_MS,runSettle} from '../../src/lib/judgments/settle';

const USAGE='usage: settle.ts [--apply] [--deadline-ms n]';
interface Args{apply:boolean;deadlineMs:number}
function parseArgs(argv:string[]):Args{
 const a:Args={apply:false,deadlineMs:DEADLINE_MS};
 for(let i=0;i<argv.length;i++){
  const x=argv[i];
  if(x==='--apply')a.apply=true;
  else if(x==='--deadline-ms'){const v=argv[++i];if(v===undefined||!/^\d{1,7}$/.test(v)){console.error(USAGE);process.exit(2);}a.deadlineMs=Number(v);}
  else{console.error(USAGE);process.exit(2);}
 }
 if(a.deadlineMs<1000){console.error('--deadline-ms must be at least 1000');process.exit(2);}
 return a;
}

async function main(){
 const args=parseArgs(process.argv.slice(2));
 const codeVersion=resolveCodeVersion({allowGit:true})??(args.apply?null:'preview');
 if(!codeVersion){console.error('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');process.exit(2);}
 const receipt=await runSettle(productionJudgmentDeps({codeVersion,actor:'script',triggeredBy:'script'}),{preview:!args.apply,deadlineMs:args.deadlineMs});
 console.log(JSON.stringify({mode:args.apply?'apply':'preview (nothing written; pass --apply to settle)',codeVersion,...receipt},null,1));
 process.exit(args.apply&&receipt.status!=='success'?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
