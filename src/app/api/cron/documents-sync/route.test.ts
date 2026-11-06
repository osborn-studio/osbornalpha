// src/app/api/cron/documents-sync/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/documents/sync',async()=>{
 class DocumentsSyncError extends Error{constructor(readonly code:string){super(code);}}
 return {runDocumentsSync:mocks.run,DocumentsSyncError,DEADLINE_MS:240_000};
});
vi.mock('@/lib/documents/deps',()=>({productionDocumentsDeps:mocks.deps,documentsCodeVersion:mocks.codeVersion}));

import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/documents-sync?${qs}`,{headers});
const original=process.env.CRON_SECRET;
const COUNTS={fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0};

describe('documents sync cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  process.env.CRON_SECRET='cron-secret';
  mocks.codeVersion.mockReturnValue('a'.repeat(40));
  mocks.deps.mockReturnValue({tag:'deps'});
  mocks.run.mockResolvedValue({batchId:'b',status:'success',counts:COUNTS,errors:[],idle:false,issuers:[]});
 });
 afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;});
 it('fails closed without CRON_SECRET (503) and rejects a wrong or missing bearer (401) before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('source=hkexnews',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('source=hkexnews',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req('source=hkexnews'))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('source is required and must be one of the three; limit 1..200; every parameter at most once',async()=>{
  const cases:[string,string][]=[['','invalid_parameter:source'],['source=upload','invalid_parameter:source'],['source=HKEXNEWS','invalid_parameter:source'],
   ['source=edgar&source=cninfo','invalid_parameter:source'],['source=edgar&limit=0','invalid_parameter:limit'],['source=edgar&limit=201','invalid_parameter:limit'],
   ['source=edgar&limit=x','invalid_parameter:limit'],['source=edgar&limit=5&limit=6','invalid_parameter:limit'],['source=edgar&foo=1&foo=2','invalid_parameter:foo']];
  for(const [qs,code] of cases){
   const res=await GET(req(qs,AUTH));
   expect(res.status,qs).toBe(400);expect((await res.json()).error.code,qs).toBe(code);
  }
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('refuses to apply without a code version (cron: env only, no git)',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await POST(req('source=edgar',AUTH));
  expect(res.status).toBe(503);expect((await res.json()).error.code).toBe('code_version_unavailable');
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('runs the source with default limit 25, sinceYear this year − 10, a 240 s deadline and cron trigger',async()=>{
  const before=Date.now();
  const res=await GET(req('source=hkexnews',AUTH));
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toMatchObject({ok:true,source:'hkexnews',limit:25,receipt:{batchId:'b',status:'success'}});
  expect(mocks.deps.mock.calls[0][0]).toBe('hkexnews');
  const depsOpts=mocks.deps.mock.calls[0][1];
  expect(depsOpts.codeVersion).toBe('a'.repeat(40));
  expect(depsOpts.deadline.getTime()-before).toBeGreaterThanOrEqual(240_000-50);
  expect(depsOpts.deadline.getTime()-before).toBeLessThan(241_000);
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{source:'hkexnews',limit:25,sinceYear:new Date().getUTCFullYear()-10,dryRun:false,triggeredBy:'cron'});
 });
 it('POST with limit; ok=false when the batch is not success',async()=>{
  mocks.run.mockResolvedValue({batchId:'b',status:'partial',counts:{...COUNTS,failed:1},errors:[{code:'fetch_failed',key:'i:r',message:'x'}],idle:false,issuers:[]});
  const res=await POST(req('source=cninfo&limit=5',AUTH));
  expect(await res.json()).toMatchObject({ok:false,source:'cninfo',limit:5});
  expect(mocks.run.mock.calls[0][1]).toMatchObject({source:'cninfo',limit:5});
 });
 it('a failed run answers a codes-only 500 (DocumentsSyncError code, else sync_failed)',async()=>{
  const {DocumentsSyncError}=await import('@/lib/documents/sync');
  mocks.run.mockRejectedValueOnce(new Error('secret db detail'));
  let res=await GET(req('source=edgar',AUTH));
  expect(res.status).toBe(500);expect(res.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(await res.json())).not.toContain('secret');
  mocks.run.mockRejectedValueOnce(new DocumentsSyncError('adapter_mismatch'));
  res=await GET(req('source=edgar',AUTH));
  expect((await res.json()).error.code).toBe('adapter_mismatch');
  mocks.deps.mockImplementationOnce(()=>{throw new Error('missing env SUPABASE_SERVICE_ROLE_KEY');});
  res=await GET(req('source=edgar',AUTH));
  expect((await res.json()).error).toEqual({code:'sync_failed',message:'Documents sync failed'});
 });
 it('the HTTP receipt drops error messages',async()=>{
  mocks.run.mockResolvedValue({batchId:'b',status:'partial',counts:COUNTS,errors:[{code:'list_failed',key:'k',message:'leaky detail'}],idle:false,
   issuers:[{issuerId:'i',fetchKey:'00268',outcome:'failed',code:'list_failed',counts:COUNTS,errors:[{code:'list_failed',key:'i:y2026',message:'leaky'}]}]});
  const text=JSON.stringify(await (await GET(req('source=hkexnews',AUTH))).json());
  expect(text).not.toContain('leaky');expect(text).toContain('"code":"list_failed"');expect(text).toContain('"fetchKey":"00268"');
 });
});
