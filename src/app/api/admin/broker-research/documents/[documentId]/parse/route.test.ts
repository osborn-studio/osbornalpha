// Admin parse route guards and service status mapping (spec §6.2/§8.2).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {F3Timeout,fakeF3Port} from '@/lib/broker-research/ports/f3';
import {ADMIN_ID,memoryBrokerDeps,seedDocument,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryDeps} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,jsonReq} from '@/lib/broker-research/route-testing';
const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',async(orig)=>({...await orig<typeof import('@/lib/broker-research/deps')>(),coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {POST} from './route';
describe('POST documents/[documentId]/parse',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{vi.clearAllMocks();d=memoryBrokerDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 const url=(id:string)=>`/api/admin/broker-research/documents/${id}/parse`;
 adminGuardCases({call:r=>POST(r,ctxOf({documentId:'00000000-0000-4000-8000-000000000001'})),request:()=>jsonReq(url('x'),{}),requireAdmin:mocks.requireAdmin,post:true});
 it('200 success, 409 held, 502 failed run, 404 unknown',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);const ctx=ctxOf({documentId:doc.document_id});
  const ok=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(ok.status).toBe(200);expect(await bodyOf(ok)).toMatchObject({status:'succeeded'});
  await d.db.claimLease(doc.document_id,'someone',300);
  const held=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(held.status).toBe(409);expect(await errCode(held)).toBe('lease_held');
  d.advance(301_000);d.f3=fakeF3Port(()=>new F3Timeout());
  const failed=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(failed.status).toBe(502);expect(await errCode(failed)).toBe('f3_timeout');
  const missing='00000000-0000-4000-8000-0000000000ff';
  expect((await POST(jsonReq(url(missing),{}),ctxOf({documentId:missing}))).status).toBe(404);
 });
 it('410 withdrawn and no-store',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  await d.db.updateDocument(doc.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'x'});
  const r=await POST(jsonReq(url(doc.document_id),{}),ctxOf({documentId:doc.document_id}));
  expect(r.status).toBe(410);expect(r.headers.get('cache-control')).toBe('no-store');
 });
});
