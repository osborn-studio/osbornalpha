// src/lib/documents/sources/shared.test.ts
import {describe,expect,it,vi} from 'vitest';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {HOST_POLICY,HttpError,NO_CONTACT_UA,SEC_HOSTS,assetMime,fetchBytes,makeDocBudget,orderListed,pollSegment,politeHttp,requestTimeoutMs,sniffMime,urlRejection,yearSegments} from './shared';
import type {Listed} from './shared';
import type {DocScopeRow} from '../types';

const X={allowedHosts:['x']};
const unlimited=makeDocBudget(null);
const left=(ms:number)=>({deadline:new Date(0),remainingMs:()=>ms});
const pdf=(n:number)=>{const b=new Uint8Array(n);b.set([0x25,0x50,0x44,0x46,0x2d]);return b;};   // '%PDF-' + zeros
const scope=(o:Partial<DocScopeRow>={}):DocScopeRow=>({issuer_id:'i',source:'hkexnews',reasons:[],priority:10,fetch_key:'00268',backfill_cursor:{},backfill_done:true,poll_cursor:{},next_due_at:'2026-11-06T00:00:00.000Z',lease_until:null,lease_batch_id:null,last_attempt_at:null,last_success_at:null,last_status:null,updated_at:'2026-11-06T00:00:00.000Z',...o});

describe('budget and timeouts',()=>{
 it('remainingMs follows the injected clock; no deadline is unlimited',()=>{
  let t=Date.parse('2026-11-06T00:00:00Z');
  const b=makeDocBudget(new Date(t+240_000),()=>new Date(t));
  expect(b.remainingMs()).toBe(240_000);t+=250_000;expect(b.remainingMs()).toBe(0);
  expect(unlimited.remainingMs()).toBe(Number.POSITIVE_INFINITY);
 });
 it('request timeout is min(60 s, remaining − 20 s) and refuses when nothing is left',()=>{
  expect(requestTimeoutMs(unlimited)).toBe(60_000);
  expect(requestTimeoutMs(left(50_000))).toBe(30_000);
  expect(()=>requestTimeoutMs(left(20_000))).toThrow('budget_exhausted');
 });
});

describe('politeHttp',()=>{
 it('paces requests and sends the contact User-Agent only to SEC hosts',async()=>{
  const seen:string[]=[];const sleeps:number[]=[];let now=0;
  const http=politeHttp({allowedHosts:['x',...SEC_HOSTS],minIntervalMs:500,clock:()=>now,sleep:async ms=>{sleeps.push(ms);now+=ms;},fetch:async(_u,init)=>{seen.push(String((init?.headers as Record<string,string>)['User-Agent']));return new Response('ok');}});
  await http.getText('https://data.sec.gov/a',unlimited);now+=100;await http.getText('https://x/b',unlimited);
  expect(seen[0]).toBe(process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT);
  expect(seen[1]).toBe(NO_CONTACT_UA);expect(seen[1]).not.toContain('@');
  expect(sleeps).toEqual([400]);
 });
 it('backs off 1→2→4→8 s on 429/503, then throws HttpError; stops early when the budget cannot cover the wait',async()=>{
  const sleeps:number[]=[];
  const f=vi.fn(async()=>new Response('busy',{status:503}));
  const http=politeHttp({...X,fetch:f,sleep:async ms=>{sleeps.push(ms);}});
  await expect(http.getText('https://x/a',unlimited)).rejects.toBeInstanceOf(HttpError);
  expect(sleeps).toEqual([1000,2000,4000,8000]);expect(f).toHaveBeenCalledTimes(5);
  const ok=vi.fn().mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(new Response('fine'));
  expect(await politeHttp({...X,fetch:ok,sleep:async()=>{}}).getText('https://x/b',unlimited)).toBe('fine');
  const ra:number[]=[];
  const withRa=vi.fn().mockResolvedValueOnce(new Response('',{status:429,headers:{'Retry-After':'3'}})).mockResolvedValueOnce(new Response('ok'));
  await politeHttp({...X,fetch:withRa,sleep:async ms=>{ra.push(ms);}}).getText('https://x/d',unlimited);
  expect(ra).toEqual([3000]);   // Retry-After honoured
  const long=politeHttp({...X,fetch:async()=>new Response('',{status:503,headers:{'Retry-After':'600'}}),sleep:async()=>{}});
  await expect(long.getText('https://x/e',unlimited)).rejects.toThrow('budget_exhausted');
  const tight=politeHttp({...X,fetch:async()=>new Response('',{status:429}),sleep:async()=>{}});
  await expect(tight.getText('https://x/c',left(21_500))).rejects.toThrow('budget_exhausted');
 });
});

