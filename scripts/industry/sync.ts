/**
 * Industry jobs from the command line (spec §10). Dry run by default.
 *
 *   node --env-file="$HOME/.config/osbornalpha/secrets.env" --import tsx scripts/industry/sync.ts --job <job> [--apply]   (Tushare jobs; never print the token)
 *        [--limit n] [--ticker <canonical CN ticker>]... [--facts-as-of YYYY-MM-DD] [--trade-date YYYY-MM-DD]... [--l1 <code>]... [--recompute-from YYYY-MM-DD]
 *
 * --limit is accepted only for load-a-share (cninfo lookups) and memberships-sic (issuer processing).
 * Neither use of --limit is a whole-job budget. --ticker is load-a-share only: repeat for
 * 1..10 distinct exact canonical CN tickers. It scopes stock_basic reads, snapshots and
 * issuer/claim writes to those tickers, skips delisting writes and records a targeted receipt.
 * For memberships-sw, --l1 limits source fetch only: apply loads all
 * SW2021 classifications and runs the global resolver, in separate batches, with no job deadline.
 * Its dry run plans sources from stored classifications; it does not preview the full apply scope.
 * Jobs: load-a-share | facts-scope | memberships-sw | memberships-sic | marks | aggregate, plus the
 * deferred official | valuation (I-3: printed as skipped deferred_i3, exit 0). --recompute-from belongs
 * to valuation only. Gates (src/lib/industry/jobs.ts::jobGate): Tushare jobs need TUSHARE_TOKEN even
 * for a dry run; --apply of facts-scope needs FACTS_CN_INDUSTRY_UNIVERSE=1 and of aggregate needs
 * FACTS_CN_ENABLED=1 (spec §4.10 V4). --apply needs a code version (VERCEL_GIT_COMMIT_SHA or a git
 * checkout). The weekly aggregate runs here (Mac Studio launchd, spec §5.4), never concurrently with
 * a cron run of the same job (spec §10); a late worker is stopped by activation's obsolete_run.
 * Exit 0 success (or dry run without failures), 1 failed/partial, 2 bad arguments or a refused gate.
 * tsx does NOT load env files: use node --env-file as above (Supabase keys from the usual env file, the token from
 * ~/.config/osbornalpha/secrets.env — pass both --env-file flags; never commit or print either).
 */
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {DEFERRED_JOBS,jobGate,parseSyncArgs,productionIndustryDeps,runIndustryJob} from '../../src/lib/industry/jobs';

async function main(){
 const parsed=parseSyncArgs(process.argv.slice(2));
 if(!parsed.ok){console.error(parsed.error);process.exit(2);}
 const args=parsed.args;
 if(DEFERRED_JOBS.has(args.job)){console.log(JSON.stringify({job:args.job,skipped:'deferred_i3',note:'verification items 1/2 open; see docs/runbooks/industry-research.md'},null,1));process.exit(0);}
 if(args.job==='memberships-sw'){
  console.error(`memberships-sw operation plan: source L1=${args.l1Codes.length?args.l1Codes.join(','):'all stored L1'}; apply: classifications=all SW2021, resolver=global (including delisting reconciliation), separate stage batches; job deadline=none. --l1 is not a whole-job write bound. dry-run=source plan from stored classifications only (may fetch provider pages); does not execute or estimate the global resolver. This is not a coverage/readiness check.`);
 }
 const gate=jobGate(args.job,process.env,{apply:args.apply});
 if(gate){console.error(`${gate.code}: ${gate.message}`);process.exit(2);}
 const codeVersion=resolveCodeVersion({allowGit:true})??(args.apply?null:'dry-run');
 if(!codeVersion){console.error('code version unavailable (set VERCEL_GIT_COMMIT_SHA or run inside a git checkout); refusing --apply');process.exit(2);}
 const result=await runIndustryJob(args.job,productionIndustryDeps({codeVersion}),{dryRun:!args.apply,triggeredBy:'script',limit:args.limit,tickers:args.tickers,factsAsOf:args.factsAsOf,tradeDates:args.tradeDates.length?args.tradeDates:undefined,l1Codes:args.l1Codes.length?args.l1Codes:undefined});
 console.log(JSON.stringify({mode:args.apply?'apply':'dry-run (nothing written; pass --apply to write)',codeVersion,tickers:args.tickers,...result},null,1));
 if('skipped' in result)process.exit(0);
 const ok=args.apply?result.receipt.status==='success':result.receipt.status!=='failed';
 process.exit(ok?0:1);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
