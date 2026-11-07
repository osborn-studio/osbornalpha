// src/app/api/admin/judgments/[id]/withdraw/route.test.ts
// Also covers the shared admin-actions core used by …/reopen (reopen/route.test.ts checks its kind).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {judgmentRow,uuidOf} from '@/lib/judgments/testing/envelopes';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getJudgment:vi.fn(),append:vi.fn(),insert:vi.fn(),from:vi.fn(),tables:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({from:mocks.from})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.tables}));
vi.mock('@/lib/judgments/db',()=>({supabaseJudgmentsDb:()=>({getJudgment:mocks.getJudgment,appendSettlement:mocks.append})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {POST} from './route';
import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';

const ID=uuidOf(7),REQ='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const post=(body:unknown,headers:Record<string,string>={'content-type':'application/json'},id=ID)=>
 POST(new Request(`https://alpha.example/api/admin/judgments/${id}/withdraw`,{method:'POST',headers,body:JSON.stringify(body)}),{params:Promise.resolve({id})});

describe('POST /api/admin/judgments/[id]/withdraw',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.tables=memoryTableClient({ingest_batches:['batch_id']});
  mocks.requireAdmin.mockResolvedValue({id:ADMIN});
  mocks.getJudgment.mockResolvedValue(judgmentRow({n:7}));
  mocks.append.mockResolvedValue({seq:2,status:'applied'});
  mocks.insert.mockResolvedValue({error:null});
  mocks.from.mockReturnValue({insert:mocks.insert});
 });
 it('appends withdrawn with lease null, actor admin:<uuid>, request key admin:<request_id>, a manual batch, and audits',async()=>{
  const res=await post({reason:'label error',request_id:REQ},{'content-type':'application/json',origin:'https://alpha.example'});
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await res.json()).toEqual({codeVersion:'abc1234',id:ID,outcome:'applied',seq:2});
  const [jid,token,key,row]=mocks.append.mock.calls[0];
  expect([jid,token,key]).toEqual([ID,null,`admin:${REQ}`]);
  expect(row).toMatchObject({kind:'withdrawn',outcome:null,realized:null,evidence:{admin_action:'withdrawn'},resolver:'fact_metric',resolver_version:'admin',reason:'label error',actor:`admin:${ADMIN}`,code_version:'abc1234'});
  const [batch]=await (mocks.tables as ReturnType<typeof memoryTableClient>).select('ingest_batches',{batch_id:row.batch_id});
  expect(batch).toMatchObject({dataset:'judgments.settle',triggered_by:'manual',status:'success',counts:expect.objectContaining({fetched:1,versioned:1})});
  expect(mocks.from).toHaveBeenCalledWith('research_audit_log');
  expect(mocks.insert.mock.calls[0][0]).toMatchObject({user_id:ADMIN,action:'judgments.withdraw',object_type:'judgments',object_id:ID,detail:{kind:'withdrawn',reason:'label error',request_id:REQ,outcome:'applied',seq:2}});
 });
 it('a retried request with the same payload is already_applied (200); a conflicting one is 409',async()=>{
  mocks.append.mockResolvedValueOnce({seq:2,status:'already_applied'});
  const r1=await post({reason:'label error',request_id:REQ});
  expect(r1.status).toBe(200);expect((await r1.json()).outcome).toBe('already_applied');
  mocks.append.mockResolvedValueOnce({seq:2,status:'request_key_conflict'});
  const r2=await post({reason:'other',request_id:REQ});
  expect(r2.status).toBe(409);expect((await r2.json()).error.code).toBe('request_key_conflict');
 });
 it('an illegal transition is 409 settlement_sequence and the batch records the failure',async()=>{
  mocks.append.mockRejectedValueOnce(Object.assign(new Error('23514 settlement_sequence'),{code:'settlement_sequence'}));
  const res=await post({reason:'x',request_id:REQ});
  expect(res.status).toBe(409);expect((await res.json()).error.code).toBe('settlement_sequence');
  const [batch]=await (mocks.tables as ReturnType<typeof memoryTableClient>).select('ingest_batches',{});
  expect(batch).toMatchObject({status:'failed',errors:[{code:'settlement_sequence',key:ID}]});
  expect(mocks.insert).not.toHaveBeenCalled();
 });
 it('404 unknown_judgment; 400 for id, reason and request_id; 415 and 403 for the transport checks',async()=>{
  mocks.getJudgment.mockResolvedValueOnce(null);
  expect((await post({reason:'x',request_id:REQ})).status).toBe(404);
  expect((await (await post({reason:'x',request_id:REQ},undefined,'bad')).json()).error.code).toBe('invalid_parameter:id');
  expect((await (await post({request_id:REQ})).json()).error.code).toBe('invalid_parameter:reason');
  expect((await (await post({reason:' ',request_id:REQ})).json()).error.code).toBe('invalid_parameter:reason');
  expect((await (await post({reason:'x'.repeat(501),request_id:REQ})).json()).error.code).toBe('invalid_parameter:reason');
  expect((await (await post({reason:'x',request_id:'nope'})).json()).error.code).toBe('invalid_parameter:request_id');
  expect((await post({reason:'x',request_id:REQ},{'content-type':'text/plain'})).status).toBe(415);
  expect((await post({reason:'x',request_id:REQ},{'content-type':'application/json',origin:'https://evil.example'})).status).toBe(403);
  expect(mocks.append).not.toHaveBeenCalled();
 });
 it('401 / 403 from requireAdminUser before anything else',async()=>{
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));
  expect((await post({reason:'x',request_id:REQ})).status).toBe(401);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));
  expect((await post({reason:'x',request_id:REQ})).status).toBe(403);
  expect(mocks.getJudgment).not.toHaveBeenCalled();
 });
 it('an audit failure is logged, not a 500',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  mocks.insert.mockResolvedValue({error:{message:'audit down'}});
  expect((await post({reason:'x',request_id:REQ})).status).toBe(200);
  expect(spy).toHaveBeenCalledWith('[admin/judgments] audit failed','audit down');
  spy.mockRestore();
 });
});
