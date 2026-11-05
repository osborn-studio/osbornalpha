// src/app/api/facts/[ticker]/metrics/route.ts
// Public derived metrics (spec §9): without asOf the materialized financial_metrics rows of the
// current FORMULA_VERSION; with asOf a live deriveMetrics over the read_facts envelope (asOf
// replay), basedOnRev = the envelope's state_rev. Metric names are validated per market.
import {NextResponse} from 'next/server';
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveMetrics,metricNames} from '@/lib/facts/derive';
import {STALE_CACHE_CONTROL,QueryError,TICKER_RE,dateParam,errorResponse,intParam,listParam,paramErrorResponse,publicClients,readParams,resolvePublicIssuer,successHeaders,utcDate} from '@/lib/facts/public-route';
import {FactsDbError} from '@/lib/facts/types';
import type {MetricRow} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['metrics','from','to','asOf','limit'] as const;
const DEFAULT_LIMIT=200,MAX_LIMIT=1000;
const publicMetric=(m:MetricRow)=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,inputs:m.inputs,basedOnRev:m.based_on_rev});

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeURIComponent(raw);
 if(!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let p:Map<string,string>,from:string|undefined,to:string|undefined,asOf:string|undefined,limit:number;
 try{
  p=readParams(new URL(req.url),PARAMS);
  from=dateParam(p,'from');to=dateParam(p,'to');asOf=dateParam(p,'asOf');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);
  if(asOf!==undefined&&asOf>today)throw new QueryError('asOf');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db,stateRev}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  let metrics:string[]|undefined;
  try{metrics=listParam(p,'metrics',new Set(metricNames(issuer.market)),metricNames(issuer.market).length);}
  catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  let rows:MetricRow[],truncated=false,stale=false;
  if(asOf===undefined){
   // Serve materialised rows only if they were derived from the CURRENT fact state: rev before,
   // rows (one consistent based_on_rev, enforced by metricsOfIssuer), rev after. Any mismatch (or
   // an unstable metrics read) means facts changed visibility since materialisation: no rows.
   const rev=await stateRev(issuer.issuerId,issuer.market);
   try{rows=await db.metricsOfIssuer(issuer.issuerId,issuer.market,FORMULA_VERSION);}
   catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
   if(!stale&&rows.length>0&&(rows.some(m=>m.based_on_rev!==rev)||await stateRev(issuer.issuerId,issuer.market)!==rev)){rows=[];stale=true;}
  }else{
   const env=await db.readFacts(issuer.issuerId,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
   truncated=env.truncated;
   rows=truncated?[]:deriveMetrics(env.rows,{market:issuer.market,asOf,basedOnRev:env.stateRev});
  }
  const wanted=metrics?new Set(metrics):null;
  rows=rows.filter(m=>(!wanted||wanted.has(m.metric))&&(from===undefined||m.period_end>=from)&&(to===undefined||m.period_end<=to)).slice(0,limit);
  const body={issuerId:issuer.issuerId,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,metrics:rows.map(publicMetric)};
  return NextResponse.json(body,{headers:stale?{'Cache-Control':STALE_CACHE_CONTROL}:successHeaders(now,asOf,rows.length===0||truncated)});
 }catch(e){
  console.error('[facts/metrics]',e instanceof Error?e.message:e);
  return errorResponse('internal','metrics read failed',500);
 }
}
