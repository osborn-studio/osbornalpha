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
 /** Rows dropped for an off-allowlist URL, accumulated over the run; the sync core reports each as an error. */
 rejected?:Rejection[];
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
/** Per-source network policy (SSRF guard): only these hosts, https only except the listed http hosts. */
export interface HostPolicy{allowedHosts:readonly string[];httpHosts?:readonly string[]}
export const SEC_HOSTS:readonly string[]=['www.sec.gov','data.sec.gov'];
export const HOST_POLICY:Record<ListedSource,HostPolicy>={
 edgar:{allowedHosts:SEC_HOSTS},
 // the 巨潮 query API is plain http in the collectors (CNINFO_HISTORY); document links are https
 cninfo:{allowedHosts:['www.cninfo.com.cn','static.cninfo.com.cn'],httpHosts:['www.cninfo.com.cn']},
 hkexnews:{allowedHosts:['www1.hkexnews.hk']},
};
/** UA without a contact address, for every non-SEC host (the contact UA of the collectors goes to SEC only). */
export const NO_CONTACT_UA='OsbornAlpha document-pipeline (research)';
/** Why a URL may not be fetched under the policy; null = allowed. Rejects userinfo and non-default ports. */
export function urlRejection(url:string,policy:HostPolicy):string|null{
 let u:URL;
 try{u=new URL(url);}catch{return 'invalid_url';}
 if(u.username!==''||u.password!=='')return 'url_userinfo';
 if(u.port!=='')return 'url_port';
 if(!policy.allowedHosts.includes(u.hostname))return `host_not_allowed: ${u.hostname}`;
 if(u.protocol==='https:')return null;
 if(u.protocol==='http:'&&(policy.httpHosts??[]).includes(u.hostname))return null;
 return `scheme_not_allowed: ${u.protocol}`;
}
/** A listed row dropped by an adapter (off-allowlist URL); adapters accumulate these in `rejected` so the sync core can report them as errors. */
export interface Rejection{source_ref:string;url:string;reason:string}
export const MAX_REDIRECTS=3;
/** Cap for list/JSON/HTML bodies read through getText/postForm (documents use fetchBytes with their own cap). */
export const LIST_MAX_BYTES=20*1024*1024;
export const RETRY_AFTER_MAX_MS=60_000;
export interface HttpOptions extends HostPolicy{fetch?:typeof fetch;userAgent?:string;minIntervalMs?:number;sleep?:(ms:number)=>Promise<void>;clock?:()=>number}
export interface PoliteHttp{
 /** The User-Agent sent to this URL's host: the contact UA for SEC hosts only. */
 userAgentFor(url:string):string;
 /** One request with pacing, budget timeout, allowlisted manual redirects (≤ 3 hops, each paced) and 429/503 back-off; 2xx returns the Response, anything else throws HttpError. */
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
/** Retry-After as milliseconds (delta-seconds or HTTP date); null when absent or unusable. */
function retryAfterMs(res:Response,nowMs:number):number|null{
 const h=res.headers.get('retry-after');
 if(h===null)return null;
 if(/^\d+$/.test(h.trim()))return Number(h.trim())*1000;
 const t=Date.parse(h);
 return Number.isFinite(t)?Math.max(0,t-nowMs):null;
}
/** Reads a body with the streaming reader, cancelling at the cap. */
async function readCapped(res:Response,maxBytes:number):Promise<Uint8Array|'too_large'>{
 const declared=Number(res.headers.get('content-length'));
 if(res.headers.has('content-length')&&Number.isFinite(declared)&&declared>maxBytes){await res.body?.cancel().catch(()=>undefined);return 'too_large';}
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
 return bytes;
}

export function politeHttp(opts:HttpOptions):PoliteHttp{
 const doFetch=opts.fetch??fetch;
 const contactUa=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const policy:HostPolicy={allowedHosts:opts.allowedHosts,httpHosts:opts.httpHosts};
 const gap=opts.minIntervalMs??0;const sleep=opts.sleep??realSleep;const clock=opts.clock??Date.now;
 let last=Number.NEGATIVE_INFINITY;
 // Request-start reservations are serialized (retries and redirect hops included): concurrent callers queue behind each other.
 let queue:Promise<unknown>=Promise.resolve();
 const pace=():Promise<void>=>{
  const turn=queue.then(async()=>{const wait=last+gap-clock();if(wait>0)await sleep(wait);last=clock();});
  queue=turn.catch(()=>undefined);
  return turn;
 };
 const userAgentFor=(url:string):string=>{try{return SEC_HOSTS.includes(new URL(url).hostname)?contactUa:NO_CONTACT_UA;}catch{return NO_CONTACT_UA;}};
 const request:PoliteHttp['request']=async(method0,url0,budget,init={})=>{
  let method=method0,url=url0,body=init.body;let hops=0;
  for(let attempt=0;;){
   const bad=urlRejection(url,policy);
   if(bad!==null)throw new Error(`url_rejected: ${bad}`);
   const timeout=requestTimeoutMs(budget);
   await pace();
   const headers:Record<string,string>={'User-Agent':userAgentFor(url),...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...init.headers};
   const res=await doFetch(url,{method,headers,body,signal:AbortSignal.timeout(timeout),redirect:'manual'});
   if(res.ok)return res;
   if(res.status>=300&&res.status<400){
    const loc=res.headers.get('location');
    await res.body?.cancel().catch(()=>undefined);
    if(loc===null)throw new HttpError(res.status,url);
    if(++hops>MAX_REDIRECTS)throw new Error('too_many_redirects');
    let next:string;
    try{next=new URL(loc,url).toString();}catch{throw new Error('url_rejected: invalid_url');}
    if(method==='POST'&&res.status!==307&&res.status!==308){method='GET';body=undefined;}
    url=next;continue;   // the next loop turn validates the hop against the allowlist and paces it
   }
   if((res.status===429||res.status===503)&&attempt<RETRY_DELAYS_MS.length){
    const wait=retryAfterMs(res,clock())??RETRY_DELAYS_MS[attempt];
    await res.body?.cancel().catch(()=>undefined);
    if(wait>RETRY_AFTER_MAX_MS||budget.remainingMs()-BUDGET_RESERVE_MS<wait+1000)throw new Error('budget_exhausted');
    await sleep(wait);attempt++;continue;
   }
   await res.body?.cancel().catch(()=>undefined);
   throw new HttpError(res.status,url);
  }
 };
 const text=async(res:Response):Promise<string>=>{
  const b=await readCapped(res,LIST_MAX_BYTES);
  if(b==='too_large')throw new Error('response_too_large');
  return new TextDecoder().decode(b);
 };
 const fetchBytes:FetchBytes=async(url,budget,maxBytes)=>{
  let res:Response;
  try{res=await request('GET',url,budget,{headers:{Accept:'*/*'}});}
  catch(e){if(e instanceof HttpError&&e.status===404)return 'not_found';throw e;}
  const headers:Record<string,string>={};
  res.headers.forEach((v,k)=>{headers[k.toLowerCase()]=v;});
  const bytes=await readCapped(res,maxBytes);
  if(bytes==='too_large')return 'too_large';
  const mime=(headers['content-type']??'').split(';')[0].trim().toLowerCase();
  return {bytes,mime,status:res.status,headers,fetchedAt:new Date(clock()).toISOString()};
 };
 return {
  userAgentFor,request,fetchBytes,
  getText:async(url,budget,headers)=>text(await request('GET',url,budget,{headers})),
  postForm:async(url,body,budget)=>text(await request('POST',url,budget,{body})),
 };
}

/** Contract entry point (plan §契约补充): a one-off polite fetch; adapters and the sync core share one PoliteHttp instead. */
export function fetchBytes(url:string,budget:Budget,maxBytes:number,opts:HttpOptions):Promise<FetchedBytes|'too_large'|'not_found'>{
 return politeHttp(opts).fetchBytes(url,budget,maxBytes);
}

/** The stored MIME of a downloaded document: '%PDF-' within the first 1024 bytes wins; a declared PDF without it, or an undeclared type, is null (unexpected_mime). */
export function sniffMime(declared:string,bytes:Uint8Array):DocMime|null{
 if(Buffer.from(bytes.subarray(0,1024)).includes('%PDF-','latin1'))return 'application/pdf';
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
export function pollSegment(scope:DocScopeRow,now:Date,offsetHours=8):Segment{
 const cur=scope.poll_cursor as Partial<DocScopeCursor>;
 const resume=typeof cur.segment==='string'&&/^poll:\d{4}-\d{2}-\d{2}$/.test(cur.segment)?cur.segment.slice(5):null;
 const base=scope.last_success_at!==null&&Number.isFinite(Date.parse(scope.last_success_at))?Date.parse(scope.last_success_at)-DAY_MS:now.getTime()-7*DAY_MS;
 const from=resume??localDate(new Date(base).toISOString(),offsetHours);   // both ends in the same calendar (UTC+8 for 巨潮/HKEX, UTC for EDGAR)
 return {id:`poll:${from}`,from,to:localDate(now.toISOString(),offsetHours)};
}
/** Stable order (published_at, source_ref) with the first occurrence of each source_ref kept. */
export function orderListed(items:Listed[]):Listed[]{
 const seen=new Set<string>();const out:Listed[]=[];
 for(const i of items){if(!seen.has(i.source_ref)){seen.add(i.source_ref);out.push(i);}}
 return out.sort((a,b)=>a.published_at<b.published_at?-1:a.published_at>b.published_at?1:a.source_ref<b.source_ref?-1:a.source_ref>b.source_ref?1:0);
}
