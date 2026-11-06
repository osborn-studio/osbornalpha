// src/app/api/cron/reconcile/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/dq/reconcile/run',async importOriginal=>({...(await importOriginal<typeof import('@/lib/dq/reconcile/run')>()),runReconcile:mocks.run}));
vi.mock('@/lib/dq/reconcile/deps',()=>({productionReconcileDeps:mocks.deps,cnPairEnabled:(pair:string)=>!pair.startsWith('cn.')||process.env.FACTS_CN_ENABLED==='1'}));
vi.mock('@/lib/dq/reconcile/pairs',async importOriginal=>{const o=await importOriginal<typeof import('@/lib/dq/reconcile/pairs')>();return {...o,RECONCILE_PAIRS:{...o.RECONCILE_PAIRS,'cn.tushare_vs_cninfo_pdf_gold':{id:'cn.tushare_vs_cninfo_pdf_gold'}}};});   // a CN pair registered (as Task 16a will) so the gate is reached
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));

import {GET,POST} from './route';
import {ReconcileError} from '@/lib/dq/reconcile/run';

const AUTH={authorization:'Bearer cron-secret'};
const req=(qs:string,headers:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/reconcile?${qs}`,{headers});
const original=process.env.CRON_SECRET,originalCn=process.env.FACTS_CN_ENABLED;
const receipt={batchId:'b',status:'success',counts:{fetched:2,inserted:2,duplicates:0,versioned:0,quarantined:0,failed:0},errors:[{code:'skipped_summary',key:'x:US:claimed',message:'secret detail'}],cycle:{cycleId:'c',status:'complete',created:true,settled:true,expectedTotal:2},members:[{issuerId:'i',market:'US',outcome:'done',counts:{compared_passed:2,compared_failed:0,not_compared:0}}],hooks:{retried:0,failed:0}};

describe('reconcile cron',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();process.env.CRON_SECRET='cron-secret';delete process.env.FACTS_CN_ENABLED;
  mocks.codeVersion.mockReturnValue('abc123');mocks.deps.mockReturnValue({tag:'deps'});mocks.run.mockResolvedValue(receipt);
 });
 afterEach(()=>{
  if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;
  if(originalCn===undefined)delete process.env.FACTS_CN_ENABLED;else process.env.FACTS_CN_ENABLED=originalCn;
 });
 it('fails closed without CRON_SECRET and rejects a wrong bearer before touching deps',async()=>{
  delete process.env.CRON_SECRET;
  expect((await GET(req('pair=facts.lineage_same_day',AUTH))).status).toBe(503);
  process.env.CRON_SECRET='cron-secret';
  expect((await GET(req('pair=facts.lineage_same_day',{authorization:'Bearer nope'}))).status).toBe(401);
  expect((await GET(req('pair=facts.lineage_same_day'))).status).toBe(401);
  expect(mocks.deps).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('requires exactly one registered cycle pair',async()=>{
  for(const qs of ['','pair=','pair=bogus','pair=sec.filer_category','pair=facts.lineage_same_day&pair=us.companyfacts_vs_gold']){
   const res=await GET(req(qs,AUTH));
   expect(res.status,qs).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:pair');
  }
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('answers 400 for a cycle pair that is not registered yet (US iXBRL until Task 15a) and does not run it',async()=>{
  const res=await GET(req('pair=us.companyfacts_vs_ixbrl',AUTH));
  expect(res.status).toBe(400);expect((await res.json()).error.code).toBe('invalid_parameter:pair');
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('refuses a registered CN pair with exactly 403 cn_disabled unless FACTS_CN_ENABLED=1, then runs it',async()=>{
  for(const v of [undefined,'0','true']){
   if(v===undefined)delete process.env.FACTS_CN_ENABLED;else process.env.FACTS_CN_ENABLED=v;
   const res=await GET(req('pair=cn.tushare_vs_cninfo_pdf_gold',AUTH));
   expect(res.status,String(v)).toBe(403);expect((await res.json()).error.code).toBe('cn_disabled');
  }
  expect(mocks.run).not.toHaveBeenCalled();expect(mocks.deps).not.toHaveBeenCalled();
  process.env.FACTS_CN_ENABLED='1';
  expect((await GET(req('pair=cn.tushare_vs_cninfo_pdf_gold',AUTH))).status).toBe(200);
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{pair:'cn.tushare_vs_cninfo_pdf_gold',triggeredBy:'cron'});
 });
 it('refuses to run without a code version',async()=>{
  mocks.codeVersion.mockReturnValue(null);
  const res=await POST(req('pair=facts.lineage_same_day',AUTH));
  expect(res.status).toBe(503);expect((await res.json()).error.code).toBe('code_version_unavailable');
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('runs the pair with a 240 s deadline and cron trigger; the body carries codes and counts only',async()=>{
  const before=Date.now();
  const res=await GET(req('pair=facts.lineage_same_day',AUTH));
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');
  const body=await res.json();
  expect(body).toMatchObject({ok:true,pair:'facts.lineage_same_day',receipt:{batchId:'b',status:'success',cycle:{cycleId:'c',status:'complete'}}});
  expect(body.receipt.errors).toEqual([{code:'skipped_summary',key:'x:US:claimed'}]);
  expect(JSON.stringify(body)).not.toContain('secret detail');
  expect(mocks.run).toHaveBeenCalledWith({tag:'deps'},{pair:'facts.lineage_same_day',triggeredBy:'cron'});
  const d=mocks.deps.mock.calls[0][0];
  expect(d.codeVersion).toBe('abc123');
  expect(d.deadline.getTime()-before).toBeGreaterThanOrEqual(240_000-50);expect(d.deadline.getTime()-before).toBeLessThan(241_000);
 });
 it('ok=false when the batch is not success; errors map to codes only',async()=>{
  mocks.run.mockResolvedValueOnce({...receipt,status:'partial'});
  expect((await (await GET(req('pair=us.companyfacts_vs_gold',AUTH))).json()).ok).toBe(false);
  mocks.run.mockRejectedValueOnce(new ReconcileError('pair_not_registered','details'));
  const res=await GET(req('pair=us.companyfacts_vs_gold',AUTH));
  expect(res.status).toBe(500);expect(await res.json()).toEqual({error:{code:'pair_not_registered',message:'Reconcile failed'}});
  mocks.run.mockRejectedValueOnce(new Error('boom'));
  expect((await (await GET(req('pair=us.companyfacts_vs_gold',AUTH))).json()).error.code).toBe('reconcile_failed');
 });
});
