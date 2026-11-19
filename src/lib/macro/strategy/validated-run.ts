// Shared claim, durable completion and usage settlement for validated explanations.
import {parseModelContent} from './explain-validate';

export interface LlmDeps{
 resolve():Promise<{provider:string;model:string;byo:boolean}|null>;
 checkQuota():Promise<{allowed:boolean;used:number;limit:number}|null>;
 begin(usageAuditKey:string,meta:Record<string,unknown>):Promise<void>;
 call(system:string,user:string):Promise<{content:string;accounting:unknown}>;
 /** The exact finalizeUsageRun payload (status, provider, model, tokens, cost, pricingVersion, usdCnyMicros, usageEstimated,
  *  byo), computed once at completion and stored on the run row; retries replay it verbatim. */
 finalizePayload(status:'completed'|'failed',accounting:unknown[]):Record<string,unknown>;
 /** finalizeUsageRun(userId, usageAuditKey, 'perspectives', payload) with the payload verbatim. */
 finalize(usageAuditKey:string,payload:Record<string,unknown>):Promise<void>;
}
/** Thrown by LlmDeps.call when the provider call failed; accounting = meteredUsageFromError(e) (null when none). */
export class LlmCallError extends Error{constructor(message:string,readonly accounting:unknown|null=null){super(message);this.name='LlmCallError';}}
const COST_ERROR_CODES=new Set(['daily_cost_exhausted','pricing_unavailable','budget_unavailable','budget_invariant_violation','usage_audit_unavailable','usage_audit_invariant']);
export function costErrorCode(e:unknown):string|null{const c=e instanceof Error?e.message:String(e);return COST_ERROR_CODES.has(c)?c:null;}
export function costErrorStatus(code:string):number{return code==='daily_cost_exhausted'?429:code==='budget_unavailable'||code==='usage_audit_unavailable'?503:500;}

type Replay={kind:'none'}|{kind:'conflict'}|{kind:'replay';response:unknown};
type Response={status:number;body:unknown};
type Identity={actor:string;requestId:string;payloadHash:string};
interface FinishedRun{
 state:'accepted'|'rejected'|'failed';provider:string;model:string;rawOutput:unknown;validation:unknown;
 rendered:unknown;failureCodes:string[];accounting:unknown;finalizePayload:Record<string,unknown>;
}
export interface ValidatedRunStore<Claim>{
 replay(actor:string,requestId:string,payloadHash:string):Promise<Replay>;
 claim(actor:string,requestId:string,payloadHash:string):Promise<Claim>;
 recordCompletion(claim:Claim,rawOutput:unknown,finalizePayload:Record<string,unknown>):Promise<void>;
 finish(claim:Claim,r:FinishedRun):Promise<unknown>;
 markFinalized(claim:Claim):Promise<void>;
 auditKey(claim:Claim):string;
 // A competing request can win the claim after replay missed.
 existing?(claim:Claim):Response|null;
 isPayloadConflict?(error:unknown):boolean;
}
export interface ValidatedRunSubject{
 system:string;user:string;usageMeta:Record<string,unknown>;
 validate(raw:unknown):{ok:true;output:unknown}|{ok:false;codes:string[];failures:unknown};
 // TOPICS ↓
 render(output:unknown,provider:{provider:string;model:string}):unknown;
 // TOPICS ↑
 versions?:{prompt_version:string;validator_version:string};
}
type RunDeps<C>={store:ValidatedRunStore<C>;llm:LlmDeps;now():Date};
const err=(status:number,code:string,explanation?:unknown):Response=>({status,body:{error:{code,message:code},...(explanation?{explanation}:{})}});

