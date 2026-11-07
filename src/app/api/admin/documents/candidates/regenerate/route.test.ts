// src/app/api/admin/documents/candidates/regenerate/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),regen:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/documents/db',()=>({supabaseDocumentsDb:()=>({requestCandidatesRegen:mocks.regen})}));
vi.mock('@/lib/research/store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/research/store')>(),audit:mocks.audit}));

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
 it('an empty filter means every eligible version',async()=>{
  await post({filter:{}});expect(mocks.regen).toHaveBeenCalledWith({},ADMIN);
 });
 it('rejects malformed filters and non-JSON requests',async()=>{
  for(const body of [{},{filter:null},{filter:{source:'upload'}},{filter:{issuer_id:'x'}},{filter:{document_id:1}},{filter:{other:1}}])expect((await post(body)).status,JSON.stringify(body)).toBe(400);
  expect((await post({filter:{}},{'content-type':'text/plain'})).status).toBe(415);
  expect(mocks.regen).not.toHaveBeenCalled();
 });
});
