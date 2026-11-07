// src/app/api/admin/documents/[id]/reprocess/route.test.ts
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const S=vi.hoisted(()=>({db:null as unknown,user:vi.fn(),audit:vi.fn(),run:vi.fn(),deps:vi.fn(),codeVersion:vi.fn(),classify:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({})}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:S.user}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({__role:'service'})}));
vi.mock('@/lib/documents/db',async(orig)=>({...await orig<typeof import('@/lib/documents/db')>(),supabaseDocumentsDb:()=>S.db}));
vi.mock('@/lib/research/store',()=>({audit:S.audit}));
vi.mock('@/lib/documents/extract/run',()=>({runDocumentsExtract:S.run}));
vi.mock('@/lib/documents/extract/deps',()=>({productionExtractDeps:S.deps}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:S.codeVersion}));
vi.mock('@/lib/documents/classify',()=>({classify:S.classify}));

import {POST} from './route';
import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {memoryDocumentsDb} from '@/lib/documents/memory-documents-db';
import type {MemoryDocumentsDb} from '@/lib/documents/memory-documents-db';
import {OWNER_A,seedExtraction,seedPublicDocument,seedUpload} from '@/lib/documents/test-seed';
import {CLASSIFIER_GEN} from '@/lib/documents/types';

const ADMIN='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const enc=(s:string)=>new TextEncoder().encode(s);
const post=(id:string,body:unknown,headers:Record<string,string>={'content-type':'application/json'})=>
 POST(new Request(`https://alpha.example/api/admin/documents/${id}/reprocess`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)}),{params:Promise.resolve({id})});
const saved=process.env.DOCUMENTS_EXTRACT_ENABLED;

let db:MemoryDocumentsDb,doc:string;
beforeEach(async()=>{
 vi.clearAllMocks();delete process.env.DOCUMENTS_EXTRACT_ENABLED;
 db=memoryDocumentsDb();S.db=db;
 S.user.mockResolvedValue({id:ADMIN});S.audit.mockResolvedValue(undefined);
 S.codeVersion.mockReturnValue('a'.repeat(40));S.deps.mockReturnValue({tag:'deps'});
 S.classify.mockReturnValue({doc_class:'interim_report',fiscal_year:2026,fiscal_period:'H1',period_end:'2026-06-30',filing_source_ref:null,language:'zh'});
 doc=await seedPublicDocument(db,enc('%PDF-r'));
});
afterEach(()=>{if(saved===undefined)delete process.env.DOCUMENTS_EXTRACT_ENABLED;else process.env.DOCUMENTS_EXTRACT_ENABLED=saved;});

