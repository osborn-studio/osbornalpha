// src/app/api/industries/[scheme]/[code]/constituents/route.ts
// GET …/constituents (spec §9): members on `on` known by today (spec §4.6), paged (pageSize ≤ 200),
// each with its membership evidence, L1>L2>L3 path, and the latest annual revenue / net income visible
// on `on`; unresolvedCount is a count only (source records are not public). SIC is current_only.
import {NextResponse} from 'next/server';
import {errorResponse,intParam,paramErrorResponse,readParams,successHeaders,utcDate} from '@/lib/facts/public-route';
import {publicReadDeps} from '@/lib/industry/public-deps';
import {constituentsView} from '@/lib/industry/read';
import type {ConstituentsQuery} from '@/lib/industry/read';
import {MAX_PAGE_SIZE,codeOf,onOf,schemeOf,versionOf} from '@/lib/industry/route-params';

export const dynamic='force-dynamic';
const PARAMS=['version','on','page','pageSize'] as const;

export async function GET(req:Request,{params}:{params:Promise<{scheme:string;code:string}>}){
 const now=new Date();const today=utcDate(now);
 const raw=await params;
 let q:ConstituentsQuery;
 try{
  const scheme=schemeOf(raw.scheme);
  const p=readParams(new URL(req.url),PARAMS);
  q={scheme,version:versionOf(p,scheme),code:codeOf(raw.code),on:onOf(p,today),page:intParam(p,'page',1,10_000),pageSize:intParam(p,'pageSize',50,MAX_PAGE_SIZE)};
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const v=await constituentsView(publicReadDeps(now),q);
  if(v.state==='unlicensed')return errorResponse('unlicensed',`dataset ${v.datasetKey} is not public`,403);
  if(v.state==='unknown_industry')return errorResponse('unknown_industry','no such industry code',404);
  return NextResponse.json({scheme:q.scheme,version:q.version,...v},{headers:successHeaders(now,q.on,v.rows.length===0)});
 }catch(e){
  console.error('[industries/constituents]',e instanceof Error?e.message:e);
  return errorResponse('internal','constituents read failed',500);
 }
}
