// src/app/api/industries/[scheme]/[code]/route.ts
// GET /api/industries/[scheme]/[code] (spec §9): the node (ancestors, children), member summary
// (unresolved as a count only), the aggregate series of the active run inside `window`, published
// valuations with the run's reconciliation summary, the method block and the source list.
import {NextResponse} from 'next/server';
import {errorResponse,paramErrorResponse,readParams,successHeaders} from '@/lib/facts/public-route';
import {publicReadDeps} from '@/lib/industry/public-deps';
import {industryDetailView} from '@/lib/industry/read';
import type {DetailQuery} from '@/lib/industry/read';
import {codeOf,durationsOf,metricsOf,schemeOf,versionOf,windowOf} from '@/lib/industry/route-params';

export const dynamic='force-dynamic';
const PARAMS=['version','metrics','durations','window'] as const;

export async function GET(req:Request,{params}:{params:Promise<{scheme:string;code:string}>}){
 const now=new Date();
 const raw=await params;
 let q:DetailQuery;
 try{
  const scheme=schemeOf(raw.scheme);
  const p=readParams(new URL(req.url),PARAMS);
  q={scheme,version:versionOf(p,scheme),code:codeOf(raw.code),metrics:metricsOf(p),durations:durationsOf(p),window:windowOf(p)};
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const v=await industryDetailView(publicReadDeps(now),q);
  if(v.state==='unlicensed')return errorResponse('unlicensed',`dataset ${v.datasetKey} is not public`,403);
  if(v.state==='unknown_industry')return errorResponse('unknown_industry','no such industry code',404);
  const reconciliationSummary=v.valuation.state==='not_enabled'?null:v.valuation.reconciliation;
  const body={methodVersion:v.method.methodVersion,runId:v.header?.runId??null,factsAsOf:v.header?.factsAsOf??null,historyClass:v.header?.historyClass??null,
   scheme:q.scheme,version:q.version,window:q.window,reconciliationSummary,...v};
  return NextResponse.json(body,{headers:successHeaders(now,undefined,false)});
 }catch(e){
  console.error('[industries/detail]',e instanceof Error?e.message:e);
  return errorResponse('internal','industry read failed',500);
 }
}
