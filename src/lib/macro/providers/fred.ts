// src/lib/macro/providers/fred.ts
// FRED public CSV fetcher (spec §4.4 step 2, §11 "provider 超时 / 5xx"): GET
// https://fred.stlouisfed.org/graph/fredgraph.csv?id=<CODE>&cosd=<date> (no API key). Each attempt has its
// own timeout; timeouts, network errors, 429 and 5xx are retried 3 times with 1 s / 2 s / 4 s backoff;
// other HTTP statuses fail at once. Returns the exact response bytes as EvidenceInput (sha256 of the bytes,
// final URL and host, status, server Content-Type, fetched_at). A response from any host other than
// fred.stlouisfed.org is refused (provenance would lie). Parsing is the caller's job (parsers/fred-csv.ts).
// fredCosdFor picks the start date: full backfill once, then a recent window.
import {createHash} from 'node:crypto';
import {FRED_PARSER_VERSION} from '../parsers/fred-csv';
import type {EvidenceInput,PeriodKind} from '../types';

export const FRED_HOST='fred.stlouisfed.org';
export const FRED_COSD='2000-01-01';
export const FRED_FETCHER_VERSION='macro-fred-fetch/1';
/** A series' full backfill counts as complete once an eligible row exists this early (covers quarter-end periods of 2000 Q1). */
export const FRED_BACKFILL_DONE_BY='2000-04-15';
export const FRED_BACKOFF_MS=[1000,2000,4000] as const;
const CODE=/^[A-Z0-9_]{1,40}$/;
const UA='OsbornAlpha-macro-sync/1 (+https://alpha.osborn.studio)';
export type FredFetchCode='fetch_timeout'|'fetch_network'|'fetch_http_5xx'|'fetch_http_retryable'|'fetch_http_4xx'|'fetch_aborted'|'fetch_wrong_host'|'bad_code';
export class FredFetchError extends Error{
 readonly code:FredFetchCode;readonly status:number|null;
 constructor(code:FredFetchCode,status:number|null=null){super(status===null?code:`${code}:${status}`);this.name='FredFetchError';this.code=code;this.status=status;}
}
export interface FredFetchOptions{fetch?:typeof fetch;signal?:AbortSignal;now?:()=>Date;sleep?:(ms:number)=>Promise<void>;timeoutMs?:number;cosd?:string}
export const fredCsvUrl=(code:string,cosd=FRED_COSD)=>`https://${FRED_HOST}/graph/fredgraph.csv?id=${encodeURIComponent(code)}&cosd=${cosd}`;
/**
 * cosd for one run (`backfilled` = the series' full backfill is complete, i.e. persisted eligible data reaches back to
 * FRED_BACKFILL_DONE_BY — not merely that some row exists): a series without a completed backfill is fetched in full from FRED_COSD from FRED_COSD (spec §4.4); afterwards a recent
 * window keeps the daily run small — daily series 400 days, monthly/quarterly 6 years (BLS revises seasonal
 * factors 5 years back each February). Never earlier than FRED_COSD.
 */
export function fredCosdFor(period:PeriodKind,backfilled:boolean,today:string):string{
 if(!backfilled)return FRED_COSD;
 const d=new Date(`${today}T00:00:00Z`);
 if(!Number.isFinite(d.getTime()))throw new Error('invalid_today');
 if(period==='day')d.setUTCDate(d.getUTCDate()-400);else{d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear()-6);}
 const iso=d.toISOString().slice(0,10);
 return iso<FRED_COSD?FRED_COSD:iso;
}
const defaultSleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const retryable=(e:FredFetchError)=>e.code==='fetch_timeout'||e.code==='fetch_network'||e.code==='fetch_http_5xx'||e.code==='fetch_http_retryable';

export async function fetchFredCsv(code:string,opts:FredFetchOptions={}):Promise<EvidenceInput>{
 if(!CODE.test(code))throw new FredFetchError('bad_code');
 const f=opts.fetch??globalThis.fetch,now=opts.now??(()=>new Date()),sleep=opts.sleep??defaultSleep,timeoutMs=opts.timeoutMs??20_000;
 const url=fredCsvUrl(code,opts.cosd);
 for(let attempt=0;;attempt++){
  if(opts.signal?.aborted)throw new FredFetchError('fetch_aborted');
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),timeoutMs);
  const onAbort=()=>ctl.abort();
  opts.signal?.addEventListener('abort',onAbort,{once:true});
  let failure:FredFetchError;
  try{
   const res=await f(url,{signal:ctl.signal,headers:{'user-agent':UA,accept:'text/csv,*/*'},redirect:'follow',cache:'no-store'});
   if(res.status===200){
    const bytes=new Uint8Array(await res.arrayBuffer());
    const finalUrl=res.url||url;
    const host=new URL(finalUrl).host;
    if(host!==FRED_HOST)throw new FredFetchError('fetch_wrong_host');
    return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes,adapter:'fred_csv',fetchUrl:finalUrl,fetchHost:host,httpStatus:200,
     contentType:res.headers.get('content-type')||'text/csv',fetchedAt:now().toISOString(),toolVersions:{fetcher:FRED_FETCHER_VERSION,parser:FRED_PARSER_VERSION}};
   }
   failure=new FredFetchError(res.status===429?'fetch_http_retryable':res.status>=500?'fetch_http_5xx':'fetch_http_4xx',res.status);
  }catch(e){
   if(e instanceof FredFetchError)throw e;
   failure=new FredFetchError(opts.signal?.aborted?'fetch_aborted':ctl.signal.aborted?'fetch_timeout':'fetch_network');
  }finally{
   clearTimeout(timer);opts.signal?.removeEventListener('abort',onAbort);
  }
  if(!retryable(failure)||attempt>=FRED_BACKOFF_MS.length)throw failure;
  await sleep(FRED_BACKOFF_MS[attempt]);
 }
}
