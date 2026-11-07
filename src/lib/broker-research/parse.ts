// Licensed parse action, private F3 artifact, durable write inventory, and batch receipt (spec §6.2).
import {createHash} from 'node:crypto';
import {finishBatch,startBatch,emptyCounts} from '../dq/batches';
import type {BatchError} from '../dq/batches';
import {BrokerError,conflict} from './errors';
import {processingAllowed,utcToday} from './licences';
import {F3Error,F3Timeout,assertExtraction} from './ports/f3';
import type {F3Artifact} from './ports/f3';
import {brokerPaths} from './storage';
import {trackedPortWrite,trackedUpload} from './tracked-write';
import {documentForAccess} from './upload';
import type {BrokerDeps} from './deps';
import type {DocumentRow,LicenceRow,RunRow} from './types';
export const LEASE_SECONDS=300;
export interface ParseResult{runId:string;status:'succeeded'|'failed';errorCode?:string;batchStatus:string}
/** Shared preconditions for processing services. */
export async function claimForProcessing(deps:BrokerDeps,documentId:string):Promise<{doc:DocumentRow;licence:LicenceRow;token:string}>{
 const doc=await documentForAccess(deps,documentId);
 const licence=await deps.db.getLicence(doc.licence_id);
 if(!licence||!processingAllowed(licence,utcToday(deps.now())))throw conflict('licence_forbids_processing');
 const token=deps.newId();if(!await deps.db.claimLease(documentId,token,LEASE_SECONDS))throw conflict('lease_held');
 return {doc,licence,token};
}
export async function failUnavailable(deps:BrokerDeps,producer:string,documentId:string,token:string,code:'f3_unavailable'|'llm_unavailable'):Promise<never>{
 const {batchId}=await startBatch(deps.tables,{producer,dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'});
 await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code}]},deps.now());
 await deps.db.fencedUpdateDocument(documentId,token,{releaseLease:true});
 throw new BrokerError(code,503);
}
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const f3Code=(e:unknown)=>e instanceof BrokerError?e.code:e instanceof F3Timeout?'f3_timeout':e instanceof F3Error?e.code:'f3_failed';
export async function runParse(deps:BrokerDeps,documentId:string,by:string,opts:{deadline:Date}):Promise<ParseResult>{
 const {doc,licence,token}=await claimForProcessing(deps,documentId);
 if(!deps.f3.available())return failUnavailable(deps,'broker-research-parse',documentId,token,'f3_unavailable');
 const {batchId}=await startBatch(deps.tables,{producer:'broker-research-parse',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'});
 const hadSuccess=doc.current_parse_run_id!==null,runId=deps.newId(),path=brokerPaths.artifact(doc.sha256,runId);
 await deps.db.fencedUpdateDocument(documentId,token,{status:'parsing'});
 await deps.db.insertRun({run_id:runId,document_id:documentId,kind:'parse',parse_run_id:null,extractor_version:null,artifact_path:null,artifact_hash:null,
  model_id:null,registry_hash:null,prompt_version:null,schema_version:null,code_version:deps.codeVersion,behavior_digest:null,licence_version:licence.version,
  request_path:null,response_path:null,batch_id:batchId});
 let errorCode:string|null=null,ex:F3Artifact|null=null,artifactHash='';
 try{
  const bytes=await deps.storage.download(doc.storage_path);if(!bytes)throw new F3Error('f3_failed','pdf_missing');
  ex=assertExtraction(await trackedPortWrite(deps,{documentId,prefix:brokerPaths.pagesPrefix(doc.sha256,runId),writer:'f3',lease:{token,ttlSeconds:LEASE_SECONDS}},
   ()=>deps.f3.extractDocument({bytes,sha256:doc.sha256,outputPrefix:brokerPaths.artifactPrefix(doc.sha256,runId),pagesPrefix:brokerPaths.pagesPrefix(doc.sha256,runId)},
    {deadline:opts.deadline,authorization:{licenceId:licence.licence_id,licenceVersion:licence.version,purpose:'broker_research'}})),doc.sha256);
  const artifact=new TextEncoder().encode(JSON.stringify(ex));artifactHash=sha(artifact);
  if(await trackedUpload(deps,{documentId,path,writer:'parse',body:artifact,contentType:'application/json',lease:{token,ttlSeconds:LEASE_SECONDS}})!=='stored')throw new F3Error('f3_failed','artifact_exists');
 }catch(e){errorCode=f3Code(e);}
 if(errorCode===null&&ex){
  const fin=await deps.db.finishRun(runId,token,{status:'succeeded',extractor_version:ex.extractor_version,artifact_path:path,artifact_hash:artifactHash,detail:{page_count:ex.page_count,ocr_used:ex.ocr_used,ocr_version:ex.ocr_version}});
  const upd=fin==='ok'?await deps.db.fencedUpdateDocument(documentId,token,{status:'parsed',current_parse_run_id:runId,page_count:ex.page_count,releaseLease:true}):'lease_lost';
  if(upd==='lease_lost')errorCode='lease_lost';
 }else{
  const fin=await deps.db.finishRun(runId,token,{status:'failed',detail:{error_code:errorCode}});
  if(fin==='lease_lost')errorCode='lease_lost';
  const withdrawn=(await deps.db.getDocument(documentId))?.status==='withdrawn';
  await deps.db.fencedUpdateDocument(documentId,token,withdrawn?{releaseLease:true}:{status:hadSuccess?'parsed':'parse_failed',releaseLease:true});
 }
 const errors:BatchError[]=errorCode?[{code:errorCode}]:[];
 const batchStatus=await finishBatch(deps.tables,batchId,{counts:{...emptyCounts(),fetched:1,...(errorCode?{failed:1}:{inserted:1})},errors},deps.now());
 await deps.db.logAccess({document_id:documentId,user_id:by,action:'parse_run',detail:{run_id:runId,status:errorCode?'failed':'succeeded',error_code:errorCode}});
 return errorCode?{runId,status:'failed',errorCode,batchStatus}:{runId,status:'succeeded',batchStatus};
}
export async function loadArtifact(deps:Pick<BrokerDeps,'storage'>,run:RunRow):Promise<F3Artifact>{
 if(run.kind!=='parse'||run.status!=='succeeded'||!run.artifact_path||!run.artifact_hash)throw new BrokerError('artifact_unreadable',409,{run_id:run.run_id});
 const bytes=await deps.storage.download(run.artifact_path);
 if(!bytes||sha(bytes)!==run.artifact_hash)throw new BrokerError('artifact_unreadable',409,{run_id:run.run_id});
 try{const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const expected=(parsed as {content_sha256?:unknown}).content_sha256;
  if(typeof expected!=='string'||!/^[0-9a-f]{64}$/.test(expected))throw new Error('invalid_hash');
  return assertExtraction(parsed,expected);
 }
 catch{throw new BrokerError('artifact_unreadable',409,{run_id:run.run_id});}
}
export function artifactLoader(deps:Pick<BrokerDeps,'db'|'storage'>):(parseRunId:string)=>Promise<F3Artifact>{
 const cache=new Map<string,Promise<F3Artifact>>();
 return id=>{let p=cache.get(id);if(!p){p=deps.db.getRun(id).then(r=>{if(!r)throw new BrokerError('artifact_unreadable',409,{run_id:id});return loadArtifact(deps,r);});cache.set(id,p);}return p;};
}
