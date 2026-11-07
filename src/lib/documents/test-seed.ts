// src/lib/documents/test-seed.ts
// Test-only seeding helpers for Part C's unit and route tests (not imported by production code).
// Everything goes through the DocumentsDb contract of memoryDocumentsDb (Task 2), so the memory
// implementation's leases and status rules apply: public documents via reconcileScope →
// claimSyncLease → insertDocumentVersion; uploads via insertUploadDocument; extractions via
// claimExtractLease → finishExtract. rlsView() imitates what an anon client sees (spec §4.12)
// for the read methods the routes use; withOverride() replaces single methods (bound to the target,
// so class-based implementations keep their private state).
import {randomUUID} from 'node:crypto';
import {CLASSIFIER_GEN,EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from './types';
import type {CitationRow,DocumentInsert,DocumentRow,DocumentsDb,ExtractionRow,PageLayout} from './types';
import {assemblePage,buildPagesJson,pageInsertsOf,sha256Hex} from './extract/pages-json';
import {blobPath,pagesJsonPath} from './object-store';
import {decodeCursor,encodeCursor} from './db';
import type {ObjectStore} from './types';

export const ISSUER='11111111-1111-4111-8111-111111111111';
export const OWNER_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OWNER_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const SEED_BATCH='99999999-9999-4999-8999-999999999999';

/** A public HKEX zh annual report insert; bytes default to a tiny PDF-looking body whose sha256 is real. */
export function docInsertFor(bytes:Uint8Array,o:Partial<DocumentInsert>={}):DocumentInsert{
 const sha=sha256Hex(bytes);const mime=o.mime??'application/pdf';
 return {issuer_id:ISSUER,source:'hkexnews',market:'HK',source_ref:'2026090300863_c',form_type:'年報',doc_class:'annual_report',classifier_gen:CLASSIFIER_GEN,
  title:'2025 年報',language:'zh',source_url:'https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf',content_sha256:sha,bytes:bytes.length,mime,
  storage_path:blobPath(sha,mime),acquisition:{fetched_at:'2026-09-03T10:00:00.000Z',http_status:200},published_at:'2026-09-03T08:30:00.000Z',published_at_precision:'instant',
  available_at:'2026-09-03T08:30:00.000Z',available_date:'2026-09-03',fiscal_year:2025,fiscal_period:'FY',period_end:'2025-12-31',filing_source_ref:null,
  permission:'public',owner_user_id:null,license_ref:null,batch_id:SEED_BATCH,code_version:'c'.repeat(40),...o};
}

/** Inserts a public listed document (scope row + sync lease are created on the way and the lease released); stores the bytes when a store is given. */
export async function seedPublicDocument(db:DocumentsDb,bytes:Uint8Array,o:Partial<DocumentInsert>={},store?:ObjectStore):Promise<string>{
 const doc=docInsertFor(bytes,o);const source=doc.source==='upload'?'hkexnews':doc.source;
 await db.reconcileScope(source,[{issuer_id:doc.issuer_id!,reasons:['test'],priority:1,fetch_key:'00268'}]);
 const batch=randomUUID();
 if(!await db.claimSyncLease(doc.issuer_id!,source,batch,600))throw new Error('seed_lease');
 const r=await db.insertDocumentVersion(doc.issuer_id!,source,batch,doc,[]);
 await db.releaseSyncLease(doc.issuer_id!,source,batch,'success',new Date().toISOString());   // the next seed of the same issuer claims again
 if(store)await store.put(doc.storage_path,bytes,doc.mime);
 return r.document_id;
}

/** Inserts an owner's licensed/private upload directly (ingestUpload is tested separately). */
export async function seedUpload(db:DocumentsDb,owner:string,bytes:Uint8Array,o:Partial<DocumentInsert>={},store?:ObjectStore):Promise<string>{
 const doc=docInsertFor(bytes,{issuer_id:null,source:'upload',market:'other',source_ref:`${owner}/${sha256Hex(bytes)}`,form_type:null,doc_class:'other',title:'broker note.pdf',language:null,source_url:null,
  acquisition:{uploaded_at:'2026-11-01T00:00:00.000Z',filename:'broker note.pdf'},fiscal_year:null,fiscal_period:null,period_end:null,permission:'licensed',owner_user_id:owner,license_ref:'lic-1',...o});
 const r=await db.insertUploadDocument(owner,doc);
 if(store)await store.put(doc.storage_path,bytes,doc.mime);
 return r.document_id;
}

/** One extraction whose page n has text pageTexts[n-1] (one line per text line) — or exactly `layouts` when given; returns its id. Writes pages.json to the store when given. */
export async function seedExtraction(db:DocumentsDb,documentId:string,pageTexts:string[],o:{extractorVersion?:string;store?:ObjectStore;layouts?:PageLayout[]}={}):Promise<string>{
 const doc=(await db.documentById(documentId))!;const batch=randomUUID();
 if(!await db.claimExtractLease(documentId,batch,600))throw new Error('seed_extract_lease');
 const pages=o.layouts??pageTexts.map((t,k)=>{const {text,lines}=assemblePage(t.split('\n').filter(l=>l!=='').map((l,i)=>({y:700-i*12,pieces:[{text:l,x0:50,x1:50+10*Array.from(l).length,y:700-i*12,h:10,spaceBefore:false}]})));return {page_no:k+1,width:595,height:842,text,lines,tables:[]};});
 const built=buildPagesJson({content_sha256:doc.content_sha256,code_version:'c'.repeat(40),has_text_layer:pages.some(p=>p.text!==''),pages});
 const path=pagesJsonPath(doc.content_sha256,built.sha256);
 if(o.store)await o.store.put(path,built.bytes,'application/json');
 return db.finishExtract(documentId,batch,{extractor_version:o.extractorVersion??EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:'c'.repeat(40),has_text_layer:built.json.has_text_layer,page_count:pages.length,pages_json_path:path,pages_json_sha256:built.sha256},pageInsertsOf(built.json));
}

/** Replaces some methods of a DocumentsDb; every other method is the target's, bound to it. */
export function withOverride<T extends object>(target:T,over:Partial<T>):T{
 return new Proxy(target,{get(t,k){if(k in over)return (over as Record<string|symbol,unknown>)[k];const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});
}

/**
 * What the anon role sees through RLS (spec §4.12), for the reads the routes use: public documents
 * only; their extractions/pages/assets; citations of public documents with visibility 'public'
 * (the fact_citations clause is not imitated). read_documents is security invoker: public rows only,
 * filtered before pagination (offset cursor built with db.ts::encodeCursor).
 */
export function rlsView(db:DocumentsDb):DocumentsDb{
 const pub=async(id:string)=>(await db.documentById(id))?.permission==='public';
 const pubEx=async(e:ExtractionRow|null)=>!!e&&await pub(e.document_id);
 const visibleCitation=async(c:CitationRow|null)=>!!c&&c.visibility==='public'&&await pub(c.document_id);
 return withOverride(db,{
  documentById:async(id:string):Promise<DocumentRow|null>=>{const d=await db.documentById(id);return d&&d.permission==='public'?d:null;},
  assetsOf:async(id:string)=>await pub(id)?db.assetsOf(id):[],
  extractionsOf:async(id:string,p)=>await pub(id)?db.extractionsOf(id,p):{rows:[],nextCursor:null},
  extractionById:async(id:string)=>{const e=await db.extractionById(id);return await pubEx(e)?e:null;},
  pagesOf:async(eid:string,nos:number[])=>await pubEx(await db.extractionById(eid))?db.pagesOf(eid,nos):[],
  citationById:async(id:string)=>{const c=await db.citationById(id);return await visibleCitation(c)?c:null;},
  documentVersions:async(source,ref,p)=>{const r=await db.documentVersions(source,ref,p);return {rows:r.rows.filter(d=>d.permission==='public'),nextCursor:r.nextCursor};},
  // RLS filters BEFORE pagination: read everything through the target, keep public rows, page with an offset cursor
  readDocuments:async(issuer,o)=>{
   const all:DocumentRow[]=[];let cursor:string|null=null;
   do{const r=await db.readDocuments(issuer,{...o,cursor,limit:1000});all.push(...r.rows);cursor=r.nextCursor;}while(cursor);
   const pub=all.filter(d=>d.permission==='public');const off=o.cursor?Number(decodeCursor(o.cursor)[1]):0;
   return {rows:pub.slice(off,off+o.limit),nextCursor:off+o.limit<pub.length?encodeCursor(['rls',off+o.limit]):null};
  },
 } as Partial<DocumentsDb>);
}
