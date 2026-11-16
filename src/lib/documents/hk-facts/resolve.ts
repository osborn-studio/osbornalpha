// src/lib/documents/hk-facts/resolve.ts
// Admin verdicts on HK fact quarantine items (spec §4.8 resolve_hk_facts_quarantine, §7.7 第 5 步,
// §9 POST /api/admin/documents/hk-quarantine/[id], R5-12). Accept validates the verdict like
// dq/facts-resolver.ts (same_day_conflict: chosen ⊆ payload.fact_ids, one numeric value; identity
// items: every member) and calls the SQL function, which promotes and closes the hook
// ({stage:'done', state:'done', message:'hk_no_metrics'}) in the same transaction — HK has no
// metrics to materialize (R5-3). Reject is the generic plan-1 flip (fact rows stay quarantined).
// finalizeHkHooks repairs items accepted through the GENERIC route (/api/admin/dq/quarantine/[id]:
// spec-2 resolveFactsItem promotes but records hook 'no_target' failed for a market it does not
// know): every resolved_accept facts.hk item whose hook is not done gets the done hook. The
// candidates cron calls it at the start of its promote phase.
import type {Row,TableClient} from '../../db/table-client';
import {resolveQuarantine} from '../../dq/quarantine';
import {decimalEquals} from '../../facts/json-numbers';
import type {HkFactsPort} from './facts-port';

export const HK_FACTS_ITEM_DATASET='facts.hk';
const FACT_ROW_REASONS:readonly string[]=['same_day_conflict','identity_bs','identity_gp'];
export type HkResolveOutcome='resolved'|'not_found'|'already_resolved'|'not_hk_item'|'invalid_choice'|'run_pending';
export interface HkResolveInput{status:'resolved_accept'|'resolved_reject';chosenFactIds?:string[];resolvedBy:string}
export interface HkResolveResult{outcome:HkResolveOutcome;promoted?:number;skipped?:number;chosenFactIds?:string[]}
const codeOf=(e:unknown):string|null=>{const c=(e as {code?:unknown}|null)?.code;return typeof c==='string'?c:null;};
const membersOf=(item:Row):string[]=>{const p=(item.payload??{}) as {fact_ids?:unknown};return Array.isArray(p.fact_ids)?p.fact_ids.filter((x):x is string=>typeof x==='string'):[];};

export async function resolveHkFactsItem(port:Pick<HkFactsPort,'resolveHkFactsQuarantine'|'factsByIds'>,tables:TableClient,item:Row,input:HkResolveInput):Promise<HkResolveResult>{
 if(item.dataset!==HK_FACTS_ITEM_DATASET||item.table_name!=='financial_facts')return {outcome:'not_hk_item'};
 if(item.status!=='open')return {outcome:'already_resolved'};
 const id=String(item.id);
 if(input.status==='resolved_reject')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_reject',resolvedBy:input.resolvedBy})};
 const reason=String(item.reason_code);const members=membersOf(item);
 let chosen:string[]=[];
 if(reason==='same_day_conflict'){
  chosen=[...new Set(input.chosenFactIds??[])];
  if(chosen.some(f=>!members.includes(f)))return {outcome:'invalid_choice'};
  if(chosen.length>1){
   const rows=await port.factsByIds(chosen);
   if(rows.some(r=>!decimalEquals(r.value,rows[0].value)))return {outcome:'invalid_choice'};
  }
 }else if(FACT_ROW_REASONS.includes(reason))chosen=[...members];
 try{
  const r=await port.resolveHkFactsQuarantine(id,chosen,input.resolvedBy);
  return {outcome:'resolved',promoted:r.promoted,skipped:r.skipped,chosenFactIds:r.chosenFactIds};
 }catch(e){
  const c=codeOf(e);
  if(c==='run_pending')return {outcome:'run_pending'};
  if(c==='invalid_chosen')return {outcome:'invalid_choice'};
  if(c==='not_hk_item')return {outcome:'not_hk_item'};
  if(c==='item_not_open')return {outcome:'already_resolved'};
  throw e;
 }
}

export const HOOK_REPAIR_LIMIT=500;
const HOOK_BATCH=100;
/** Server-side repair (migration one finalize_hk_hooks): picks only items whose detail.hook.state is not 'done' and merges ONLY detail.hook (detail || jsonb_build_object('hook', …)). */
export interface HookRepair{finalize(limit:number,atIso:string):Promise<number>}
export function supabaseHookRepair(admin:{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>}):HookRepair{
 return {async finalize(limit,atIso){
  const {data,error}=await admin.rpc('finalize_hk_hooks',{p_limit:limit,p_at:atIso});
  if(error)throw new Error(error.message);
  return Number(data);
 }};
}
const doneHook=(now:Date)=>({stage:'done',state:'done',at:now.toISOString(),message:'hk_no_metrics'});

/**
 * Closes the hook of accepted facts.hk items that are not done yet; returns how many were fixed.
 * Bounded: at most opts.limit items (default 500) and nothing after opts.deadline. With opts.hooks
 * (production: supabaseHookRepair) the selection and the detail.hook merge happen in SQL; without
 * it the generic TableClient path scans accepted items (equality filters only) and rewrites each
 * item's detail with the hook replaced.
 */
export async function finalizeHkHooks(tables:TableClient,now:Date,opts:{limit?:number;deadline?:Date|null;hooks?:HookRepair;clock?:()=>Date}={}):Promise<number>{
 const limit=opts.limit??HOOK_REPAIR_LIMIT;
 if(!Number.isInteger(limit)||limit<1)throw new Error('invalid_limit');
 const expired=()=>opts.deadline!=null&&(opts.clock?.()??new Date())>=opts.deadline;
 let n=0;
 if(opts.hooks){
  while(n<limit&&!expired()){
   const want=Math.min(HOOK_BATCH,limit-n);
   const got=await opts.hooks.finalize(want,now.toISOString());
   n+=got;if(got<want)break;
  }
  return n;
 }
 for(let offset=0;n<limit&&!expired();offset+=HOOK_BATCH){
  const rows=await tables.select('dq_quarantine',{dataset:HK_FACTS_ITEM_DATASET,status:'resolved_accept'},{orderBy:'id',offset,limit:HOOK_BATCH});
  if(rows.length===0)break;
  for(const r of rows){
   if(n>=limit||expired())break;
   const detail=(r.detail&&typeof r.detail==='object'?r.detail:{}) as Record<string,unknown>;
   if((detail.hook as {state?:unknown}|undefined)?.state==='done')continue;
   n+=await tables.update('dq_quarantine',{id:r.id as string,status:'resolved_accept'},{detail:{...detail,hook:doneHook(now)}});
  }
  if(rows.length<HOOK_BATCH)break;
 }
 return n;
}
