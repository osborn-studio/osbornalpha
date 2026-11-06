// src/lib/documents/sources/shared.ts
// Source adapter plumbing (spec §6.2, §6.1 step 5). One PoliteHttp per source run: declared
// User-Agent (EDGAR_USER_AGENT ?? DEFAULT_USER_AGENT of the research collectors), a minimum gap
// between requests (edgar 120 ms, cninfo 500 ms, hkexnews 1000 ms), a per-request timeout of
// min(60 s, remaining budget − 20 s) instead of the collectors' fixed 30 s, and 429/503 back-off
// 1→2→4→8 s that stops when the budget cannot cover the wait. fetchBytes reads at most maxBytes:
// a Content-Length above the cap is answered 'too_large' without reading the body, otherwise the
// body is streamed and the read cancelled at the cap (one GET; no separate HEAD request). 404 →
// 'not_found'; any other non-2xx throws HttpError. Segments: backfill = calendar years from
// sinceYear (ids y<year>, stable across runs); poll = one window [last_success_at − 1 day, today]
// whose id `poll:<from>` keeps an unfinished window's start, so a resumed poll continues the same list.
import {DEFAULT_USER_AGENT,localDate} from '../../research/ingest/collectors/shared';
import type {AssetRole,DocClass,DocMime,DocScopeCursor,DocScopeRow,ListedSource} from '../types';

export interface Segment{id:string;from:string;to:string}
export interface ListedAsset{role:AssetRole;filename:string;url:string;required:boolean}
export interface Listed{source_ref:string;source_url:string;title:string;form_type:string|null;headline?:string;published_at:string;precision:'instant'|'date';assets?:ListedAsset[]}
export interface Budget{deadline:Date|null;remainingMs():number}
export interface FetchedBytes{bytes:Uint8Array;mime:string;status:number;headers:Record<string,string>;fetchedAt:string}
export type FetchBytes=(url:string,budget:Budget,maxBytes:number)=>Promise<FetchedBytes|'too_large'|'not_found'>;
export interface SourceAdapter{
 source:ListedSource;
 segments(scope:DocScopeRow,mode:'backfill'|'poll',sinceYear:number,now:Date):Segment[];
 list(scope:DocScopeRow,segment:Segment,budget:Budget):Promise<Listed[]>;
 /** Assets named by a fetched filing index (EDGAR: XBRL instance); optional assets, fetched after the index. */
 assetsFromIndex?(listed:Listed,indexBytes:Uint8Array):ListedAsset[];
 /** Non-null while the backfill segments cannot reach the full history (EDGAR before files[] is verified): backfill_done is never set and coverage_summary reports it. */
 coverageGap:string|null;
}

export const DAY_MS=86_400_000;
export const FETCH_TIMEOUT_MAX_MS=60_000;
export const BUDGET_RESERVE_MS=20_000;
export const RETRY_DELAYS_MS=[1000,2000,4000,8000] as const;
/** Periodic report classes stored by default for cninfo and hkexnews (owner decision B). */
export const PERIODIC_CLASSES:ReadonlySet<DocClass>=new Set<DocClass>(['annual_report','interim_report','quarterly_report','results_announcement']);
export const DOC_MIMES:readonly DocMime[]=['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json'];

/** Remaining time until the deadline on the injected clock; no deadline = unlimited. */
export function makeDocBudget(deadline:Date|null,now:()=>Date=()=>new Date()):Budget{
 return {deadline,remainingMs:()=>deadline===null?Number.POSITIVE_INFINITY:Math.max(0,deadline.getTime()-now().getTime())};
}

export class HttpError extends Error{
 constructor(readonly status:number,readonly url:string){super(`http_${status}`);this.name='HttpError';}
}
export interface HttpOptions{fetch?:typeof fetch;userAgent?:string;minIntervalMs?:number;sleep?:(ms:number)=>Promise<void>;clock?:()=>number}
export interface PoliteHttp{
 readonly userAgent:string;
 /** One request with pacing, budget timeout and 429/503 back-off; 2xx returns the Response, anything else throws HttpError. */
 request(method:'GET'|'POST',url:string,budget:Budget,init?:{body?:string;headers?:Record<string,string>}):Promise<Response>;
 getText(url:string,budget:Budget,headers?:Record<string,string>):Promise<string>;
 postForm(url:string,body:string,budget:Budget):Promise<string>;
 fetchBytes:FetchBytes;
}

const realSleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
/** Per-request timeout: min(60 s, remaining − 20 s); throws budget_exhausted when nothing is left. */
export function requestTimeoutMs(budget:Budget):number{
 const left=budget.remainingMs()-BUDGET_RESERVE_MS;
 if(left<=0)throw new Error('budget_exhausted');
 return Math.min(FETCH_TIMEOUT_MAX_MS,left);
}

