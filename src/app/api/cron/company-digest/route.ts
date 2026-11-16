// src/app/api/cron/company-digest/route.ts
// Company digest trigger (spec §6.3): CRON_SECRET bearer, limit 1..200 (default 200), maxDuration 300
// with a 240 s deadline handed to runCompanyDigest (no new stream with < 30 s left → deadline_hit).
// code_version = VERCEL_GIT_COMMIT_SHA only (missing → 503, like facts-sync). The HTTP receipt carries
// codes, keys and counts only — never messages. Hourly at :20 (vercel.json).
import {NextResponse} from 'next/server';
import {DigestError,runCompanyDigest} from '@/lib/company/digest';
import type {DigestReceipt} from '@/lib/company/digest';
import {productionDigestDeps} from '@/lib/company/deps';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {authorizedCronRequest} from '@/lib/observability/cron-auth';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000,DEFAULT_LIMIT=200,MAX_LIMIT=200;
const NO_STORE={'Cache-Control':'no-store'};
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:NO_STORE});
function publicReceipt(r:DigestReceipt){
 return {batchId:r.batchId,status:r.status,counts:r.counts,idle:r.idle,detail:r.detail,
  errors:r.errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key}),
  streams:r.streams.map(s=>s.code===undefined?{issuerId:s.issuerId,market:s.market,sweep:s.sweep,outcome:s.outcome}:{issuerId:s.issuerId,market:s.market,sweep:s.sweep,outcome:s.outcome,code:s.code})};
}
async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorizedCronRequest(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const url=new URL(request.url);
 const limits=url.searchParams.getAll('limit');
 if(limits.length>1)return err('invalid_parameter:limit','limit may be given once',400);
 let limit=DEFAULT_LIMIT;
 if(limits.length===1){if(!/^\d{1,3}$/.test(limits[0])||Number(limits[0])<1||Number(limits[0])>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(limits[0]);}
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const deps=productionDigestDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion});
  const receipt=await runCompanyDigest(deps,{mode:'incremental',limit,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',limit,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:NO_STORE});
 }catch(e){
  return err(e instanceof DigestError?e.code:'digest_failed','Company digest failed',500);
 }
}
export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