describe('fetchBytes',()=>{
 it('returns bytes, mime, status, lower-cased headers and fetch time',async()=>{
  const r=await fetchBytes('https://x/a.pdf',unlimited,1000,{...X,fetch:async()=>new Response(pdf(10),{status:200,headers:{'Content-Type':'application/pdf; charset=binary',ETag:'"e1"'}}),clock:()=>Date.parse('2026-11-06T01:02:03Z')});
  if(typeof r==='string')throw new Error(r);
  expect(r.bytes.length).toBe(10);expect(r.mime).toBe('application/pdf');expect(r.status).toBe(200);
  expect(r.headers.etag).toBe('"e1"');expect(r.fetchedAt).toBe('2026-11-06T01:02:03.000Z');
 });
 it('404 → not_found; other errors throw',async()=>{
  expect(await fetchBytes('https://x/a',unlimited,10,{...X,fetch:async()=>new Response('',{status:404})})).toBe('not_found');
  await expect(fetchBytes('https://x/a',unlimited,10,{...X,fetch:async()=>new Response('',{status:500})})).rejects.toThrow('http_500');
 });
 it('too_large from Content-Length without reading, and from the streamed body at the cap',async()=>{
  expect(await fetchBytes('https://x/a',unlimited,10,{...X,fetch:async()=>new Response(pdf(5),{headers:{'Content-Length':'11'}})})).toBe('too_large');
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(pdf(6));c.enqueue(new Uint8Array(6));c.close();}});
  expect(await fetchBytes('https://x/a',unlimited,10,{...X,fetch:async()=>new Response(stream)})).toBe('too_large');
  const exact=await fetchBytes('https://x/a',unlimited,10,{...X,fetch:async()=>new Response(pdf(10))});
  expect(typeof exact==='string'?exact:exact.bytes.length).toBe(10);
 });
});

describe('mime',()=>{
 it('PDF magic (anywhere in the first 1024 bytes) wins; a declared PDF without it is unexpected; html/json pass through',()=>{
  expect(sniffMime('application/octet-stream',pdf(8))).toBe('application/pdf');
  expect(sniffMime('application/pdf',new TextEncoder().encode('<html>'))).toBeNull();
  expect(sniffMime('text/html',new TextEncoder().encode('<html>'))).toBe('text/html');
  expect(sniffMime('text/plain',new TextEncoder().encode('x'))).toBeNull();
  expect(sniffMime('text/html',new TextEncoder().encode('<!DOCTYPE html>'))).toBe('text/html');   // allowed for EDGAR only: sync's per-source ALLOWED_MIMES rejects it for hkexnews/cninfo
  const lead=new Uint8Array(600);lead.set(new TextEncoder().encode('%PDF-1.7'),600-8);expect(sniffMime('application/octet-stream',lead)).toBe('application/pdf');
  const late=new Uint8Array(1100);late.set(new TextEncoder().encode('%PDF-'),1030);expect(sniffMime('application/octet-stream',late)).toBeNull();
  // an HTML 200 served under a .pdf URL (e.g. an HKEX _e.pdf error page) is text/html, never a PDF: the per-source MIME policy rejects it
  expect(sniffMime('text/html',new TextEncoder().encode('<html><body>Not found</body></html>'))).toBe('text/html');
  expect(assetMime('text/plain','index.json')).toBe('application/json');
  expect(assetMime('','pltr-20260630_htm.xml')).toBe('application/xml');
  expect(assetMime('image/png','a.png')).toBeNull();
 });
});

describe('segments',()=>{
 const now=new Date('2026-11-05T20:00:00Z');   // already 2026-11-06 in UTC+8
 it('backfill: one stable id per calendar year, the current year ending today (UTC+8)',()=>{
  expect(yearSegments(2024,now)).toEqual([{id:'y2024',from:'2024-01-01',to:'2024-12-31'},{id:'y2025',from:'2025-01-01',to:'2025-12-31'},{id:'y2026',from:'2026-01-01',to:'2026-11-06'}]);
 });
 it('poll: from last success − 1 day; an unfinished window resumes from its own start; 7 days when never successful',()=>{
  expect(pollSegment(scope({last_success_at:'2026-11-04T16:00:00.000Z'}),now)).toEqual({id:'poll:2026-11-04',from:'2026-11-04',to:'2026-11-06'});
  expect(pollSegment(scope({last_success_at:'2026-11-04T16:00:00.000Z',poll_cursor:{segment:'poll:2026-10-30',last_ref:'2026103000001_c',settled:[],attempts:{},seq:4}}),now).id).toBe('poll:2026-10-30');
  expect(pollSegment(scope(),now).from).toBe('2026-10-30');   // both ends in UTC+8
  expect(pollSegment(scope({last_success_at:'2026-11-04T16:00:00.000Z'}),now,0)).toEqual({id:'poll:2026-11-03',from:'2026-11-03',to:'2026-11-05'});   // EDGAR: UTC both ends
 });
 it('orderListed sorts by (published_at, source_ref) and keeps the first of each source_ref',()=>{
  const l=(ref:string,at:string):Listed=>({source_ref:ref,source_url:`https://x/${ref}`,title:ref,form_type:null,published_at:at,precision:'instant'});
  expect(orderListed([l('b','2026-01-02'),l('a','2026-01-02'),l('c','2026-01-01'),l('a','2026-01-03')]).map(x=>x.source_ref)).toEqual(['c','a','b']);
 });
});

