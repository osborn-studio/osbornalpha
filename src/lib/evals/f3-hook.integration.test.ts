// Eval-only PG17 hook: an isolated migrated database keeps immutable F3 rows and global state separate.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {docInsert,extractionInsert,pageInsert,sha} from '@/lib/documents/db-contract';
import {freshMigratedDatabase} from '@/lib/documents/fresh-db';
import {pgDocumentsDb} from '@/lib/documents/pg-documents-db';
import {withOverride} from '@/lib/documents/test-seed';
import type {DocumentsDb} from '@/lib/documents/types';
import {adaptF3Document,toExtractionOutput} from './kinds/f3-adapter';
import {evaluateExtraction} from './kinds/extraction';

const enabled=!!process.env.S4_TEST_STATE;
describe.skipIf(!enabled)('F3 to F6 extraction hook on PG17',()=>{
 let fresh:Awaited<ReturnType<typeof freshMigratedDatabase>>;let db:DocumentsDb;let issuer:string;let batch:string;
 beforeAll(async()=>{
  const {adminUrl}=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')) as {adminUrl:string};
  fresh=await freshMigratedDatabase(adminUrl);db=pgDocumentsDb(fresh.pool);
  issuer=randomUUID();batch=randomUUID();
  await fresh.pool.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'F6 Hook')`,[issuer]);
  await fresh.pool.query(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'documents-sync','documents.hkexnews')`,[batch]);
  expect(await db.reconcileScope('hkexnews',[{issuer_id:issuer,reasons:['eval'],priority:10,fetch_key:'00268'}])).toBe(1);
  expect(await db.claimSyncLease(issuer,'hkexnews',batch,600)).toBe(true);
 },120000);
 afterAll(async()=>{await fresh?.drop();},30000);
 const insert=async(ref:string,content:string)=>{
  const r=await db.insertDocumentVersion(issuer,'hkexnews',batch,docInsert({issuer_id:issuer,source_ref:ref,content_sha256:sha(content),storage_path:`blobs/${sha(content)}.pdf`}),[]);
  return r.document_id;
 };
 const extract=async(id:string)=>{
  expect(await db.claimExtractLease(id,batch,600)).toBe(true);
  return db.finishExtract(id,batch,extractionInsert(1),[pageInsert(1,'Revenue 123')]);
 };
 it('scores F3 candidate value and citation, excludes superseded/private, and treats a missing page as read_error',async()=>{
  const id=await insert(`hook-${randomUUID()}_c`,'public');const ext=await extract(id);
  const citation=await db.insertCitation({document_id:id,extraction_id:ext,page_no:1,char_start:8,char_end:11,bbox:{x0:10,y0:100,x1:30,y1:110},snippet:'123',text_hash:sha('Revenue 123'),created_by:'extractor',created_ref:'f6-hook'});
  expect(await db.claimCandidatesLease(ext,batch,600)).toBe(true);
  const doc=(await db.documentById(id))!;
  expect(await db.insertCandidates(ext,batch,[{kind:'field',extractor_kind:'rule',extractor_ref:'f6-hook',natural_key:'revenue',citations:{value:citation},payload:{field:'revenue',value:'123'},fingerprint:sha('field-revenue'),input_snapshot:{content_sha256:doc.content_sha256,pages_json_sha256:(await db.extractionById(ext))!.pages_json_sha256,page_nos:[1],extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'test-code'}}])).toEqual({inserted:1});
  const output=toExtractionOutput(await adaptF3Document(db,id))!;
  expect(output).toMatchObject({status:'parsed',fields:[{field:'revenue',value:'123',page:1,bbox:[10,732,30,742]}]});
  const gold={documents:[{document_sha256:doc.content_sha256,page_count:1,bbox_space:'pdf_points_top_left' as const}],labels:[{label_id:'revenue-1',document_sha256:doc.content_sha256,field:'revenue',occurrence:1,value_type:'decimal' as const,value:'123',locator:{page:1,bbox:[10,732,30,742] as [number,number,number,number]},recorded_by:'test',reviewed_by:'test'}]};
  // Direct evaluator call is the explicit test entry point; assertKindEnabled remains in the runner.
  expect(evaluateExtraction(gold,[output]).fields.revenue).toMatchObject({tp:1,fp:0,fn:0,passed:true});
  const replacement=await db.insertDocumentVersion(issuer,'hkexnews',batch,docInsert({issuer_id:issuer,source_ref:doc.source_ref,content_sha256:sha('replacement'),storage_path:`blobs/${sha('replacement')}.pdf`}),[]);
  expect(replacement.outcome).toBe('versioned');
  expect(await adaptF3Document(db,id)).toMatchObject({status:'excluded',reason:'superseded'});
  const missing=withOverride(db,{pagesOf:async()=>[]});
  const another=await insert(`missing-${randomUUID()}_c`,'missing');await extract(another);
  const missingOutput=toExtractionOutput(await adaptF3Document(missing,another))!;
  expect(missingOutput).toMatchObject({status:'unparseable',error:'missing_page'});
  const missingDoc=(await db.documentById(another))!;
  expect(evaluateExtraction({...gold,documents:[...gold.documents,{document_sha256:missingDoc.content_sha256,page_count:1,bbox_space:'pdf_points_top_left'}]},[output,missingOutput]).cases[0].outcome.result).toBe('read_error');
  const owner=randomUUID();await fresh.pool.query('insert into auth.users(id,email) values($1,$2)',[owner,`${owner}@example.test`]);
  const privateDoc=await db.insertUploadDocument(owner,docInsert({issuer_id:null,source:'upload',market:'other',source_ref:`${owner}/private`,source_url:null,language:null,permission:'private',owner_user_id:owner,license_ref:null,batch_id:batch,content_sha256:sha('private'),storage_path:`blobs/${sha('private')}.pdf`,acquisition:{uploaded_at:'2026-11-07T00:00:00Z',filename:'private.pdf'}}));
  expect(await adaptF3Document(db,privateDoc.document_id)).toMatchObject({status:'excluded',reason:'permission'});
 },120000);
});
