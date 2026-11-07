// src/app/api/cron/judgments-settle/route.ts
// Judgment settlement trigger (spec §7.1): CRON_SECRET bearer (same constant-time check as facts-sync /
// securities-sync), GET|POST, force-dynamic, maxDuration 300 with the 280 s deadline handed to runSettle (which stops
// claiming at 200 s and aborts provider calls at the deadline). ?preview=1 runs the core read-only: no batch, no
// lease, no writes (code version 'preview' when VERCEL_GIT_COMMIT_SHA is absent); an applying run without
// VERCEL_GIT_COMMIT_SHA is refused. Vercel may deliver one cron event twice: leases and request keys make the
// duplicate harmless. The HTTP receipt carries codes, keys and counts only — never messages.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {productionJudgmentDeps,resolveCodeVersion} from '@/lib/judgments/deps';
import {JudgmentError} from '@/lib/judgments/errors';
import {DEADLINE_MS,runSettle} from '@/lib/judgments/settle';
import type {SettleReceipt} from '@/lib/judgments/settle';

export const dynamic='force-dynamic';
export const maxDuration=300;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
/** Codes, keys and counts; never messages (summaries carry reason counts in their message and stay server-side). */
function publicReceipt(r:SettleReceipt){
 const c=r.detail.compensation;
 return {batchId:r.batchId,status:r.status,counts:r.counts,idle:r.idle,preview:r.preview,
  errors:r.errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key}),
  detail:{repaired:r.detail.repaired,batches:r.detail.batches,deadline_hit:r.detail.deadline_hit,
   compensation:c?{status:c.status,reason:c.reason,scanned:c.scanned,produced:c.produced,existing:c.existing}:null},
  items:r.items};
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const previewRaw=new URL(request.url).searchParams.getAll('preview');
 if(previewRaw.length>1||(previewRaw.length===1&&previewRaw[0]!=='1'))return err('invalid_parameter:preview','preview must be 1, given at most once',400);
 const preview=previewRaw.length===1;
 const codeVersion=resolveCodeVersion({allowGit:false})??(preview?'preview':null);
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const receipt=await runSettle(productionJudgmentDeps({codeVersion,actor:'cron',triggeredBy:'cron',signal:request.signal}),{preview,deadlineMs:DEADLINE_MS});
  return NextResponse.json({ok:receipt.status==='success'||receipt.status==='preview',preview,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return err(e instanceof JudgmentError?e.code:'settle_failed','Judgment settlement failed',500);   // code only: no message leaves the server
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