describe('host allowlist and redirects (SSRF guard)',()=>{
 const sec=(f:unknown)=>politeHttp({...HOST_POLICY.edgar,fetch:f as typeof fetch,sleep:async()=>{}});
 it('rejects external hosts, private/metadata addresses, other schemes, userinfo and ports before any fetch',async()=>{
  const f=vi.fn(async()=>new Response('x'));
  const h=sec(f);
  for(const u of ['https://evil.example.com/a','http://169.254.169.254/latest/meta-data/','https://10.0.0.1/x','http://localhost:3000/','https://data.sec.gov@evil.com/a','https://data.sec.gov:8443/a','http://data.sec.gov/a','ftp://data.sec.gov/a'])
   await expect(h.getText(u,unlimited)).rejects.toThrow('url_rejected');
  expect(f).not.toHaveBeenCalled();
  expect(urlRejection('http://www.cninfo.com.cn/x',HOST_POLICY.cninfo)).toBeNull();
  expect(urlRejection('http://static.cninfo.com.cn/x',HOST_POLICY.cninfo)).toMatch(/scheme_not_allowed/);
 });
 it('follows at most 3 allowlisted hops, each paced; a redirect off the list or a fourth hop is refused',async()=>{
  const calls:string[]=[];const starts:number[]=[];let now=0;
  const route:Record<string,string>={'https://data.sec.gov/a':'https://www.sec.gov/b','https://www.sec.gov/b':'/c','https://www.sec.gov/c':'https://data.sec.gov/d'};
  const mk=(r:Record<string,string>)=>politeHttp({...HOST_POLICY.edgar,minIntervalMs:100,clock:()=>now,sleep:async ms=>{now+=ms;},fetch:async u=>{calls.push(String(u));starts.push(now);const to=r[String(u)];return to?new Response('',{status:302,headers:{Location:to}}):new Response('final');}});
  expect(await mk(route).getText('https://data.sec.gov/a',unlimited)).toBe('final');
  expect(calls).toEqual(['https://data.sec.gov/a','https://www.sec.gov/b','https://www.sec.gov/c','https://data.sec.gov/d']);
  expect(starts).toEqual([0,100,200,300]);
  await expect(mk({...route,'https://data.sec.gov/d':'https://data.sec.gov/e'}).getText('https://data.sec.gov/a',unlimited)).rejects.toThrow('too_many_redirects');
  const f=vi.fn(async()=>new Response('',{status:302,headers:{Location:'http://169.254.169.254/latest/meta-data/'}}));
  await expect(sec(f).getText('https://data.sec.gov/a',unlimited)).rejects.toThrow('url_rejected');
  expect(f).toHaveBeenCalledTimes(1);
  const esc=vi.fn(async()=>new Response('',{status:301,headers:{Location:'https://evil.example.com/x'}}));
  await expect(sec(esc).fetchBytes('https://www.sec.gov/a',unlimited,10)).rejects.toThrow('url_rejected');
  expect(esc).toHaveBeenCalledTimes(1);
 });
 it('uses redirect:manual',async()=>{
  let seen:RequestRedirect|undefined;
  await sec(async(_u:unknown,init?:RequestInit)=>{seen=init?.redirect;return new Response('ok');}).getText('https://data.sec.gov/a',unlimited);
  expect(seen).toBe('manual');
 });
});

describe('pacing under concurrency',()=>{
 it('three concurrent requests start 0, 1000 and 2000 ms apart on the injected clock',async()=>{
  let now=0;const starts:number[]=[];
  const h=politeHttp({...X,minIntervalMs:1000,clock:()=>now,sleep:async ms=>{now+=ms;},fetch:async()=>{starts.push(now);return new Response('ok');}});
  await Promise.all([h.getText('https://x/1',unlimited),h.getText('https://x/2',unlimited),h.getText('https://x/3',unlimited)]);
  expect(starts).toEqual([0,1000,2000]);
 });
});

describe('body caps',()=>{
 it('getText stops reading a list body at 20 MB',async()=>{
  const big=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array(8*1024*1024));}});
  await expect(politeHttp({...X,fetch:async()=>new Response(big)}).getText('https://x/a',unlimited)).rejects.toThrow('response_too_large');
  await expect(politeHttp({...X,fetch:async()=>new Response('x',{headers:{'Content-Length':String(21*1024*1024)}})}).getText('https://x/a',unlimited)).rejects.toThrow('response_too_large');
 });
});
