// src/app/api/facts/[ticker]/metrics/route.ts
// Public derived metrics (spec §9; plan 3 §4.4, T8). Without asOf: the materialized
// financial_metrics rows of the lineage target T for the current FORMULA_VERSION, served only when
// the lineage members and their state_revs read before and after the metrics read are identical
// and every row's based_on_lineage equals that vector; any mismatch or an unstable read →
// metrics:[], stale:true, STALE_CACHE_CONTROL (never recomputed inline: the visibility paths
// re-materialise). With asOf: a live deriveLineageMetrics over the read_facts_lineage envelope
// (asOf replay), basedOnRev = T's rev, basedOnLineage = the envelope vector. Metric names are
// validated per market; tickerAsOf picks the ticker's owner at that date. `conflicts` = the cross-issuer
// conflicts withheld from current values (same shape as the facts route), read from a
// read_facts_lineage call inside the same before/after bracket (live branch: the envelope itself).
import {NextResponse} from 'next/server';
import {MAPPING_GEN} from '@/lib/facts/concepts';
import {lineageRevsEqual} from '@/lib/facts/db';
import {DERIVE_CONCEPTS,FORMULA_VERSION,deriveLineageMetrics,metricNames} from '@/lib/facts/derive';
import {FRESH_METRICS_CACHE_CONTROL,STALE_CACHE_CONTROL,QueryError,TICKER_RE,dateParam,decodeTicker,errorResponse,failureResponse,intParam,listParam,paramErrorResponse,publicClients,publicConflict,publicResolution,readParams,resolvePublicIssuer,successHeaders,tickerAsOfParam,utcDate} from '@/lib/facts/public-route';
import {FactsDbError} from '@/lib/facts/types';
import type {LineageConflict,MetricRow} from '@/lib/facts/types';

export const dynamic='force-dynamic';
const PARAMS=['metrics','from','to','asOf','limit','tickerAsOf'] as const;
const DEFAULT_LIMIT=200,MAX_LIMIT=1000;
const publicMetric=(m:MetricRow)=>({metric:m.metric,periodStart:m.period_start,periodEnd:m.period_end,duration:m.duration,value:m.value,unit:m.unit,inputUnit:m.input_unit,basis:m.basis,inputs:m.inputs,basedOnRev:m.based_on_rev,basedOnLineage:m.based_on_lineage});

export async function GET(req:Request,{params}:{params:Promise<{ticker:string}>}){
 const now=new Date();const today=utcDate(now);
 const {ticker:raw}=await params;const ticker=decodeTicker(raw);
 if(ticker===null||!TICKER_RE.test(ticker))return errorResponse('invalid_parameter:ticker','invalid ticker',400);
 let p:Map<string,string>,from:string|undefined,to:string|undefined,asOf:string|undefined,limit:number,tickerAsOf:string;
 try{
  p=readParams(new URL(req.url),PARAMS);
  from=dateParam(p,'from');to=dateParam(p,'to');asOf=dateParam(p,'asOf');limit=intParam(p,'limit',DEFAULT_LIMIT,MAX_LIMIT);tickerAsOf=tickerAsOfParam(p,today);
  if(asOf!==undefined&&asOf>today)throw new QueryError('asOf');
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const {tables,db}=publicClients();
  const issuer=await resolvePublicIssuer(tables,ticker,today,tickerAsOf);
  if(!issuer)return errorResponse('unknown_ticker','no issuer for ticker',404);
  let metrics:string[]|undefined;
  try{metrics=listParam(p,'metrics',new Set(metricNames(issuer.market)),metricNames(issuer.market).length);}
  catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
  const target=issuer.issuerId;
  const lineage=await db.lineageOf(target);
  let rows:MetricRow[],truncated=false,stale=false,conflicts:LineageConflict[]=[];
  if(asOf===undefined){
   const before=await db.stateRevs(lineage,issuer.market);
   try{
    rows=await db.metricsOfIssuer(target,issuer.market,FORMULA_VERSION);
    // conflicts withheld from current values, read inside the same before/after bracket
    const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf:today});
    conflicts=env.conflicts;if(env.truncated)truncated=true;
   }catch(e){if(e instanceof FactsDbError&&e.message==='metrics_unstable'){rows=[];stale=true;}else throw e;}
   if(!stale){   // the guard runs for an empty read too: a lineage or rev that moved during it is stale, never an empty answer
    const lineageAfter=await db.lineageOf(target);
    const after=await db.stateRevs(lineageAfter,issuer.market);
    if(lineageAfter.join(',')!==lineage.join(',')||!lineageRevsEqual(before,after)||rows.some(m=>!lineageRevsEqual(m.based_on_lineage,before))){rows=[];conflicts=[];stale=true;}
   }
  }else{
   const env=await db.readFactsLineage(lineage,issuer.market,{concepts:[...DERIVE_CONCEPTS[issuer.market]],asOf,history:true});
   truncated=env.truncated;conflicts=env.conflicts;
   rows=truncated?[]:deriveLineageMetrics(env.rows,target,lineage,{market:issuer.market,asOf,basedOn:env.stateRevs});
  }
  const wanted=metrics?new Set(metrics):null;
  rows=rows.filter(m=>(!wanted||wanted.has(m.metric))&&(from===undefined||m.period_end>=from)&&(to===undefined||m.period_end<=to)).slice(0,limit);
  const body={issuerId:target,ticker:issuer.ticker,market:issuer.market,asOf:asOf??null,mappingGen:MAPPING_GEN,formulaVersion:FORMULA_VERSION,truncated,stale,lineage,resolution:publicResolution(issuer),conflicts:conflicts.map(publicConflict),metrics:rows.map(publicMetric)};
  return NextResponse.json(body,{headers:stale?{'Cache-Control':STALE_CACHE_CONTROL}:asOf===undefined&&rows.length>0?{'Cache-Control':FRESH_METRICS_CACHE_CONTROL}:successHeaders(now,asOf,rows.length===0||truncated)});
 }catch(e){return failureResponse(e,'facts/metrics','metrics read failed');}
}