type Prepared<C>={store:Omit<ValidatedRunStore<C>,'replay'>;subject:()=>ValidatedRunSubject};
type DeferredDeps<C>=Pick<RunDeps<C>,'llm'|'now'>&{
 replay:ValidatedRunStore<C>['replay'];load():Promise<Response|Prepared<C>>;
};
/** A macro replay must precede all manifest I/O. Its prompt is rendered after quota and before claim. */
export function runValidatedExplanation<C>(d:RunDeps<C>,a:Identity&{subject:ValidatedRunSubject}):Promise<Response>;
export function runValidatedExplanation<C>(d:DeferredDeps<C>,a:Identity):Promise<Response>;
export async function runValidatedExplanation<C>(d:RunDeps<C>|DeferredDeps<C>,a:Identity&{subject?:ValidatedRunSubject}):Promise<Response>{
 const prior='store' in d?await d.store.replay(a.actor,a.requestId,a.payloadHash):await d.replay(a.actor,a.requestId,a.payloadHash);
 if(prior.kind==='conflict')return err(409,'payload_conflict');
 if(prior.kind==='replay')return {status:200,body:prior.response};
 const prepared='store' in d?{store:d.store,subject:()=>a.subject!}:await d.load();
 if('status' in prepared)return prepared;
 const {store}=prepared;
 // step 4: model and quota (perspectives route order: resolve first, BYO skips the feature quota)
 const llm=await d.llm.resolve();
 if(!llm)return err(503,'llm_not_configured');
 if(!llm.byo){
  const quota=await d.llm.checkQuota();
  if(quota&&quota.limit!==-1&&!quota.allowed)return {status:429,body:{error:{code:'quota_exceeded',message:`${quota.used}/${quota.limit}`}}};
 }
 // model input is built BEFORE the claim, so a preparation failure (prompt file, fact rendering) never opens a usage run
 const subject=prepared.subject();
 let claim:C;
 try{claim=await store.claim(a.actor,a.requestId,a.payloadHash);}
 catch(e){if(store.isPayloadConflict?.(e))return err(409,'payload_conflict');throw e;}
 const existing=store.existing?.(claim);
 if(existing)return existing;
 const base={provider:llm.provider,model:llm.model};
 const started=d.now().getTime(),key=store.auditKey(claim);
 const record=async(rawOutput:unknown,payload:Record<string,unknown>)=>{
  try{await store.recordCompletion(claim,rawOutput,payload);}catch{/* finish stores the same payload */}
 };
 const settle=(payload:Record<string,unknown>)=>settleUsage(d.llm,key,payload,()=>store.markFinalized(claim));
 // step 6: usage run. A begin error is ambiguous (the run may have committed): record and settle a failed payload under the same key.
 try{await d.llm.begin(key,{provider:llm.provider,model:llm.model,byo:llm.byo,...subject.usageMeta});}
 catch(e){
  const code=costErrorCode(e)??'usage_audit_unavailable';
  const payload=d.llm.finalizePayload('failed',[]);
  await record(null,payload);
  let projection:unknown;
  try{projection=await store.finish(claim,{...base,state:'failed',rawOutput:null,validation:{stage:'begin',code},rendered:null,failureCodes:[code],accounting:null,finalizePayload:payload});}
  finally{await settle(payload);}
  return err(costErrorStatus(code),code,projection);
 }
 // step 7: metered model call, then the durable completion before anything else can fail
 let content:string;let accounting:unknown;
 try{({content,accounting}=await d.llm.call(subject.system,subject.user));}
 catch(e){
  const code=costErrorCode(e)??'provider_error';const acc=e instanceof LlmCallError?e.accounting:null;
  const payload=d.llm.finalizePayload('failed',acc===null?[]:[acc]);
  await record(null,payload);
  let projection:unknown;
  try{projection=await store.finish(claim,{...base,state:'failed',rawOutput:null,validation:{stage:'call',code,message:e instanceof Error?e.message:String(e)},rendered:null,failureCodes:[code],accounting:acc,finalizePayload:payload});}
  finally{await settle(payload);}
  return {status:200,body:projection};
 }
 const payload=d.llm.finalizePayload('completed',[accounting]);
 /** Completion envelope: everything finish needs, so recovery never calls the provider again (R2-1). */
 const rawOutput={content,provider:llm.provider,model:llm.model,...subject.versions,accounting:accounting??null};
 await record(rawOutput,payload);
 // step 8: validate → accepted | rejected (both are completed calls); finalize runs even if this throws
 let projection:unknown;
 try{
  const result=subject.validate(parseModelContent(content));
  const validation={...(subject.versions?{validator_version:subject.versions.validator_version}:{}),ok:result.ok,failures:result.ok?[]:result.failures,elapsed_ms:d.now().getTime()-started};
  projection=await store.finish(claim,result.ok
   // TOPICS ↓
   ?{...base,state:'accepted',rawOutput,validation,rendered:subject.render(result.output,base),failureCodes:[],accounting,finalizePayload:payload}
   // TOPICS ↑
   :{...base,state:'rejected',rawOutput,validation,rendered:null,failureCodes:result.codes,accounting,finalizePayload:payload});
 }finally{await settle(payload);}
 return {status:200,body:projection};
}

export async function settleUsage(llm:LlmDeps,key:string,payload:Record<string,unknown>,mark:()=>Promise<void>):Promise<void>{
 try{await llm.finalize(key,payload);}catch{return;}
 try{await mark();}catch{/* recovery retries settlement with the same audit key */}
}
