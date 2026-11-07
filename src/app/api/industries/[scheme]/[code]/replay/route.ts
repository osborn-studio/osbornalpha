// src/app/api/industries/[scheme]/[code]/replay/route.ts
// GET …/replay (spec §5.5, §9). Rate limit first (10 per IP per minute, in-memory, best effort), then
// the authorization order dataset public → run visible → cell exists and is ok/published (else 404
// unknown_run / unknown_cell), then the private manifest. Aggregate cells: mode=original returns the
// per-cell filtered manifest, replayFromManifest's cell and `reproduced`; mode=recompute returns
// match|changed with the diff against current evidence. Valuation cells (tradeDate): the published row
// and, only when the official dataset is public, officialValue (deferred I-3: no valuation replay yet).
// Success: Cache-Control public, max-age=3600 (mode=recompute: no-store, it reflects current evidence).
import {NextResponse} from 'next/server';
import {QueryError,dateParam,errorResponse,paramErrorResponse,readParams} from '@/lib/facts/public-route';
import {replayDeps,valuationReplayDeps} from '@/lib/industry/public-deps';
import {SCHEME_VERSION,replayView,valuationReplayView} from '@/lib/industry/read';
import {clientIp,codeOf,metricOf,modeOf,optionalDurationOf,replayLimiter,schemeOf,uuidOf,valuationMetricOf} from '@/lib/industry/route-params';
import type {AggDuration,AggMetric,Scheme} from '@/lib/industry/types';
import type {ValuationMetric} from '@/lib/industry/read';

export const dynamic='force-dynamic';
const PARAMS=['runId','metric','duration','periodEnd','tradeDate','mode'] as const;
const CACHE={'Cache-Control':'public, max-age=3600'};
// mode=recompute reads current evidence: never cached
const NO_STORE={'Cache-Control':'no-store'};
type Parsed={scheme:Scheme;code:string;runId:string;mode:'original'|'recompute'}&({kind:'aggregate';metric:AggMetric;duration:AggDuration|null;periodEnd:string}|{kind:'valuation';metric:ValuationMetric;tradeDate:string});

export async function GET(req:Request,{params}:{params:Promise<{scheme:string;code:string}>}){
 const now=new Date();
 if(!replayLimiter.take(clientIp(req),now.getTime()))return errorResponse('rate_limited','at most 10 replay requests per minute',429);
 const raw=await params;
 let q:Parsed;
 try{
  const scheme=schemeOf(raw.scheme),code=codeOf(raw.code);
  const p=readParams(new URL(req.url),PARAMS);
  const runId=uuidOf(p,'runId'),mode=modeOf(p);
  const periodEnd=dateParam(p,'periodEnd'),tradeDate=dateParam(p,'tradeDate');
  if((periodEnd===undefined)===(tradeDate===undefined))throw new QueryError(periodEnd===undefined?'periodEnd':'tradeDate');
  if(tradeDate!==undefined){
   if(mode!=='original'||p.has('duration'))throw new QueryError(mode!=='original'?'mode':'duration');
   q={scheme,code,runId,mode,kind:'valuation',metric:valuationMetricOf(p),tradeDate};
  }else{
   const metric=metricOf(p,null);
   q={scheme,code,runId,mode,kind:'aggregate',metric,duration:optionalDurationOf(p,metric),periodEnd:periodEnd!};
  }
 }catch(e){const r=paramErrorResponse(e);if(r)return r;throw e;}
 try{
  const version=SCHEME_VERSION[q.scheme];
  if(q.kind==='valuation'){
   const v=await valuationReplayView(valuationReplayDeps(),{scheme:q.scheme,version,code:q.code,runId:q.runId,metric:q.metric,tradeDate:q.tradeDate});
   if(v.state==='unlicensed')return errorResponse('unlicensed',`dataset ${v.datasetKey} is not public`,403);
   if(v.state==='unknown_cell')return errorResponse('unknown_cell','no published valuation cell',404);
   return NextResponse.json({runId:q.runId,...v},{headers:CACHE});
  }
  const v=await replayView(replayDeps(now),{scheme:q.scheme,version,code:q.code,runId:q.runId,metric:q.metric,duration:q.duration,periodEnd:q.periodEnd,mode:q.mode});
  if(v.state==='unlicensed')return errorResponse('unlicensed',`dataset ${v.datasetKey} is not public`,403);
  if(v.state==='unknown_run')return errorResponse('unknown_run','no visible run',404);
  if(v.state==='unknown_cell')return errorResponse('unknown_cell','no replayable cell',404);
  if(v.state==='ambiguous_duration')return errorResponse('invalid_parameter:duration','several durations match; pass duration',400);
  return NextResponse.json({methodVersion:v.header.methodVersion,runId:v.header.runId,factsAsOf:v.header.factsAsOf,historyClass:v.header.historyClass,...v},{headers:v.mode==='recompute'?NO_STORE:CACHE});
 }catch(e){
  console.error('[industries/replay]',e instanceof Error?e.message:e);
  return errorResponse('internal','replay failed',500);
 }
}
