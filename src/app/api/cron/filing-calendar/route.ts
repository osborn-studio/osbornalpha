// src/app/api/cron/filing-calendar/route.ts
// Filing-calendar trigger (spec §6.2): CRON_SECRET bearer (same constant-time check as facts-sync),
// market US|CN given once, limit 1..1000 (default 200) given at most once, maxDuration 300 with a
// 240 s deadline (calendar-sync starts a member only with >= 60 s left). A missing code version
// refuses the run. CN is deliberately NOT gated by FACTS_CN_ENABLED: the calendar computes statutory
// nodes and reports unknown_upstream / pending honestly while CN facts are off (plan 3 Part E
// contract note 13). Duplicate deliveries are harmless: the second run finds the pass leased
// (skipped_summary pass_claimed). The HTTP receipt carries codes, keys and counts only.
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {productionCalendarDeps} from '@/lib/dq/calendar-deps';
import {runCalendarSync} from '@/lib/dq/calendar-sync';
import type {CalendarReceipt} from '@/lib/dq/calendar-sync';
import {resolveCodeVersion} from '@/lib/facts/deps';
import type {Market} from '@/lib/facts/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000,DEFAULT_LIMIT=200,MAX_LIMIT=1000;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});
const publicReceipt=(r:CalendarReceipt)=>({batchId:r.batchId,status:r.status,passId:r.passId,passStatus:r.passStatus,counts:r.counts,
 errors:r.errors.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key}),detail:r.detail});

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
 if(limitRaw!==null){if(!/^\d{1,4}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(limitRaw);}
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const deps=productionCalendarDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion});
  const receipt=await runCalendarSync(deps,{market:market as Market,limit,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',market,limit,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch{
  return err('calendar_failed','Filing calendar failed',500);   // code only: no message leaves the server
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
