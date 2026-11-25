import {timingSafeEqual} from 'node:crypto';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {errorResponse} from '@/lib/facts/public-route';
import {isVendorJob,vendorJobGate,productionVendorDeps,runVendorJob} from '@/lib/industry/vendor/jobs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret)return errorResponse('cron_unavailable','Cron unavailable',503);
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(request.headers.get('authorization')??'');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return errorResponse('unauthorized','Unauthorized',401);
 const jobs=new URL(request.url).searchParams.getAll('job'),job=jobs[0];
 if(jobs.length!==1||!isVendorJob(job))return errorResponse('invalid_parameter:job','Expected one vendor job',400);
 const mode='apply',gate=vendorJobGate(job,process.env,{mode});
 if(gate)return errorResponse(gate.code,gate.message,gate.code==='job_disabled'?403:503);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return errorResponse('code_version_unavailable','Code version unavailable',503);
 try{
  const deps=productionVendorDeps({codeVersion,mode,env:process.env});
  const {batchId,status,counts,errors}=await runVendorJob(job,deps,{mode,triggeredBy:'cron',deadlineMs:270000});
  return Response.json({receipt:{batchId,status,counts,errors:errors.map(({code,key})=>({code,key}))}},{headers:{'Cache-Control':'no-store'}});
 }catch{return errorResponse('sync_failed','Vendor sync failed',500);}
}
export const POST=GET;
