import {authorizedCronRequest} from '@/lib/observability/cron-auth';
import {resolveCodeVersion} from '@/lib/facts/deps';
import {failureResponse} from '@/lib/facts/public-route';
import {errorJson,jsonNoStore} from './admin-route';
import {topicsEnabled} from './flags';

export function topicCron(tag:string,job:(version:string)=>Promise<unknown>){
 return async(request:Request)=>{
  const secret=process.env.CRON_SECRET;
  if(!secret)return errorJson('cron_unavailable',503);
  if(!authorizedCronRequest(request.headers.get('authorization'),secret))return errorJson('unauthorized',401);
  if(!topicsEnabled())return jsonNoStore({skipped:'disabled'});
  try{
   const version=resolveCodeVersion({allowGit:false});
   if(!version)return errorJson('code_version_unavailable',503);
   return jsonNoStore(await job(version));
  }catch(error){return failureResponse(error,tag,'job_failed');}
 };
}
