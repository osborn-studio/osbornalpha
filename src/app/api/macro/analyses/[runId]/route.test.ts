// GET /api/macro/analyses/[runId]: session + RLS own rows; private, no-store.
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),maybeSingle:vi.fn(),eq:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:vi.fn(async()=>({auth:{getUser:m.auth},from:m.from}))}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:vi.fn(()=>({}))}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:vi.fn(()=>({}))}));
import {GET} from './route';
const ID='9d0c1a8e-1f2b-4c3d-8e4f-5a6b7c8d9e0f';
const get=(id:string)=>GET(new Request(`https://x/api/macro/analyses/${id}`),{params:Promise.resolve({runId:id})});
describe('GET /api/macro/analyses/[runId]',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  m.auth.mockResolvedValue({data:{user:{id:'user-1'}}});
  m.eq.mockReturnValue({maybeSingle:m.maybeSingle});
  m.from.mockReturnValue({select:()=>({eq:m.eq})});
  m.maybeSingle.mockResolvedValue({data:{run_id:ID,status:'ok'},error:null});
 });
 it('400 for a non-uuid id, 401 without session',async()=>{
  expect((await get('abc')).status).toBe(400);
  m.auth.mockResolvedValue({data:{user:null}});expect((await get(ID)).status).toBe(401);
 });
 it('reads through the user client (RLS) and returns private, no-store',async()=>{
  const r=await get(ID);
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(m.from).toHaveBeenCalledWith('macro_analysis_runs');expect(m.eq).toHaveBeenCalledWith('run_id',ID);
  expect(await r.json()).toEqual({run:{run_id:ID,status:'ok'}});
 });
 it('someone else’s run is invisible under RLS → 404',async()=>{
  m.maybeSingle.mockResolvedValue({data:null,error:null});
  expect((await get(ID)).status).toBe(404);
 });
});
