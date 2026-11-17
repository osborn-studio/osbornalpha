// src/app/api/cron/broker-research-crons.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({verify:vi.fn(),deliver:vi.fn(),codeVersion:vi.fn(),f4:vi.fn()}));
vi.mock('@/lib/broker-research/verify',async(orig)=>({...await orig<typeof import('@/lib/broker-research/verify')>(),runVerify:mocks.verify}));
vi.mock('@/lib/broker-research/outbox',async(orig)=>({...await orig<typeof import('@/lib/broker-research/outbox')>(),deliverOutbox:mocks.deliver}));
vi.mock('@/lib/broker-research/ports/f4',async(orig)=>({...await orig<typeof import('@/lib/broker-research/ports/f4')>(),productionF4Port:mocks.f4}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/broker-research/db',()=>({supabaseBrokerResearchDb:()=>({tag:'db'})}));
vi.mock('@/lib/broker-research/storage',()=>({supabaseBrokerStorage:()=>({tag:'storage'})}));
vi.mock('@/lib/db/table-client',async(orig)=>({...await orig<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>({tag:'tables'})}));
import {GET as verifyGET,POST as verifyPOST} from './broker-research-verify/route';
import {GET as outboxGET} from './broker-research-outbox/route';

const AUTH={authorization:'Bearer s3cret'};
const req=(path:string,h:Record<string,string>={})=>new Request(`https://alpha.example/api/cron/${path}`,{headers:h});
const original=process.env.CRON_SECRET;
beforeEach(()=>{vi.clearAllMocks();process.env.CRON_SECRET='s3cret';mocks.codeVersion.mockReturnValue('abc123');
 mocks.verify.mockResolvedValue({batchId:'b',status:'success',checked:0,remaining:0,results:[],freshness:'fresh',orphansRemoved:0,writesReconciled:0});
 mocks.deliver.mockResolvedValue({skipped:'f4_disabled',taken:0,delivered:0,failed:0});mocks.f4.mockReturnValue({enabled:false});});
afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;});

describe('cron auth (both routes)',()=>{
 it('503 without CRON_SECRET, 401 on a wrong bearer, nothing runs',async()=>{
  delete process.env.CRON_SECRET;
  for(const r of [await verifyGET(req('broker-research-verify',AUTH)),await outboxGET(req('broker-research-outbox',AUTH))]){expect(r.status).toBe(503);expect(r.headers.get('Cache-Control')).toBe('no-store');}
  process.env.CRON_SECRET='s3cret';
  expect((await verifyGET(req('broker-research-verify',{authorization:'Bearer no'}))).status).toBe(401);
  expect((await outboxGET(req('broker-research-outbox'))).status).toBe(401);
  expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.deliver).not.toHaveBeenCalled();
 });
});

describe('verify cron',()=>{
 it('refuses without a code version',async()=>{mocks.codeVersion.mockReturnValue(null);expect((await verifyPOST(req('broker-research-verify',AUTH))).status).toBe(503);});
 it('runs with a 250 s budget, cron trigger and freshness recording',async()=>{
  const before=Date.now();
  const res=await verifyGET(req('broker-research-verify',AUTH));
  expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');
  const [deps,opts]=mocks.verify.mock.calls[0];
  expect(deps).toMatchObject({db:{tag:'db'},storage:{tag:'storage'},tables:{tag:'tables'},codeVersion:'abc123'});
  expect(opts).toMatchObject({triggeredBy:'cron',recordFreshness:true});expect(opts.restore).toBeUndefined();
  expect(opts.deadline.getTime()-before).toBeGreaterThanOrEqual(249_000);expect(opts.deadline.getTime()-before).toBeLessThanOrEqual(251_000);
  expect(await res.json()).toMatchObject({ok:true,receipt:{batchId:'b',checked:0}});
 });
 it('500 with a code only when the run throws',async()=>{
  mocks.verify.mockRejectedValue(new Error('secret detail'));
  const res=await verifyGET(req('broker-research-verify',AUTH));
  expect(res.status).toBe(500);expect(JSON.stringify(await res.json())).not.toContain('secret detail');
 });
});

describe('outbox cron',()=>{
 it('F4 unset → skipped, events untouched',async()=>{
  const res=await outboxGET(req('broker-research-outbox',AUTH));
  expect(res.status).toBe(200);expect(await res.json()).toMatchObject({ok:true,receipt:{skipped:'f4_disabled'}});
  expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({f4:{enabled:false}}),expect.objectContaining({limit:50}));
 });
});
