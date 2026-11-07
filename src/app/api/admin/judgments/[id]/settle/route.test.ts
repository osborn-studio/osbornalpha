// src/app/api/admin/judgments/[id]/settle/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),settleNow:vi.fn(),deps:vi.fn(),insert:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({from:()=>({insert:mocks.insert})})}));
vi.mock('@/lib/judgments/settle',()=>({settleNow:mocks.settleNow}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234',productionJudgmentDeps:mocks.deps}));

import {POST} from './route';

const ID='00000000-0000-4000-8000-000000000007',REQ='cccccccc-cccc-4ccc-8ccc-cccccccccccc',ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const post=(body:unknown)=>POST(new Request(`https://alpha.example/api/admin/judgments/${ID}/settle`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:ID})});

describe('POST /api/admin/judgments/[id]/settle',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({id:ADMIN});
  mocks.deps.mockReturnValue({tag:'deps'});
  mocks.settleNow.mockResolvedValue({outcome:'settled',seq:1,reason:null,batchId:'b'});
  mocks.insert.mockResolvedValue({error:null});
 });
 it('runs settleNow for one judgment as admin with a bounded signal, audits, reason optional',async()=>{
  const res=await post({request_id:REQ});
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({codeVersion:'abc1234',id:ID,outcome:'settled',seq:1});
  expect(mocks.settleNow).toHaveBeenCalledWith({tag:'deps'},ID,{actor:`admin:${ADMIN}`,requestKey:`admin:${REQ}`});
  const d=mocks.deps.mock.calls[0][0];
  expect(d).toMatchObject({codeVersion:'abc1234',actor:'script',triggeredBy:'manual'});expect(d.signal).toBeInstanceOf(AbortSignal);
  expect(mocks.insert.mock.calls[0][0]).toMatchObject({action:'judgments.settle',object_id:ID});
 });
 it.each([
  ['settled',200],['void',200],['duplicate',200],['deferred',200],['quarantined',200],
  ['quarantine_pending',200],['closed',200],['leased',409],['conflict',409],
 ])('maps outcome %s to HTTP %i',async(outcome,status)=>{
  mocks.settleNow.mockResolvedValueOnce({outcome,seq:null,reason:null,batchId:null});
  const res=await post({request_id:REQ});
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toBe('no-store');
  if(status===200)expect(await res.json()).toMatchObject({outcome,seq:null});
 });
 it('maps unknown_judgment → 404; leased / conflict / settlement_sequence / lease_lost → 409; deferred is 200 with seq null',async()=>{
  mocks.settleNow.mockRejectedValueOnce(Object.assign(new Error('x'),{code:'unknown_judgment'}));
  expect((await post({request_id:REQ})).status).toBe(404);
  mocks.settleNow.mockRejectedValueOnce(new Error('lease_lost'));
  expect((await post({request_id:REQ})).status).toBe(409);
  mocks.settleNow.mockResolvedValueOnce({outcome:'leased',seq:null,reason:'lease_held',batchId:null});
  expect((await post({request_id:REQ})).status).toBe(409);
  mocks.settleNow.mockResolvedValueOnce({outcome:'conflict',seq:2,reason:null,batchId:'b'});
  expect((await post({request_id:REQ})).status).toBe(409);
  mocks.settleNow.mockResolvedValueOnce({outcome:'deferred',seq:null,reason:'not_reported',batchId:null});
  const deferred=await post({request_id:REQ});
  expect(deferred.status).toBe(200);expect(await deferred.json()).toMatchObject({outcome:'deferred',seq:null});
 });
});
