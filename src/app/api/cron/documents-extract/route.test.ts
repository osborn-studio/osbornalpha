// src/app/api/cron/documents-extract/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/documents/extract/run',()=>({runDocumentsExtract:mocks.run}));
vi.mock('@/lib/documents/extract/deps',()=>({productionExtractDeps:mocks.deps}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));

import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/documents-extract?${qs}`,{headers});
const saved={secret:process.env.CRON_SECRET,enabled:process.env.DOCUMENTS_EXTRACT_ENABLED};
const restore=(k:string,v:string|undefined)=>{if(v===undefined)delete process.env[k];else process.env[k]=v;};

describe('documents-extract cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  process.env.CRON_SECRET='cron-secret';process.env.DOCUMENTS_EXTRACT_ENABLED='1';
  mocks.codeVersion.mockReturnValue('a'.repeat(40));
  mocks.deps.mockReturnValue({tag:'deps'});
  mocks.run.mockResolvedValue({batchId:'b',status:'partial',counts:{fetched:2,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:1},idle:false,
   errors:[{code:'extract_error',key:'d2',message:'secret detail'}],documents:[{documentId:'d1',outcome:'extracted',pageCount:3,extractionId:'e1'},{documentId:'d2',outcome:'failed',code:'extract_error'}]});
 });
 afterEach(()=>{restore('CRON_SECRET',saved.secret);restore('DOCUMENTS_EXTRACT_ENABLED',saved.enabled);});
 it('fails closed without CRON_SECRET and rejects a wrong bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req(''))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('validates limit',async()=>{
  for(const qs of ['limit=0','limit=101','limit=x','limit=1&limit=2'])expect((await GET(req(qs,AUTH))).status,qs).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it("is gated by DOCUMENTS_EXTRACT_ENABLED ('1' or 'true'): after auth, 200 skipped disabled, nothing touched",async()=>{
  for(const v of [undefined,'0','TRUE','yes']){
   restore('DOCUMENTS_EXTRACT_ENABLED',v);
   const res=await GET(req('',AUTH));
   expect(res.status,String(v)).toBe(200);
   expect(res.headers.get('cache-control')).toBe('no-store');
   expect(await res.json()).toEqual({skipped:'disabled'});
  }
  expect((await GET(req('',{authorization:'Bearer nope'}))).status).toBe(401);   // auth first
  expect(mocks.run).not.toHaveBeenCalled();expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.codeVersion).not.toHaveBeenCalled();
  restore('DOCUMENTS_EXTRACT_ENABLED','true');
  expect((await GET(req('',AUTH))).status).toBe(200);expect(mocks.run).toHaveBeenCalledTimes(1);
 });
 it('refuses to apply without a code version (Vercel SHA only, no git)',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await POST(req('',AUTH));
  expect(res.status).toBe(503);
  expect((await res.json()).error.code).toBe('code_version_unavailable');
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('runs with a 240 s deadline and returns a message-free receipt',async()=>{
  const before=Date.now();
  const res=await GET(req('limit=5',AUTH));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const body=await res.json();
  expect(body).toMatchObject({ok:false,limit:5,receipt:{batchId:'b',status:'partial',errors:[{code:'extract_error',key:'d2'}]}});
  expect(JSON.stringify(body)).not.toContain('secret detail');
  const opts=mocks.deps.mock.calls[0][0] as {deadline:Date;codeVersion:string};
  expect(opts.codeVersion).toBe('a'.repeat(40));
  expect(opts.deadline.getTime()-before).toBeGreaterThanOrEqual(240_000-50);
  expect(opts.deadline.getTime()-before).toBeLessThanOrEqual(240_000+1000);
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{limit:5,dryRun:false,triggeredBy:'cron'});
 });
 it('a thrown core error is a code-only 500',async()=>{
  mocks.run.mockRejectedValue(new Error('db password in message'));
  const res=await GET(req('',AUTH));
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain('password');
 });
});
