// src/app/api/admin/documents/candidates/regenerate/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),regen:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/documents/db',()=>({supabaseDocumentsDb:()=>({requestCandidatesRegen:mocks.regen})}));
vi.mock('@/lib/research/store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/research/store')>(),audit:mocks.audit}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {POST} from './route';

const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',ISS='a0000000-0000-4000-8000-000000000001';
const post=(body:unknown,headers:Record<string,string>={'content-type':'application/json'})=>POST(new Request('https://alpha.example/api/admin/documents/candidates/regenerate',{method:'POST',headers,body:JSON.stringify(body)}));

describe('POST /api/admin/documents/candidates/regenerate',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.requireAdmin.mockResolvedValue({id:ADMIN});mocks.getAdmin.mockReturnValue({});mocks.regen.mockResolvedValue(3);mocks.audit.mockResolvedValue(undefined);});
 it('requests regeneration for the filter and audits it',async()=>{
  const res=await post({filter:{source:'hkexnews',issuer_id:ISS}});
  expect(res.status).toBe(200);expect(await res.json()).toEqual({requested:3});
  expect(mocks.regen).toHaveBeenCalledWith({source:'hkexnews',issuer_id:ISS},ADMIN);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({userId:ADMIN}),'document.candidates_regenerate',null,{filter:{source:'hkexnews',issuer_id:ISS},requested:3});
 });
 it('an empty filter needs an explicit all:true (every eligible version); all:true with filter keys is refused',async()=>{
  const bare=await post({filter:{}});expect(bare.status).toBe(400);expect(await bare.json()).toEqual({error:'filter_required'});
  expect(mocks.regen).not.toHaveBeenCalled();
  expect((await post({filter:{},all:true})).status).toBe(200);expect(mocks.regen).toHaveBeenCalledWith({},ADMIN);
  expect((await post({filter:{source:'edgar'},all:true})).status).toBe(400);
  expect((await post({filter:{},all:'yes'})).status).toBe(400);
  expect(mocks.regen).toHaveBeenCalledTimes(1);
 });
 it('401 / 403 from the admin guard before touching the database',async()=>{
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));expect((await post({filter:{source:'edgar'}})).status).toBe(401);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));expect((await post({filter:{source:'edgar'}})).status).toBe(403);
  expect(mocks.regen).not.toHaveBeenCalled();
 });
 it('rejects malformed filters and non-JSON requests',async()=>{
  for(const body of [{},{filter:null},{filter:{source:'upload'}},{filter:{issuer_id:'x'}},{filter:{document_id:1}},{filter:{other:1}}])expect((await post(body)).status,JSON.stringify(body)).toBe(400);
  expect((await post({filter:{}},{'content-type':'text/plain'})).status).toBe(415);
  expect(mocks.regen).not.toHaveBeenCalled();
 });
});
