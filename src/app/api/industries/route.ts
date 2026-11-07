// src/app/api/industries/route.ts
// GET /api/industries (spec §9): the active aggregate run's cells for one metric × duration over the
// last `periods` period ends (missing cells carry their reason), the stored YoY companion of a sum,
// the published valuation snapshot, and methodVersion / runId / factsAsOf / historyClass / freshness
// at the top level. SIC answers its navigation list (no aggregation, spec §1.2). A non-public scheme
// dataset is 403 unlicensed with no-store (spec §4.8, §11).
import {NextResponse} from 'next/server';
import {errorResponse,intParam,paramErrorResponse,readParams,successHeaders} from '@/lib/facts/public-route';
import {publicReadDeps} from '@/lib/industry/public-deps';
import {industryListView} from '@/lib/industry/read';
import type {ListQuery} from '@/lib/industry/read';
import {MAX_PERIODS,durationOf,levelOf,metricOf,schemeOf,versionOf} from '@/lib/industry/route-params';

export const dynamic='force-dynamic';
const PARAMS=['scheme','version','level','metric','duration','periods'] as const;

export async function GET(req:Request){
 const now=new Date();
 let q:ListQuery;
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const scheme=schemeOf(p.get('scheme')??'sw2021');
  const metric=metricOf(p);
  q={scheme,version:versionOf(p,scheme),level:levelOf(p,scheme),metric,duration:durationOf(p,metric),periods:intParam(p,'periods',10,MAX_PERIODS)};
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const v=await industryListView(publicReadDeps(now),q);
  if(v.state==='unlicensed')return errorResponse('unlicensed',`dataset ${v.datasetKey} is not public`,403);
  const h=v.state==='ok'&&v.kind==='aggregate'?v.header:null;
  const body={methodVersion:h?.methodVersion??null,runId:h?.runId??null,factsAsOf:h?.factsAsOf??null,historyClass:h?.historyClass??null,scheme:q.scheme,version:q.version,level:q.level,...v};
  return NextResponse.json(body,{headers:successHeaders(now,undefined,v.state==='empty')});
 }catch(e){
  console.error('[industries]',e instanceof Error?e.message:e);
  return errorResponse('internal','industries read failed',500);
 }
}
