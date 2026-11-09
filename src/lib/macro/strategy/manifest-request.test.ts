// Actual locked Supabase SDK; only HTTP is simulated. No live database calls.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {strategyDb} from './route-helpers';
import {strategyDbOver,supabaseTransport} from './db';
import {testManifest} from './db-contract';
import {manifestFetch,manifestRequestId,withManifestRequest} from './manifest-request';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const PRIVATE='private-manifest-body-header-sentinel';
const endpoint='https://fixture.invalid/rest/v1/rpc/macro_put_manifest_json';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
function failed(id:string|null){return new Response(JSON.stringify({code:'57014',message:'canceling statement',details:PRIVATE,hint:PRIVATE}),{
 status:500,headers:{...(id?{'sb-request-id':id}:{}),'authorization':PRIVATE,'set-cookie':PRIVATE,'x-request-id':PRIVATE},
});}
function setup(handler:(input:RequestInfo|URL,init?:RequestInit)=>Response|Promise<Response>){
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.invalid');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','synthetic-anon');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','synthetic-service');
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>handler(input,init));vi.stubGlobal('fetch',fetcher);
 const info=vi.spyOn(console,'info').mockImplementation(()=>{}),error=vi.spyOn(console,'error').mockImplementation(()=>{});
 const db=strategyDb();
 const events=()=>[...info.mock.calls,...error.mock.calls].filter(c=>c[0]==='[macro-manifest]').map(c=>c[1]);
 const run=()=>db.putManifest(testManifest('cycle_table'));
 return {db,run,events,fetcher};
}
function deferred(){let release!:()=>void;return {promise:new Promise<void>(r=>{release=r;}),release:()=>release()};}
describe('manifest failure response correlation through default strategy construction',()=>{
 it('logs only the failed POST UUID without changing SDK error or consuming its body twice',async()=>{
  const res=failed(A),text=vi.spyOn(res,'text'),json=vi.spyOn(res,'json'),clone=vi.spyOn(res,'clone');
  const h=setup((input,init)=>{expect(String(input)).toBe(endpoint);expect(init?.method).toBe('POST');return res;});
  const error=await h.run().catch(e=>e);
  expect(error).toMatchObject({name:'StrategyDbError',code:'rpc_failed',message:'canceling statement'});
  expect(JSON.stringify(error)).not.toContain(A);
  const event=h.events().find(e=>e.stage==='rpc');
  expect(event).toMatchObject({outcome:'failed',category:'query_canceled',upstream_request_id:A});
  expect(Object.keys(event).sort()).toEqual(['category','elapsed_ms','operation_id','outcome','stage','stage_ms','upstream_request_id']);
  expect(h.events().filter(e=>'upstream_request_id' in e)).toHaveLength(1);expect(JSON.stringify(h.events())).not.toContain(PRIVATE);
  expect(h.fetcher).toHaveBeenCalledTimes(1);expect(text).toHaveBeenCalledTimes(1);expect(json).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled();
 });
 it('keeps overlapping calls isolated when first SDK body completes last',async()=>{
  const entered=deferred(),release=deferred();let n=0;const completed:string[]=[];
  const h=setup(()=>{
   const id=++n===1?A:B,res=failed(id),text=res.text.bind(res);
   vi.spyOn(res,'text').mockImplementation(async()=>{if(id===A){entered.release();await release.promise;}completed.push(id);return text();});return res;
  });
  const first=h.run().catch(e=>e);await entered.promise;await h.run().catch(e=>e);release.release();await first;
  expect(completed).toEqual([B,A]);const failures=h.events().filter(e=>e.stage==='rpc');
  expect(failures.map(e=>e.upstream_request_id)).toEqual([B,A]);expect(new Set(failures.map(e=>e.operation_id)).size).toBe(2);expect(h.fetcher).toHaveBeenCalledTimes(2);
 });
 it.each([null,PRIVATE,'a'.repeat(36),'a'.repeat(4096),`${A}, ${B}`])('omits missing/invalid ID %s after a prior failure',async id=>{
  let n=0;const h=setup(()=>failed(++n===1?A:id));await h.run().catch(e=>e);await h.run().catch(e=>e);
  expect(h.events().filter(e=>e.stage==='rpc').map(e=>e.upstream_request_id)).toEqual([A,undefined]);expect(h.fetcher).toHaveBeenCalledTimes(2);
 });
 it('has no stale UUID for network failure after an earlier response and does not retry',async()=>{
  let n=0;const h=setup(()=>{if(++n===1)return failed(A);throw new TypeError(PRIVATE);});
  await h.run().catch(e=>e);await expect(h.run()).rejects.toMatchObject({code:'rpc_failed'});
  expect(h.events().filter(e=>e.stage==='rpc').map(e=>e.upstream_request_id)).toEqual([A,undefined]);expect(h.fetcher).toHaveBeenCalledTimes(2);
 });
 it('omits IDs on RPC success, metadata readback failure and successful stored results',async()=>{
  let failRead=true,hash='';const h=setup((input,init)=>{
   if(String(input)===endpoint){hash=JSON.parse(String(init?.body)).p_manifest_hash;return new Response(JSON.stringify(A),{headers:{'sb-request-id':B}});}
   return failRead?failed(B):new Response(JSON.stringify([{manifest_id:A,manifest_hash:hash,created_at:'2026-11-07T00:00:00Z'}]),{headers:{'sb-request-id':B}});
  });
  await expect(h.run()).rejects.toMatchObject({code:'rpc_failed'});failRead=false;const result=await h.run();
  expect(result.manifest_id).toBe(A);expect(JSON.stringify(result)).not.toContain(B);expect(h.events().some(e=>'upstream_request_id' in e)).toBe(false);expect(h.fetcher).toHaveBeenCalledTimes(4);
 });
 it('preserves injected plain clients without inventing optional metadata',async()=>{
  const h=setup(()=>failed(A)),client=getAdminSupabase(),db=strategyDbOver(supabaseTransport({admin:client,anon:client}));
  await expect(db.putManifest(testManifest('cycle_table'))).rejects.toMatchObject({code:'rpc_failed'});
  expect(h.events().some(e=>'upstream_request_id' in e)).toBe(false);expect(h.fetcher).toHaveBeenCalledTimes(1);
 });
 it('preserves SDK failure semantics if the correlated failure logger throws',async()=>{
  const h=setup(()=>failed(A));vi.spyOn(console,'error').mockImplementation(()=>{throw new Error('diagnostic sink unavailable');});
  await expect(h.run()).rejects.toMatchObject({name:'StrategyDbError',code:'rpc_failed',message:'canceling statement'});
  expect(h.fetcher).toHaveBeenCalledTimes(1);
 });
});

