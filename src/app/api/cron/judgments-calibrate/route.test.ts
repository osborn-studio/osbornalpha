// src/app/api/cron/judgments-calibrate/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),preview:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/judgments/calibrate',()=>({runCalibrate:mocks.run,previewCalibrate:mocks.preview}));
vi.mock('@/lib/judgments/calibrate-deps',()=>({productionCalibrateDeps:mocks.deps}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:mocks.codeVersion}));

import {GET,POST} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/judgments-calibrate?${qs}`,{headers});
const original=process.env.CRON_SECRET;
const RECEIPT={batchId:'b',status:'success',counts:{fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0,deferred:0},errors:[{code:'stale_revision',key:'calibrate:m@v1:all:',message:'leaky'}],units:[{job:'calibrate:m@v1:all:',methodology_id:'m',version:'v1',scope:{scope_type:'all',scope_key:''},outcome:'inserted',pages:2,calibration_id:'c'}]};

describe('judgments calibrate cron',()=>{
 beforeEach(()=>{vi.clearAllMocks();process.env.CRON_SECRET='cron-secret';mocks.codeVersion.mockReturnValue('abc1234');mocks.deps.mockReturnValue({tag:'deps'});mocks.run.mockResolvedValue(RECEIPT);mocks.preview.mockResolvedValue([{job:'calibrate:m@v1:all:',state:'idle'}]);});
 afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;});
 it('fails closed without CRON_SECRET; rejects a wrong bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req(''))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();
 });
 it('runs with a 280 s deadline and cron trigger; the receipt drops messages',async()=>{
  const before=Date.now();
  const res=await POST(req('',AUTH));
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');
  const text=JSON.stringify(await res.json());
  expect(text).not.toContain('leaky');expect(text).toContain('"code":"stale_revision"');
  const d=mocks.deps.mock.calls[0][0];
  expect(d).toMatchObject({codeVersion:'abc1234',triggeredBy:'cron'});
  expect(d.deadline.getTime()-before).toBeGreaterThanOrEqual(280_000-50);expect(d.deadline.getTime()-before).toBeLessThan(281_000);
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('preview=1 only previews; other preview values are 400; no code version → 503',async()=>{
  const res=await GET(req('preview=1',AUTH));
  expect(await res.json()).toMatchObject({ok:true,preview:true,units:[{state:'idle'}]});
  expect(mocks.run).not.toHaveBeenCalled();
  expect((await GET(req('preview=0',AUTH))).status).toBe(400);
  expect((await GET(req('preview=1&preview=1',AUTH))).status).toBe(400);
  mocks.codeVersion.mockReturnValue(null);
  expect((await GET(req('',AUTH))).status).toBe(503);
 });
 it('preview succeeds without a code version and never runs the writing core',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await GET(req('preview=1',AUTH));
  expect(res.status).toBe(200);expect(await res.json()).toMatchObject({ok:true,preview:true});
  expect(mocks.run).not.toHaveBeenCalled();expect(mocks.preview).toHaveBeenCalledOnce();
 });
 it('a thrown core is a code-only 500',async()=>{
  mocks.run.mockRejectedValueOnce(new Error('secret'));
  const res=await GET(req('',AUTH));
  expect(res.status).toBe(500);expect(JSON.stringify(await res.json())).not.toContain('secret');
 });
});
