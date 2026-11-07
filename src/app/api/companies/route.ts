// src/app/api/companies/route.ts
// GET /api/companies — coverage directory (spec §8, §6.1). Public, anon, no session, no per-user fields.
// ?market=US|CN &q=<name|ticker prefix ≤24> &sort=latest_available_date|latest_period_end|name &page &pageSize≤200
import {getAnonSupabase} from '@/lib/supabase/anon';
import {supabaseCompanyDb} from '@/lib/company/db';
import {DIRECTORY_DEFAULT_PAGE_SIZE,DIRECTORY_MAX_PAGE_SIZE,DIRECTORY_Q_RE,DIRECTORY_SORTS,issuerIdsByPrefix,toDirectoryRows,type DirectorySort,type PrefixClient} from '@/lib/company/directory';
import {loadIssuerLites,type SelectInClient} from '@/lib/company/tracking-issuers';
import type {Market} from '@/lib/company/types';
import {FACT_CONCEPTS} from '@/lib/facts/concepts';
import {QueryError,failureResponse,intParam,paramErrorResponse,readParams,successHeaders,utcDate} from '@/lib/facts/public-route';
import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';
const PARAMS=['market','q','sort','page','pageSize'] as const;

export async function GET(request:Request){
 const now=new Date(),today=utcDate(now);
 let market:Market|undefined,q:string|undefined,sort:DirectorySort,page:number,pageSize:number;
 try{
  const p=readParams(new URL(request.url),PARAMS);
  const m=p.get('market');
  if(m!==undefined&&m!=='US'&&m!=='CN')throw new QueryError('market');
  market=m as Market|undefined;
  q=p.get('q')?.trim();
  if(q!==undefined&&!DIRECTORY_Q_RE.test(q))throw new QueryError('q');
  const s=p.get('sort')??'latest_available_date';
  if(!(DIRECTORY_SORTS as readonly string[]).includes(s))throw new QueryError('sort');
  sort=s as DirectorySort;
  page=intParam(p,'page',1,10000);
  pageSize=intParam(p,'pageSize',DIRECTORY_DEFAULT_PAGE_SIZE,DIRECTORY_MAX_PAGE_SIZE);
 }catch(e){
  return paramErrorResponse(e)??failureResponse(e,'companies','directory unavailable');
 }
 const empty={total:0,page,pageSize,conceptsTotal:FACT_CONCEPTS.length,rows:[]};
 try{
  const sb=getAnonSupabase();
  let issuerIds:string[]|undefined;
  if(q!==undefined){
   issuerIds=await issuerIdsByPrefix(sb as unknown as PrefixClient,q,today);
   if(issuerIds.length===0)return NextResponse.json(empty,{headers:successHeaders(now,undefined,true)});
  }
  const {rows,total}=await supabaseCompanyDb(sb).listCoverage({market,issuerIds},sort,{offset:(page-1)*pageSize,limit:pageSize});
  const lites=await loadIssuerLites(sb as unknown as SelectInClient,[...new Set(rows.map(r=>r.issuer_id))]);
  const body={total,page,pageSize,conceptsTotal:FACT_CONCEPTS.length,rows:toDirectoryRows(rows,lites,today)};
  return NextResponse.json(body,{headers:successHeaders(now,undefined,rows.length===0)});
 }catch(e){
  return failureResponse(e,'companies','directory unavailable');
 }
}
