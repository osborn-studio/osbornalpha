// src/lib/industry/route-params.ts
// Parameter parsing of the industry routes (spec §9) on top of the facts route conventions
// (readParams: a repeated parameter → 400 invalid_parameter:<name>; QueryError carries the name),
// plus the in-memory per-IP limiter of /replay (10 per minute; per server instance, best effort
// across instances as the spec allows). Pure: no clients, so pages reuse it for search params.
import {QueryError,UUID_RE,dateParam,listParam} from '../facts/public-route';
import {AGG_DURATIONS,AGG_METRICS,METRIC_DURATIONS,SCHEME_VERSION} from './read';
import type {ValuationMetric,Window} from './read';
import type {AggDuration,AggMetric,Scheme,SchemeVersion} from './types';

export const CODE_RE=/^[A-Za-z0-9.\-]{1,32}$/;
export const MAX_PERIODS=44;
export const MAX_PAGE_SIZE=200;
export const VALUATION_METRICS:readonly ValuationMetric[]=['pe_ttm','pe_static','pb','market_cap'];

export function schemeOf(raw:string):Scheme{if(raw==='sw2021'||raw==='sic')return raw;throw new QueryError('scheme');}
/** v1 has exactly one version per scheme; anything else is invalid. */
export function versionOf(p:Map<string,string>,scheme:Scheme):SchemeVersion{
 const v=p.get('version');
 if(v===undefined)return SCHEME_VERSION[scheme];
 if(v!==SCHEME_VERSION[scheme])throw new QueryError('version');
 return SCHEME_VERSION[scheme];
}
/** Path segment → industry code (percent-decoded, conservative charset). */
export function codeOf(raw:string):string{
 let s:string;
 try{s=decodeURIComponent(raw);}catch{throw new QueryError('code');}
 if(!CODE_RE.test(s))throw new QueryError('code');
 return s;
}
/** SW levels 1..3 (default 1); SIC is single-level and accepts only 1. */
export function levelOf(p:Map<string,string>,scheme:Scheme):number{
 const v=p.get('level');
 if(v===undefined)return 1;
 if(!/^[1-3]$/.test(v)||(scheme==='sic'&&v!=='1'))throw new QueryError('level');
 return Number(v);
}
export function metricOf(p:Map<string,string>,fallback:AggMetric|null='gross_margin'):AggMetric{
 const v=p.get('metric');
 if(v===undefined){if(fallback===null)throw new QueryError('metric');return fallback;}
 if(!(AGG_METRICS as readonly string[]).includes(v))throw new QueryError('metric');
 return v as AggMetric;
}
/** Default = the metric's first duration; a duration the metric is not computed for is invalid. */
export function durationOf(p:Map<string,string>,metric:AggMetric):AggDuration{
 const v=p.get('duration');
 if(v===undefined)return METRIC_DURATIONS[metric][0];
 if(!(METRIC_DURATIONS[metric] as readonly string[]).includes(v))throw new QueryError('duration');
 return v as AggDuration;
}
export function optionalDurationOf(p:Map<string,string>,metric:AggMetric):AggDuration|null{return p.has('duration')?durationOf(p,metric):null;}
export function metricsOf(p:Map<string,string>):AggMetric[]{return (listParam(p,'metrics',new Set(AGG_METRICS),AGG_METRICS.length) as AggMetric[]|undefined)??[...AGG_METRICS];}
export function durationsOf(p:Map<string,string>):AggDuration[]|null{return (listParam(p,'durations',new Set(AGG_DURATIONS),AGG_DURATIONS.length) as AggDuration[]|undefined)??null;}
export function windowOf(p:Map<string,string>):Window{
 const v=p.get('window');
 if(v===undefined)return '10y';
 if(v!=='5y'&&v!=='10y'&&v!=='all')throw new QueryError('window');
 return v;
}
export function modeOf(p:Map<string,string>):'original'|'recompute'{
 const v=p.get('mode');
 if(v===undefined)return 'original';
 if(v!=='original'&&v!=='recompute')throw new QueryError('mode');
 return v;
}
/** `on` defaults to today and may not be in the future (membership knowledge is as of today). */
export function onOf(p:Map<string,string>,today:string):string{
 const v=dateParam(p,'on');
 if(v===undefined)return today;
 if(v>today)throw new QueryError('on');
 return v;
}
export function uuidOf(p:Map<string,string>,name:string):string{
 const v=p.get(name);
 if(v===undefined||!UUID_RE.test(v))throw new QueryError(name);
 return v.toLowerCase();
}
export function valuationMetricOf(p:Map<string,string>):ValuationMetric{
 const v=p.get('metric');
 if(v===undefined||!(VALUATION_METRICS as readonly string[]).includes(v))throw new QueryError('metric');
 return v as ValuationMetric;
}

export interface RateLimiter{take(key:string,now?:number):boolean;reset():void}
/** Fixed window per key; at most `maxKeys` keys (expired windows are evicted first, then the oldest). */
export function createRateLimiter(limit:number,windowMs:number,maxKeys=10_000):RateLimiter{
 const hits=new Map<string,{count:number;resetAt:number}>();
 return {
  take(key,now=Date.now()){
   const h=hits.get(key);
   if(!h||h.resetAt<=now){
    if(hits.size>=maxKeys)for(const [k,v] of hits)if(v.resetAt<=now)hits.delete(k);
    if(hits.size>=maxKeys){const oldest=hits.keys().next().value;if(oldest!==undefined)hits.delete(oldest);}
    hits.set(key,{count:1,resetAt:now+windowMs});
    return true;
   }
   if(h.count>=limit)return false;
   h.count+=1;
   return true;
  },
  reset(){hits.clear();},
 };
}
/** Spec §9: /replay is limited to 10 requests per IP per minute. */
export const replayLimiter=createRateLimiter(10,60_000);
/** First X-Forwarded-For hop (Vercel sets it), else X-Real-IP, else one shared 'unknown' bucket. */
export function clientIp(req:Request):string{
 const first=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
 if(first)return first;
 return req.headers.get('x-real-ip')?.trim()||'unknown';
}
