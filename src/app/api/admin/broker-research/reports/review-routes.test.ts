// Admin review routes: logged private reads, guards and publish blockers (spec §8.2).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {runExtract} from '@/lib/broker-research/extract/run';
import {PAGES} from '@/lib/broker-research/fixtures/pipeline';
import {runParse} from '@/lib/broker-research/parse';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from '@/lib/broker-research/testing';
import type {MemoryDeps} from '@/lib/broker-research/testing';
import {adminGuardCases,bodyOf,ctxOf,errCode,getReq,jsonReq} from '@/lib/broker-research/route-testing';
const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),deps:null as unknown}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/broker-research/deps',async(orig)=>({...await orig<typeof import('@/lib/broker-research/deps')>(),coreDeps:()=>mocks.deps,brokerDeps:()=>mocks.deps}));
import {GET as REPORT} from './[reportId]/route';
import {GET as PAGE} from '../documents/[documentId]/pages/[n]/route';
import {POST as FIELD} from './[reportId]/fields/[fieldId]/route';
import {POST as ABSENT} from './[reportId]/fields/absent/route';
import {POST as PUBLISH} from './[reportId]/publish/route';
import {GET as BLOCKERS} from './[reportId]/publish-blockers/route';
import {POST as REVIEW} from './[reportId]/review/route';
import {POST as RECHECK} from './[reportId]/disclosure-recheck/route';
const B='/api/admin/broker-research/reports',X='00000000-0000-4000-8000-000000000001';
describe('review routes',()=>{
 let d:MemoryDeps,reportId:string,documentId:string;
 beforeEach(async()=>{vi.clearAllMocks();d=memoryBrokerDeps();mocks.deps=d;mocks.requireAdmin.mockResolvedValue({id:ADMIN_ID});const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);documentId=doc.document_id;await runParse(d,documentId,ADMIN_ID,{deadline:DEADLINE()});reportId=(await runExtract(d,documentId,ADMIN_ID,{deadline:DEADLINE()})).reportId;});
 adminGuardCases({call:r=>REPORT(r,ctxOf({reportId:X})),request:()=>getReq(`${B}/${X}`),requireAdmin:mocks.requireAdmin,post:false});
 adminGuardCases({call:r=>FIELD(r,ctxOf({reportId:X,fieldId:X})),request:()=>jsonReq(`${B}/${X}/fields/${X}`,{action:'reject'}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:r=>PUBLISH(r,ctxOf({reportId:X})),request:()=>jsonReq(`${B}/${X}/publish`,{}),requireAdmin:mocks.requireAdmin,post:true});
 adminGuardCases({call:r=>RECHECK(r,ctxOf({reportId:X})),request:()=>jsonReq(`${B}/${X}/disclosure-recheck`,{}),requireAdmin:mocks.requireAdmin,post:true});
 it('logs before returning private review data, fails closed, and returns 410 for withdrawn documents',async()=>{
  const ok=await REPORT(getReq(`${B}/${reportId}`),ctxOf({reportId}));expect(ok.status).toBe(200);expect(ok.headers.get('cache-control')).toBe('no-store');expect((await bodyOf<{fields:unknown[]}>(ok)).fields.length).toBeGreaterThan(0);
  expect((await d.db.listAccessLog({documentId,limit:20})).filter(r=>r.action==='text_viewed')).toHaveLength(1);
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(d.db,'logAccess').mockRejectedValueOnce(new Error('down'));
  const f=await REPORT(getReq(`${B}/${reportId}`),ctxOf({reportId}));expect(f.status).toBe(500);expect(await f.text()).not.toContain('value_source_text');spy.mockRestore();
  await d.db.updateDocument(documentId,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'x'});expect((await REPORT(getReq(`${B}/${reportId}`),ctxOf({reportId}))).status).toBe(410);
 });
 it('rechecks disclosure after a licence change',async()=>{
  await d.db.updateLicence((await d.db.getDocument(documentId))!.licence_id,{allows_public_target_price:false});const r=await RECHECK(jsonReq(`${B}/${reportId}/disclosure-recheck`,{}),ctxOf({reportId}));
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(await bodyOf<{restored:boolean;failures:string[]}>(r)).toEqual({restored:true,failures:[]});
 });
 it('logs page text and rejects missing or malformed page numbers',async()=>{
  const ok=await PAGE(getReq(`/api/admin/broker-research/documents/${documentId}/pages/1`),ctxOf({documentId,n:'1'}));expect((await bodyOf<{text:string}>(ok)).text).toBe(PAGES[0]);
  expect((await PAGE(getReq('/x'),ctxOf({documentId,n:'9'}))).status).toBe(404);expect((await PAGE(getReq('/x'),ctxOf({documentId,n:'0'}))).status).toBe(400);
 });
 it('validates field action and confirms with a framed span',async()=>{
  const tp=(await d.db.listFields(reportId)).find(f=>f.field==='target_price')!;
  expect((await FIELD(jsonReq(`${B}/${reportId}/fields/${tp.field_id}`,{action:'nuke'}),ctxOf({reportId,fieldId:tp.field_id}))).status).toBe(400);
  expect((await FIELD(jsonReq(`${B}/${reportId}/fields/${X}`,{action:'reject'}),ctxOf({reportId,fieldId:X}))).status).toBe(404);
  const s=PAGES[0].indexOf('120.00');expect((await FIELD(jsonReq(`${B}/${reportId}/fields/${tp.field_id}`,{action:'confirm',payload:{page:1,charStart:s,charEnd:s+6}}),ctxOf({reportId,fieldId:tp.field_id}))).status).toBe(200);
 });
 it('creates absence and returns approval and publication blockers',async()=>{
  expect((await ABSENT(jsonReq(`${B}/${reportId}/fields/absent`,{field:'analyst',page:1}),ctxOf({reportId}))).status).toBe(201);
  const a=await REVIEW(jsonReq(`${B}/${reportId}/review`,{action:'approve'}),ctxOf({reportId}));expect(a.status).toBe(409);expect(await errCode(a)).toBe('review_not_ready');
  const p=await PUBLISH(jsonReq(`${B}/${reportId}/publish`,{}),ctxOf({reportId}));expect(p.status).toBe(409);expect((await bodyOf<{error:{code:string;reasons:string[]}}>(p)).error.reasons).toContain('review_not_approved');
  const b=await BLOCKERS(getReq(`${B}/${reportId}/publish-blockers`),ctxOf({reportId}));expect((await bodyOf<{reviewReady:boolean}>(b)).reviewReady).toBe(false);
 });
});
