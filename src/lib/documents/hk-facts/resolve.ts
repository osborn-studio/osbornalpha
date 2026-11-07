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
import {selectAll} from '../../db/table-client';
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

/** Closes the hook of every accepted facts.hk item that is not done yet; returns how many were fixed. */
export async function finalizeHkHooks(tables:TableClient,now:Date):Promise<number>{
 const rows=await selectAll(tables,'dq_quarantine',{dataset:HK_FACTS_ITEM_DATASET,status:'resolved_accept'},'id');
 let n=0;
 for(const r of rows){
  const detail=(r.detail&&typeof r.detail==='object'?r.detail:{}) as Record<string,unknown>;
  const hook=detail.hook as {state?:unknown}|undefined;
  if(hook?.state==='done')continue;
  n+=await tables.update('dq_quarantine',{id:r.id as string,status:'resolved_accept'},{detail:{...detail,hook:{stage:'done',state:'done',at:now.toISOString(),message:'hk_no_metrics'}}});
 }
 return n;
}
