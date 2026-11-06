// scripts/dq/reconcile.ts
/**
 * Runs one reconciliation pair (spec §5.5).
 *
 *   node --env-file=.env.local --import tsx scripts/dq/reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]
 *
 * Without --apply: dry run — members + evaluate only (right documents go to an in-memory raw store, no
 * batch, no cycle, no result rows, no items); prints one JSON line per expected key
 * {issuer, market, natural_key, outcome, passed, action} and a summary. With --apply: one runReconcile
 * batch (triggered_by 'script', no deadline; code_version = VERCEL_GIT_COMMIT_SHA or git HEAD, refused when
 * unavailable) and the full receipt as JSON. --issuer restricts which members are processed (tickers are
 * resolved with resolveIssuer as of today). --apply for a cn.* pair is refused (exit 2) unless FACTS_CN_ENABLED=1. Exit 0 ok, 1 when the batch
 * is not success or a member failed, 2 on bad arguments.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {resolveIssuer} from '../../src/lib/entities/resolve';
import {resolveCodeVersion} from '../../src/lib/facts/deps';
import {memoryRawStore} from '../../src/lib/dq/raw-store';
import {cnPairEnabled,productionReconcileDeps} from '../../src/lib/dq/reconcile/deps';
import {RECONCILE_PAIRS} from '../../src/lib/dq/reconcile/pairs';
import {runReconcile} from '../../src/lib/dq/reconcile/run';
import {CYCLE_PAIR_IDS} from '../../src/lib/dq/reconcile/types';
import type {CyclePairId} from '../../src/lib/dq/reconcile/types';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const USAGE='usage: reconcile.ts --pair <cycle pair id> [--issuer <ticker>...] [--apply]';

async function main(){
 const argv=process.argv.slice(2);let pair='',apply=false;const tickers:string[]=[];
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--pair'&&v){pair=v;i++;}
  else if(x==='--issuer'&&v){tickers.push(v);i++;}
  else if(x==='--apply')apply=true;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair)){console.error(USAGE);process.exit(2);}
 if(apply&&!cnPairEnabled(pair)){console.error('cn_disabled: --apply for cn.* pairs needs FACTS_CN_ENABLED=1');process.exit(2);}   // before any production deps
 if(!RECONCILE_PAIRS[pair as CyclePairId]){console.error(`${USAGE}\nregistered: ${Object.keys(RECONCILE_PAIRS).join(', ')}`);process.exit(2);}
 const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const today=new Date().toISOString().slice(0,10);
 const issuerIds:string[]=[];
 for(const t of tickers){const r=await resolveIssuer(tables,{ticker:t},{today});if(!r){console.error(`unknown ticker: ${t}`);process.exit(2);}issuerIds.push(r.issuer_id);}
 const codeVersion=apply?resolveCodeVersion({allowGit:true}):'dry-run';
 if(!codeVersion){console.error('code_version unavailable (VERCEL_GIT_COMMIT_SHA or git HEAD): refusing to apply');process.exit(2);}
 const base=productionReconcileDeps({deadline:null,codeVersion,admin:sb});
 const deps=apply?base:{...base,raw:memoryRawStore()};
 const receipt=await runReconcile(deps,{pair:pair as CyclePairId,triggeredBy:'script',dryRun:!apply,...(issuerIds.length?{issuerIds}:{})});
 if(!apply){
  let n=0;
  for(const m of receipt.dryRun??[])for(const r of m.results){n++;console.log(JSON.stringify({issuer:m.issuerId,market:m.market,natural_key:r.natural_key,outcome:r.outcome,passed:r.passed,action:r.action}));}
  console.log(JSON.stringify({pair,dry_run:true,members:receipt.dryRun?.length??0,keys:n}));
  process.exit(0);
 }
 console.log(JSON.stringify(receipt,null,1));
 process.exit(receipt.status==='success'&&receipt.members.every(m=>m.outcome!=='failed')?0:1);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
