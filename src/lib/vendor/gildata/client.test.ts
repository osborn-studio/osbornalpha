// Offline transport contract, scheduling, and credential containment.
import {expect,it,vi} from 'vitest';
import {budgetFor,sha256Hex} from '../../facts/providers/shared';
import {canonicalRequest} from '../source';
import {createGildataSource,gildataSourceFromEnv} from './client';
import {swL1Members} from './templates';
import {redactSecret} from './redact';
import {fixtureGildataSource,loadFixtureBody} from './fixture-source';
import empty from './fixtures/empty.json';
const apiKey='sk-test-FAKEKEY-123456',request=swL1Members({nameZh:'电子'});
const base={apiKey,minIntervalMs:0};
it('sends one stateless POST, preserving arbitrary response bytes',async()=>{
 const bytes=new Uint8Array([0xff,10,0]);
 const fetch=vi.fn<typeof globalThis.fetch>(async()=>new Response(bytes));
 const source=createGildataSource({...base,fetch,now:()=>new Date(0)});
 const result=await source.fetch(request,budgetFor(3000));
 expect(result).toEqual({vendor:'gildata',product:'datamap-mcp',request,bytes,sha256:sha256Hex(bytes),attempt:1,httpStatus:200,fetchedAt:new Date(0).toISOString()});
 const [[url,init]]=fetch.mock.calls;
 expect(url).toBe('https://api.gildata.com/mcp-servers/aidata-assistant-srv-tool');
 expect(init?.method).toBe('POST');
 expect(Object.fromEntries(new Headers(init?.headers))).toEqual({'content-type':'application/json',accept:'application/json, text/event-stream',authorization:'Bearer '+apiKey});
 expect(JSON.parse(String(init?.body))).toEqual({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'FinQuery',arguments:{query:request.query}}});
 expect(canonicalRequest(request)).toEqual({tool:'FinQuery',template_id:'sw_l1_members',template_version:1,args:{industry:'电子'},query:request.query});
});
it.each([
 [401,'vendor_auth_failed',1],[403,'vendor_auth_failed',1],[429,'vendor_rate_limited',3],[500,'vendor_http_error',3],
 [201,'vendor_http_error',1],[0,'vendor_network_error',3],[-1,'vendor_timeout',3],
] as const)('classifies and redacts %i',async(status,code,attempts)=>{
 const sleep=vi.fn(async()=>{});
 const fetch=vi.fn<typeof globalThis.fetch>(async(_url,init)=>{
  if(status===0)throw Error(apiKey+' https://example.test/'+apiKey);
  if(status===-1)return new Promise((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error(apiKey)),{once:true}));
  return new Response(apiKey,{status});
 });
 const source=createGildataSource({...base,fetch,sleep,timeoutMs:10});
 const err=await source.fetch(request,budgetFor(5000)).catch(e=>e);
 expect(err).toMatchObject({code});
 expect([String(err),err.message,JSON.stringify(err)].join(' ')).not.toContain(apiKey);
 expect(fetch).toHaveBeenCalledTimes(attempts);
 expect(source.callsMade()).toBe(attempts);
 expect(sleep.mock.calls.map(args=>(args as unknown[])[0])).toEqual(attempts===3?[1000,2000]:[]);
});
it('caps attempts, including retries and concurrent requests',async()=>{
 const fetch=vi.fn(async()=>new Response(apiKey,{status:429}));
 const source=createGildataSource({...base,maxCalls:1,fetch,sleep:async()=>{}});
 const errors=await Promise.all([1,2].map(()=>source.fetch(request,budgetFor(5000)).catch(e=>e)));
 for(const err of errors){
  expect(err.code).toBe('vendor_call_budget_exceeded');
  expect([err.message,String(err),JSON.stringify(err)].join(' ')).not.toContain(apiKey);
 }
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(source.callsMade()).toBe(1);
});
it('keeps concurrent requests single-flight and spaces starts',async()=>{
 let time=0,active=0;
 const starts:number[]=[];
 const source=createGildataSource({...base,minIntervalMs:1000,now:()=>new Date(time),sleep:async ms=>{time+=ms;},fetch:async()=>{
  expect(++active).toBe(1);starts.push(time);
  await new Promise(r=>setTimeout(r,5));active--;return new Response('');
 }});
 await Promise.all([1,2,3].map(()=>source.fetch(request,budgetFor(5000))));
 expect(starts).toEqual([0,1000,2000]);
});
it('rejects unsafe or untemplated requests before dispatch',async()=>{
 const fetch=vi.fn(),source=createGildataSource({...base,fetch});
 await expect(source.fetch({...request,args:{industry:apiKey}},budgetFor(100))).rejects.toThrow('vendor_unavailable: request_contains_secret');
 await expect(source.fetch({...request,query:'arbitrary'},budgetFor(100))).rejects.toThrow();
 expect(fetch).not.toHaveBeenCalled();
});
it('honors exhausted and aborted budgets and refuses unaffordable backoff',async()=>{
 const fetch=vi.fn(async()=>new Response(null,{status:500})),sleep=vi.fn();
 const source=createGildataSource({...base,fetch,sleep});
 await expect(source.fetch(request,budgetFor(0))).rejects.toMatchObject({code:'budget_exhausted'});
 await expect(source.fetch(request,{signal:AbortSignal.abort(apiKey),remainingMs:()=>5000})).rejects.toMatchObject({code:'budget_aborted'});
 await expect(source.fetch(request,budgetFor(500))).rejects.toMatchObject({code:'budget_exhausted'});
 expect(fetch).toHaveBeenCalledTimes(1);expect(sleep).not.toHaveBeenCalled();
});
it('validates bounded environment integers without exposing their values',()=>{
 expect(gildataSourceFromEnv({})).toBeNull();
 expect(gildataSourceFromEnv({GILDATA_API_KEY:'  '})).toBeNull();
 for(const [name,value] of [['GILDATA_MAX_CALLS_PER_RUN','0'],['GILDATA_MAX_CALLS_PER_RUN','501'],['GILDATA_MIN_INTERVAL_MS','60001'],['GILDATA_MIN_INTERVAL_MS',apiKey],['GILDATA_MIN_INTERVAL_MS','0.5']]){
  expect(()=>gildataSourceFromEnv({GILDATA_API_KEY:apiKey,[name]:value})).toThrow(new Error('invalid_env:'+name));
 }
 expect(gildataSourceFromEnv({GILDATA_API_KEY:apiKey,GILDATA_MIN_INTERVAL_MS:'0',GILDATA_MAX_CALLS_PER_RUN:'500'})).toBeTruthy();
});
it('redacts literal and encoded occurrences and skips short keys',()=>{
 expect(redactSecret('a/b? a%2Fb%3F a/b?','a/b?')).toBe('*** *** ***');
 expect(redactSecret('abc','abc')).toBe('abc');
});
it('resolves fixture text and bytes exactly and reports missing fixtures',async()=>{
 const body=loadFixtureBody('src/lib/vendor/gildata/fixtures/empty.json');
 expect(body).toBe(empty.response_text);
 for(const value of [body,new TextEncoder().encode(body)]){
  const source=fixtureGildataSource({resolve:()=>value});
  expect(await source.fetch(request,budgetFor(500))).toMatchObject({bytes:new TextEncoder().encode(body),sha256:sha256Hex(body),attempt:1,httpStatus:200});
  expect(source.callsMade()).toBe(1);
 }
 await expect(fixtureGildataSource({resolve:()=>undefined}).fetch(request,budgetFor(100))).rejects.toMatchObject({code:'fixture_missing'});
});
it('reports the successful attempt number after retrying',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(new Response('ok'));
 const source=createGildataSource({...base,fetch,sleep:async()=>{}});
 expect(await source.fetch(request,budgetFor(5000))).toMatchObject({attempt:2,sha256:sha256Hex('ok')});
 expect(source.callsMade()).toBe(2);
});
it('applies the timeout until the last body byte',async()=>{
 const fetch:typeof globalThis.fetch=async(_url,init)=>new Response(new ReadableStream({
  start(controller){init?.signal?.addEventListener('abort',()=>controller.error(Error(apiKey)),{once:true});},
 }));
 const source=createGildataSource({...base,fetch,timeoutMs:10,maxRetries:0});
 await expect(source.fetch(request,budgetFor(3000))).rejects.toMatchObject({code:'vendor_timeout',message:'vendor_timeout'});
});
it('releases a cancelled queued caller without dispatching its request',async()=>{
 let release!:()=>void,started!:()=>void;
 const ready=new Promise<void>(r=>{started=r;}),gate=new Promise<void>(r=>{release=r;});
 const source=createGildataSource({...base,fetch:async()=>{started();await gate;return new Response('ok');}});
 const first=source.fetch(request,budgetFor(3000));
 await ready;
 const cancel=new AbortController();
 const second=source.fetch(request,budgetFor(3000,cancel.signal));
 cancel.abort(Error(apiKey));
 try{await expect(second).rejects.toMatchObject({code:'budget_aborted',message:'budget_aborted'});}
 finally{release();}
 await first;
 expect(source.callsMade()).toBe(1);
});
