import {NextResponse} from 'next/server';
import {authorizedCronRequest} from '@/lib/observability/cron-auth';
import {strategyEnabled} from '@/lib/macro/strategy/flags';
import {strategyPort} from '@/lib/macro/strategy/port';
import {skippedFactViews,warmFactViews} from '@/lib/macro/strategy/fact-views';
import {codeVersionOrNull,errorResponse,failureResponse,strategyDb} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(req:Request){
 if(!authorizedCronRequest(req.headers.get('authorization'),process.env.CRON_SECRET))return errorResponse('unauthorized','Unauthorized',401);
 if(!strategyEnabled())return NextResponse.json({outcomes:skippedFactViews()},{headers:{'Cache-Control':'no-store'}});
 try{
  const port=strategyPort();if(!port)return errorResponse('macro_foundation_unavailable','macro data foundation is not wired',503);
  const codeVersion=codeVersionOrNull();if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
  const outcomes=await warmFactViews({port,db:strategyDb(),codeVersion,now:()=>new Date()});
  return NextResponse.json({outcomes},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e);}
}
