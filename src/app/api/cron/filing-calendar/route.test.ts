// src/app/api/cron/filing-calendar/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/dq/calendar-sync',()=>({runCalendarSync:mocks.run}));
vi.mock('@/lib/dq/calendar-deps',()=>({productionCalendarDeps:mocks.deps}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));

import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/filing-calendar?${qs}`,{headers});
const original={secret:process.env.CRON_SECRET,cn:process.env.FACTS_CN_ENABLED};
const receipt=(p:Record<string,unknown>={})=>({batchId:'b',status:'success',passId:'p',passStatus:'complete',counts:{fetched:2,inserted:2,duplicates:0,versioned:0,quarantined:0,failed:0},errors:[{code:'sec_unavailable',key:'i1',message:'http_503 secret detail'}],detail:{pass_id:'p',issuers_done:2,issuers_failed:0,rows:12,by_deadline_state:{statutory:12},by_disclosure_state:{pending:12},upstream_unavailable:0,no_fiscal_year_end:0,no_category:0,no_profile:0},...p});

describe('filing calendar cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  process.env.CRON_SECRET='cron-secret';delete process.env.FACTS_CN_ENABLED;
  mocks.codeVersion.mockReturnValue('abc123');mocks.deps.mockReturnValue({tag:'deps'});mocks.run.mockResolvedValue(receipt());
 });
 afterEach(()=>{
  if(original.secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original.secret;
  if(original.cn===undefined)delete process.env.FACTS_CN_ENABLED;else process.env.FACTS_CN_ENABLED=original.cn;
 });
 it('fails closed without CRON_SECRET and rejects a wrong bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('market=US',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('market=US',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req('market=US'))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('validates market and limit',async()=>{
  for(const qs of ['','market=HK','market=us','market=US&limit=0','market=US&limit=1001','market=US&limit=x','market=US&market=CN','market=US&limit=1&limit=2']){
   const res=await GET(req(qs,AUTH));
   expect(res.status,qs).toBe(400);
  }
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('refuses to run without a code version',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await POST(req('market=US',AUTH));
  expect(res.status).toBe(503);
  expect((await res.json()).error.code).toBe('code_version_unavailable');
 });
 it('runs with default limit 200, a 240 s deadline and the cron trigger; the body carries codes, never messages',async()=>{
  const before=Date.now();
  const res=await GET(req('market=US',AUTH));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body).toMatchObject({ok:true,market:'US',limit:200,receipt:{batchId:'b',status:'success',passId:'p',passStatus:'complete',errors:[{code:'sec_unavailable',key:'i1'}]}});
  expect(JSON.stringify(body)).not.toContain('secret detail');
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{market:'US',limit:200,triggeredBy:'cron'});
  const arg=mocks.deps.mock.calls[0][0];
  expect(arg.codeVersion).toBe('abc123');
  expect(arg.deadline.getTime()-before).toBeGreaterThanOrEqual(240_000-50);
  expect(arg.deadline.getTime()-before).toBeLessThan(241_000);
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('CN runs without FACTS_CN_ENABLED (calendar rows report unknown_upstream honestly); ok=false when the batch is not success',async()=>{
  mocks.run.mockResolvedValue(receipt({status:'partial'}));
  const res=await POST(req('market=CN&limit=5',AUTH));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ok:false,market:'CN',limit:5});
  expect(mocks.run.mock.calls[0][1]).toEqual({market:'CN',limit:5,triggeredBy:'cron'});
 });
 it('a thrown error becomes a 500 with a code only',async()=>{
  mocks.run.mockRejectedValue(new Error('boom with details'));
  const res=await GET(req('market=US',AUTH));
  expect(res.status).toBe(500);
  const body=await res.json();
  expect(body.error.code).toBe('calendar_failed');
  expect(JSON.stringify(body)).not.toContain('boom');
 });
});
