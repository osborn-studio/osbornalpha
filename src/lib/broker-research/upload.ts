// Resumable upload intent, private PDF promotion, orphan cleanup and signed reads (spec §6.1, §8.2).
import {createHash} from 'node:crypto';
import {auditAdmin} from './audit';
import {BrokerError,bad,conflict,gone,notFound} from './errors';
import {licenceConfirmed,utcToday} from './licences';
import {MAX_OBJECT_BYTES,SIGNED_READ_SECONDS,brokerPaths} from './storage';
import type {CoreDeps} from './deps';
import type {AccessLogInput,DocumentRow,IntentRow} from './types';

export const INTENT_TTL_MS=2*3600_000;
export const VALIDATING_STALE_MS=60_000;
type UploadDeps=Pick<CoreDeps,'db'|'storage'|'tables'|'now'|'newId'>;
export interface IntentInput{sha256:string;byte_size:number;licence_id:string;original_filename:string}
const SHA_RE=/^[0-9a-f]{64}$/,UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseIntentInput(b:Record<string,unknown>):IntentInput{
 const invalid=(k:string)=>bad(`invalid_parameter:${k}`);
 if(typeof b.sha256!=='string'||!SHA_RE.test(b.sha256))throw invalid('sha256');
 if(typeof b.byte_size!=='number'||!Number.isSafeInteger(b.byte_size)||b.byte_size<1)throw invalid('byte_size');
 if(typeof b.licence_id!=='string'||!UUID_RE.test(b.licence_id))throw invalid('licence_id');
 if(typeof b.original_filename!=='string'||!b.original_filename.trim()||b.original_filename.length>255)throw invalid('original_filename');
 return {sha256:b.sha256,byte_size:b.byte_size,licence_id:b.licence_id.toLowerCase(),original_filename:b.original_filename.trim()};
}
export async function createIntent(deps:UploadDeps,input:IntentInput,by:string):Promise<{intentId:string;uploadUrl:string;token:string;expiresAt:string;replacesDocumentId:string|null}>{
 const licence=await deps.db.getLicence(input.licence_id);
 if(!licence)throw notFound('licence_not_found');
 if(!licenceConfirmed(licence,utcToday(deps.now())))throw conflict('licence_unconfirmed');
 if(input.byte_size>MAX_OBJECT_BYTES)throw new BrokerError('file_too_large',413);
 const existing=await deps.db.findDocumentBySha(input.sha256);
 let replaces:string|null=null;
 if(existing){
  if(existing.status!=='withdrawn'||existing.withdrawn_reason!=='promotion_lost'||existing.purged_at!==null)throw conflict('duplicate_document',{documentId:existing.document_id});
  if(existing.licence_id!==input.licence_id)throw conflict('intent_mismatch',{reason:'licence'});
  replaces=existing.document_id;
 }
 const intentId=deps.newId(),expiresAt=new Date(deps.now().getTime()+INTENT_TTL_MS).toISOString();
 await deps.db.insertIntent({intent_id:intentId,sha256:input.sha256,byte_size:input.byte_size,licence_id:input.licence_id,original_filename:input.original_filename,
  created_by:by,expires_at:expiresAt,status:'open',staging_path:brokerPaths.staging(intentId),document_id:replaces});
 const {url,token}=await deps.storage.createSignedUploadUrl(brokerPaths.staging(intentId));
 return {intentId,uploadUrl:url,token,expiresAt,replacesDocumentId:replaces};
}
const reload=async(deps:UploadDeps,id:string)=>{const i=await deps.db.getIntent(id);if(!i)throw notFound('intent_not_found');return i;};
const busy=()=>conflict('intent_busy');
async function validate(deps:UploadDeps,i:IntentRow):Promise<'missing'|'sha_mismatch'|'size_mismatch'|'not_pdf'|null>{
 const bytes=await deps.storage.download(i.staging_path);
 if(bytes===null)return 'missing';
 if(bytes.byteLength!==i.byte_size)return 'size_mismatch';
 if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')return 'not_pdf';
 if(createHash('sha256').update(bytes).digest('hex')!==i.sha256)return 'sha_mismatch';
 return null;
}
async function abandon(deps:UploadDeps,i:IntentRow,from:IntentRow['status'],code:string):Promise<void>{
 await deps.storage.remove([i.staging_path]);
 await deps.db.transitionIntent(i.intent_id,from,'abandoned',{error_code:code});
}
function replay(i:IntentRow,dupId?:string):never{
 if(i.status==='expired')throw conflict('intent_mismatch',{reason:'expired'});
 if(i.error_code==='duplicate_document')throw conflict('duplicate_document',dupId?{documentId:dupId}:{});
 if(i.error_code==='promotion_lost')throw new BrokerError('promotion_lost',500);
 if(i.error_code==='document_withdrawn')throw gone();
 throw conflict('intent_mismatch',{reason:i.error_code??i.status});
}
export async function commitIntent(deps:UploadDeps,intentId:string,by:string):Promise<{documentId:string;status:'committed'}>{
 let i=await reload(deps,intentId);
 if(i.created_by!==by)throw conflict('intent_mismatch',{reason:'owner'});
 if(i.status!=='committed'&&i.status!=='expired'&&i.status!=='abandoned'){
  const licence=await deps.db.getLicence(i.licence_id);
  if(!licence||!licenceConfirmed(licence,utcToday(deps.now())))throw conflict('licence_unconfirmed');
 }
 for(let step=0;step<8;step++){
  switch(i.status){
   case 'committed':return {documentId:i.document_id!,status:'committed'};
   case 'expired':case 'abandoned':{const dup=i.error_code==='duplicate_document'?await deps.db.findDocumentBySha(i.sha256):null;return replay(i,dup?.document_id);}
   case 'open':{
    if(deps.now().getTime()>Date.parse(i.expires_at)){await deps.db.transitionIntent(intentId,'open','expired');throw conflict('intent_mismatch',{reason:'expired'});}
    if(!await deps.db.transitionIntent(intentId,'open','validating'))throw busy();
    i=await reload(deps,intentId);break;
   }
   case 'validating':{
    if(step===0&&i.checkpoint_at!==null&&deps.now().getTime()-Date.parse(i.checkpoint_at)<VALIDATING_STALE_MS)throw busy();
    const v=await validate(deps,i);
    if(v==='missing'){await deps.db.transitionIntent(intentId,'validating','open');throw conflict('intent_not_uploaded');}
    if(v!==null){await abandon(deps,i,'validating',v);throw new BrokerError(v,422);}
    if(!await deps.db.transitionIntent(intentId,'validating','validated'))throw busy();
    i=await reload(deps,intentId);break;
   }
   case 'validated':{
    const docId=i.document_id??intentId;
    if(!await deps.db.getDocument(docId)){
     const inserted=await deps.db.insertDocument({document_id:docId,sha256:i.sha256,storage_path:brokerPaths.report(i.sha256),byte_size:i.byte_size,licence_id:i.licence_id,uploaded_by:i.created_by,original_filename:i.original_filename});
     if(inserted==='duplicate'){
      const other=await deps.db.findDocumentBySha(i.sha256);
      if(other&&other.document_id!==docId){await abandon(deps,i,'validated','duplicate_document');throw conflict('duplicate_document',{documentId:other.document_id});}
     }
     if(!await deps.db.getDocument(docId))throw new BrokerError('document_insert_lost',500);
    }
    if(!await deps.db.transitionIntent(intentId,'validated','promoting',{document_id:docId}))throw busy();
    i=await reload(deps,intentId);break;
   }
   case 'promoting':{await promote(deps,i,by);i=await reload(deps,intentId);break;}
  }
 }
 throw busy();
}
async function promote(deps:UploadDeps,i:IntentRow,by:string):Promise<void>{
 const docId=i.document_id!,reportPath=brokerPaths.report(i.sha256);
 let doc=await deps.db.getDocument(docId);
 if(!doc){
  const r=await deps.db.insertDocument({document_id:docId,sha256:i.sha256,storage_path:reportPath,byte_size:i.byte_size,licence_id:i.licence_id,uploaded_by:i.created_by,original_filename:i.original_filename});
  if(r==='duplicate'){
   const other=await deps.db.findDocumentBySha(i.sha256);
   if(other&&other.document_id!==docId){await abandon(deps,i,'promoting','duplicate_document');throw conflict('duplicate_document',{documentId:other.document_id});}
  }
  doc=await deps.db.getDocument(docId);
  if(!doc)throw new BrokerError('document_insert_lost',500);
 }
 const replacement=doc.status==='withdrawn'&&doc.withdrawn_reason==='promotion_lost'&&doc.purged_at===null;
 if(doc.status==='withdrawn'&&!replacement){await deps.db.transitionIntent(i.intent_id,'promoting','abandoned',{error_code:'document_withdrawn'});throw gone();}
 const m=await deps.storage.move(i.staging_path,reportPath);
 if(m==='target_exists')await deps.storage.remove([i.staging_path]);
 if(m==='missing'&&!await deps.storage.exists(reportPath)){
  if(!replacement)await deps.db.updateDocument(docId,{status:'withdrawn',withdrawn_at:deps.now().toISOString(),withdrawn_reason:'promotion_lost'});
  await deps.db.transitionIntent(i.intent_id,'promoting','abandoned',{error_code:'promotion_lost'});
  throw new BrokerError('promotion_lost',500);
 }
 if(replacement)await deps.db.updateDocument(docId,{status:'uploaded',withdrawn_at:null,withdrawn_reason:null,promotion_pending:false});
 else if(doc.promotion_pending)await deps.db.updateDocument(docId,{promotion_pending:false});
 const fresh=await deps.db.getIntent(i.intent_id);
 if(fresh?.status!=='promoting')return;
 await deps.db.logAccess({document_id:docId,user_id:by,action:'upload',detail:{intent_id:i.intent_id,sha256:i.sha256,byte_size:i.byte_size,replacement}});
 await deps.db.transitionIntent(i.intent_id,'promoting','committed');
 await auditAdmin(deps.tables,by,'broker_research.upload',docId,{intent_id:i.intent_id,replacement},deps.now());
}
export async function orphanCleanup(deps:UploadDeps,by:string):Promise<{removed:string[];kept:number}>{
 const removed:string[]=[];let kept=0;
 for(const path of await deps.storage.list('staging/')){
  const id=/^staging\/([0-9a-f-]{36})\.pdf$/.exec(path)?.[1],i=id?await deps.db.getIntent(id):null;
  if(!i){kept++;continue;}
  let status=i.status;
  if(status==='open'&&deps.now().getTime()>Date.parse(i.expires_at)&&await deps.db.transitionIntent(i.intent_id,'open','expired'))status='expired';
  if(status==='expired'||status==='abandoned'){await deps.storage.remove([path]);removed.push(path);}else kept++;
 }
 await deps.db.logAccess({document_id:null,user_id:by,action:'orphan_cleanup',detail:{removed:removed.length,kept}});
 return {removed,kept};
}
export async function documentForAccess(deps:Pick<CoreDeps,'db'>,documentId:string):Promise<DocumentRow>{
 const doc=await deps.db.getDocument(documentId);
 if(!doc)throw notFound('document_not_found');
 if(doc.status==='withdrawn')throw gone();
 if(doc.promotion_pending)throw conflict('promotion_pending');
 return doc;
}
export async function signedReadUrl(deps:UploadDeps,documentId:string,by:string):Promise<{payload:{url:string;expiresIn:number};log:AccessLogInput}>{
 const doc=await documentForAccess(deps,documentId);
 const url=await deps.storage.createSignedUrl(doc.storage_path,SIGNED_READ_SECONDS);
 return {payload:{url,expiresIn:SIGNED_READ_SECONDS},log:{document_id:documentId,user_id:by,action:'signed_url_issued',detail:{expires_in:SIGNED_READ_SECONDS}}};
}
