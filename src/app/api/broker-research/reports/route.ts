// src/app/api/broker-research/reports/route.ts
// GET /api/broker-research/reports (spec §8.1): anon views only, whitelist DTO, no-store. An
// unfiltered empty library is 404 not_found (anon cannot tell "switch off" from "empty" — by design);
// a filtered empty page is 200 []. ticker resolves through resolveIssuer (404 unknown_ticker).
import {NextResponse} from 'next/server';
import {QueryError,TICKER_RE,UUID_RE,dateParam,errorResponse,failureResponse,flagParam,intParam,paramErrorResponse,readParams,utcDate} from '@/lib/facts/public-route';
import {LIST_DEFAULT_LIMIT,LIST_MAX_LIMIT,anonPublicDeps,decodeCursor,listPublicReports,resolveTicker} from '@/lib/broker-research/public-read';
import type {ListQuery} from '@/lib/broker-research/public-read';
import {PUBLIC_RATINGS,PUBLIC_SCOPES} from '@/lib/broker-research/public-dto';
import type {NormalizedRating,ReportScope} from '@/lib/broker-research/types';

export const dynamic='force-dynamic';
const PARAMS=['institution','ticker','rating','scope','from','to','limit','cursor','summary'] as const;

export async function GET(req:Request){
 const today=utcDate(new Date());
 let q:ListQuery,ticker:string|undefined,filtered:boolean;
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const institution=p.get('institution');if(institution!==undefined&&!UUID_RE.test(institution))throw new QueryError('institution');
  ticker=p.get('ticker');if(ticker!==undefined&&!TICKER_RE.test(ticker))throw new QueryError('ticker');
  const rating=p.get('rating');if(rating!==undefined&&!(PUBLIC_RATINGS as readonly string[]).includes(rating))throw new QueryError('rating');
  const scope=p.get('scope');if(scope!==undefined&&!(PUBLIC_SCOPES as readonly string[]).includes(scope))throw new QueryError('scope');
  const from=dateParam(p,'from'),to=dateParam(p,'to');if(from!==undefined&&to!==undefined&&from>to)throw new QueryError('to');
  const c=p.get('cursor'),cursor=c===undefined?undefined:decodeCursor(c);if(cursor===null)throw new QueryError('cursor');
  const limit=intParam(p,'limit',LIST_DEFAULT_LIMIT,LIST_MAX_LIMIT);
  q={institutionId:institution?.toLowerCase(),rating:rating as NormalizedRating|undefined,scope:scope as ReportScope|undefined,from,to,limit,cursor,summaryOnly:flagParam(p,'summary')};
  filtered=[...p.keys()].some(k=>k!=='limit');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const deps=anonPublicDeps();
  if(ticker!==undefined){
   const t=await resolveTicker(deps.tables,ticker,today);
   if(!t)return errorResponse('unknown_ticker','no issuer for ticker',404);
   q.issuerId=t.issuerId;
  }
  const page=await listPublicReports(deps,q);
  if(!filtered&&page.reports.length===0)return errorResponse('not_found','no public reports',404);
  return NextResponse.json(page,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failureResponse(e,'broker-research/reports','reports unavailable');}
}
