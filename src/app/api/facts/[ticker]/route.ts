// src/app/api/facts/[ticker]/route.ts
// Public disclosure-log read (spec §9): concepts mode (read_facts envelope, asOf replay, history,
// durations, limit = natural keys) or factIds evidence mode (≤ 100 ids, any mapping generation,
// RLS limits to status ok). Filings returned are exactly those referenced by the returned facts.
import {NextResponse} from 'next/server';
import {CONCEPT_IDS as CONCEPT_ID_LIST,MAPPING_GEN,MAX_READ_CONCEPTS} from '@/lib/facts/concepts';
import {QueryError,TICKER_RE,UUID_RE,asOfParam,dateParam,errorResponse,flagParam,intParam,listParam,paramErrorResponse,publicClients,publicFact,publicFiling,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';
import type {Duration} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['concepts','factIds','from','to','asOf','durations','history','limit'] as const;
const CONCEPT_IDS=new Set(CONCEPT_ID_LIST);
const DURATIONS=new Set<string>(['3M','6M','9M','12M','INSTANT']);
const MAX_FACT_IDS=100,DEFAULT_LIMIT=200,MAX_LIMIT=1000;

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeURIComponent(raw);
 if(!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let q:{concepts?:string[];factIds?:string[];from?:string;to?:string;asOf:string;durations?:Set<string>;history:boolean;limit:number};
 try{
  const p=readParams(new URL(req.url),PARAMS);
  const concepts=listParam(p,'concepts',CONCEPT_IDS,MAX_READ_CONCEPTS);
  const factIds=listParam(p,'factIds',null,MAX_FACT_IDS);
  if(factIds&&factIds.some(id=>!UUID_RE.test(id)))throw new QueryError('factIds');
  if((concepts===undefined)===(factIds===undefined))throw new QueryError(concepts?'factIds':'concepts');   // exactly one mode
  const durations=listParam(p,'durations',DURATIONS,DURATIONS.size);
  q={concepts,factIds,from:dateParam(p,'from'),to:dateParam(p,'to'),asOf:asOfParam(p,today),durations:durations?new Set(durations):undefined,history:flagParam(p,'history'),limit:intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT)};
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  let rows,truncated=false;
  if(q.factIds){
   rows=(await db.factsByIds(q.factIds)).filter(r=>r.issuer_id===issuer.issuerId&&r.market===issuer.market);
  }else{
   const env=await db.readFacts(issuer.issuerId,issuer.market,{concepts:q.concepts!,asOf:q.asOf,from:q.from,to:q.to,history:q.history,limit:q.limit});
   truncated=env.truncated;
   rows=q.durations?env.rows.filter(r=>q.durations!.has(r.duration as Duration)):env.rows;
  }
  const wanted=new Set(rows.map(r=>r.filing_id));
  const filings=wanted.size===0?[]:(await db.filingsOfIssuer(issuer.issuerId,issuer.market,{})).filter(f=>wanted.has(f.filing_id));
  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:q.asOf,mappingGen:MAPPING_GEN,truncated,facts:rows.map(publicFact),filings:filings.map(publicFiling)};
  return NextResponse.json(body,{headers:successHeaders(now,q.factIds?undefined:q.asOf,rows.length===0||truncated)});
 }catch(e){
  console.error('[facts]',e instanceof Error?e.message:e);
  return errorResponse('internal','facts read failed',500);
 }
}