describe('manifest fetch observation boundaries',()=>{
 it('ignores wrong RPCs, path variants, query parameters, methods and unscoped calls',async()=>{
  const res=failed(A),get=vi.spyOn(res.headers,'get'),wrapped=manifestFetch(async()=>res);
  await withManifestRequest(async()=>{
   for(const url of [endpoint+'/',endpoint+'?x=1',endpoint+'/other','https://fixture.invalid/rest/v1/rpc/macro_put_manifest'])
    expect(await wrapped(url,{method:'POST'})).toBe(res);
   for(const method of ['GET','HEAD','PATCH','post'])expect(await wrapped(endpoint,{method})).toBe(res);
   expect(await wrapped(endpoint)).toBe(res);expect(manifestRequestId()).toBeUndefined();
  });
  expect(await wrapped(endpoint,{method:'POST'})).toBe(res);expect(get).not.toHaveBeenCalled();expect(manifestRequestId()).toBeUndefined();
 });
 it('supports Request method metadata without consuming or replacing request/response bodies',async()=>{
  const res=failed(A),request=new Request(endpoint,{method:'POST',body:PRIVATE}),text=vi.spyOn(request,'text'),clone=vi.spyOn(request,'clone');
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{expect(input).toBe(request);return res;});
  await withManifestRequest(async()=>{
   expect(await manifestFetch(fetcher)(request)).toBe(res);expect(manifestRequestId()).toBe(A);
  });
  expect(text).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled();expect(request.bodyUsed).toBe(false);expect(res.bodyUsed).toBe(false);
 });
 it('clears previous metadata on success, missing headers and network failure within a scope',async()=>{
  const network=new TypeError(PRIVATE);let response=failed(A),throws=false;
  const wrapped=manifestFetch(async()=>{if(throws)throw network;return response;});
  await withManifestRequest(async()=>{
   await wrapped(endpoint,{method:'POST'});expect(manifestRequestId()).toBe(A);
   response=new Response('null',{headers:{'SB-Request-ID':B}});await wrapped(endpoint,{method:'POST'});expect(manifestRequestId()).toBeUndefined();
   response=failed(B);await wrapped(endpoint,{method:'POST'});expect(manifestRequestId()).toBe(B);
   response=failed(null);await wrapped(endpoint,{method:'POST'});expect(manifestRequestId()).toBeUndefined();
   response=failed(A);await wrapped(endpoint,{method:'POST'});throws=true;
   await expect(wrapped(endpoint,{method:'POST'})).rejects.toBe(network);expect(manifestRequestId()).toBeUndefined();
  });
 });
 it('preserves response identity if header inspection fails and accepts case-insensitive header names',async()=>{
  const res=failed(A),get=vi.spyOn(res.headers,'get').mockImplementation(()=>{throw new Error(PRIVATE);});
  await withManifestRequest(async()=>{
   expect(await manifestFetch(async()=>res)(endpoint,{method:'POST'})).toBe(res);expect(manifestRequestId()).toBeUndefined();
   get.mockRestore();const upper=new Response('{}',{status:500,headers:{'SB-Request-ID':B}});
   expect(await manifestFetch(async()=>upper)(endpoint,{method:'POST'})).toBe(upper);expect(manifestRequestId()).toBe(B);
  });
 });
});
