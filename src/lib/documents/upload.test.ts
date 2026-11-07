// src/lib/documents/upload.test.ts
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryDocumentsDb} from './memory-documents-db';
import {blobPath,memoryObjectStore} from './object-store';
import {OWNER_A,OWNER_B,ISSUER,seedPublicDocument,seedUpload,withOverride} from './test-seed';
import {ingestUpload,readOwnedDocument,OwnerAuditError,UploadError} from './upload';
import type {UploadDeps,UploadInput} from './upload';
import {sha256Hex} from './extract/pages-json';
import {MAX_DOC_BYTES} from './types';
import type {DocumentsDb,ObjectStore} from './types';

const NOW=new Date('2026-11-05T20:00:00.000Z');   // 2026-11-06 in UTC+8
const pdf=(s:string)=>new TextEncoder().encode(`%PDF-1.7 ${s}`);
function harness(){
 const db=memoryDocumentsDb();const store=memoryObjectStore();
 const tables=memoryTableClient({ingest_batches:['batch_id']});
 const deps:UploadDeps={db,store,tables,now:()=>NOW,codeVersion:'c'.repeat(40)};
 return {db,store,tables,deps};
}
const input=(o:Partial<UploadInput>={}):UploadInput=>({ownerUserId:OWNER_A,bytes:pdf('note'),filename:'C:\\reports\\GS note.pdf',mime:'application/pdf',permission:'licensed',license:{ref:'gs-2026-11'},...o});
const code=async(p:Promise<unknown>)=>{try{await p;return null;}catch(e){return e instanceof UploadError?e.code:String(e);}};

describe('ingestUpload',()=>{
 it('object first, then an upload row owned by the uploader; batch receipt; UTC+8 available_date',async()=>{
  const {db,store,tables,deps}=harness();
  const bytes=pdf('note');const sha=sha256Hex(bytes);
  const r=await ingestUpload(deps,input({issuerId:ISSUER,title:'GS initiation'}));
  expect(r.duplicate).toBe(false);
  expect(store.objects().get(blobPath(sha,'application/pdf'))?.bytes).toEqual(bytes);
  expect((await db.documentById(r.documentId))!).toMatchObject({source:'upload',market:'other',source_ref:`${OWNER_A}/${sha}`,source_version:1,doc_class:'other',title:'GS initiation',language:null,source_url:null,
   content_sha256:sha,bytes:bytes.length,mime:'application/pdf',storage_path:`blobs/${sha}.pdf`,acquisition:{uploaded_at:NOW.toISOString(),filename:'GS note.pdf'},published_at:NOW.toISOString(),
   published_at_precision:'instant',available_at:NOW.toISOString(),available_date:'2026-11-06',permission:'licensed',owner_user_id:OWNER_A,license_ref:'gs-2026-11',issuer_id:ISSUER,status:'stored'});
  const [batch]=(tables as ReturnType<typeof memoryTableClient>).rows('ingest_batches');
  expect(batch).toMatchObject({producer:'documents-upload',dataset:'documents.upload',triggered_by:'manual',status:'success',counts:{fetched:1,inserted:1}});
 });
 it('same owner + same bytes → duplicate; another owner → own row sharing the object',async()=>{
  const {db,store,deps}=harness();
  const a=await ingestUpload(deps,input());
  const again=await ingestUpload(deps,input({filename:'renamed.pdf'}));
  expect(again).toEqual({documentId:a.documentId,duplicate:true});
  const b=await ingestUpload(deps,input({ownerUserId:OWNER_B,permission:'private',license:undefined}));
  expect(b.duplicate).toBe(false);
  expect(b.documentId).not.toBe(a.documentId);
  expect((await db.documentById(b.documentId))!).toMatchObject({owner_user_id:OWNER_B,permission:'private',license_ref:null,title:'GS note.pdf'});
  expect(store.objects().size).toBe(1);
 });
 it('validates owner, mime, permission, issuer, licence, size, magic and filename',async()=>{
  const {deps}=harness();
  expect(await code(ingestUpload(deps,input({ownerUserId:'me'})))).toBe('invalid_input');
  expect(await code(ingestUpload(deps,input({mime:'text/html'})))).toBe('unsupported_mime');
  expect(await code(ingestUpload(deps,input({permission:'public' as 'licensed'})))).toBe('invalid_input');
  expect(await code(ingestUpload(deps,input({issuerId:'0268.HK'})))).toBe('invalid_input');
  expect(await code(ingestUpload(deps,input({license:{ref:' '}})))).toBe('invalid_input');
  expect(await code(ingestUpload(deps,input({bytes:new Uint8Array(0)})))).toBe('empty');
  expect(await code(ingestUpload(deps,input({bytes:new Uint8Array(MAX_DOC_BYTES+1)})))).toBe('too_large');
  expect(await code(ingestUpload(deps,input({bytes:new TextEncoder().encode('<html>')})))).toBe('not_pdf');
  for(const filename of ['','dir/','a\u0000b.pdf','a\u202eb.pdf','x'.repeat(256)])expect(await code(ingestUpload(deps,input({filename}))),JSON.stringify(filename)).toBe('invalid_input');
 });
 it('a failed object put writes no row and finishes the batch failed',async()=>{
  const {db,tables,deps}=harness();
  const broken=withOverride<ObjectStore>(deps.store,{put:async()=>{throw new Error('storage down');}});
  await expect(ingestUpload({...deps,store:broken},input())).rejects.toThrow('storage down');
  expect(db.documents()).toEqual([]);
  expect((tables as ReturnType<typeof memoryTableClient>).rows('ingest_batches')[0]).toMatchObject({status:'failed',counts:{failed:1}});
 });
});

