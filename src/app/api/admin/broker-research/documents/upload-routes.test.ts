// Admin upload route guard, validation, and logged signed-read tests (spec §6.1, §8.2).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {brokerPaths} from '@/lib/broker-research/storage';
import {ADMIN_ID,memoryCoreDeps,seedDocument,seedLicence,sha256,syntheticPdf} from '@/lib/broker-research/testing';
import type {MemoryCore} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,getReq,jsonReq} from '@/lib/broker-research/route-testing';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',()=>({coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {POST as INTENT} from './intent/route';
import {POST as COMMIT} from './commit/route';
import {POST as CLEANUP} from './orphan-cleanup/route';
import {GET as URL_} from './[documentId]/url/route';

const B='/api/admin/broker-research/documents';
describe('upload routes',()=>{
 let d:MemoryCore;
 beforeEach(()=>{vi.clearAllMocks();d=memoryCoreDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});});
 const pdf=syntheticPdf('route');
 const intentBody=(licence_id:string)=>({sha256:sha256(pdf),byte_size:pdf.byteLength,licence_id,original_filename:'r.pdf'});
 adminGuardCases({call:(r)=>INTENT(r,{}),request:()=>jsonReq(`${B}/intent`,{}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>COMMIT(r,{}),request:()=>jsonReq(`${B}/commit`,{}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>CLEANUP(r,{}),request:()=>jsonReq(`${B}/orphan-cleanup`,{}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:(r)=>URL_(r,ctxOf({documentId:'00000000-0000-4000-8000-000000000001'})),request:()=>getReq(`${B}/x/url`),requireAdmin:mocks.requireAdmin,post:false});
 it('intent → commit → 409 duplicate_document on second intent',async()=>{
  const l=await seedLicence(d.db);
  const r=await INTENT(jsonReq(`${B}/intent`,intentBody(l.licence_id)),{});
  expect(r.status).toBe(201);const i=await bodyOf<{intentId:string;token:string;uploadUrl:string}>(r);
  d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,pdf);
  const c=await COMMIT(jsonReq(`${B}/commit`,{intentId:i.intentId}),{});
  expect(c.status).toBe(200);expect(await bodyOf(c)).toEqual({documentId:i.intentId,status:'committed'});
  const dup=await INTENT(jsonReq(`${B}/intent`,intentBody(l.licence_id)),{});
  expect(dup.status).toBe(409);expect(await bodyOf(dup)).toMatchObject({error:{code:'duplicate_document',documentId:i.intentId}});
 });
 it('400 malformed intent; 422 not_pdf on commit',async()=>{
  const l=await seedLicence(d.db);
  expect((await INTENT(jsonReq(`${B}/intent`,{...intentBody(l.licence_id),sha256:'xyz'}),{})).status).toBe(400);
  const txt=new TextEncoder().encode('hello');
  const i=await bodyOf<{intentId:string;token:string}>(await INTENT(jsonReq(`${B}/intent`,{sha256:sha256(txt),byte_size:txt.byteLength,licence_id:l.licence_id,original_filename:'x.pdf'}),{}));
  d.storage.putSigned(brokerPaths.staging(i.intentId),i.token,txt);
  const c=await COMMIT(jsonReq(`${B}/commit`,{intentId:i.intentId}),{});
  expect(c.status).toBe(422);expect(await errCode(c)).toBe('not_pdf');
 });
 it('★ URL logs before no-store response; withdrawal 410; log failure 500 without URL',async()=>{
  const l=await seedLicence(d.db),doc=await seedDocument(d,l.licence_id),ctx=ctxOf({documentId:doc.document_id});
  const ok=await URL_(getReq(`${B}/${doc.document_id}/url`),ctx);
  expect(ok.status).toBe(200);expect(ok.headers.get('cache-control')).toBe('no-store');
  expect((await bodyOf<{url:string}>(ok)).url).toContain(doc.storage_path);
  expect((await d.db.listAccessLog({documentId:doc.document_id,limit:5})).map(r=>r.action)).toEqual(['signed_url_issued']);
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.spyOn(d.db,'logAccess').mockRejectedValueOnce(new Error('log down'));
  const failed=await URL_(getReq(`${B}/${doc.document_id}/url`),ctx);
  expect(failed.status).toBe(500);const t=await failed.text();expect(t).toContain('access_log_failed');expect(t).not.toContain('memory://');
  spy.mockRestore();
  await d.db.updateDocument(doc.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'test'});
  const w=await URL_(getReq(`${B}/${doc.document_id}/url`),ctx);
  expect(w.status).toBe(410);expect(await errCode(w)).toBe('document_withdrawn');
 });
 it('orphan cleanup answers counts',async()=>{
  const r=await CLEANUP(jsonReq(`${B}/orphan-cleanup`,{}),{});
  expect(r.status).toBe(200);expect(await bodyOf(r)).toEqual({removed:[],kept:0});
 });
});
