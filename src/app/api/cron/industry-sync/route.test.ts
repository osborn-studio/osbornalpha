// src/app/api/cron/industry-sync/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
vi.mock('@/lib/industry/jobs',async(importOriginal)=>{
 const real=await importOriginal<typeof import('@/lib/industry/jobs')>();
 return {...real,runIndustryJob:mocks.run,productionIndustryDeps:mocks.deps};
});

import {IndustryDbError} from '@/lib/industry/types';
import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/industry-sync?${qs}`,{headers});
const ENV=['CRON_SECRET','TUSHARE_TOKEN','FACTS_CN_ENABLED','FACTS_CN_INDUSTRY_UNIVERSE'] as const;
const saved=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));

describe('industry sync cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  for(const k of ENV)delete process.env[k];
  process.env.CRON_SECRET='cron-secret';
  mocks.codeVersion.mockReturnValue('abc123');
  mocks.deps.mockReturnValue({tag:'deps'});
  mocks.run.mockResolvedValue({job:'memberships-sic',receipt:{batchId:'b',status:'success',counts:{inserted:3},errors:[]}});
 });
 afterEach(()=>{for(const k of ENV){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}});
 it('fails closed without CRON_SECRET and rejects a wrong bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('job=memberships-sic',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('job=memberships-sic',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req('job=memberships-sic'))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();
 });
 it('validates job and limit',async()=>{
  for(const qs of ['','job=sw','job=marks&job=marks','job=memberships-sic&limit=0','job=memberships-sic&limit=501','job=memberships-sic&limit=x','job=memberships-sic&limit=1&limit=2'])
   expect((await GET(req(qs,AUTH))).status,qs).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('runs memberships-sic (the one scheduled job) with apply semantics and returns a codes-only receipt',async()=>{
  mocks.run.mockResolvedValue({job:'memberships-sic',receipt:{batchId:'b',status:'partial',counts:{inserted:3},errors:[{code:'sec_unavailable',key:'0000320193',message:'leaky 503 body'}]}});
  const res=await POST(req('job=memberships-sic&limit=100',AUTH));
  expect(res.status).toBe(200);
  const text=await res.text();
  expect(JSON.parse(text)).toMatchObject({ok:false,job:'memberships-sic',limit:100,receipt:{batchId:'b',status:'partial',errors:[{code:'sec_unavailable',key:'0000320193'}]}});
  expect(text).not.toContain('leaky');
  expect(mocks.run).toHaveBeenCalledWith('memberships-sic',{tag:'deps'},{dryRun:false,triggeredBy:'cron',limit:100});
  expect(mocks.deps).toHaveBeenCalledWith({codeVersion:'abc123'});
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('official and valuation answer skipped deferred_i3 without building deps',async()=>{
  for(const job of ['valuation','official']){
   const body=await (await GET(req(`job=${job}`,AUTH))).json();
   expect(body).toMatchObject({ok:true,job,skipped:'deferred_i3'});
  }
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('gates: Tushare jobs 503 without a token; aggregate and facts-scope 403 without their CN flags',async()=>{
  const code=async(qs:string)=>{const r=await GET(req(qs,AUTH));return [r.status,(await r.json()).error.code];};
  expect(await code('job=marks')).toEqual([503,'tushare_unavailable']);
  expect(await code('job=load-a-share')).toEqual([503,'tushare_unavailable']);
  expect(await code('job=aggregate')).toEqual([403,'job_disabled']);
  expect(await code('job=facts-scope')).toEqual([403,'job_disabled']);
  expect(mocks.run).not.toHaveBeenCalled();
  process.env.FACTS_CN_ENABLED='1';
  expect((await GET(req('job=aggregate',AUTH))).status).toBe(200);
 });
 it('refuses without a code version; a failing run answers its IndustryDbError code or sync_failed, never the message',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  expect((await (await GET(req('job=memberships-sic',AUTH))).json()).error.code).toBe('code_version_unavailable');
  mocks.codeVersion.mockReturnValue('abc123');
  mocks.run.mockRejectedValueOnce(new IndustryDbError('obsolete_run','secret detail'));
  let res=await GET(req('job=memberships-sic',AUTH));
  expect(res.status).toBe(500);expect(await res.json()).toEqual({error:{code:'obsolete_run',message:'Industry sync failed'}});
  mocks.run.mockRejectedValueOnce(new Error('secret db'));
  res=await GET(req('job=memberships-sic',AUTH));
  expect((await res.json()).error.code).toBe('sync_failed');
 });
});
