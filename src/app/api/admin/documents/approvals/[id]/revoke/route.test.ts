// src/app/api/admin/documents/approvals/[id]/revoke/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),revoke:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/documents/db',()=>({supabaseDocumentsDb:()=>({revokeApproval:mocks.revoke})}));
vi.mock('@/lib/research/store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/research/store')>(),audit:mocks.audit}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {DocumentsDbError} from '@/lib/documents/types';
import {POST} from './route';

const ID='b0000000-0000-4000-8000-000000000001',ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const post=(headers:Record<string,string>={'content-type':'application/json'},id=ID)=>POST(new Request(`https://alpha.example/api/admin/documents/approvals/${id}/revoke`,{method:'POST',headers,body:'{}'}),{params:Promise.resolve({id})});

describe('POST /api/admin/documents/approvals/[id]/revoke',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.requireAdmin.mockResolvedValue({id:ADMIN});mocks.getAdmin.mockReturnValue({});mocks.revoke.mockResolvedValue(true);mocks.audit.mockResolvedValue(undefined);});
 it('revokes, audits, private no-store',async()=>{
  const res=await post();
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(await res.json()).toEqual({approvalId:ID,revoked:true,alreadyRevoked:false});
  expect(mocks.revoke).toHaveBeenCalledWith(ID);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({userId:ADMIN}),'document.approval_revoke',ID,{approval_id:ID});
 });
 it('a repeat revoke reports alreadyRevoked and writes no audit row',async()=>{
  mocks.revoke.mockResolvedValueOnce(false);
  const res=await post();
  expect(res.status).toBe(200);expect(await res.json()).toEqual({approvalId:ID,revoked:true,alreadyRevoked:true});
  expect(mocks.audit).not.toHaveBeenCalled();
 });
 it('404 unknown approval, 400 bad id, 415 / 403 write guards',async()=>{
  mocks.revoke.mockRejectedValueOnce(new DocumentsDbError('not_found'));
  expect((await post()).status).toBe(404);
  expect((await post({'content-type':'application/json'},'nope')).status).toBe(400);
  expect((await post({'content-type':'text/plain'})).status).toBe(415);
  expect((await post({'content-type':'application/json',origin:'https://evil.example'})).status).toBe(403);
  expect(mocks.audit).not.toHaveBeenCalled();
 });
 it('401 / 403 from the admin guard before touching the database',async()=>{
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));expect((await post()).status).toBe(401);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));expect((await post()).status).toBe(403);
  expect(mocks.revoke).not.toHaveBeenCalled();
 });
});
