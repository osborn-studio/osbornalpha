import {afterEach,describe,expect,it,vi} from 'vitest';
import {productionDigestDeps} from './deps';
import {runCompanyDigest} from './digest';
import {memoryTableClient} from '../db/memory-table-client';
import {memorySnapshotObjectStore} from './evidence-index';
import {companyDbFailureCategory,toCompanyDbError} from './db';
import {companyEvidenceFetch,evidenceRequestId,withEvidenceRequest} from './evidence-request';
import {getAdminSupabase} from '../supabase/admin';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const ISSUER='33333333-3333-4333-8333-333333333333';
const PRIVATE='private-row-credential-sentinel';
const endpoint='https://fixture.invalid/rest/v1/rpc/replace_company_fact_evidence';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
function setup(handler:()=>Response|Promise<Response>){
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.invalid');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','synthetic-key');
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  expect(String(input)).toBe(endpoint);expect(init?.method).toBe('POST');return handler();
 });
 vi.stubGlobal('fetch',fetcher);
 const info=vi.spyOn(console,'info').mockImplementation(()=>{}),error=vi.spyOn(console,'error').mockImplementation(()=>{});
 const deps=productionDigestDeps({deadline:null,codeVersion:'a'.repeat(40)});
 const mark=vi.fn(async()=>true),replace=vi.fn(async()=>({upserted:0,changed:0,retired:0,revived:0}));
 deps.db={...deps.db,beginAttempt:async()=>1,markDigestFailed:mark,replaceDigest:replace,backlog:async()=>({failedStreams:0})};
 deps.tables=memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
 deps.facts={scopeRows:async()=>[{issuer_id:ISSUER,market:'US',state_rev:1}] as never,scopeAll:async()=>[]};
 deps.readSnapshot=async()=>({rows:[],filings:[],stateRev:1,truncated:false});deps.reader=memorySnapshotObjectStore(new Map());
 const run=()=>runCompanyDigest(deps,{mode:'full',market:'US',issuerIds:[ISSUER]});
 const events=()=>[...info.mock.calls,...error.mock.calls].filter(c=>c[0]==='[company-digest]').map(c=>c[1]);
 return {deps,run,events,fetcher,mark,replace};
}
function failed(id:string|null){return new Response(JSON.stringify({code:'57014',message:'canceling statement',details:PRIVATE,hint:PRIVATE}),{
 status:500,headers:{...(id?{'sb-request-id':id}:{}),'authorization':PRIVATE,'set-cookie':PRIVATE,'x-request-id':PRIVATE},
});}
function deferred(){let resolve!:()=>void;return {promise:new Promise<void>(r=>{resolve=r;}),release:()=>resolve()};}

