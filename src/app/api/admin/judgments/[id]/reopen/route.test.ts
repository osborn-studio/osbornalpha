// src/app/api/admin/judgments/[id]/reopen/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {judgmentRow,uuidOf} from '@/lib/judgments/testing/envelopes';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getJudgment:vi.fn(),append:vi.fn(),insert:vi.fn(),tables:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({from:()=>({insert:mocks.insert})})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.tables}));
vi.mock('@/lib/judgments/db',()=>({supabaseJudgmentsDb:()=>({getJudgment:mocks.getJudgment,appendSettlement:mocks.append})}));
vi.mock('@/lib/judgments/deps',()=>({resolveCodeVersion:()=>'abc1234'}));

import {POST} from './route';

const ID=uuidOf(7),REQ='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const post=(body:unknown)=>POST(new Request(`https://alpha.example/api/admin/judgments/${ID}/reopen`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:ID})});

describe('POST /api/admin/judgments/[id]/reopen',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.tables=memoryTableClient({ingest_batches:['batch_id']});
  mocks.requireAdmin.mockResolvedValue({id:'9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'});
  mocks.getJudgment.mockResolvedValue(judgmentRow({n:7}));
  mocks.append.mockResolvedValue({seq:3,status:'applied'});
  mocks.insert.mockResolvedValue({error:null});
 });
 it('appends reopened with the reason and audits judgments.reopen',async()=>{
  const res=await post({reason:'data fixed',request_id:REQ});
  expect(res.status).toBe(200);
  expect(mocks.append.mock.calls[0][3]).toMatchObject({kind:'reopened',reason:'data fixed',evidence:{admin_action:'reopened'}});
  expect(mocks.insert.mock.calls[0][0]).toMatchObject({action:'judgments.reopen',object_id:ID});
 });
 it('reason is required',async()=>{expect((await post({request_id:REQ})).status).toBe(400);expect(mocks.append).not.toHaveBeenCalled();});
});
