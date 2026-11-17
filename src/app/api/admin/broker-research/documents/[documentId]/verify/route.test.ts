// src/app/api/admin/broker-research/documents/[documentId]/verify/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ADMIN_ID,memoryCoreDeps,seedDocument,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryCore} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',()=>({coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {POST} from './route';

const ID='00000000-0000-4000-8000-0000000000aa';
const call=(id:string)=>POST(jsonReq(`/api/admin/broker-research/documents/${id}/verify`,{}),ctxOf({documentId:id}));
describe('POST documents/[documentId]/verify',()=>{
 let d:MemoryCore;
 beforeEach(()=>{vi.clearAllMocks();d=memoryCoreDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 adminGuardCases({call:(r)=>POST(r,ctxOf({documentId:ID})),request:()=>jsonReq(`/api/admin/broker-research/documents/${ID}/verify`,{}),requireAdmin:mocks.requireAdmin,post:true});
 it('400 bad id, 404 unknown, 409 not_published for a document without a published report',async()=>{
  const bad=await call('nope');expect(bad.status).toBe(400);expect(await errCode(bad)).toBe('invalid_parameter:documentId');
  const missing=await call(ID);expect(missing.status).toBe(404);
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  const r=await call(doc.document_id);expect(r.status).toBe(409);expect(await errCode(r.clone())).toBe('not_published');
  expect(await bodyOf(r)).toMatchObject({error:{code:'not_published'}});
 });
});