describe('ingestUpload follow-ups',()=>{
 it('same owner and bytes with a different permission or licence is upload_conflict carrying the stored values',async()=>{
  const {deps}=harness();
  const a=await ingestUpload(deps,input());
  for(const o of [{permission:'private' as const,license:undefined},{license:{ref:'other'}}]){
   const e=await ingestUpload(deps,input(o)).catch(x=>x);
   expect(e).toBeInstanceOf(UploadError);
   expect(e).toMatchObject({code:'upload_conflict',stored:{documentId:a.documentId,permission:'licensed',licenseRef:'gs-2026-11'}});
  }
  expect((await ingestUpload(deps,input({license:{ref:' gs-2026-11 '}}))).duplicate).toBe(true);
 });
 it('a finishBatch failure after the insert keeps the result and reports batchError',async()=>{
  const {db,tables,deps}=harness();
  const t=tables as ReturnType<typeof memoryTableClient>;
  const broken=withOverride(t,{update:async()=>{throw new Error('batch down');}} as never);
  const r=await ingestUpload({...deps,tables:broken},input());
  expect(r.duplicate).toBe(false);
  expect(r.batchError).toBeDefined();
  expect(db.documents()).toHaveLength(1);
 });
 it('measures the trimmed licence ref in code points',async()=>{
  const {deps}=harness();
  expect((await ingestUpload(deps,input({license:{ref:'𠀋'.repeat(200)}}))).duplicate).toBe(false);
  expect(await code(ingestUpload(deps,input({ownerUserId:OWNER_B,license:{ref:'𠀋'.repeat(201)}})))).toBe('invalid_input');
 });
});

describe('readOwnedDocument',()=>{
 async function setup(){
  const db=memoryDocumentsDb();
  const mine=await seedUpload(db,OWNER_A,pdf('a'));
  const pub=await seedPublicDocument(db,pdf('p'));
  const audit=vi.fn(async()=>{});
  return {db,mine,pub,audit,deps:{db:db as DocumentsDb,audit}};
 }
 it('owner: load, then audit document.read with the route detail, then return',async()=>{
  const {mine,audit,deps}=await setup();
  const order:string[]=[];
  audit.mockImplementation(async()=>{order.push('audit');});
  const r=await readOwnedDocument(deps,{documentId:mine,requester:OWNER_A,route:'documents/page',pageNo:3,load:async d=>{order.push('load');return d.title;}});
  expect(r?.data).toBe('broker note.pdf');
  expect(order).toEqual(['load','audit']);
  expect(audit).toHaveBeenCalledWith(OWNER_A,'document.read',mine,{route:'documents/page',requester:OWNER_A,page_no:3});
  await readOwnedDocument(deps,{documentId:mine,requester:OWNER_A,route:'documents/file',signedUrlIssued:true,load:async()=>'u'});
  expect(audit).toHaveBeenLastCalledWith(OWNER_A,'document.read',mine,{route:'documents/file',requester:OWNER_A,signed_url_issued:true});
 });
 it('another owner, a public document, a missing id or a null load → null and no audit',async()=>{
  const {mine,pub,audit,deps}=await setup();
  const load=vi.fn(async()=>'x');
  expect(await readOwnedDocument(deps,{documentId:mine,requester:OWNER_B,route:'documents/doc',load})).toBeNull();
  expect(await readOwnedDocument(deps,{documentId:pub,requester:OWNER_A,route:'documents/doc',load})).toBeNull();
  expect(await readOwnedDocument(deps,{documentId:'00000000-0000-4000-8000-000000000000',requester:OWNER_A,route:'documents/doc',load})).toBeNull();
  expect(load).not.toHaveBeenCalled();
  expect(await readOwnedDocument(deps,{documentId:mine,requester:OWNER_A,route:'documents/page',load:async()=>null})).toBeNull();
  expect(audit).not.toHaveBeenCalled();
 });
 it('an audit failure throws OwnerAuditError and returns nothing',async()=>{
  const {mine,audit,deps}=await setup();
  audit.mockRejectedValue(new Error('insert failed'));
  await expect(readOwnedDocument(deps,{documentId:mine,requester:OWNER_A,route:'citations',citationId:'c',load:async()=>'secret'})).rejects.toBeInstanceOf(OwnerAuditError);
 });
});
