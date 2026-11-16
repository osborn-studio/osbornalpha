// src/lib/macro/strategy/llm-deps.ts
// Production LlmDeps for macro explanations (spec §6.3 steps 4–8). Each method makes the same calls as
// src/app/api/perspectives/[ticker]/route.ts, in the same order: resolveLlm() (BYO = source 'user');
// checkQuota('perspectives') only for platform keys, a throw other than 'not authenticated' fails open (→ null), and
// limit -1 marks the caller budget-exempt; the limiter (createPersonaConcurrencyLimiter for env keys, else
// createConcurrencyLimiter(PERSONA_CONCURRENCY_HARD_CAP)) is built right before beginUsageRun(feature 'perspectives');
// one limiter.runWithBudgetRetry(runMeteredLlmCall(chatResolved)); meteredUsageFromError on failure. finalizePayload builds
// the exact finalizeUsageRun body once, at completion (the perspectives finalizeAccounting body, without ticker: aggregate
// of the accounting rows plus the pricing version and FX in force at that moment, status included; JSON-safe, undefined
// keys dropped); it is stored on the run row (macro_record_completion) and finalize sends a payload verbatim, so an ops
// retry after a pricing or FX change replays exactly what the request computed.
// One instance serves one request. A failed call throws Task 11's LlmCallError(message, meteredUsageFromError(e)): the
// message keeps a cost error code (daily_cost_exhausted …) when that is what failed.
import {chatResolved} from '@/lib/data/sources/llm';
import {resolveLlm,type ResolvedLlm} from '@/lib/llm/resolve';
import {beginUsageRun,checkQuota,finalizeUsageRun,type RecordUsageMeta} from '@/lib/billing/quota';
import {aggregateMeteredUsage,meteredUsageFromError,runMeteredLlmCall,type MeteredUsage} from '@/lib/billing/metered-llm';
import {getBudgetConfig} from '@/lib/billing/cost-budget';
import {createConcurrencyLimiter,createPersonaConcurrencyLimiter,PERSONA_CONCURRENCY_HARD_CAP,type ConcurrencyLimiter} from '@/lib/billing/llm-concurrency';
import {PRICING_VERSION} from '@/lib/billing/llm-pricing';
import {LlmCallError,type LlmDeps} from './explain-request';
export const EXPLAIN_MAX_OUTPUT_TOKENS=1200;
export const EXPLAIN_TIMEOUT_MS=30_000;
export const EXPLAIN_TEMPERATURE=0.2;
const isMeteredUsage=(v:unknown):v is MeteredUsage=>typeof v==='object'&&v!==null&&'status' in v&&'usage' in v&&'costMicrormb' in v;
export function productionLlmDeps(userId:string):LlmDeps{
 let llm:ResolvedLlm|null=null,limiter:ConcurrencyLimiter|null=null,budgetExempt=false;
 const resolved=():ResolvedLlm=>{if(!llm)throw new Error('llm_not_resolved');return llm;};
 return {
  async resolve(){
   llm=await resolveLlm();
   return llm?{provider:llm.provider,model:llm.model,byo:llm.source==='user'}:null;
  },
  async checkQuota(){
   try{const q=await checkQuota('perspectives');budgetExempt=q.limit===-1;return {allowed:q.allowed,used:q.used,limit:q.limit};}
   catch(e){if(e instanceof Error&&e.message==='not authenticated')throw e;return null;}
  },
  async begin(usageAuditKey){
   const r=resolved(),byo=r.source==='user';
   limiter=r.source==='env'
    ?createPersonaConcurrencyLimiter({provider:r.provider,model:r.model,maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS})
    :createConcurrencyLimiter(PERSONA_CONCURRENCY_HARD_CAP);
   const budget=getBudgetConfig();
   await beginUsageRun(userId,usageAuditKey,'perspectives',{provider:r.provider,model:r.model,
    pricingVersion:byo?undefined:PRICING_VERSION,usdCnyMicros:byo?undefined:budget.usdCnyMicros,byo});
  },
  async call(system,user){
   const r=resolved();
   if(!limiter)throw new Error('usage_run_not_started');
   try{
    const metered=await limiter.runWithBudgetRetry(()=>runMeteredLlmCall({feature:'perspectives',provider:r,userId,budgetExempt,maxOutputTokens:EXPLAIN_MAX_OUTPUT_TOKENS,
     call:()=>chatResolved(r,{system,messages:[{role:'user',content:user}],max_tokens:EXPLAIN_MAX_OUTPUT_TOKENS,temperature:EXPLAIN_TEMPERATURE,timeoutMs:EXPLAIN_TIMEOUT_MS,responseJson:true})}));
    return {content:metered.value.content,accounting:metered.accounting};
   }catch(e){
    throw new LlmCallError(e instanceof Error?e.message:String(e),meteredUsageFromError(e)??null);
   }
  },
  finalizePayload(status,accounting){
   const rows=accounting.filter(isMeteredUsage);
   const aggregate=rows.length>0?aggregateMeteredUsage(rows):null;
   const budget=getBudgetConfig(),byo=llm?.source==='user';
   const body:RecordUsageMeta={
    provider:aggregate?.provider??llm?.provider??'unknown',model:aggregate?.model??llm?.model??'unknown',
    inputTokens:aggregate?.usage.inputTokens??0,cacheHitInputTokens:aggregate?.usage.cacheHitInputTokens??0,
    cacheMissInputTokens:aggregate?.usage.cacheMissInputTokens??0,outputTokens:aggregate?.usage.outputTokens??0,
    costMicrormb:aggregate?.costMicrormb??0,
    pricingVersion:aggregate?.pricingVersion??(byo?undefined:PRICING_VERSION),
    usdCnyMicros:aggregate?.usdCnyMicros??(byo?undefined:budget.usdCnyMicros),
    usageEstimated:aggregate?.usageEstimated??true,byo:aggregate?.byo??byo,status,
   };
   return JSON.parse(JSON.stringify(body)) as Record<string,unknown>;
  },
  async finalize(usageAuditKey,payload){
   await finalizeUsageRun(userId,usageAuditKey,'perspectives',payload as unknown as RecordUsageMeta);
  },
 };
}
