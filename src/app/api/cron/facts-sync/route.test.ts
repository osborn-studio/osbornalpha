// src/app/api/cron/facts-sync/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/facts/sync',()=>({runFactsSync:mocks.run}));
vi.mock('@/lib/facts/deps',()=>({productionSyncDeps:mocks.deps,resolveCodeVersion:mocks.codeVersion}));

import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/facts-sync?${qs}`,{headers});
const original=process.env.CRON_SECRET;
const originalCn=process.env.FACTS_CN_ENABLED;
const originalToken=process.env.TUSHARE_TOKEN;

describe('facts sync cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  process.env.CRON_SECRET='cron-secret';delete process.env.FACTS_CN_ENABLED;process.env.TUSHARE_TOKEN='test-token';
  mocks.codeVersion.mockReturnValue('abc123');
  mocks.deps.mockReturnValue({tag:'deps'});
  mocks.run.mockResolvedValue({batchId:'b',status:'success',counts:{fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0},errors:[],detail:{attempted:1,published:1,failed:0,skipped:0,idle:false},issuers:[]});
 });
 afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;if(originalCn===undefined)delete process.env.FACTS_CN_ENABLED;else process.env.FACTS_CN_ENABLED=originalCn;if(originalToken===undefined)delete process.env.TUSHARE_TOKEN;else process.env.TUSHARE_TOKEN=originalToken;});
 it('fails closed without CRON_SECRET and rejects a wrong bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('market=US',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('market=US',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req('market=US'))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('validates market and limit',async()=>{
  for(const qs of ['','market=HK','market=us','market=US&limit=0','market=US&limit=201','market=US&limit=x','market=US&market=CN','market=US&limit=5&limit=6'])expect((await GET(req(qs,AUTH))).status,qs).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('refuses to apply without a code version',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await POST(req('market=US',AUTH));
  expect(res.status).toBe(503);
  expect((await res.json()).error.code).toBe('code_version_unavailable');
 });
 it('runs the market with default limit 25, a 240 s deadline, cron trigger, and returns the receipt',async()=>{
  const before=Date.now();
  const res=await GET(req('market=US',AUTH));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({ok:true,market:'US',limit:25,receipt:{batchId:'b',status:'success'}});
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{market:'US',limit:25,dryRun:false,triggeredBy:'cron'});
  const depsArg=mocks.deps.mock.calls[0][0];
  expect(depsArg.codeVersion).toBe('abc123');
  expect(depsArg.deadline.getTime()-before).toBeGreaterThanOrEqual(240_000-50);
  expect(depsArg.deadline.getTime()-before).toBeLessThan(241_000);
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('refuses market=CN with 403 cn_disabled only when the kill switch FACTS_CN_ENABLED=0 is set',async()=>{
  process.env.FACTS_CN_ENABLED='0';
  const res=await GET(req('market=CN',AUTH));
  expect(res.status).toBe(403);expect((await res.json()).error.code).toBe('cn_disabled');
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('market=CN without TUSHARE_TOKEN answers 503 tushare_unconfigured before deps or a batch; US is unaffected',async()=>{
  delete process.env.TUSHARE_TOKEN;
  const res=await GET(req('market=CN',AUTH));
  expect(res.status).toBe(503);expect((await res.json()).error.code).toBe('tushare_unconfigured');
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
  expect((await GET(req('market=US',AUTH))).status).toBe(200);
 });
 it('market=CN runs when FACTS_CN_ENABLED is unset (CN is on by default)',async()=>{
  mocks.run.mockResolvedValue({batchId:'b',status:'success',counts:{fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0},errors:[],detail:{attempted:1,published:1,failed:0,skipped:0,idle:false},issuers:[]});
  const res=await GET(req('market=CN',AUTH));
  expect(res.status).toBe(200);expect(mocks.run.mock.calls[0][1]).toMatchObject({market:'CN'});
 });
 it('POST with limit and CN; ok=false when the batch is not success',async()=>{
  mocks.run.mockResolvedValue({batchId:'b',status:'partial',counts:{fetched:2,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:1},errors:[{code:'sec_unavailable'}],detail:{attempted:2,published:1,failed:1,skipped:0,idle:false},issuers:[]});
  const res=await POST(req('market=CN&limit=5',AUTH));
  expect(await res.json()).toMatchObject({ok:false,market:'CN',limit:5});
  expect(mocks.run.mock.calls[0][1]).toMatchObject({market:'CN',limit:5});
 });
 it('repeated limit is invalid_parameter:limit',async()=>{
  const res=await GET(req('market=US&limit=5&limit=6',AUTH));
  expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:limit');
 });
 it('a rejected run answers a codes-only 500 (SyncError code, else sync_failed), no-store',async()=>{
  const {SyncError}=await import('@/lib/facts/errors');
  mocks.run.mockRejectedValueOnce(new Error('secret db detail'));
  let res=await GET(req('market=US',AUTH));
  expect(res.status).toBe(500);expect(res.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify(await res.json())).not.toContain('secret');
  mocks.run.mockRejectedValueOnce(new SyncError('code_version_unavailable'));
  res=await GET(req('market=US',AUTH));
  expect((await res.json()).error.code).toBe('code_version_unavailable');
  mocks.deps.mockImplementationOnce(()=>{throw new Error('missing env SUPABASE_KEY');});
  res=await GET(req('market=US',AUTH));
  expect(res.status).toBe(500);expect((await res.json()).error).toEqual({code:'sync_failed',message:'Facts sync failed'});
 });
 it('the HTTP receipt carries codes and counts only: error messages, warnings and hashes are dropped',async()=>{
  mocks.run.mockResolvedValue({batchId:'b',status:'partial',counts:{fetched:1,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:1},errors:[{code:'unknown',key:'k',message:'leaky detail'}],idle:false,detail:{attempted:1,published:0,failed:1,skipped:0,idle:false},issuers:[{issuerId:'i',fetchKey:'f',runId:'r',outcome:'failed',code:'unknown',counts:{fetched:1,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:1},errors:[{code:'unknown',key:'i',message:'leaky'}],warnings:new Map([['w',['x']]]),snapshotSha256:['abc']}]});
  const text=JSON.stringify(await (await GET(req('market=US',AUTH))).json());
  expect(text).not.toContain('leaky');expect(text).not.toContain('abc');
  expect(text).toContain('"code":"unknown"');
 });
});
