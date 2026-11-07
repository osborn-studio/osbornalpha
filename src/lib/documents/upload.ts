// src/lib/documents/upload.ts
// Licensed / private documents (spec §8.2–8.3).
// ingestUpload: the interface the foreign-research spec calls. PDF only (mime and %PDF- magic),
//   1..MAX_DOC_BYTES bytes, permission 'licensed'|'private' (never public), optional issuer and licence
//   ref. One ingest_batches row (producer documents-upload, dataset documents.upload, triggered_by
//   manual) → object first (blobs/<sha256>.pdf, content-addressed: an object shared with another
//   owner answers 'exists') → insert_upload_document (source 'upload', source_ref
//   '<owner>/<sha256>', published_at = available_at = now, precision instant, available_date = the
//   UTC+8 calendar day, source_url null, acquisition {uploaded_at, filename}, doc_class 'other') →
//   duplicate for the same owner and hash. Extraction picks the row up like any stored document
//   (candidates_role 'none').
// readOwnedDocument: the owner read path of the doc/pages/file/citations routes. Not public, owner =
//   requester (else null → the route answers 404, indistinguishable from a missing id) → load() the
//   response through the service db → audit 'document.read' (research_audit_log, object_type
//   'document', detail {route, requester, page_no?, citation_id?, signed_url_issued?}) → return. The
//   audit is written after everything that will be returned is loaded and before it is returned; an
//   audit failure throws OwnerAuditError (route → 500 audit_failed), so nothing is returned unaudited.
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {TableClient} from '../db/table-client';
import {blobPath} from './object-store';
import {sha256Hex} from './extract/pages-json';
import {CLASSIFIER_GEN,MAX_DOC_BYTES} from './types';
import type {DocumentInsert,DocumentRow,DocumentsDb,ObjectStore} from './types';

export type UploadErrorCode='invalid_input'|'unsupported_mime'|'empty'|'too_large'|'not_pdf';
export class UploadError extends Error{constructor(public code:UploadErrorCode,message?:string){super(message??code);this.name='UploadError';}}
export interface UploadDeps{db:Pick<DocumentsDb,'insertUploadDocument'>;store:ObjectStore;tables:TableClient;now:()=>Date;codeVersion:string}
export interface UploadInput{ownerUserId:string;bytes:Uint8Array;filename:string;mime:string;permission:'licensed'|'private';license?:{ref:string};issuerId?:string;title?:string}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL=/[\u0000-\u001f\u007f]/;
/** Last path component, trimmed; 1..255 code points, no control characters. */
function cleanFilename(name:string):string{
 const base=(name.split(/[\\/]/).pop()??'').trim();
 if(base===''||Array.from(base).length>255||CONTROL.test(base))throw new UploadError('invalid_input','filename');
 return base;
}
const utc8Date=(d:Date)=>new Date(d.getTime()+8*3_600_000).toISOString().split('T')[0];

export async function ingestUpload(deps:UploadDeps,input:UploadInput):Promise<{documentId:string;duplicate:boolean}>{
 if(!UUID.test(input.ownerUserId))throw new UploadError('invalid_input','owner');
 if(input.mime!=='application/pdf')throw new UploadError('unsupported_mime');
 if(input.permission!=='licensed'&&input.permission!=='private')throw new UploadError('invalid_input','permission');
 if(input.issuerId!==undefined&&!UUID.test(input.issuerId))throw new UploadError('invalid_input','issuer');
 if(input.license!==undefined&&(typeof input.license.ref!=='string'||input.license.ref.trim()===''||input.license.ref.length>200))throw new UploadError('invalid_input','license');
 if(input.bytes.length===0)throw new UploadError('empty');
 if(input.bytes.length>MAX_DOC_BYTES)throw new UploadError('too_large');
 if(new TextDecoder().decode(input.bytes.subarray(0,5))!=='%PDF-')throw new UploadError('not_pdf');
 const filename=cleanFilename(input.filename);
 const title=(input.title??filename).trim();
 if(title===''||Array.from(title).length>500)throw new UploadError('invalid_input','title');
 const sha=sha256Hex(input.bytes);const now=deps.now();const at=now.toISOString();
 const {batchId}=await startBatch(deps.tables,{producer:'documents-upload',dataset:'documents.upload',codeVersion:deps.codeVersion,triggeredBy:'manual'});
 const counts={...emptyCounts(),fetched:1};
 try{
  const storage_path=blobPath(sha,'application/pdf');
  await deps.store.put(storage_path,input.bytes,'application/pdf');
  const doc:DocumentInsert={issuer_id:input.issuerId??null,source:'upload',market:'other',source_ref:`${input.ownerUserId}/${sha}`,form_type:null,doc_class:'other',classifier_gen:CLASSIFIER_GEN,
   title,language:null,source_url:null,content_sha256:sha,bytes:input.bytes.length,mime:'application/pdf',storage_path,acquisition:{uploaded_at:at,filename},
   published_at:at,published_at_precision:'instant',available_at:at,available_date:utc8Date(now),fiscal_year:null,fiscal_period:null,period_end:null,filing_source_ref:null,
   permission:input.permission,owner_user_id:input.ownerUserId,license_ref:input.license?.ref.trim()??null,batch_id:batchId,code_version:deps.codeVersion};
  const r=await deps.db.insertUploadDocument(input.ownerUserId,doc);
  if(r.outcome==='duplicate')counts.duplicates++;else counts.inserted++;
  await finishBatch(deps.tables,batchId,{counts,errors:[]},deps.now());
  return {documentId:r.document_id,duplicate:r.outcome==='duplicate'};
 }catch(e){
  counts.failed++;
  await finishBatch(deps.tables,batchId,{counts,errors:[{code:'upload_failed',message:e instanceof Error?e.message:String(e)}]},deps.now()).catch(()=>undefined);
  throw e;
 }
}

export class OwnerAuditError extends Error{readonly code='audit_failed';constructor(message:string){super(message);this.name='OwnerAuditError';}}
export interface OwnerReadDeps{db:DocumentsDb;audit:(userId:string,action:string,objectId:string,detail:Record<string,unknown>)=>Promise<void>}
export interface OwnerReadInput<T>{documentId:string;requester:string;route:string;pageNo?:number;citationId?:string;signedUrlIssued?:boolean;load:(doc:DocumentRow)=>Promise<T|null>}

export async function readOwnedDocument<T>(deps:OwnerReadDeps,input:OwnerReadInput<T>):Promise<{doc:DocumentRow;data:T}|null>{
 const doc=await deps.db.documentById(input.documentId);
 if(!doc||doc.permission==='public'||doc.owner_user_id===null||doc.owner_user_id!==input.requester)return null;
 const data=await input.load(doc);
 if(data===null)return null;
 const detail:Record<string,unknown>={route:input.route,requester:input.requester};
 if(input.pageNo!==undefined)detail.page_no=input.pageNo;
 if(input.citationId!==undefined)detail.citation_id=input.citationId;
 if(input.signedUrlIssued)detail.signed_url_issued=true;
 try{await deps.audit(doc.owner_user_id,'document.read',doc.document_id,detail);}
 catch(e){throw new OwnerAuditError(e instanceof Error?e.message:String(e));}
 return {doc,data};
}
