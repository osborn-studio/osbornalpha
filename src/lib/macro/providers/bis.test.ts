// src/lib/macro/providers/fred.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {BIS_BACKOFF_MS,BisFetchError,fetchBisCbpol,bisCbpolUrl} from './bis';

const CSV='observation_date,DFF\n2026-10-01,4.10\n';
const ok=(body=CSV,headers:Record<string,string>={'content-type':'application/csv'})=>new Response(body,{status:200,headers});
const status=(s:number)=>new Response('nope',{status:s});
const NOW=()=>new Date('2026-11-06T05:30:00.000Z');
function harness(responses:(()=>Response|Promise<Response>)[]){
 const calls:{url:string;init:RequestInit|undefined}[]=[];const sleeps:number[]=[];
 const fetch=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{calls.push({url:String(url),init});const next=responses.shift();if(!next)throw new Error('no more responses');return next();}) as unknown as typeof globalThis.fetch;
 return {calls,sleeps,opts:{fetch,now:NOW,sleep:async(ms:number)=>{sleeps.push(ms);}}};
}
const codeOf=async(p:Promise<unknown>)=>{try{await p;return 'resolved';}catch(e){return e instanceof BisFetchError?`${e.code}${e.status===null?'':`:${e.status}`}`:String(e);}};

describe('fetchBisCbpol',()=>{
 it('returns the exact bytes as evidence with hash, final URL, host, status, content type and fetched_at',async()=>{
  const h=harness([()=>ok()]);
  const e=await fetchBisCbpol('M.CN',h.opts);
  expect(h.calls[0].url).toBe('https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.CN?startPeriod=2019-08&format=csv');
  expect(new TextDecoder().decode(e.bytes)).toBe(CSV);
  expect(e).toMatchObject({sha256:createHash('sha256').update(CSV).digest('hex'),adapter:'bis_sdmx_csv',fetchUrl:bisCbpolUrl('M.CN'),fetchHost:'stats.bis.org',httpStatus:200,contentType:'application/csv',fetchedAt:'2026-11-06T05:30:00.000Z'});
  expect(e.toolVersions).toEqual({fetcher:'macro-bis-fetch/1',parser:'bis-cbpol-cn-lpr1y/1'});
  expect(h.sleeps).toEqual([]);expect(h.calls[0].init).toMatchObject({redirect:'manual',headers:{accept:'text/csv'}});
 });
 it('retries 5xx and 429 with 1/2/4 s backoff and succeeds',async()=>{
  const h=harness([()=>status(503),()=>status(429),()=>status(502),()=>ok()]);
  await fetchBisCbpol('M.CN',h.opts);
  expect(h.calls).toHaveLength(4);expect(h.sleeps).toEqual([...BIS_BACKOFF_MS]);
 });
 it('gives up after 3 retries with the last failure',async()=>{
  const h=harness([()=>status(503),()=>status(503),()=>status(503),()=>status(500)]);
  expect(await codeOf(fetchBisCbpol('M.CN',h.opts))).toBe('fetch_http_5xx:500');
  expect(h.calls).toHaveLength(4);
 });
 it('does not retry other 4xx',async()=>{
  const h=harness([()=>status(404)]);
  expect(await codeOf(fetchBisCbpol('M.CN',h.opts))).toBe('fetch_http_4xx:404');
  expect(h.calls).toHaveLength(1);
 });
 it('retries network errors and per-attempt timeouts',async()=>{
  const h=harness([()=>{throw new TypeError('fetch failed');},()=>ok()]);
  await fetchBisCbpol('M.CN',h.opts);expect(h.calls).toHaveLength(2);
  const fetch=vi.fn((_u:unknown,init?:RequestInit)=>new Promise<Response>((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))) as unknown as typeof globalThis.fetch;
  const sleeps:number[]=[];
  expect(await codeOf(fetchBisCbpol('M.CN',{fetch,now:NOW,sleep:async(ms)=>{sleeps.push(ms);},timeoutMs:5}))).toBe('fetch_timeout');
  expect(sleeps).toEqual([...BIS_BACKOFF_MS]);
 });
 it('stops at once when the caller aborts',async()=>{
  const ctl=new AbortController();ctl.abort();
  const h=harness([()=>ok()]);
  expect(await codeOf(fetchBisCbpol('M.CN',{...h.opts,signal:ctl.signal}))).toBe('fetch_aborted');
  expect(h.calls).toHaveLength(0);
 });
 it('refuses a response served from another host and invalid codes',async()=>{
  const moved=ok();Object.defineProperty(moved,'url',{value:'https://mirror.example.com/DFF.csv'});
  const h=harness([()=>moved]);
  expect(await codeOf(fetchBisCbpol('M.CN',h.opts))).toBe('fetch_wrong_host');
  expect(h.calls).toHaveLength(1);
  expect(await codeOf(fetchBisCbpol('DFF&id=X',h.opts))).toBe('bad_code');
 });
});

describe('fetchBisCbpol error codes and content type',()=>{
 it('429 exhausts as fetch_http_retryable, 5xx stays fetch_http_5xx',async()=>{
  const h=harness([()=>status(429),()=>status(429),()=>status(429),()=>status(429)]);
  expect(await codeOf(fetchBisCbpol('M.CN',h.opts))).toBe('fetch_http_retryable:429');
  expect(h.calls).toHaveLength(4);
 });
 it('defaults a missing Content-Type to text/csv',async()=>{
  const res=new Response(CSV,{status:200});res.headers.delete('content-type');
  const h=harness([()=>res]);
  expect((await fetchBisCbpol('M.CN',h.opts)).contentType).toBe('text/csv');
 });
});


it('uses M.CN by default and refuses redirects without following the Location host',async()=>{
 const h=harness([()=>ok()]);await fetchBisCbpol(undefined,h.opts);expect(h.calls[0].url).toBe(bisCbpolUrl('M.CN'));
 const moved=harness([()=>new Response(null,{status:302,headers:{location:'https://mirror.example.com/data'}})]);
 expect(await codeOf(fetchBisCbpol('M.CN',moved.opts))).toBe('fetch_http_4xx:302');expect(moved.calls).toHaveLength(1);expect(moved.calls[0].init?.redirect).toBe('manual');
});
