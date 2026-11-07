// Admin extraction route guards and response mapping (spec §8.2).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {recordedLlmPort} from '@/lib/broker-research/ports/llm';
import {runParse} from '@/lib/broker-research/parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryDeps} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,jsonReq} from '@/lib/broker-research/route-testing';
const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',async(orig)=>({...await orig<typeof import('@/lib/broker-research/deps')>(),coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {POST} from './route';
describe('POST documents/[documentId]/extract',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{vi.clearAllMocks();d=memoryBrokerDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 const url=(id:string)=>`/api/admin/broker-research/documents/${id}/extract`;
 adminGuardCases({call:r=>POST(r,ctxOf({documentId:'00000000-0000-4000-8000-000000000001'})),request:()=>jsonReq(url('x'),{}),requireAdmin:mocks.requireAdmin,post:true});
 it('maps unparsed, successful and invalid-schema runs',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id),ctx=ctxOf({documentId:doc.document_id});
  const np=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(np.status).toBe(409);expect(await errCode(np)).toBe('document_not_parsed');
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const ok=await POST(jsonReq(url(doc.document_id),{}),ctx);expect(ok.status).toBe(200);expect(await bodyOf(ok)).toMatchObject({status:'succeeded'});
  d.llm=recordedLlmPort(['x','y']);const bad=await POST(jsonReq(url(doc.document_id),{}),ctx);
  expect(bad.status).toBe(502);expect(await errCode(bad)).toBe('llm_schema_invalid');
 });
 it('blocks processing after a material licence change',async()=>{
  const l=await seedLicence(d.db),doc=await seedDocument(d,l.licence_id);
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});await d.db.updateLicence(l.licence_id,{allows_public_snippets:false});
  const r=await POST(jsonReq(url(doc.document_id),{}),ctxOf({documentId:doc.document_id}));
  expect(r.status).toBe(409);expect(await errCode(r)).toBe('licence_forbids_processing');
 });
});
