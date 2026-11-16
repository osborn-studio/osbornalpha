// scripts/macro/strategy-reconcile.ts
/**
 * Settlement reconcile for macro explanations (runbook §4; plan audit R2-4). Dry run by default.
 *
 *   node --env-file=.env.local --import tsx scripts/macro/strategy-reconcile.ts [--limit n] [--apply]
 *
 * Walks macro_explanation_runs with finalize_payload set and finalized = false in pages of --limit rows (default 100) by keyset over
 * (claimed_at, explanation_id), so unresolved rows never block later ones, reads
 * the usage_events row whose idempotency_key is the run's usage_audit_key, and prints one JSON line per run:
 * {explanation_id, usage_audit_key, state, class: absent|pending|settled|conflict|unknown, action}. --apply finalizes pending rows
 * with the stored payload verbatim through finalizeUsageRun and marks absent / settled / newly finalized rows with
 * macro_mark_finalized; conflict rows are left for a person (runbook §4); a failed usage_events lookup is reported as lookup_failed and the sweep continues. Each line is
 * printed as its row completes. Service role only; it never calls a model and
 * never recomputes pricing or FX. Exit 0 when every line is dry_run / marked / finalized_and_marked, 1 when any run still
 * needs attention, 2 on bad arguments. tsx does NOT load .env.local: use node --env-file as above (never commit that file).
 */
import {finalizeUsageRun,type RecordUsageMeta} from '../../src/lib/billing/quota';
import {supabaseStrategyDb} from '../../src/lib/macro/strategy/db';
import {reconcileSettlements,USAGE_EVENT_COLUMNS,type ReconcileClient,type UnsettledRun,type UsageEventRow} from '../../src/lib/macro/strategy/reconcile';
import {getAdminSupabase} from '../../src/lib/supabase/admin';
import {getAnonSupabase} from '../../src/lib/supabase/anon';

type Result<T>={data:T|null;error:{message:string}|null};
interface Query<T>{
 eq(column:string,value:unknown):Query<T>;
 not(column:string,operator:string,value:unknown):Query<T>;
 or(filters:string):Query<T>;
 order(column:string,options:{ascending:boolean}):Query<T>;
 limit(n:number):PromiseLike<Result<T[]>>;
 maybeSingle():PromiseLike<Result<T>>;
}
interface AdminTables{from<T>(table:string):{select(columns:string):Query<T>}}
const USAGE='usage: strategy-reconcile.ts [--limit n] [--apply]';
const DONE=new Set(['dry_run','marked','finalized_and_marked']);

function parseArgs(argv:string[]):{apply:boolean;limit:number}|null{
 const a={apply:false,limit:100};
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply')a.apply=true;
  else if(argv[i]==='--limit'){const n=Number(argv[++i]);if(!Number.isInteger(n)||n<1||n>1000)return null;a.limit=n;}
  else return null;
 }
 return a;
}
function client():ReconcileClient{
 const admin=getAdminSupabase();const tables=admin as unknown as AdminTables;
 const db=supabaseStrategyDb({admin,anon:getAnonSupabase()});
 return {
  async unsettledRuns(limit,after){
   const base=tables.from<UnsettledRun>('macro_explanation_runs').select('claimed_at,explanation_id,user_id,usage_audit_key,state,finalize_payload')
    .eq('finalized',false).not('finalize_payload','is',null);
   const q=after?base.or(`claimed_at.gt."${after.claimed_at}",and(claimed_at.eq."${after.claimed_at}",explanation_id.gt."${after.explanation_id}")`):base;
   const {data,error}=await q.order('claimed_at',{ascending:true}).order('explanation_id',{ascending:true}).limit(limit);
   if(error)throw new Error(error.message);
   return data??[];
  },
  async usageEvent(key){
   const {data,error}=await tables.from<UsageEventRow>('usage_events').select(USAGE_EVENT_COLUMNS).eq('idempotency_key',key).maybeSingle();
   if(error)throw new Error(error.message);
   return data;
  },
  finalize:(userId,key,payload)=>finalizeUsageRun(userId,key,'perspectives',payload as unknown as RecordUsageMeta),
  markFinalized:id=>db.markFinalized(id),
 };
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 if(!args){process.stderr.write(`${USAGE}\n`);process.exitCode=2;return;}
 let attention=false;
 try{await reconcileSettlements(client(),args,l=>{process.stdout.write(`${JSON.stringify(l)}\n`);if(!DONE.has(l.action))attention=true;});}
 finally{process.exitCode=attention?1:process.exitCode;}
}
main().catch(e=>{process.stderr.write(`${e instanceof Error?e.message:String(e)}\n`);process.exitCode=1;});
