// src/app/api/cron/broker-research-verify/route.ts
// Daily evidence verification trigger (spec §8.3). CRON_SECRET bearer (timing-safe, like facts-sync);
// maxDuration 300 with a 250 s budget; the only recordAttempt caller of dataset broker_research.
// NOT registered in vercel.json by this plan (nothing to verify before the first publication; the
// owner registers it after merge — docs/runbooks/broker-research.md). Receipt carries codes and counts.
import {NextResponse} from 'next/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseTableClient} from '@/lib/db/table-client';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {cronAuthorized} from '@/lib/broker-research/cron-auth';
import {supabaseBrokerResearchDb} from '@/lib/broker-research/db';
import {supabaseBrokerStorage} from '@/lib/broker-research/storage';
import {VERIFY_BUDGET_MS,runVerify} from '@/lib/broker-research/verify';

export const dynamic='force-dynamic';
export const maxDuration=300;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!cronAuthorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const sb=getAdminSupabase();
  const receipt=await runVerify({db:supabaseBrokerResearchDb({admin:sb}),storage:supabaseBrokerStorage(sb),tables:supabaseTableClient(sb),now:()=>new Date(),codeVersion},
   {deadline:new Date(started.getTime()+VERIFY_BUDGET_MS),triggeredBy:'cron',recordFreshness:true});
  return NextResponse.json({ok:receipt.status!=='failed',started_at:started.toISOString(),receipt:{batchId:receipt.batchId,status:receipt.status,checked:receipt.checked,remaining:receipt.remaining,freshness:receipt.freshness,
   outcomes:receipt.results.map(r=>({documentId:r.documentId,outcome:r.outcome}))}},{headers:{'Cache-Control':'no-store'}});
 }catch{return err('verify_failed','Broker research verification failed',500);}
}
export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
