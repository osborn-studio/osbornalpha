// src/app/api/admin/evals/[run_id]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),tables:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/db/table-client',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/table-client')>(),supabaseTableClient:()=>mocks.tables}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {RUN_A,SENTINEL,caseRow,evalTables,runRow} from '@/lib/evals/test-support/eval-rows';
import {GET} from './route';

const get=(id:string)=>GET(new Request(`https://alpha.example/api/admin/evals/${id}`),{params:Promise.resolve({run_id:id})});
const CASE_KEYS=['abs_diff','case_id','document_id','left_text','locator','reason','rel_diff','result','right_text','tolerance'];

describe('GET /api/admin/evals/[run_id]',()=>{
 beforeEach(async()=>{
  vi.clearAllMocks();
  const t=evalTables();await t.insert('dq_eval_runs',runRow());await t.insert('dq_eval_case_results',caseRow(RUN_A,'ZZEVA/revenue/2023'));mocks.tables=t;
  mocks.getAdmin.mockReturnValue({});
 });
 it('401 / 403 before constructing the admin client',async()=>{
  mocks.requireAdmin.mockRejectedValue(new AdminUnauthenticated());
  expect((await get(RUN_A)).status).toBe(401);
  mocks.requireAdmin.mockRejectedValue(new AdminForbidden());
  expect((await get(RUN_A)).status).toBe(403);
  expect(mocks.getAdmin).not.toHaveBeenCalled();
 });
 it('400 invalid_run_id (no db access); 404 run_not_found',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  const bad=await get('not-a-uuid');expect(bad.status).toBe(400);expect(await bad.json()).toEqual({error:'invalid_run_id'});
  expect(mocks.getAdmin).not.toHaveBeenCalled();
  const nf=await get('cccccccc-cccc-4ccc-8ccc-cccccccccccc');expect(nf.status).toBe(404);expect(await nf.json()).toEqual({error:'run_not_found'});
 });
 it('200: run + whitelisted cases; the 20-digit text value survives verbatim; sentinel absent',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  const t=mocks.tables as ReturnType<typeof evalTables>;
  await t.insert('dq_eval_case_results',caseRow(RUN_A,'ZZEVA/big',{left_text:'12345678901234567890',right_text:'12345678901234567891',abs_diff:'1'}));
  const r=await get(RUN_A.toUpperCase());
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('no-store');
  const raw=await r.text();
  expect(raw).not.toContain(SENTINEL);
  expect(raw).toContain('"left_text":"12345678901234567890"');
  const body=JSON.parse(raw);
  expect(Object.keys(body).sort()).toEqual(['case_total','cases','cases_truncated','run']);
  expect(body.run.run_id).toBe(RUN_A);
  for(const c of body.cases)expect(Object.keys(c).sort()).toEqual(CASE_KEYS);
 });
 it('500 generic with a log line',async()=>{
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});
  mocks.getAdmin.mockImplementation(()=>{throw new Error('no service role key');});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const r=await get(RUN_A);
  expect(r.status).toBe(500);expect(await r.json()).toEqual({error:'evals unavailable'});
  expect(spy).toHaveBeenCalledWith('[admin/evals/run]','no service role key');
  spy.mockRestore();
 });
});
