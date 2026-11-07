// src/lib/macro/providers/fred.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {FRED_BACKOFF_MS,FredFetchError,fetchFredCsv,fredCosdFor,fredCsvUrl} from './fred';

const CSV='observation_date,DFF\n2026-10-01,4.10\n';
const ok=(body=CSV,headers:Record<string,string>={'content-type':'application/csv'})=>new Response(body,{status:200,headers});
const status=(s:number)=>new Response('nope',{status:s});
const NOW=()=>new Date('2026-11-06T05:30:00.000Z');
function harness(responses:(()=>Response|Promise<Response>)[]){
 const calls:{url:string;init:RequestInit|undefined}[]=[];const sleeps:number[]=[];
 const fetch=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{calls.push({url:String(url),init});const next=responses.shift();if(!next)throw new Error('no more responses');return next();}) as unknown as typeof globalThis.fetch;
 return {calls,sleeps,opts:{fetch,now:NOW,sleep:async(ms:number)=>{sleeps.push(ms);}}};
}
const codeOf=async(p:Promise<unknown>)=>{try{await p;return 'resolved';}catch(e){return e instanceof FredFetchError?`${e.code}${e.status===null?'':`:${e.status}`}`:String(e);}};

describe('fetchFredCsv',()=>{
 it('returns the exact bytes as evidence with hash, final URL, host, status, content type and fetched_at',async()=>{
  const h=harness([()=>ok()]);
  const e=await fetchFredCsv('DFF',h.opts);
  expect(h.calls[0].url).toBe('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFF&cosd=2000-01-01');
  expect(new TextDecoder().decode(e.bytes)).toBe(CSV);
  expect(e).toMatchObject({sha256:createHash('sha256').update(CSV).digest('hex'),adapter:'fred_csv',fetchUrl:fredCsvUrl('DFF'),fetchHost:'fred.stlouisfed.org',httpStatus:200,contentType:'application/csv',fetchedAt:'2026-11-06T05:30:00.000Z'});
  expect(e.toolVersions).toEqual({fetcher:'macro-fred-fetch/1',parser:'fred-csv/1'});
  expect(h.sleeps).toEqual([]);
 });
 it('honours cosd',async()=>{
  const h=harness([()=>ok()]);
  await fetchFredCsv('CPIAUCSL',{...h.opts,cosd:'2015-01-01'});
  expect(h.calls[0].url).toBe('https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL&cosd=2015-01-01');
 });
 it('retries 5xx and 429 with 1/2/4 s backoff and succeeds',async()=>{
  const h=harness([()=>status(503),()=>status(429),()=>status(502),()=>ok()]);
  await fetchFredCsv('DFF',h.opts);
  expect(h.calls).toHaveLength(4);expect(h.sleeps).toEqual([...FRED_BACKOFF_MS]);
 });
 it('gives up after 3 retries with the last failure',async()=>{
  const h=harness([()=>status(503),()=>status(503),()=>status(503),()=>status(500)]);
  expect(await codeOf(fetchFredCsv('DFF',h.opts))).toBe('fetch_http_5xx:500');
  expect(h.calls).toHaveLength(4);
 });
 it('does not retry other 4xx',async()=>{
  const h=harness([()=>status(404)]);
  expect(await codeOf(fetchFredCsv('DFF',h.opts))).toBe('fetch_http_4xx:404');
  expect(h.calls).toHaveLength(1);
 });
 it('retries network errors and per-attempt timeouts',async()=>{
  const h=harness([()=>{throw new TypeError('fetch failed');},()=>ok()]);
  await fetchFredCsv('DFF',h.opts);expect(h.calls).toHaveLength(2);
  const fetch=vi.fn((_u:unknown,init?:RequestInit)=>new Promise<Response>((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))) as unknown as typeof globalThis.fetch;
  const sleeps:number[]=[];
  expect(await codeOf(fetchFredCsv('DFF',{fetch,now:NOW,sleep:async(ms)=>{sleeps.push(ms);},timeoutMs:5}))).toBe('fetch_timeout');
  expect(sleeps).toEqual([...FRED_BACKOFF_MS]);
 });
 it('stops at once when the caller aborts',async()=>{
  const ctl=new AbortController();ctl.abort();
  const h=harness([()=>ok()]);
  expect(await codeOf(fetchFredCsv('DFF',{...h.opts,signal:ctl.signal}))).toBe('fetch_aborted');
  expect(h.calls).toHaveLength(0);
 });
 it('refuses a response served from another host and invalid codes',async()=>{
  const moved=ok();Object.defineProperty(moved,'url',{value:'https://mirror.example.com/DFF.csv'});
  const h=harness([()=>moved]);
  expect(await codeOf(fetchFredCsv('DFF',h.opts))).toBe('fetch_wrong_host');
  expect(h.calls).toHaveLength(1);
  expect(await codeOf(fetchFredCsv('DFF&id=X',h.opts))).toBe('bad_code');
 });
});

describe('fredCosdFor',()=>{
 it('backfills from 2000-01-01 without data and uses a recent window afterwards',()=>{
  expect(fredCosdFor('day',false,'2026-11-06')).toBe('2000-01-01');
  expect(fredCosdFor('day',true,'2026-11-06')).toBe('2025-10-02');
  expect(fredCosdFor('month',true,'2026-11-06')).toBe('2020-11-01');
  expect(fredCosdFor('month',true,'2003-05-20')).toBe('2000-01-01');
  expect(()=>fredCosdFor('day',true,'nope')).toThrow('invalid_today');
 });
});