export function politeHttp(opts:HttpOptions={}):PoliteHttp{
 const doFetch=opts.fetch??fetch;
 const userAgent=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const gap=opts.minIntervalMs??0;const sleep=opts.sleep??realSleep;const clock=opts.clock??Date.now;
 let last=Number.NEGATIVE_INFINITY;
 const pace=async()=>{const wait=last+gap-clock();if(wait>0)await sleep(wait);last=clock();};
 const request:PoliteHttp['request']=async(method,url,budget,init={})=>{
  for(let attempt=0;;attempt++){
   const timeout=requestTimeoutMs(budget);
   await pace();
   const headers:Record<string,string>={'User-Agent':userAgent,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...init.headers};
   const res=await doFetch(url,{method,headers,body:init.body,signal:AbortSignal.timeout(timeout)});
   if(res.ok)return res;
   if((res.status===429||res.status===503)&&attempt<RETRY_DELAYS_MS.length){
    const wait=RETRY_DELAYS_MS[attempt];
    await res.body?.cancel().catch(()=>undefined);
    if(budget.remainingMs()-BUDGET_RESERVE_MS<wait+1000)throw new Error('budget_exhausted');
    await sleep(wait);continue;
   }
   await res.body?.cancel().catch(()=>undefined);
   throw new HttpError(res.status,url);
  }
 };
 const fetchBytes:FetchBytes=async(url,budget,maxBytes)=>{
  let res:Response;
  try{res=await request('GET',url,budget,{headers:{Accept:'*/*'}});}
  catch(e){if(e instanceof HttpError&&e.status===404)return 'not_found';throw e;}
  const headers:Record<string,string>={};
  res.headers.forEach((v,k)=>{headers[k.toLowerCase()]=v;});
  const declared=Number(headers['content-length']);
  if(headers['content-length']!==undefined&&Number.isFinite(declared)&&declared>maxBytes){await res.body?.cancel().catch(()=>undefined);return 'too_large';}
  const chunks:Uint8Array[]=[];let total=0;
  if(res.body){
   const reader=res.body.getReader();
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.byteLength;
    if(total>maxBytes){await reader.cancel().catch(()=>undefined);return 'too_large';}
    chunks.push(value);
   }
  }
  const bytes=new Uint8Array(total);let at=0;
  for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
  const mime=(headers['content-type']??'').split(';')[0].trim().toLowerCase();
  return {bytes,mime,status:res.status,headers,fetchedAt:new Date(clock()).toISOString()};
 };
 return {
  userAgent,request,fetchBytes,
  getText:async(url,budget,headers)=>(await request('GET',url,budget,{headers})).text(),
  postForm:async(url,body,budget)=>(await request('POST',url,budget,{body})).text(),
 };
}

/** Contract entry point (plan §契约补充): a one-off polite fetch; adapters and the sync core share one PoliteHttp instead. */
export function fetchBytes(url:string,budget:Budget,maxBytes:number,opts:HttpOptions={}):Promise<FetchedBytes|'too_large'|'not_found'>{
 return politeHttp(opts).fetchBytes(url,budget,maxBytes);
}

/** The stored MIME of a downloaded document: '%PDF-' magic wins; a declared PDF without it, or an undeclared type, is null (unexpected_mime). */
export function sniffMime(declared:string,bytes:Uint8Array):DocMime|null{
 if(bytes.length>=5&&String.fromCharCode(...bytes.subarray(0,5))==='%PDF-')return 'application/pdf';
 if(declared!=='application/pdf'&&(DOC_MIMES as readonly string[]).includes(declared))return declared as DocMime;
 return null;
}
/** MIME of an asset: by extension for .json/.xml (servers often say text/plain), else a declared document type; null = unusable. */
export function assetMime(declared:string,filename:string):DocMime|null{
 if(/\.json$/i.test(filename))return 'application/json';
 if(/\.xml$/i.test(filename))return 'application/xml';
 return declared!=='application/pdf'&&(DOC_MIMES as readonly string[]).includes(declared)?declared as DocMime:null;
}

/** Backfill segments: one per calendar year sinceYear..this year (UTC+8 date; covers the US/CN/HK calendars), the current year ending today. */
export function yearSegments(sinceYear:number,now:Date):Segment[]{
 const today=localDate(now.toISOString(),8);const thisYear=Number(today.slice(0,4));
 const out:Segment[]=[];
 for(let y=sinceYear;y<=thisYear;y++)out.push({id:`y${y}`,from:`${y}-01-01`,to:y===thisYear?today:`${y}-12-31`});
 return out;
}
/** Poll window: resumes an unfinished window (cursor segment poll:<from>), else last_success_at − 1 day (7 days back when never successful), to today (UTC+8). */
export function pollSegment(scope:DocScopeRow,now:Date):Segment{
 const cur=scope.poll_cursor as Partial<DocScopeCursor>;
 const resume=typeof cur.segment==='string'&&/^poll:\d{4}-\d{2}-\d{2}$/.test(cur.segment)?cur.segment.slice(5):null;
 const base=scope.last_success_at!==null&&Number.isFinite(Date.parse(scope.last_success_at))?Date.parse(scope.last_success_at)-DAY_MS:now.getTime()-7*DAY_MS;
 const from=resume??new Date(base).toISOString().slice(0,10);
 return {id:`poll:${from}`,from,to:localDate(now.toISOString(),8)};
}
/** Stable order (published_at, source_ref) with the first occurrence of each source_ref kept. */
export function orderListed(items:Listed[]):Listed[]{
 const seen=new Set<string>();const out:Listed[]=[];
 for(const i of items){if(!seen.has(i.source_ref)){seen.add(i.source_ref);out.push(i);}}
 return out.sort((a,b)=>a.published_at<b.published_at?-1:a.published_at>b.published_at?1:a.source_ref<b.source_ref?-1:a.source_ref>b.source_ref?1:0);
}