describe('production evidence response correlation (actual SDK, mocked fetch)',()=>{
 it('logs only the failed evidence POST ID and category, preserving failure and serialized receipt',async()=>{
  const res=failed(A),text=vi.spyOn(res,'text'),json=vi.spyOn(res,'json'),clone=vi.spyOn(res,'clone');
  const h=setup(()=>res);const receipt=await h.run();
  expect(h.events().find(e=>e.stage==='evidence_replace')).toMatchObject({outcome:'failed',category:'query_canceled',upstream_request_id:A});
  expect(h.events().filter(e=>'upstream_request_id' in e)).toHaveLength(1);
  expect(Object.keys(h.events().find(e=>e.stage==='evidence_replace')).sort()).toEqual(['category','elapsed_ms','operation_id','outcome','stage','stage_ms','upstream_request_id']);
  expect(receipt.counts.failed).toBe(1);expect(h.mark).toHaveBeenCalledTimes(1);expect(h.replace).not.toHaveBeenCalled();
  expect(JSON.stringify(receipt)).not.toContain(A);expect(JSON.stringify(h.events())).not.toContain(PRIVATE);
  expect(h.fetcher).toHaveBeenCalledTimes(1);expect(text).toHaveBeenCalledTimes(1);expect(json).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled();
 });
 it('keeps request IDs local when overlapping calls complete in the opposite order',async()=>{
  const entered=deferred(),release=deferred();let count=0;const completed:string[]=[];
  const h=setup(()=>{
   const id=++count===1?A:B,res=failed(id),text=res.text.bind(res);
   // Both fetches return headers immediately. Delay only the first SDK body read,
   // so a shared last-header variable would misattribute B to the first failure.
   vi.spyOn(res,'text').mockImplementation(async()=>{
    if(id===A){entered.release();await release.promise;}
    completed.push(id);return text();
   });
   return res;
  });
  const first=h.run();await entered.promise;await h.run();release.release();await first;
  expect(completed).toEqual([B,A]);expect(h.fetcher).toHaveBeenCalledTimes(2);
  const failures=h.events().filter(e=>e.stage==='evidence_replace');
  expect(failures.map(e=>e.upstream_request_id)).toEqual([B,A]);expect(new Set(failures.map(e=>e.operation_id)).size).toBe(2);
 });
 it.each([{name:'missing',id:null},{name:'malformed',id:PRIVATE},{name:'oversized',id:'a'.repeat(4096)},{name:'combined',id:`${A}, ${B}`}])('omits $name ID',async({id})=>{
  const h=setup(()=>failed(id));const receipt=await h.run();
  const event=h.events().find(e=>e.stage==='evidence_replace');expect(event.category).toBe('query_canceled');expect(event).not.toHaveProperty('upstream_request_id');
  expect(receipt.counts.failed).toBe(1);expect(h.fetcher).toHaveBeenCalledTimes(1);
 });
 it('omits ID on success and preserves successful SDK result and digest semantics',async()=>{
  const h=setup(()=>new Response('{"upserted":0,"deleted":0}',{headers:{'sb-request-id':A}}));
  const receipt=await h.run();expect(receipt.status).toBe('success');expect(h.mark).not.toHaveBeenCalled();expect(h.replace).toHaveBeenCalledTimes(1);
  expect(h.events().some(e=>'upstream_request_id' in e)).toBe(false);expect(h.fetcher).toHaveBeenCalledTimes(1);
 });
 it('has no invented ID for network failure and does not retry the POST',async()=>{
  const h=setup(()=>{throw new TypeError(PRIVATE);});const receipt=await h.run();
  expect(receipt.counts.failed).toBe(1);expect(h.fetcher).toHaveBeenCalledTimes(1);
  expect(h.events().find(e=>e.stage==='evidence_replace')).toMatchObject({category:'unknown'});
  expect(h.events().some(e=>'upstream_request_id' in e)).toBe(false);
 });
 it('keeps the zero-argument admin factory and injected client working without an ID',async()=>{
  const h=setup(()=>failed(A));
  const injected=productionDigestDeps({deadline:null,codeVersion:'a'.repeat(40),admin:getAdminSupabase()});
  h.deps.db.replaceEvidence=injected.db.replaceEvidence;
  const receipt=await h.run();expect(receipt.counts.failed).toBe(1);
  expect(h.events().find(e=>e.stage==='evidence_replace')).toMatchObject({category:'query_canceled'});
  expect(h.events().some(e=>'upstream_request_id' in e)).toBe(false);expect(h.fetcher).toHaveBeenCalledTimes(1);
 });
 it('preserves a PG-style converted error and its category without ID',async()=>{
  const h=setup(()=>{throw new Error('must not fetch');});
  const cause=toCompanyDbError({code:'57014',message:'canceling statement'});
  expect(companyDbFailureCategory(cause)).toBe('query_canceled');
  h.deps.db.replaceEvidence=async()=>{throw cause;};
  const receipt=await h.run();expect(receipt.counts.failed).toBe(1);expect(h.fetcher).not.toHaveBeenCalled();
  expect(h.events().find(e=>e.stage==='evidence_replace')).toMatchObject({category:'query_canceled'});
  expect(h.events().some(e=>'upstream_request_id' in e)).toBe(false);
 });
});

describe('evidence fetch observation boundaries',()=>{
 it('ignores unrelated RPCs, methods and calls outside the evidence scope',async()=>{
  const res=failed(A),get=vi.spyOn(res.headers,'get');
  const fetcher=vi.fn(async()=>res),wrapped=companyEvidenceFetch(fetcher);
  await withEvidenceRequest(async()=>{
   expect(await wrapped('https://fixture.invalid/rest/v1/rpc/other',{method:'POST'})).toBe(res);
   expect(await wrapped(endpoint,{method:'GET'})).toBe(res);expect(evidenceRequestId()).toBeUndefined();
  });
  expect(await wrapped(endpoint,{method:'POST'})).toBe(res);expect(get).not.toHaveBeenCalled();
 });
 it('does not change response identity when metadata inspection throws',async()=>{
  const res=failed(A);vi.spyOn(res.headers,'get').mockImplementation(()=>{throw new Error(PRIVATE);});
  await withEvidenceRequest(async()=>{
   expect(await companyEvidenceFetch(async()=>res)(endpoint,{method:'POST'})).toBe(res);
   expect(evidenceRequestId()).toBeUndefined();
  });
 });
});
