// Admin hook for facts.* quarantine items (spec §7.3). Accepting is done entirely by the SQL
// function resolve_facts_quarantine (run_pending check on every member row AND on the item's
// anchor run payload.run_id — so an item without fact rows is also refused while its run is
// staged and stays open until that run is published or abandoned (round-1 #10); status flip,
// verdict in detail.chosen_fact_ids, promotion — one transaction). This module validates the
// verdict (same_day_conflict: chosen ⊆ payload.fact_ids with one value), calls the function,
// then runs materialize and records detail.hook = {stage, state, at, message?}; a later POST on
// a resolved_accept item with hook.state='failed' re-runs materialize only (idempotent).
// resolved_reject is the generic flip from quarantine.ts; fact rows stay quarantined.
// The SQL function stays the final authority: invalid_chosen / item_not_open / run_pending
// surface as FactsDbError (the route maps them to HTTP). For fact-row reasons the function itself
// commits detail.hook={stage:'materialize',state:'pending'} with the verdict, so an accepted item
// whose hook is missing / pending / failed is UNFINISHED: a later POST re-runs materialize only
// (never resolves again). Everything after the function commits is best-effort and never throws:
// a hook-write failure is reported as hook.state='failed' on a 'resolved' answer. Client-visible
// hook messages are codes only; full errors go to the server log.
import type {Row,TableClient} from '../db/table-client';
import {FactsDbError} from '../facts/types';
import type {FactsDb,Market} from '../facts/types';
import {decimalEquals} from '../facts/json-numbers';
import {materialize} from '../facts/derive';
import {resolveQuarantine} from './quarantine';
import type {QuarantineStatus} from './quarantine';

export interface HookState{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
export type FactsResolveOutcome='resolved'|'not_found'|'already_resolved'|'hook_retried'|'invalid_choice';
export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;promoted?:number;skipped?:number;chosenFactIds?:string[];
 /** What the route should audit: undefined = the outcome itself; null = nothing (retry of an already audited item). */
 auditAs?:'resolved'|'hook_retried'|null;
 /** Set when auditAs='resolved' on a retry: the audit row describes the PERSISTED resolution (original resolver, accept, committed ids); the retrying admin is recorded separately. */
 recovered?:{resolvedBy:string;status:'resolved_accept';chosenFactIds:string[];recoveredBy:string;recoveredAt:string}}
export interface ResolveFactsInput{status:Exclude<QuarantineStatus,'open'>;chosenFactIds?:string[];resolvedBy:string;now?:()=>Date}
/** Reason codes whose items reference fact rows; the other three (ambiguous_value, odd_duration, missing_available_date) have none. */
export const FACT_ROW_REASONS:readonly string[]=['same_day_conflict','identity_bs','identity_gp'];
const TABLE='dq_quarantine';
const MARKETS:readonly string[]=['US','CN'];

interface Payload{key?:Record<string,string|null>;fact_ids?:string[]}
const payloadOf=(item:Row):Payload=>(item.payload??{}) as Payload;
const detailOf=(item:Row):Record<string,unknown>=>(item.detail??{}) as Record<string,unknown>;
const hookOf=(item:Row):HookState|undefined=>detailOf(item).hook as HookState|undefined;
const target=(item:Row):{issuer:string;market:Market}|null=>{
 const key=payloadOf(item).key;const issuer=key?.issuer_id;const market=key?.market;
 return typeof issuer==='string'&&typeof market==='string'&&MARKETS.includes(market)?{issuer,market:market as Market}:null;
};

/** Re-reads the item (the SQL function may have written detail.chosen_fact_ids) and merges `hook` into detail. Never throws. */
async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
 try{
  const [fresh]=await tables.select(TABLE,{id},{limit:1});
  await tables.update(TABLE,{id},{detail:{...detailOf(fresh??{}),hook}});
  return hook;
 }catch(e){
  console.error('[admin/dq] hook write',e instanceof Error?e.message:String(e));
  return hook.state==='done'?{stage:hook.stage,state:'failed',at:hook.at,message:'hook_write_failed'}:hook;
 }
}

async function runHook(db:FactsDb,tables:TableClient,id:string,where:{issuer:string;market:Market}|null,now:()=>Date):Promise<HookState>{
 let hook:HookState;
 if(where===null)hook={stage:'materialize',state:'failed',at:now().toISOString(),message:'no_target'};
 else{
  try{await materialize(db,where.issuer,where.market);hook={stage:'done',state:'done',at:now().toISOString()};}
  catch(e){
   console.error('[admin/dq] materialize',e instanceof Error?e.message:String(e));
   hook={stage:'materialize',state:'failed',at:now().toISOString(),message:e instanceof FactsDbError?e.code:'materialize_failed'};
  }
 }
 return writeHook(tables,id,hook);
}

/** Marks that the audit row of this resolution was written (best-effort; a missing mark only causes one extra audit row on retry). */
export async function markAudited(tables:TableClient,id:string):Promise<void>{
 try{
  const [fresh]=await tables.select(TABLE,{id},{limit:1});
  await tables.update(TABLE,{id},{detail:{...detailOf(fresh??{}),audit_written:true}});
 }catch(e){console.error('[admin/dq] audit mark',e instanceof Error?e.message:String(e));}
}

/**
 * Resolves one facts.* item. Throws FactsDbError('run_pending') straight from the FactsDb when any
 * member row's run is still staged (the route answers 409 and the item stays open).
 */
export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput):Promise<FactsResolveResult>{
 const now=input.now??(()=>new Date());const id=String(item.id);const where=target(item);
 if(item.status!=='open'){
  const hook=hookOf(item);
  if(input.status==='resolved_accept'&&item.status==='resolved_accept'&&FACT_ROW_REASONS.includes(String(item.reason_code))&&hook?.state!=='done'&&where!==null){
   const audited=detailOf(item).audit_written===true;
   const ran=await runHook(db,tables,id,where,now);
   const persisted=detailOf(item).chosen_fact_ids;
   const chosenFactIds=Array.isArray(persisted)?persisted.map(String):[];
   const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
   if(audited)return base;
   return {...base,recovered:{resolvedBy:String(item.resolved_by),status:'resolved_accept',chosenFactIds,recoveredBy:input.resolvedBy,recoveredAt:now().toISOString()}};
  }
  return hook===undefined?{outcome:'already_resolved'}:{outcome:'already_resolved',hook};
 }
 if(input.status==='resolved_reject')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_reject',resolvedBy:input.resolvedBy})};
 const reason=String(item.reason_code);const members=payloadOf(item).fact_ids??[];
 let chosen:string[]=[];
 if(reason==='same_day_conflict'){
  chosen=[...new Set(input.chosenFactIds??[])];
  if(chosen.some(f=>!members.includes(f)))return {outcome:'invalid_choice'};
  if(chosen.length>1){
   const rows=await db.factsByIds(chosen);
   // rows that no longer exist (abandoned / deleted members) are ignored here; the SQL function decides
   if(rows.some(r=>!decimalEquals(r.value,rows[0].value)))return {outcome:'invalid_choice'};
  }
 }else if(FACT_ROW_REASONS.includes(reason))chosen=[...members];
 const {promoted,skipped,chosenFactIds}=await db.resolveFactsQuarantine(id,chosen,input.resolvedBy);
 // from here on the resolution is committed: nothing below may throw
 const hook=FACT_ROW_REASONS.includes(reason)?await runHook(db,tables,id,where,now):await writeHook(tables,id,{stage:'done',state:'done',at:now().toISOString()});
 return {outcome:'resolved',hook,promoted,skipped,chosenFactIds};
}
