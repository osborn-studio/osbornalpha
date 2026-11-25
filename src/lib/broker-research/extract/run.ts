// Licensed chunked LLM extraction, private call storage, candidate commit and rules receipt (spec §6.2).
import {DATASETS} from '../../dq/datasets';
import {finishBatch,startBatch,emptyCounts} from '../../dq/batches';
import type {BatchCounts,BatchError} from '../../dq/batches';
import {behaviorDigest} from '../behavior';
import {BrokerError,conflict} from '../errors';
import {processingAllowed,utcToday} from '../licences';
import {LEASE_SECONDS,artifactLoader,claimForProcessing,failUnavailable} from '../parse';
import type {F3Artifact,F3Page} from '../ports/f3';
import {LlmError} from '../ports/llm';
import type {LlmInfo,LlmPort} from '../ports/llm';
import {EXTRACT_PROMPT} from '../prompts';
import {applyRules} from '../rules-run';
import type {RulesOutcome} from '../rules-run';
import {brokerPaths} from '../storage';
import {trackedUpload} from '../tracked-write';
import {resolveTargets} from '../tickers';
import {EXTRACT_PROMPT_VERSION,SCHEMA_VERSION} from '../versions';
import {buildCandidateRows,mergeChunks} from './merge';
import type {ChunkExtraction,MergeResult} from './merge';
import {EXTRACT_SCHEMA,validateExtraction} from './schema';
import type {DocumentExtraction} from './schema';
import type {BrokerDeps} from '../deps';
import {BrokerResearchDbError} from '../types';
import type {CandidateFieldInput,MaterializeReceipt} from '../types';

