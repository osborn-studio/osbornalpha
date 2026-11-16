// src/app/api/admin/documents/hk-quarantine/[id]/route.real.test.ts
// Task 17 review: the route over the REAL resolveHkFactsItem and memory table (only the database
// function behind the port is faked): accept validates the verdict before the function, reject is
// the plan-1 flip and leaves the fact rows alone.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),audit:vi.fn(),client:null as unknown,resolveFn:vi.fn(),factsByIds:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.client}));
vi.mock('@/lib/documents/hk-facts/facts-port',()=>({supabaseHkFactsPort:()=>({resolveHkFactsQuarantine:mocks.resolveFn,factsByIds:mocks.factsByIds})}));
vi.mock('@/lib/research/store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/research/store')>(),audit:mocks.audit}));

import {POST} from './route';

const ID='3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b',ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const A='20000000-0000-4000-8000-00000000000a',B='20000000-0000-4000-8000-00000000000b';
const post=(body:unknown)=>POST(new Request(`https://alpha.example/api/admin/documents/hk-quarantine/${ID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:ID})});
const item=()=>(mocks.client as ReturnType<typeof memoryTableClient>).select('dq_quarantine',{id:ID}).then(r=>r[0]);

describe('POST /api/admin/documents/hk-quarantine/[id] over the real resolver',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();
  const client=memoryTableClient({dq_quarantine:['id']});mocks.client=client;
  await client.insert('dq_quarantine',{id:ID,dataset:'facts.hk',table_name:'financial_facts',natural_key:'k',reason_code:'same_day_conflict',status:'open',payload:{fact_ids:[A,B]},detail:{}});
  mocks.requireAdmin.mockResolvedValue({id:ADMIN});mocks.getAdmin.mockReturnValue({});mocks.audit.mockResolvedValue(undefined);
  mocks.factsByIds.mockImplementation(async(ids:string[])=>ids.map(id=>({fact_id:id,value:id===A?'100':'100.0'})));
  mocks.resolveFn.mockImplementation(async(_i:string,chosen:string[])=>({promoted:chosen.length,skipped:0,chosenFactIds:chosen}));
 });
 it('reject: closes the item as resolved_reject without calling the promotion function; audited',async()=>{
  const res=await post({status:'resolved_reject'});
  expect(res.status).toBe(200);expect(await res.json()).toEqual({id:ID,outcome:'resolved'});
  expect(await item()).toMatchObject({status:'resolved_reject',resolved_by:ADMIN});
  expect(mocks.resolveFn).not.toHaveBeenCalled();
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({userId:ADMIN}),'dq.quarantine_resolve',ID,expect.objectContaining({status:'resolved_reject',outcome:'resolved'}));
  const again=await post({status:'resolved_reject'});
  expect(again.status).toBe(409);expect((await again.json()).outcome).toBe('already_resolved');
 });
 it('accept: a choice of two equal-valued members passes; a choice outside the members is 422 before the function',async()=>{
  const bad=await post({status:'resolved_accept',chosenFactIds:['30000000-0000-4000-8000-000000000000']});
  expect(bad.status).toBe(422);expect(mocks.resolveFn).not.toHaveBeenCalled();expect((await item())!.status).toBe('open');
  const ok=await post({status:'resolved_accept',chosenFactIds:[A,B]});
  expect(ok.status).toBe(200);expect(await ok.json()).toEqual({id:ID,outcome:'resolved',promoted:2,skipped:0,chosenFactIds:[A,B]});
  expect(mocks.resolveFn).toHaveBeenCalledWith(ID,[A,B],ADMIN);
 });
});
