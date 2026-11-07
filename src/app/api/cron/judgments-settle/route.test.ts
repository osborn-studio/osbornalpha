// src/app/api/cron/judgments-settle/route.test.ts
// F4 Task 14 (spec §7.1): bearer auth like facts-sync, preview=1 read-only, code_version gate, 280 s deadline,
// codes-only receipt, GET and POST.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {JudgmentError} from '@/lib/judgments/errors';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/judgments/settle',()=>({runSettle:mocks.run}));
vi.mock('@/lib/judgments/deps',()=>({productionJudgmentDeps:mocks.deps,resolveCodeVersion:mocks.codeVersion}));

import {GET,POST,dynamic,maxDuration} from './route';

const AUTH={authorization:'Bearer cron-secret'};
const SHA='0123456789abcdef0123456789abcdef01234567';
const req=(qs='',headers:Record<string,string>=AUTH)=>new Request(`https://alpha.example/api/cron/judgments-settle${qs?`?${qs}`:''}`,{headers});
const RECEIPT={batchId:'b',status:'success',counts:{fetched:2,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0,deferred:1},
 errors:[{code:'pending_summary',message:'{"awaiting_bars":1}'},{code:'lease_lost',key:'j2'}],idle:false,preview:false,
 detail:{repaired:0,batches:1,deadline_hit:false,compensation:{status:'skipped',reason:'macro_unavailable',scanned:0,produced:0,existing:0,skippedFailed:0,stoppedAt:null,batchId:null,errors:[{code:'macro_unavailable',message:'leaky macro detail'}]}},
 items:[{judgment_id:'j1',action:'settled',reason:null,seq:1}]};
const original=process.env.CRON_SECRET;

describe('judgments settle cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  process.env.CRON_SECRET='cron-secret';
  mocks.codeVersion.mockReturnValue(SHA);mocks.deps.mockReturnValue({tag:'deps'});mocks.run.mockResolvedValue(RECEIPT);
 });
 afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;});
 it('is force-dynamic with maxDuration 300',()=>{expect(dynamic).toBe('force-dynamic');expect(maxDuration).toBe(300);});
 it('fails closed without CRON_SECRET and rejects a wrong or missing bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req())).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req('',{}))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('runs with cron actor/trigger and a 280 s deadline; the receipt carries codes, keys and counts only',async()=>{
  const res=await GET(req());
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');
  const body=await res.json();
  expect(body).toMatchObject({ok:true,preview:false,receipt:{batchId:'b',status:'success',counts:{deferred:1},items:[{judgment_id:'j1',action:'settled'}],
   errors:[{code:'pending_summary'},{code:'lease_lost',key:'j2'}],detail:{compensation:{status:'skipped',reason:'macro_unavailable'}}}});
  expect(JSON.stringify(body)).not.toContain('awaiting_bars');expect(JSON.stringify(body)).not.toContain('leaky');
  expect(mocks.deps).toHaveBeenCalledWith({codeVersion:SHA,actor:'cron',triggeredBy:'cron'});
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{preview:false,deadlineMs:280_000});
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('POST works the same; ok=false when the batch is not success',async()=>{
  mocks.run.mockResolvedValue({...RECEIPT,status:'partial'});
  const body=await (await POST(req())).json();
  expect(body).toMatchObject({ok:false,receipt:{status:'partial'}});
 });
 it('preview=1 runs read-only (preview flag), even without a code version; any other preview value is 400',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  mocks.run.mockResolvedValue({...RECEIPT,status:'preview',preview:true,batchId:null});
  const res=await GET(req('preview=1'));
  expect(res.status).toBe(200);expect(await res.json()).toMatchObject({ok:true,preview:true});
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{preview:true,deadlineMs:280_000});
  expect(mocks.deps).toHaveBeenCalledWith({codeVersion:'preview',actor:'cron',triggeredBy:'cron'});
  for(const qs of ['preview=0','preview=true','preview=1&preview=1']){
   const bad=await GET(req(qs));
   expect({qs,status:bad.status}).toEqual({qs,status:400});
   expect((await bad.json()).error.code).toBe('invalid_parameter:preview');
  }
 });
 it('refuses an applying run without a code version',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await GET(req());
  expect(res.status).toBe(503);expect((await res.json()).error.code).toBe('code_version_unavailable');
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('a failing run answers a codes-only 500 (JudgmentError code, else settle_failed)',async()=>{
  mocks.run.mockRejectedValueOnce(new Error('secret db detail'));
  let res=await GET(req());
  expect(res.status).toBe(500);expect(JSON.stringify(await res.json())).not.toContain('secret');
  mocks.run.mockRejectedValueOnce(new JudgmentError('lease_lost'));
  res=await GET(req());
  expect((await res.json()).error).toEqual({code:'lease_lost',message:'Judgment settlement failed'});
  mocks.deps.mockImplementationOnce(()=>{throw new Error('missing env SUPABASE_SERVICE_ROLE_KEY');});
  res=await GET(req());
  expect((await res.json()).error).toEqual({code:'settle_failed',message:'Judgment settlement failed'});
 });
});
