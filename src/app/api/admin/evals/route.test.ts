// src/app/api/admin/evals/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),tables:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.tables}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {RUN_A,SENTINEL,evalTables,runRow} from '@/lib/evals/test-support/eval-rows';
import {GET} from './route';

const get=(qs='')=>GET(new Request(`https://alpha.example/api/admin/evals${qs}`));

describe('GET /api/admin/evals',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();
  const t=evalTables();await t.insert('dq_eval_runs',runRow());mocks.tables=t;
  mocks.getAdmin.mockReturnValue({});
 });
 it('401 / 403 before constructing the admin client',async()=>{
  mocks.requireAdmin.mockRejectedValue(new AdminUnauthenticated());
  const a=await get();expect(a.status).toBe(401);expect(await a.json()).toEqual({error:'authentication required'});
  mocks.requireAdmin.mockRejectedValue(new AdminForbidden());
  const b=await get();expect(b.status).toBe(403);expect(await b.json()).toEqual({error:'admin role required'});
  expect(mocks.getAdmin).not.toHaveBeenCalled();
 });
 it('400 on an invalid query, before constructing the admin client',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  for(const [qs,error] of [['?limit=0','invalid_limit'],['?module=bonds','invalid_module'],['?kind=x','invalid_kind']]){
   const r=await get(qs);expect(r.status).toBe(400);expect(await r.json()).toEqual({error});
  }
  expect(mocks.getAdmin).not.toHaveBeenCalled();
 });
 it('200: whitelisted list, no-store, sentinel absent from the body and the logs',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  const logs=[vi.spyOn(console,'log').mockImplementation(()=>{}),vi.spyOn(console,'error').mockImplementation(()=>{}),vi.spyOn(console,'warn').mockImplementation(()=>{})];
  const r=await get('?limit=5&module=facts');
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('no-store');
  const raw=await r.text();
  expect(raw).not.toContain(SENTINEL);
  const body=JSON.parse(raw);
  expect(Object.keys(body).sort()).toEqual(['gate_failing_30d','refreshed_at','runs']);
  expect(body.runs.map((x:{run_id:string})=>x.run_id)).toEqual([RUN_A]);
  for(const s of logs){for(const call of s.mock.calls)expect(JSON.stringify(call)).not.toContain(SENTINEL);s.mockRestore();}
 });
 it('500: logs the message and returns a generic error',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  mocks.getAdmin.mockImplementation(()=>{throw new Error('no service role key');});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const r=await get();
  expect(r.status).toBe(500);
  expect(await r.json()).toEqual({error:'evals unavailable'});
  expect(spy).toHaveBeenCalledWith('[admin/evals]','no service role key');
  spy.mockRestore();
 });
});
