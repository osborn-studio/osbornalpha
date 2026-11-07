// src/app/api/admin/industries/replay/route.ts
// GET /api/admin/industries/replay?runId=&code=&periodEnd=[&metric=&duration=] (spec §9): any run
// status (failed and building included), every cell of the (code, period_end) group with its
// `reproduced`, the full manifest, the replay, the unresolved source records, and — with metric — a
// `focus` shaped like the public original replay (the source drawer uses it in the admin preview).
import {NextResponse} from 'next/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {QueryError,dateParam,readParams} from '@/lib/facts/public-route';
import {supabaseIndustryDb} from '@/lib/industry/db';
import {supabaseManifestStore} from '@/lib/industry/manifest';
import {adminReplayView} from '@/lib/industry/read';
import {codeOf,metricOf,optionalDurationOf,uuidOf} from '@/lib/industry/route-params';
import type {AggDuration,AggMetric} from '@/lib/industry/types';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
const NO_STORE={'Cache-Control':'no-store'};
const bad=(code:string)=>NextResponse.json({error:code},{status:400,headers:NO_STORE});

export async function GET(request:Request){
 try{
  await requireAdminUser();
  let q:{runId:string;code:string;periodEnd:string;metric:AggMetric|null;duration:AggDuration|null};
  try{
   const p=readParams(new URL(request.url),['runId','code','periodEnd','metric','duration']);
   const periodEnd=dateParam(p,'periodEnd');
   if(periodEnd===undefined)throw new QueryError('periodEnd');
   const code=p.get('code');
   if(code===undefined)throw new QueryError('code');
   const metric=p.has('metric')?metricOf(p,null):null;
   q={runId:uuidOf(p,'runId'),code:codeOf(code),periodEnd,metric,duration:metric?optionalDurationOf(p,metric):null};
  }catch(e){if(e instanceof QueryError)return bad(e.message);throw e;}
  const admin=getAdminSupabase();
  const db=supabaseIndustryDb(admin);
  const v=await adminReplayView({db,manifests:supabaseManifestStore(admin,db)},q);
  if(v.state!=='ok')return NextResponse.json({error:v.state},{status:404,headers:NO_STORE});
  return NextResponse.json(v,{headers:NO_STORE});
 }catch(error){
  if(error instanceof AdminUnauthenticated)return NextResponse.json({error:'authentication required'},{status:401,headers:NO_STORE});
  if(error instanceof AdminForbidden)return NextResponse.json({error:'admin role required'},{status:403,headers:NO_STORE});
  console.error('[admin/industries/replay]',error instanceof Error?error.message:error);
  return NextResponse.json({error:'industry replay unavailable'},{status:500,headers:NO_STORE});
 }
}
