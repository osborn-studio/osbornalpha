// src/app/api/cron/reconcile/route.ts
// Reconciliation trigger (spec §5.5): GET|POST /api/cron/reconcile?pair=<cycle pair id>. Same rules as
// /api/cron/facts-sync: CRON_SECRET bearer (constant-time), maxDuration 300 with a 240 s deadline handed to
// the runner (which starts a member only with >= 60 s left), a missing code_version refuses the run. The pair
// must be given once and be a REGISTERED cycle pair; cn.* pairs are refused unless FACTS_CN_ENABLED=1 (no
// Tushare token, no verified gold yet; vercel.json schedules lineage 04:00 UTC only; the US iXBRL entry (02:00) is added with its pair in Task 15a).
// A duplicate cron delivery is harmless: cursor claims are fenced, a second worker finds nothing claimable.
// The HTTP receipt carries codes, keys and counts only — never error messages or dry-run results.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {cnPairEnabled,productionReconcileDeps} from '@/lib/dq/reconcile/deps';
import {ReconcileConfigError} from '@/lib/dq/reconcile/pair-support';
import {RECONCILE_PAIRS} from '@/lib/dq/reconcile/pairs';
import {ReconcileError,runReconcile} from '@/lib/dq/reconcile/run';
import type {ReconcileReceipt} from '@/lib/dq/reconcile/run';
import {CYCLE_PAIR_IDS} from '@/lib/dq/reconcile/types';
import type {CyclePairId} from '@/lib/dq/reconcile/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

function publicReceipt(r:ReconcileReceipt){
 return {batchId:r.batchId,status:r.status,counts:r.counts,errors:r.errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key}),cycle:r.cycle,
  members:r.members.map(m=>({issuerId:m.issuerId,market:m.market,outcome:m.outcome,...(m.counts?{counts:m.counts}:{}),...(m.code?{code:m.code.split(':')[0]}:{})})),hooks:r.hooks};
}
function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const pairs=new URL(request.url).searchParams.getAll('pair');
 const pair=pairs.length===1?pairs[0]:'';
 if(!(CYCLE_PAIR_IDS as readonly string[]).includes(pair)||!RECONCILE_PAIRS[pair as CyclePairId])return err('invalid_parameter:pair','pair must be one registered cycle pair',400);
 if(!cnPairEnabled(pair))return err('cn_disabled','CN reconciliation is not enabled (FACTS_CN_ENABLED)',403);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const receipt=await runReconcile(productionReconcileDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion}),{pair:pair as CyclePairId,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',pair,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return err(e instanceof ReconcileError||e instanceof ReconcileConfigError?e.code:'reconcile_failed','Reconcile failed',500);
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
