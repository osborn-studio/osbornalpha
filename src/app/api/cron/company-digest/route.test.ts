// src/app/api/cron/company-digest/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/company/digest',async(orig)=>({...(await orig<typeof import('@/lib/company/digest')>()),runCompanyDigest:mocks.run}));
vi.mock('@/lib/company/deps',()=>({productionDigestDeps:mocks.deps}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));

import {DigestError} from '@/lib/company/digest';
import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/company-digest?${qs}`,{headers});
const original=process.env.CRON_SECRET;
const receipt={batchId:'b',status:'success',counts:{fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0},
 errors:[{code:'skipped_summary',key:'i:US',message:'{"stale_attempt":1}'}],idle:false,detail:{attempted:1},
 streams:[{issuerId:'i',market:'US',sweep:false,outcome:'changed',attemptId:3,basedOnRev:2,events:4,result:null,evidence:null,retried:false}]};

describe('company digest cron',()=>{
 beforeEach(()=>{vi.clearAllMocks();process.env.CRON_SECRET='cron-secret';mocks.codeVersion.mockReturnValue('f'.repeat(40));mocks.deps.mockReturnValue({tag:'deps'});mocks.run.mockResolvedValue(receipt);});
 afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;});
 it('fails closed without CRON_SECRET (503) and rejects a wrong or missing bearer (401) before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  const r=await GET(req('',AUTH));expect(r.status).toBe(503);expect(r.headers.get('cache-control')).toBe('no-store');
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await POST(req(''))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('validates limit',async()=>{
  for(const qs of ['limit=0','limit=201','limit=x','limit=5&limit=6','limit=1.5'])expect((await GET(req(qs,AUTH))).status,qs).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('503 code_version_unavailable without VERCEL_GIT_COMMIT_SHA (allowGit:false)',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const r=await POST(req('',AUTH));expect(r.status).toBe(503);expect((await r.json()).error.code).toBe('code_version_unavailable');
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});expect(mocks.run).not.toHaveBeenCalled();
 });
 it('runs incremental with limit 200 by default and a 240 s deadline; the receipt carries codes and counts, never messages',async()=>{
  const before=Date.now();
  const r=await GET(req('',AUTH));
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{mode:'incremental',limit:200,triggeredBy:'cron'});
  const d=mocks.deps.mock.calls[0][0];
  expect(d.codeVersion).toBe('f'.repeat(40));
  expect(d.deadline.getTime()-before).toBeGreaterThanOrEqual(240_000-50);expect(d.deadline.getTime()-before).toBeLessThan(241_000);
  const body=await r.json();
  expect(body).toMatchObject({ok:true,limit:200,receipt:{batchId:'b',status:'success',errors:[{code:'skipped_summary',key:'i:US'}]}});
  expect(JSON.stringify(body)).not.toContain('stale_attempt":1');
  expect(body.receipt.streams).toEqual([{issuerId:'i',market:'US',sweep:false,outcome:'changed'}]);
  await POST(req('limit=7',AUTH));expect(mocks.run).toHaveBeenLastCalledWith({tag:'deps'},{mode:'incremental',limit:7,triggeredBy:'cron'});
 });
 it('500 with the code only on failure; ok=false when the batch is not success',async()=>{
  mocks.run.mockRejectedValueOnce(new DigestError('code_version_missing','secret detail'));
  const r=await GET(req('',AUTH));expect(r.status).toBe(500);
  const body=await r.json();expect(body.error.code).toBe('code_version_missing');expect(JSON.stringify(body)).not.toContain('secret detail');
  mocks.run.mockRejectedValueOnce(new Error('db exploded: password=x'));
  const r2=await GET(req('',AUTH));expect((await r2.json()).error.code).toBe('digest_failed');
  mocks.run.mockResolvedValueOnce({...receipt,status:'partial'});
  expect((await (await GET(req('',AUTH))).json()).ok).toBe(false);
 });
});
