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
// surface as FactsDbError (the route maps them to HTTP).
import type {Row,TableClient} from '../db/table-client';
import type {FactsDb,Market} from '../facts/types';
import {decimalEquals} from '../facts/json-numbers';
import {materialize} from '../facts/derive';
import {resolveQuarantine} from './quarantine';
import type {QuarantineStatus} from './quarantine';

export interface HookState{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
export type FactsResolveOutcome='resolved'|'not_found'|'already_resolved'|'hook_retried'|'invalid_choice';
export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;promoted?:number;skipped?:number;chosenFactIds?:string[]}
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

/** Re-reads the item (the SQL function may have written detail.chosen_fact_ids) and merges `hook` into detail. */
async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
 const [fresh]=await tables.select(TABLE,{id},{limit:1});
 await tables.update(TABLE,{id},{detail:{...detailOf(fresh??{}),hook}});
 return hook;
}

async function runHook(db:FactsDb,tables:TableClient,id:string,issuer:string,market:Market,now:()=>Date):Promise<HookState>{
 let hook:HookState;
 try{await materialize(db,issuer,market);hook={stage:'done',state:'done',at:now().toISOString()};}
 catch(e){hook={stage:'materialize',state:'failed',at:now().toISOString(),message:(e instanceof Error?e.message:String(e)).slice(0,200)};}
 return writeHook(tables,id,hook);
}

/**
 * Resolves one facts.* item. Throws FactsDbError('run_pending') straight from the FactsDb when any
 * member row's run is still staged (the route answers 409 and the item stays open).
 */
export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput):Promise<FactsResolveResult>{
 const now=input.now??(()=>new Date());const id=String(item.id);const where=target(item);
 if(item.status!=='open'){
  const hook=hookOf(item);
  if(item.status==='resolved_accept'&&hook?.state==='failed'&&where!==null)return {outcome:'hook_retried',hook:await runHook(db,tables,id,where.issuer,where.market,now)};
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
   if(rows.length!==chosen.length||rows.some(r=>!decimalEquals(r.value,rows[0].value)))return {outcome:'invalid_choice'};
  }
 }else if(FACT_ROW_REASONS.includes(reason))chosen=[...members];
 const {promoted,skipped}=await db.resolveFactsQuarantine(id,chosen,input.resolvedBy);
 const hook=where!==null&&FACT_ROW_REASONS.includes(reason)?await runHook(db,tables,id,where.issuer,where.market,now):await writeHook(tables,id,{stage:'done',state:'done',at:now().toISOString()});
 return {outcome:'resolved',hook,promoted,skipped,chosenFactIds:chosen};
}