describe('POST /api/admin/documents/[id]/reprocess',()=>{
 it('auth, media type, origin, id, stage and unknown document',async()=>{
  S.user.mockRejectedValueOnce(new AdminUnauthenticated('x'));
  expect((await post(doc,{stage:'extract'})).status).toBe(401);
  S.user.mockRejectedValueOnce(new AdminForbidden('x'));
  expect((await post(doc,{stage:'extract'})).status).toBe(403);
  expect((await post(doc,{stage:'extract'},{'content-type':'text/plain'})).status).toBe(415);
  expect((await post(doc,{stage:'extract'},{'content-type':'application/json',origin:'https://evil.example'})).status).toBe(403);
  expect((await post('nope',{stage:'extract'})).status).toBe(400);
  expect((await post(doc,{stage:'ocr'})).status).toBe(400);
  expect((await post(doc,'not json')).status).toBe(400);
  expect((await post('00000000-0000-4000-8000-000000000000',{stage:'extract'})).status).toBe(404);
  expect(S.audit).not.toHaveBeenCalled();
 });
 it('classify: reclassifies with the current classifier generation and audits; uploads are 409',async()=>{
  const res=await post(doc,{stage:'classify'},{'content-type':'application/json; charset=utf-8',origin:'https://alpha.example'});
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  const patch={doc_class:'interim_report',classifier_gen:CLASSIFIER_GEN,fiscal_year:2026,fiscal_period:'H1',period_end:'2026-06-30',filing_source_ref:null};
  expect(await res.json()).toEqual({id:doc,stage:'classify',patch});
  expect((await db.documentById(doc))!).toMatchObject(patch);
  expect(S.classify).toHaveBeenCalledWith('hkexnews',{form_type:'年報',title:'2025 年報',headline:'年報',source_ref:'2026090300863_c'});
  expect(S.audit).toHaveBeenCalledWith(expect.objectContaining({userId:ADMIN}),'document.reprocess',doc,{id:doc,stage:'classify',patch});
  const up=await seedUpload(db,OWNER_A,enc('%PDF-u'));
  expect((await post(up,{stage:'classify'})).status).toBe(409);
 });
 it('extract: same-version revision → 409; older version → back to stored, run skipped while extraction is disabled',async()=>{
  await seedExtraction(db,doc,['x']);
  let res=await post(doc,{stage:'extract'});
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe('revision_exists');
  const old=await seedPublicDocument(db,enc('%PDF-old'),{source_ref:'2026090300870_c'});
  await seedExtraction(db,old,['x'],{extractorVersion:'docs-extract/0.9'});
  res=await post(old,{stage:'extract'});
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({id:old,stage:'extract',run:{state:'skipped',code:'extract_disabled'}});
  expect((await db.documentById(old))!).toMatchObject({status:'stored',extract_attempts:0});
  expect(S.run).not.toHaveBeenCalled();
  expect(S.audit).toHaveBeenCalledWith(expect.anything(),'document.reprocess',old,{id:old,stage:'extract',run:{state:'skipped',code:'extract_disabled'}});
 });
 it('extract with DOCUMENTS_EXTRACT_ENABLED=1 runs one extraction for this document right away',async()=>{
  process.env.DOCUMENTS_EXTRACT_ENABLED='1';
  // each case: a document whose only extraction is from an older extractor version (requestExtract is allowed)
  const oldDoc=async(ref:string)=>{const id=await seedPublicDocument(db,enc(`%PDF-${ref}`),{source_ref:ref});await seedExtraction(db,id,['x'],{extractorVersion:'docs-extract/0.9'});return id;};
  const a=await oldDoc('2026090300871_c');
  S.run.mockResolvedValue({documents:[{documentId:a,outcome:'extracted',pageCount:2,extractionId:'e-1'}]});
  const res=await post(a,{stage:'extract'});
  expect(await res.json()).toEqual({id:a,stage:'extract',run:{state:'extracted',extractionId:'e-1'}});
  expect(S.run).toHaveBeenCalledWith({tag:'deps'},{limit:1,documentIds:[a],dryRun:false,triggeredBy:'manual'});
  expect(S.deps.mock.calls[0][0]).toMatchObject({codeVersion:'a'.repeat(40),admin:{__role:'service'}});
  expect(S.codeVersion).toHaveBeenCalledWith({allowGit:false});
  S.codeVersion.mockReturnValue(null);
  expect((await (await post(await oldDoc('2026090300872_c'),{stage:'extract'})).json()).run).toEqual({state:'skipped',code:'code_version_unavailable'});
  S.codeVersion.mockReturnValue('a'.repeat(40));
  S.run.mockRejectedValue(new Error('boom'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect((await (await post(await oldDoc('2026090300873_c'),{stage:'extract'})).json()).run).toEqual({state:'failed',code:'extract_failed'});
  spy.mockRestore();
 });
 it("a runner setup failure (worker_missing / worker_stale, no documents) is a 503 with that code after the document was reset, never skipped/not_due; the flag also accepts 'true'",async()=>{
  process.env.DOCUMENTS_EXTRACT_ENABLED='true';
  for(const code of ['worker_missing','worker_stale']){
   const id=await seedPublicDocument(db,enc(`%PDF-${code}`),{source_ref:`setup-${code}`});await seedExtraction(db,id,['x'],{extractorVersion:'docs-extract/0.9'});
   S.run.mockResolvedValue({batchId:'b',status:'failed',counts:{},idle:false,documents:[],errors:[{code,message:'setup'}]});
   const res=await post(id,{stage:'extract'});
   expect(res.status).toBe(503);
   expect(await res.json()).toEqual({id,stage:'extract',run:{state:'failed',code},error:code});
   expect((await db.documentById(id))!).toMatchObject({status:'stored',extract_attempts:0});   // reset by requestExtract, nothing claimed
   expect(S.audit).toHaveBeenCalledWith(expect.anything(),'document.reprocess',id,{id,stage:'extract',run:{state:'failed',code}});
  }
 });
 it('an audit failure after the change is logged, not a 500',async()=>{
  S.audit.mockRejectedValue(new Error('audit down'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect((await post(doc,{stage:'classify'})).status).toBe(200);
  spy.mockRestore();
 });
});
