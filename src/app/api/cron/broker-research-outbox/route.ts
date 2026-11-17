// src/app/api/cron/broker-research-outbox/route.ts
// Outbox delivery trigger (spec §8.3, every 10 min proposed). BROKER_RESEARCH_F4_URL unset → the
// production F4 port is disabled and nothing is read or changed (events stay pending, attempts not
// incremented). NOT registered in vercel.json (F4 consumer endpoint does not exist yet, F4 spec §12.3).
import {NextResponse} from 'next/server';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {supabaseBrokerResearchDb} from '@/lib/broker-research/db';
import {OUTBOX_BUDGET_MS,OUTBOX_LIMIT,deliverOutbox} from '@/lib/broker-research/outbox';
import {productionF4Port} from '@/lib/broker-research/ports/f4';
import {cronAuthorized} from '@/lib/broker-research/cron-auth';

export const dynamic='force-dynamic';
export const maxDuration=60;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!cronAuthorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const started=new Date();
 try{
  const f4=productionF4Port();
  const receipt=await deliverOutbox({db:f4.enabled?supabaseBrokerResearchDb({admin:getAdminSupabase()}):({} as never),f4,now:()=>new Date()},{limit:OUTBOX_LIMIT,deadline:new Date(started.getTime()+OUTBOX_BUDGET_MS)});
  return NextResponse.json({ok:true,started_at:started.toISOString(),receipt},{headers:{'Cache-Control':'no-store'}});
 }catch{return err('outbox_failed','Broker research outbox delivery failed',500);}
}
export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}
