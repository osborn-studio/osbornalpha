// src/app/api/cron/documents-candidates/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn(),admin:vi.fn()}));
vi.mock('@/lib/documents/candidates/run',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/documents/candidates/run')>(),runDocumentsCandidates:mocks.run,supabaseCandidatesDeps:mocks.deps}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.admin}));

import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/documents-candidates?${qs}`,{headers});
const saved={secret:process.env.CRON_SECRET,enabled:process.env.DOCUMENTS_CANDIDATES_ENABLED};
const COUNTS={fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0};
const RECEIPT={batchId:'b',status:'success',counts:{...COUNTS,fetched:2,inserted:2},errors:[{code:'label_ambiguous',key:'x',message:'secret detail'}],
 extractions:[{extractionId:'e',documentId:'d',outcome:'done',inserted:2,written:2,inherited:0,quarantined:0}],auto:{considered:2,decided:0,stopped:null},
 promote:[{issuerId:'i',runId:'r',outcome:'published',counts:COUNTS,errors:[{code:'x',key:'i',message:'m'}],staged:1}],idle:false};

describe('documents-candidates cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  process.env.CRON_SECRET='cron-secret';process.env.DOCUMENTS_CANDIDATES_ENABLED='1';
  mocks.codeVersion.mockReturnValue('abc123');mocks.admin.mockReturnValue({tag:'admin'});mocks.deps.mockReturnValue({tag:'deps'});mocks.run.mockResolvedValue(RECEIPT);
 });
 afterEach(()=>{
  if(saved.secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved.secret;
  if(saved.enabled===undefined)delete process.env.DOCUMENTS_CANDIDATES_ENABLED;else process.env.DOCUMENTS_CANDIDATES_ENABLED=saved.enabled;
 });
 it('fails closed without CRON_SECRET and rejects a wrong bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req(''))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('validates limit',async()=>{
  for(const qs of ['limit=0','limit=201','limit=x','limit=5&limit=6'])expect((await GET(req(qs,AUTH))).status,qs).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('is gated by DOCUMENTS_CANDIDATES_ENABLED (returns 200 skipped after auth, no side effects)',async()=>{
  delete process.env.DOCUMENTS_CANDIDATES_ENABLED;
  const res=await GET(req('limit=0',AUTH));
  expect(res.status).toBe(200);expect(await res.json()).toEqual({skipped:'disabled'});
  expect(mocks.run).not.toHaveBeenCalled();expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.codeVersion).not.toHaveBeenCalled();
 });
 it('refuses to run without a code version',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await POST(req('',AUTH));
  expect(res.status).toBe(503);expect((await res.json()).error.code).toBe('code_version_unavailable');
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('runs all three phases with limit 25 and a 240 s deadline; the receipt carries codes and counts only',async()=>{
  const before=Date.now();
  const res=await GET(req('',AUTH));
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');
  const body=await res.json();
  expect(body).toMatchObject({ok:true,limit:25,receipt:{batchId:'b',status:'success',auto:{decided:0}}});
  expect(JSON.stringify(body)).not.toContain('secret detail');
  expect(body.receipt.promote[0]).toEqual({issuerId:'i',outcome:'published',counts:COUNTS,errors:[{code:'x',key:'i'}]});
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{limit:25,dryRun:false,triggeredBy:'cron'});
  const [admin,opts]=mocks.deps.mock.calls[0];
  expect(admin).toEqual({tag:'admin'});expect(opts.codeVersion).toBe('abc123');
  expect(opts.deadline.getTime()-before).toBeGreaterThanOrEqual(240_000-50);
  expect(opts.deadline.getTime()-before).toBeLessThan(241_000);
 });
 it('POST with a limit; ok=false when the batch is not success; a thrown run answers 500 with a code only',async()=>{
  mocks.run.mockResolvedValueOnce({...RECEIPT,status:'partial'});
  const res=await POST(req('limit=7',AUTH));
  expect(await res.json()).toMatchObject({ok:false,limit:7});
  expect(mocks.run.mock.calls[0][1]).toEqual({limit:7,dryRun:false,triggeredBy:'cron'});
  mocks.run.mockRejectedValueOnce(new Error('db down: password=hunter2'));
  const bad=await GET(req('',AUTH));
  expect(bad.status).toBe(500);
  const text=await bad.text();expect(text).toContain('candidates_failed');expect(text).not.toContain('hunter2');
 });
});
