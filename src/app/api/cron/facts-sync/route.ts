// src/app/api/cron/facts-sync/route.ts
// Facts sync trigger (spec §6.5): CRON_SECRET bearer (same check as securities-sync), market US|CN,
// limit 1..200 (default 25), maxDuration 300 with a 240 s deadline handed to the sync core, which
// stops starting issuers when the remaining budget is under 90 s (deadline_hit). A missing
// code_version refuses the run (spec §6.1). Returns the batch receipt.
// Vercel may deliver one cron event more than once (the batch lease makes a duplicate run harmless:
// issuers held by the first run are skipped as 'leased'), and sub-daily crons (this one is every 4 h)
// need a Vercel Pro plan. The HTTP receipt carries codes and counts only: no error messages.
// CN is on by default (real Tushare verification 2026-11-06; vercel.json schedules US and CN). Kill switch:
// FACTS_CN_ENABLED=0 makes the route refuse market=CN with 403 cn_disabled.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {runFactsSync} from '@/lib/facts/sync';
import type {SyncReceipt} from '@/lib/facts/sync';
import {SyncError} from '@/lib/facts/errors';
import {productionSyncDeps,resolveCodeVersion} from '@/lib/facts/deps';
import type {Market} from '@/lib/facts/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000,DEFAULT_LIMIT=25,MAX_LIMIT=200;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

/** Receipt for the HTTP body: codes, keys and counts; never messages, warnings or snapshot hashes. */
function publicReceipt(r:SyncReceipt){
 const errs=(list:{code:string;key?:string}[])=>list.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key});
 return {batchId:r.batchId,status:r.status,counts:r.counts,errors:errs(r.errors),idle:r.idle,detail:r.detail,
  issuers:r.issuers.map(i=>({issuerId:i.issuerId,fetchKey:i.fetchKey,outcome:i.outcome,code:i.code,counts:i.counts,errors:errs(i.errors)}))};
}

function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const url=new URL(request.url);
 if(url.searchParams.getAll('limit').length>1)return err('invalid_parameter:limit','limit may be given once',400);
 if(url.searchParams.getAll('market').length!==1)return err('invalid_parameter:market','market required once',400);
 const market=url.searchParams.get('market');
 if(market!=='US'&&market!=='CN')return err('invalid_parameter:market','market must be US or CN',400);
 const limitRaw=url.searchParams.get('limit');
 let limit=DEFAULT_LIMIT;
 if(limitRaw!==null){if(!/^\d{1,3}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(limitRaw);}
 if(market==='CN'&&process.env.FACTS_CN_ENABLED==='0')return err('cn_disabled','CN facts sync is not enabled (FACTS_CN_ENABLED)',403);
 if(market==='CN'&&!process.env.TUSHARE_TOKEN)return err('tushare_unconfigured','TUSHARE_TOKEN not set',503);   // before deps or a batch: a missing token must not burn a batch per cron
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const deps=productionSyncDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion});
  const receipt=await runFactsSync(deps,{market:market as Market,limit,dryRun:false,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',market,limit,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return err(e instanceof SyncError?e.code:'sync_failed','Facts sync failed',500);   // code only: no message leaves the server
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