export const CHUNK_PAGES=8,CONTEXT_SHARE=0.6,MAX_OUTPUT_TOKENS=4000,SCHEMA_RETRIES=1,CALL_TIMEOUT_MS=90_000,MIN_CALL_BUDGET_MS=30_000;
export const FEEDBACK_MAX_CHARS=1000;
export const estimateTokens=(s:string)=>s.length;
const header=(p:F3Page)=>`=== page ${p.page} ===\n`;
export function chunkPages(pages:readonly F3Page[],contextTokens:number,overheadTokens:number):F3Page[][]{
 const budget=Math.floor(contextTokens*CONTEXT_SHARE)-overheadTokens,out:F3Page[][]=[];let cur:F3Page[]=[],used=0;
 for(const p of pages){const t=estimateTokens(header(p)+p.text);
  if(cur.length&&(cur.length>=CHUNK_PAGES||used+1+t>budget)){out.push(cur);cur=[];used=0;}
  used+=t+(cur.length?1:0);cur.push(p);
 }
 if(cur.length)out.push(cur);return out;
}
const parseJson=(s:string):unknown=>{const t=s.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{return JSON.parse(t);}catch{return undefined;}};
export interface CallRecord{chunk:number;attempt:number;system:string;user:string;max_tokens:number}
export interface ResponseRecord{chunk:number;attempt:number;content:string|null;model_id:string|null;error:string|null;error_detail:string|null}
interface CallRecorder{request(rec:CallRecord,seq:number):Promise<void>;response(rec:ResponseRecord,seq:number):Promise<void>}
export interface CandidateBatch{merge:MergeResult;rows:CandidateFieldInput[];extractor:string;unverified:number;chunks:number;retries:number;requests:CallRecord[];responses:ResponseRecord[]}
export class ExtractFailure extends Error{constructor(readonly code:string,readonly requests:CallRecord[],readonly responses:ResponseRecord[]){super(code);}}
export const extractorOf=(info:LlmInfo)=>`llm:${info.modelId}@${info.registryHash}`;
export const statedTickers=(m:MergeResult)=>m.targets.flatMap(t=>t.tickers_as_stated.map(s=>({tickerAsStated:s,exchangeHint:t.exchange_hint})));
/** DB-free extraction core shared with evaluation and replay. */
export async function extractCandidates(llm:LlmPort,info:LlmInfo,artifact:F3Artifact,o:{deadline:Date;now:()=>Date;beforeCall?:()=>Promise<void>;recorder?:CallRecorder}):Promise<CandidateBatch>{
 const prefix=(i:number,n:number)=>`JSON Schema:\n${schemaText}\n\nReport chunk ${i}/${n}:\n`,schemaText=JSON.stringify(EXTRACT_SCHEMA),n=artifact.pages.length;
 const reserved=FEEDBACK_MAX_CHARS+MAX_OUTPUT_TOKENS,chunks=chunkPages(artifact.pages,info.contextTokens,estimateTokens(EXTRACT_PROMPT+prefix(n,n))+reserved);
 const users=chunks.map((pages,i)=>prefix(i+1,chunks.length)+pages.map(p=>header(p)+p.text).join('\n'));
 if(users.some(user=>estimateTokens(EXTRACT_PROMPT+user)+reserved>info.contextTokens))throw new ExtractFailure('page_exceeds_context',[],[]);
 const requests:CallRecord[]=[],responses:ResponseRecord[]=[],parsed:ChunkExtraction[]=[];let retries=0;
 const checkDeadline=()=>{if(o.deadline.getTime()-o.now().getTime()<MIN_CALL_BUDGET_MS)throw new ExtractFailure('extract_deadline',requests,responses);};
 const record=async(write:()=>Promise<void>|undefined)=>{try{await write();}catch(e){throw new ExtractFailure(fenceError(e)??'storage_failed',requests,responses);}};
 for(const [ci,baseUser] of users.entries()){
  let feedback='',ok:DocumentExtraction|null=null;
  for(let attempt=1;attempt<=1+SCHEMA_RETRIES&&!ok;attempt++){
   checkDeadline();
   const user=baseUser+feedback,seq=requests.length+1,request={chunk:ci,attempt,system:EXTRACT_PROMPT,user,max_tokens:MAX_OUTPUT_TOKENS};
   await record(()=>o.recorder?.request(request,seq));
   try{await o.beforeCall?.();}catch(e){throw new ExtractFailure(e instanceof BrokerError?e.code:'lease_lost',requests,responses);}
   checkDeadline();requests.push(request);
   let content:string;
   try{content=(await llm.complete({system:EXTRACT_PROMPT,user,maxTokens:MAX_OUTPUT_TOKENS,responseJson:true,timeoutMs:CALL_TIMEOUT_MS})).content;}
   catch(e){const code=e instanceof LlmError?e.code:'llm_failed',response={chunk:ci,attempt,content:null,model_id:info.modelId,error:code,error_detail:String((e as {message?:unknown}|null)?.message??e).slice(0,500)};
    responses.push(response);await record(()=>o.recorder?.response(response,seq));throw new ExtractFailure(code,requests,responses);}
   const response={chunk:ci,attempt,content,model_id:info.modelId,error:null,error_detail:null};
   responses.push(response);await record(()=>o.recorder?.response(response,seq));
   const v=validateExtraction(parseJson(content));
   if(v.ok)ok=v.value;else{if(attempt===1)retries++;feedback=`\n\nYour previous answer was invalid: ${v.errors.slice(0,5).join('; ')}. Answer again with valid JSON only.`.slice(0,FEEDBACK_MAX_CHARS);}
  }
  if(!ok)throw new ExtractFailure('llm_schema_invalid',requests,responses);
  parsed.push({chunk:ci,extraction:ok});
 }
 const merge=mergeChunks(parsed),extractor=extractorOf(info),rows=buildCandidateRows(merge,{pages:artifact.pages,extractor});
 return {merge,rows,extractor,unverified:rows.filter(r=>r.status==='unverified').length,chunks:chunks.length,retries,requests,responses};
}
const fenceError=(e:unknown)=>e instanceof BrokerError&&(e.code==='lease_lost'||e.code==='document_withdrawn')?e.code:null;
type Envelopes={request:boolean;response:boolean};
async function storeCalls(deps:Pick<BrokerDeps,'db'|'storage'>,documentId:string,token:string,runId:string,requests:CallRecord[],responses:ResponseRecord[]){
 const envelopes:Envelopes={request:false,response:false};
 for(const kind of ['request','response'] as const){
  const body=JSON.stringify({run_id:runId,calls:kind==='request'?requests:responses});
  const put=()=>trackedUpload(deps,{documentId,path:brokerPaths[kind](runId),writer:'extract',body,contentType:'application/json',lease:{token,ttlSeconds:LEASE_SECONDS}});
  try{envelopes[kind]=await put()==='stored';}
  catch(e){const code=fenceError(e);if(code)return {code,envelopes};
   // A lost acknowledgement can leave the first upload present.
   try{await put();envelopes[kind]=true;}catch(retryError){const code=fenceError(retryError);if(code)return {code,envelopes};}
  }
 }
 return {code:envelopes.request&&envelopes.response?null:'storage_failed',envelopes};
}
export interface ExtractResult{runId:string;reportId:string;status:'succeeded'|'failed';errorCode?:string;counts:BatchCounts;batchStatus:string;receipt?:MaterializeReceipt;ruleReceiptId?:string}
export async function runExtract(deps:BrokerDeps,documentId:string,by:string,opts:{deadline:Date}):Promise<ExtractResult>{
 const pre=await deps.db.getDocument(documentId);
 if(pre&&pre.status!=='withdrawn'&&!pre.promotion_pending&&(pre.status!=='parsed'||!pre.current_parse_run_id))throw conflict('document_not_parsed');
 const {doc,licence,token}=await claimForProcessing(deps,documentId),info=deps.llm.info();
 if(!info)return failUnavailable(deps,'broker-research-extract',documentId,token,'llm_unavailable');
 const report=await deps.db.ensureReport(documentId,deps.codeVersion),parseRun=await deps.db.getRun(doc.current_parse_run_id!);
 if(!parseRun||parseRun.status!=='succeeded')throw conflict('document_not_parsed');
 const {batchId}=await startBatch(deps.tables,{producer:'broker-research-extract',dataset:DATASETS.brokerResearch,codeVersion:deps.codeVersion,triggeredBy:'manual',toolVersions:{prompt:EXTRACT_PROMPT_VERSION,schema:SCHEMA_VERSION}});
 const runId=deps.newId(),extractorVersion=parseRun.extractor_version??'unknown';
 const digest=behaviorDigest({extractorVersion,modelId:info.modelId,registryHash:info.registryHash,promptVersion:EXTRACT_PROMPT_VERSION,schemaVersion:SCHEMA_VERSION});
 await deps.db.insertRun({run_id:runId,document_id:documentId,kind:'extract',parse_run_id:parseRun.run_id,extractor_version:extractorVersion,artifact_path:null,artifact_hash:null,
  model_id:info.modelId,registry_hash:info.registryHash,prompt_version:EXTRACT_PROMPT_VERSION,schema_version:SCHEMA_VERSION,code_version:deps.codeVersion,behavior_digest:digest,
  licence_version:licence.version,request_path:brokerPaths.request(runId),response_path:brokerPaths.response(runId),batch_id:batchId});
 const fail=async(code:string,requests:CallRecord[]=[],responses:ResponseRecord[]=[],stored=false,envelopes?:Envelopes):Promise<ExtractResult>=>{
  // Never attempt a second write after a failed fence or withdrawal. Earlier accepted calls remain private.
  if(!stored&&code!=='lease_lost'&&code!=='document_withdrawn'){
   const s=await storeCalls(deps,documentId,token,runId,requests,responses);if(s.code){code=s.code==='document_withdrawn'?'lease_lost':s.code;envelopes=s.envelopes;}
  }
  const fin=await deps.db.finishRun(runId,token,{status:'failed',detail:{error_code:code,calls:requests.length,...(code==='storage_failed'&&envelopes?{envelopes}:{})}}).catch(()=> 'lease_lost' as const);
  if(fin==='lease_lost')code='lease_lost';
  await deps.db.fencedUpdateDocument(documentId,token,{releaseLease:true});
  const counts=emptyCounts(),batchStatus=await finishBatch(deps.tables,batchId,{counts,errors:[{code}]},deps.now());
  await deps.db.logAccess({document_id:documentId,user_id:by,action:'extract_run',detail:{run_id:runId,status:'failed',error_code:code}});
  return {runId,reportId:report.report_id,status:'failed',errorCode:code,counts,batchStatus};
 };
 const putRecord=async(path:string,rec:CallRecord|ResponseRecord)=>{const result=await trackedUpload(deps,{documentId,path,writer:'extract',body:JSON.stringify(rec),contentType:'application/json',lease:{token,ttlSeconds:LEASE_SECONDS}});if(result!=='stored')throw new Error('storage_failed');};
 let batch:CandidateBatch,artifact:F3Artifact;
 try{artifact=await artifactLoader(deps)(parseRun.run_id);batch=await extractCandidates(deps.llm,info,artifact,{deadline:opts.deadline,now:deps.now,recorder:{request:(rec,seq)=>putRecord(brokerPaths.callRequest(runId,seq),rec),response:(rec,seq)=>putRecord(brokerPaths.callResponse(runId,seq),rec)},beforeCall:async()=>{
  const current=await deps.db.getDocument(documentId);
  if(!current||current.status==='withdrawn')throw new BrokerError('document_withdrawn',410);
  const renewal=await deps.db.renewLease(documentId,token,LEASE_SECONDS);
  if(renewal!=='ok')throw conflict('lease_lost');
  const currentLicence=await deps.db.getLicence(doc.licence_id);
  if(!currentLicence||currentLicence.version!==licence.version||!processingAllowed(currentLicence,utcToday(deps.now())))throw conflict('licence_forbids_processing');
 }});}
 catch(e){if(e instanceof ExtractFailure)return fail(e.code==='document_withdrawn'?'lease_lost':e.code,e.requests,e.responses);if(e instanceof BrokerError)return fail(e.code);throw e;}
 const stored=await storeCalls(deps,documentId,token,runId,batch.requests,batch.responses);
 if(stored.code)return fail(stored.code==='document_withdrawn'?'lease_lost':stored.code,batch.requests,batch.responses,true,stored.envelopes);
 const resolutions=new Map<string,Record<string,unknown>>();
 for(const t of await resolveTargets(deps.tables,statedTickers(batch.merge),doc.uploaded_at))if(!resolutions.has(t.targetKey))resolutions.set(t.targetKey,t.resolution);
 const rows=buildCandidateRows(batch.merge,{pages:artifact.pages,extractor:batch.extractor,resolutions});
 let receipt:MaterializeReceipt;
 try{receipt=await deps.db.extractCommit(documentId,token,runId,rows);}
 catch(e){if((e as {code?:string}).code==='lease_lost'||(e as {code?:string}).code==='published_immutable')return fail((e as {code:string}).code,[],[],true);throw e;}
 const lost=(e:unknown)=>e instanceof BrokerResearchDbError&&(e.code==='lease_lost'||e.code==='run_invalid');
 if(batch.merge.scope&&!report.scope){try{receipt=await deps.db.extractSetScope(documentId,token,runId,batch.merge.scope);}catch(e){if(lost(e))return fail('lease_lost',[],[],true);throw e;}}
 let rules:RulesOutcome;
 try{rules=await applyRules(deps,report.report_id,{batchId});}
 catch(e){
  await deps.db.finishRun(runId,token,{status:'failed',detail:{error_code:'rules_error',candidates:rows.length}});
  await deps.db.fencedUpdateDocument(documentId,token,{releaseLease:true});
  await finishBatch(deps.tables,batchId,{counts:{...emptyCounts(),fetched:rows.length,inserted:rows.length-batch.unverified},
   errors:[{code:'rules_error',message:e instanceof Error?e.message:String(e)}]},deps.now());
  throw e;
 }
 const errors:BatchError[]=[];
 if(batch.unverified>0)errors.push({code:'span_unverified_summary',message:`${batch.unverified} quote(s) not found verbatim`});
 if(rules.quarantined>0)errors.push({code:'rules_failed_summary',message:`${rules.quarantined} quarantined`});
 if(rules.warnings>0)errors.push({code:'rule_warning_summary',message:`${rules.warnings} warning(s)`});
 if(!await deps.db.latestEvalReceipt(digest))errors.push({code:'eval_receipt_absent',key:digest});
 const counts:BatchCounts={fetched:rows.length,inserted:rows.length-batch.unverified,duplicates:0,versioned:0,quarantined:rules.quarantined,failed:0};
 try{await deps.db.extractFinalize(documentId,token,runId,{chunks:batch.chunks,retries:batch.retries,candidates:rows.length,unverified:batch.unverified,rule_receipt_id:rules.receiptId});}
 catch(e){if(lost(e))return fail('lease_lost',[],[],true);throw e;}
 const batchStatus=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
 await deps.db.logAccess({document_id:documentId,user_id:by,action:'extract_run',detail:{run_id:runId,status:'succeeded',candidates:rows.length}});
 return {runId,reportId:report.report_id,status:'succeeded',counts,batchStatus,receipt,ruleReceiptId:rules.receiptId};
}
