// Storage bridge for the validated request lifecycle. Project only the admin response fields.
import type {ValidatedRunStore} from '@/lib/macro/strategy/validated-run';
import {TopicsDbError,type RenderedSummary,type SummaryClaim,type SummaryResult,type SummarySubject,type TopicsDb} from '../types';

function projection(r:SummaryResult){
 const validation=r.validation;
 const failure_codes=validation&&typeof validation==='object'&&'failure_codes' in validation?validation.failure_codes:[];
 return {run_id:r.run_id,state:r.state,summary:r.summary,validation,failure_codes};
}
export function summaryRunStore(db:TopicsDb,subject:SummarySubject):ValidatedRunStore<SummaryClaim>{
 const claim=(actor:string,requestId:string,payloadHash:string)=>db.claimSummary({...subject,actor,requestId,payloadHash});
 return {
  async replay(actor,requestId,payloadHash){
   const prior=await db.summaryRunByRequest(actor,requestId);
   if(!prior)return {kind:'none'};
   if(prior.payload_hash!==payloadHash)return {kind:'conflict'};
   return {kind:'replay',response:projection(await claim(actor,requestId,payloadHash))};
  },
  claim,
  existing:c=>c.replayed?{status:200,body:projection(c)}:null,
  isPayloadConflict:e=>e instanceof TopicsDbError&&e.code==='payload_conflict',
  auditKey:c=>c.usage_audit_key,
  recordCompletion:(c,rawOutput,finalizePayload)=>db.recordSummaryCompletion({runId:c.run_id,rawOutput,finalizePayload}),
  async finish(c,r){
   const validation={...(r.validation as Record<string,unknown>),failure_codes:r.failureCodes};
   return projection(await db.finishSummary({...r,runId:c.run_id,validation,rendered:r.rendered as RenderedSummary|null}));
  },
  markFinalized:c=>db.markSummaryFinalized(c.run_id),
 };
}
