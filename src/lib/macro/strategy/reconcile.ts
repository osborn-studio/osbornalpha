// src/lib/macro/strategy/reconcile.ts
// Settlement reconciliation of macro explanation runs (spec §13, runbook §4; plan audit R2-4). The billing wrapper cannot
// classify a failed retry: finalizeUsageRun (src/lib/billing/quota.ts) maps SQLSTATE 55000 ('usage run finalize conflict')
// to usage_audit_invariant and every other error, including P0002 'usage run not found' after three attempts, to
// usage_audit_unavailable. This module therefore reads the usage_events row by idempotency_key (= the run's
// usage_audit_key) and acts on what it finds:
//   absent   no usage run: beginUsageRun never committed, so the model was never called → markFinalized (nothing to settle)
//   pending  finalizeUsageRun(the stored payload, verbatim) → markFinalized on success
//   settled  terminal row equal to the stored payload (an earlier finalize succeeded, the mark was lost) → markFinalized
//   conflict terminal row that differs (for example failed by fail_stale_usage_runs) → left unfinalized for a person
// A lookup error on one row is reported as lookup_failed and the sweep continues. The sweep walks the whole backlog in pages of
// `limit` rows by keyset over (claimed_at, explanation_id), so conflicts and failures never block later rows, and each line is
// handed to `onLine` as soon as its row completes (a later failure cannot lose earlier receipts).
// The stored payload is never recomputed from current pricing or FX, and the model is never called. A dry run reads only.
// expectedUsageColumns mirrors finalizeUsageRun's argument mapping (defaults, integer bounding, derived cache misses).

export interface UnsettledRun{claimed_at:string;explanation_id:string;user_id:string;usage_audit_key:string;state:string;finalize_payload:Record<string,unknown>}
/** usage_events columns compared with the stored payload (bigint columns may arrive as strings). */
export interface UsageEventRow{status:string;provider:string|null;model:string|null;input_tokens:number|string|null;cache_hit_input_tokens:number|string|null;
 cache_miss_input_tokens:number|string|null;output_tokens:number|string|null;cost_micrormb:number|string|null;pricing_version:string|null;
 usd_cny_micros:number|string|null;usage_estimated:boolean|null;byo:boolean|null}
export const USAGE_EVENT_COLUMNS='status,provider,model,input_tokens,cache_hit_input_tokens,cache_miss_input_tokens,output_tokens,cost_micrormb,pricing_version,usd_cny_micros,usage_estimated,byo';
export interface ReconcileClient{
 /** macro_explanation_runs with finalize_payload set and finalized = false, ordered by (claimed_at, explanation_id), strictly after the cursor. */
 unsettledRuns(limit:number,after:RunCursor|null):Promise<UnsettledRun[]>;
 /** usage_events row whose idempotency_key equals the key, or null. */
 usageEvent(idempotencyKey:string):Promise<UsageEventRow|null>;
 /** finalizeUsageRun(userId, key, 'perspectives', payload) with the payload verbatim. */
 finalize(userId:string,idempotencyKey:string,payload:Record<string,unknown>):Promise<void>;
 markFinalized(explanationId:string):Promise<void>;
}
export interface RunCursor{claimed_at:string;explanation_id:string}
export type UsageEventClass='absent'|'pending'|'settled'|'conflict';
export type ReconcileAction='dry_run'|'marked'|'finalized_and_marked'|'finalize_failed'|'mark_failed'|'left_for_review'|'lookup_failed';
export interface ReconcileLine{explanation_id:string;usage_audit_key:string;state:string;class:UsageEventClass|'unknown';action:ReconcileAction;error?:string}

const bounded=(v:unknown):number=>typeof v==='number'&&Number.isFinite(v)?Math.min(Math.max(0,Math.trunc(v)),Number.MAX_SAFE_INTEGER):0;
const num=(v:unknown):number|null=>v===null||v===undefined?null:Number(v);
/** The usage_events values finalizeUsageRun writes for this payload (same defaults and bounding as the wrapper). */
export function expectedUsageColumns(p:Record<string,unknown>):Record<string,unknown>{
 const input=bounded(p.inputTokens??p.tokensIn),hit=bounded(p.cacheHitInputTokens);
 return {status:p.status??'completed',provider:String(p.provider??'unknown').trim(),model:String(p.model??'unknown').trim(),
  input_tokens:input,cache_hit_input_tokens:hit,cache_miss_input_tokens:p.cacheMissInputTokens===undefined?Math.max(0,input-hit):bounded(p.cacheMissInputTokens),
  output_tokens:bounded(p.outputTokens??p.tokensOut),cost_micrormb:bounded(p.costMicrormb),pricing_version:p.pricingVersion??null,
  usd_cny_micros:p.usdCnyMicros===undefined?null:bounded(p.usdCnyMicros),usage_estimated:p.usageEstimated??false,byo:p.byo};
}
export function classifyUsageEvent(ev:UsageEventRow|null,payload:Record<string,unknown>):UsageEventClass{
 if(!ev)return 'absent';
 if(ev.status==='pending')return 'pending';
 const want=expectedUsageColumns(payload);
 const got:Record<string,unknown>={status:ev.status,provider:ev.provider,model:ev.model,input_tokens:num(ev.input_tokens),cache_hit_input_tokens:num(ev.cache_hit_input_tokens),
  cache_miss_input_tokens:num(ev.cache_miss_input_tokens),output_tokens:num(ev.output_tokens),cost_micrormb:num(ev.cost_micrormb),pricing_version:ev.pricing_version,
  usd_cny_micros:num(ev.usd_cny_micros),usage_estimated:ev.usage_estimated,byo:ev.byo};
 return Object.keys(want).every(k=>want[k]===got[k])?'settled':'conflict';
}
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
/** One line per unsettled run, emitted through onLine as each completes. apply=false reads only; apply=true finalizes pending rows and marks what is settled. */
export async function reconcileSettlements(c:ReconcileClient,o:{apply:boolean;limit:number},onLine:(l:ReconcileLine)=>void=()=>{}):Promise<ReconcileLine[]>{
 const out:ReconcileLine[]=[];
 const emit=(l:ReconcileLine)=>{out.push(l);onLine(l);};
 let after:RunCursor|null=null;
 for(;;){
  const page=await c.unsettledRuns(o.limit,after);
  for(const run of page){
   const base={explanation_id:run.explanation_id,usage_audit_key:run.usage_audit_key,state:run.state};
   let cls:UsageEventClass;
   try{cls=classifyUsageEvent(await c.usageEvent(run.usage_audit_key),run.finalize_payload);}
   catch(e){emit({...base,class:'unknown',action:'lookup_failed',error:message(e)});continue;}
   const line={...base,class:cls};
   if(!o.apply){emit({...line,action:'dry_run'});continue;}
   if(cls==='conflict'){emit({...line,action:'left_for_review'});continue;}
   if(cls==='pending'){
    try{await c.finalize(run.user_id,run.usage_audit_key,run.finalize_payload);}
    catch(e){emit({...line,action:'finalize_failed',error:message(e)});continue;}
   }
   try{await c.markFinalized(run.explanation_id);emit({...line,action:cls==='pending'?'finalized_and_marked':'marked'});}
   catch(e){emit({...line,action:'mark_failed',error:message(e)});}
  }
  if(page.length<o.limit)return out;
  const last=page[page.length-1];after={claimed_at:last.claimed_at,explanation_id:last.explanation_id};
 }
}
