// src/app/api/admin/documents/hk-quarantine/[id]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),resolve:vi.fn(),audit:vi.fn(),client:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.client}));
vi.mock('@/lib/documents/hk-facts/facts-port',()=>({supabaseHkFactsPort:()=>({port:true})}));
vi.mock('@/lib/documents/hk-facts/resolve',()=>({resolveHkFactsItem:mocks.resolve}));
vi.mock('@/lib/research/store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/research/store')>(),audit:mocks.audit}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {POST} from './route';

const ID='3f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b',ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const F1='20000000-0000-4000-8000-00000000000a';
const post=(body:unknown,headers:Record<string,string>={'content-type':'application/json'},id=ID)=>POST(new Request(`https://alpha.example/api/admin/documents/hk-quarantine/${id}`,{method:'POST',headers,body:JSON.stringify(body)}),{params:Promise.resolve({id})});

describe('POST /api/admin/documents/hk-quarantine/[id]',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();
  const client=memoryTableClient({dq_quarantine:['id']});mocks.client=client;
  await client.insert('dq_quarantine',{id:ID,dataset:'facts.hk',table_name:'financial_facts',natural_key:'k',reason_code:'same_day_conflict',status:'open',payload:{fact_ids:[F1]},detail:{}});
  mocks.requireAdmin.mockResolvedValue({id:ADMIN});mocks.getAdmin.mockReturnValue({});mocks.audit.mockResolvedValue(undefined);
  mocks.resolve.mockResolvedValue({outcome:'resolved',promoted:1,skipped:0,chosenFactIds:[F1]});
 });
 it('accept: resolves through resolveHkFactsItem with the admin as resolver and audits',async()=>{
  const res=await post({status:'resolved_accept',chosenFactIds:[F1]});
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(await res.json()).toEqual({id:ID,outcome:'resolved',promoted:1,skipped:0,chosenFactIds:[F1]});
  expect(mocks.resolve).toHaveBeenCalledWith({port:true},mocks.client,expect.objectContaining({id:ID}),{status:'resolved_accept',chosenFactIds:[F1],resolvedBy:ADMIN});
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({userId:ADMIN}),'dq.quarantine_resolve',ID,expect.objectContaining({route:'hk-quarantine',status:'resolved_accept',outcome:'resolved'}));
 });
 it('maps outcomes: run_pending 409, invalid_choice 422, not_hk_item 404, already_resolved 409; nothing audited',async()=>{
  for(const [outcome,status] of [['run_pending',409],['invalid_choice',422],['not_hk_item',404],['already_resolved',409]] as const){
   mocks.resolve.mockResolvedValueOnce({outcome});
   const res=await post({status:'resolved_accept'});
   expect(res.status,outcome).toBe(status);expect((await res.json()).outcome).toBe(outcome);
  }
  expect(mocks.audit).not.toHaveBeenCalled();
 });
 it('404 for an unknown item; 400 for bad id, status or chosenFactIds; chosenFactIds only with accept',async()=>{
  expect((await post({status:'resolved_accept'},{'content-type':'application/json'},'4f2b6c1e-8a4d-4f0e-9b7a-1c2d3e4f5a6b')).status).toBe(404);
  expect((await post({status:'resolved_accept'},{'content-type':'application/json'},'nope')).status).toBe(400);
  expect((await post({status:'open'})).status).toBe(400);
  expect((await post({status:'resolved_accept',chosenFactIds:['x']})).status).toBe(400);
  expect((await post({status:'resolved_reject',chosenFactIds:[F1]})).status).toBe(400);
  expect(mocks.resolve).not.toHaveBeenCalled();
 });
 it('401 / 403 from the admin guard before touching the database',async()=>{
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));expect((await post({status:'resolved_reject'})).status).toBe(401);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));expect((await post({status:'resolved_reject'})).status).toBe(403);
  expect(mocks.resolve).not.toHaveBeenCalled();
 });
 it('415 / 403 write guards',async()=>{
  expect((await post({status:'resolved_reject'},{'content-type':'text/plain'})).status).toBe(415);
  expect((await post({status:'resolved_reject'},{'content-type':'application/json',origin:'https://evil.example'})).status).toBe(403);
 });
});
