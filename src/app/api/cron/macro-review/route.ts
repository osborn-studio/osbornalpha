// src/app/api/cron/macro-review/route.ts
// Monthly review generation (spec §6.2, §8): vercel.json `0 6 3 * *` builds the newest closed month (review cutoff = the 3rd
// of the next month 00:00:00Z has passed) for US then CN;
// ?month=YYYY-MM&region=US|CN reruns one unit by hand; ?preview=1 computes with zero writes. Order: CRON_SECRET bearer
// (401) → MACRO_STRATEGY_ENABLED (404) → foundation (503) → parameters (400) → code version (503). runReview (Task 9)
// logs its own failed attempts and never moves the pointer on failure; the HTTP receipt carries codes and counts only
// (a failed unit's message is replaced by review_failed) and any failed unit makes the response 500.
import {NextResponse} from 'next/server';
import {authorizedCronRequest} from '@/lib/observability/cron-auth';
import type {Region} from '@/lib/macro/strategy/contract';
import {strategyEnabled} from '@/lib/macro/strategy/flags';
import {strategyPort} from '@/lib/macro/strategy/port';
import {runReview,type ReviewReceipt} from '@/lib/macro/strategy/review';
import {ParamError,codeVersionOrNull,errorResponse,failureResponse,isClosedMonth,lastClosedMonth,monthOf,readParams,regionOf,strategyDb} from '@/lib/macro/strategy/route-helpers';

export const dynamic='force-dynamic';
export const maxDuration=300;

const publicReceipt=(r:ReviewReceipt):Omit<ReviewReceipt,'error'>&{code?:string}=>{const {error,...rest}=r;return error===undefined?rest:{...rest,code:'review_failed'};};

export async function GET(req:Request){
 if(!authorizedCronRequest(req.headers.get('authorization'),process.env.CRON_SECRET))return errorResponse('unauthorized','Unauthorized',401);
 if(!strategyEnabled())return errorResponse('strategy_disabled','macro strategy is not enabled',404);
 const port=strategyPort();
 if(!port)return errorResponse('macro_foundation_unavailable','macro data foundation is not wired',503);
 const now=new Date();
 let month:string,regions:Region[],preview:boolean;
 try{
  const p=readParams(new URL(req.url),['month','region','preview']);
  month=p.has('month')?monthOf(p.get('month')):lastClosedMonth(now);
  if(!isClosedMonth(month,now))throw new ParamError('month');
  regions=p.has('region')?[regionOf(p.get('region'))]:['US','CN'];
  const pv=p.get('preview');
  if(pv!==undefined&&pv!=='1')throw new ParamError('preview');
  preview=pv==='1';
 }catch(e){return failureResponse(e);}
 const codeVersion=codeVersionOrNull();
 if(!codeVersion)return errorResponse('code_version_unavailable','code version not set',503);
 const db=strategyDb();
 const receipts:ReturnType<typeof publicReceipt>[]=[];
 for(const region of regions)receipts.push(publicReceipt(await runReview({port,db,codeVersion},region,month,{preview})));   // sequential: one unit per region
 const ok=receipts.every(r=>r.outcome!=='failed');
 return NextResponse.json({ok,month,preview,receipts},{status:ok?200:500,headers:{'Cache-Control':'no-store'}});
}
