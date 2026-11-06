// src/lib/dq/facts-resolver.ts
// Admin hook for facts.* quarantine items (plan 2 spec §7.3; plan 3 spec §4.6, §5.6, T10).
// Accept dispatch (exhaustive; tests mirror this table):
//  ambiguous_value + chosenCandidateIndex → adopt: the filing comes from the candidate's filingRef
//   (findFilingBySourceRef, source by market; the payload is not trusted); readFacts of that issuer
//   at `today` for the candidate's period (every concept, history:true so a later disclosure cannot
//   hide the filing's own rows; truncated → conflict read_truncated) gives stateRev and the rows of the
//   candidate's filing at its active generation that the plan-2 §7 statement rules check together
//   with the candidate (failure → rule_failed, nothing written; plan audit P1); then a batch (producer dq-resolver, dataset = item.dataset) and adoptCandidate under
//   stateRev (stale_evaluation → re-read and re-evaluate once, then 409); materialize T(issuer).
//  reconcile_mismatch → restore: inputsHashNow(item) is injected (the hash of the CURRENT inputs,
//   plan 3 Task 14c); absent → conflict not_passing + restoreNote 'reconcile_wiring_missing', an
//   {unavailable} answer → that note ('inputs_unavailable' | 'current_evidence_unavailable', plan audit
//   P2); nothing written, never promotes. restoreReconciled → materialize
//   the persisted target; promoted 0 → restore_note 'no_rows_promoted' with the skipped reasons.
//  lineage_conflict + keepFactId → resolveLineageConflict → materialize T (natural key's first
//   segment); without keepFactId → invalid_choice (keep_fact_id_required): the generic resolver
//   would promote every member.
//  reconcile_review → the plan-1 status flip (accept and reject alike): no promotion, no hook.
//  every other reason → the plan-2 path (resolve_facts_quarantine; ambiguous_value without an index
//   is an acknowledgement).
// Reject is the plan-1 flip for every reason; fact rows stay quarantined. The three new visibility
// verdicts write detail.hook = pending and the target (detail.issuer_id/market) in their SQL
// transaction; every later hook / audit write patches ONLY its key through patchQuarantineDetail
// (row lock, plan audit P4), never a read-then-replace of detail; an accepted item whose hook is missing / pending / failed is UNFINISHED and a later
// POST re-runs materialize only, on the persisted target (materialize re-derives T(i) then).
// Code → outcome: invalid_choice / invalid_candidate → invalid_choice (400); generation_moved /
// conflict_exists / duplicate / replay_required / filing_not_found / not_passing / lineage_changed
// / scope_missing / unresolved / stale_evaluation (after the retry) / read_truncated → conflict (409);
// item_not_open, batch_mismatch and anything else are thrown (the route: 409 already_resolved /
// 500). Everything after a verdict commits is best-effort and never throws. Client-visible hook
// messages are codes only; full errors go to the server log.
import type {Row,TableClient} from '../db/table-client';
import {CONCEPT_IDS,MAPPING_VERSION} from '../facts/concepts';
import {materialize} from '../facts/derive';
import {decimalEquals} from '../facts/json-numbers';
import {evaluateFactRules} from '../facts/rules';
import {FactsDbError} from '../facts/types';
import type {FactCandidate,FactInsert,FactRow,FactsDb,FilingRow,Market} from '../facts/types';
import {emptyCounts,finishBatch,startBatch} from './batches';
import {DATASETS} from './datasets';
import {patchQuarantineDetail,resolveQuarantine} from './quarantine';
import type {QuarantineStatus} from './quarantine';

export interface HookState{stage:'materialize'|'done';state:'done'|'failed';at:string;message?:string}
export type FactsResolveOutcome='resolved'|'not_found'|'already_resolved'|'hook_retried'|'invalid_choice'|'rule_failed'|'conflict';
export interface FactsResolveResult{outcome:FactsResolveOutcome;hook?:HookState;promoted?:number;skipped?:number;chosenFactIds?:string[];
 /** machine code of a refusal (rule id, SQL code) */
 code?:string;
 /** why a reconcile_mismatch restore was refused before reaching SQL (route: detail.restore_note) */
 restoreNote?:'reconcile_wiring_missing'|InputsUnavailable['unavailable'];
 adoptedFactId?:string;
 restore?:{promoted:number;skipped:{fact_id:string;reason:string}[];restore_note?:'no_rows_promoted'};
 quarantined?:number;
 /** What the route should audit: undefined = the outcome itself; null = nothing (retry of an already audited item). */
 auditAs?:'resolved'|'hook_retried'|null;
 /** Set when auditAs='resolved' on a retry: the audit row describes the PERSISTED resolution (original resolver, accept, committed ids); the retrying admin is recorded separately. */
 recovered?:{resolvedBy:string;status:'resolved_accept';chosenFactIds:string[];recoveredBy:string;recoveredAt:string}}
/** Why the current inputs of a reconcile_mismatch item cannot be hashed now (restore stays refused). */
export interface InputsUnavailable{unavailable:'inputs_unavailable'|'current_evidence_unavailable'}
/** Hash of the CURRENT reconciliation inputs of a reconcile_mismatch item (computeInputsHash over left raw_hash, the pair's CURRENT right evidence sha256, gold/sample sha256, parser version), or why it cannot be computed now. */
export type InputsHashNow=(item:Row)=>Promise<string|InputsUnavailable>;
export interface ResolveFactsInput{status:Exclude<QuarantineStatus,'open'>;chosenFactIds?:string[];chosenCandidateIndex?:number;keepFactId?:string;resolvedBy:string;now?:()=>Date;
 /** the evaluation date of an adoption (default: now's UTC date) */
 today?:string;
 inputsHashNow?:InputsHashNow}
/** Reason codes whose plan-2 items reference fact rows; the other three (ambiguous_value, odd_duration, missing_available_date) have none. */
export const FACT_ROW_REASONS:readonly string[]=['same_day_conflict','identity_bs','identity_gp'];
/** Reasons with a plan-3 visibility verdict (adopt / restore / lineage). */
export const VERDICT_REASONS:readonly string[]=['ambiguous_value','reconcile_mismatch','lineage_conflict'];
const TABLE='dq_quarantine';
const MARKETS:readonly string[]=['US','CN'];
const CHOICE_CODES:readonly string[]=['invalid_choice','invalid_candidate'];
const CONFLICT_CODES:readonly string[]=['generation_moved','conflict_exists','duplicate','replay_required','filing_not_found','not_passing','lineage_changed','scope_missing','unresolved','stale_evaluation','read_truncated','target_not_active','use_dedicated_resolver'];
const PROBE_ID='00000000-0000-4000-8000-000000000000';

interface Payload{key?:Record<string,string|null>;fact_ids?:string[];candidates?:unknown}
const payloadOf=(item:Row):Payload=>(item.payload??{}) as Payload;
const detailOf=(item:Row):Record<string,unknown>=>(item.detail??{}) as Record<string,unknown>;
const hookOf=(item:Row):HookState|undefined=>detailOf(item).hook as HookState|undefined;
const marketOfDataset=(d:unknown):Market|null=>d===DATASETS.facts('US')?'US':d===DATASETS.facts('CN')?'CN':null;
class RuleFailed extends Error{constructor(public rule:string){super(rule);this.name='RuleFailed';}}

/** Where an item materialises: the persisted detail.issuer_id/market (plan-3 verdicts and reconciliation items), else payload.key (plan-2 items). */
export function hookTarget(item:Row):{issuer:string;market:Market}|null{
 const d=detailOf(item);
 if(typeof d.issuer_id==='string'&&typeof d.market==='string'&&MARKETS.includes(d.market))return {issuer:d.issuer_id,market:d.market as Market};
 const key=payloadOf(item).key;const issuer=key?.issuer_id;const market=key?.market;
 return typeof issuer==='string'&&typeof market==='string'&&MARKETS.includes(market)?{issuer,market:market as Market}:null;
}
/** An accepted item whose materialisation is not done: plan-2 fact-row reasons, or a plan-3 verdict that actually changed visibility. */
function unfinished(item:Row):boolean{
 if(item.status!=='resolved_accept'||hookOf(item)?.state==='done')return false;
 const reason=String(item.reason_code);const d=detailOf(item);
 if(FACT_ROW_REASONS.includes(reason))return true;
 if(reason==='ambiguous_value')return typeof d.adopted_fact_id==='string';
 if(reason==='reconcile_mismatch')return typeof d.restored_by_batch==='string';
 if(reason==='lineage_conflict')return Array.isArray(d.chosen_fact_ids);
 return false;
}

/** Sets detail.hook alone through patchQuarantineDetail (row lock; plan audit P4): a concurrent verdict or result written meanwhile is kept. Never throws. */
export async function writeHook(tables:TableClient,id:string,hook:HookState):Promise<HookState>{
 try{
  await patchQuarantineDetail(tables,id,'hook',hook);
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

/** Marks that the audit row of this resolution was written: detail.audit_written alone, through patchQuarantineDetail (plan audit P4). Best-effort; a missing mark only causes one extra audit row on retry. */
export async function markAudited(tables:TableClient,id:string):Promise<void>{
 try{await patchQuarantineDetail(tables,id,'audit_written',true);}
 catch(e){console.error('[admin/dq] audit mark',e instanceof Error?e.message:String(e));}
}

/** A verdict under its own dq-resolver batch; the batch is finished whatever happens (best-effort after success). */
async function withBatch<T>(tables:TableClient,dataset:string,body:(batchId:string)=>Promise<T>):Promise<T>{
 const {batchId}=await startBatch(tables,{producer:'dq-resolver',dataset,triggeredBy:'manual'});
 const counts=emptyCounts();counts.fetched=1;
 let out:T;
 try{out=await body(batchId);}
 catch(e){
  counts.failed=1;
  await finishBatch(tables,batchId,{counts,errors:[{code:e instanceof FactsDbError?e.code:e instanceof RuleFailed?'rule_failed':'unknown'}]}).catch(err=>console.error('[admin/dq] batch finish',err instanceof Error?err.message:String(err)));
  throw e;
 }
 counts.inserted=1;
 await finishBatch(tables,batchId,{counts,errors:[]}).catch(err=>console.error('[admin/dq] batch finish',err instanceof Error?err.message:String(err)));
 return out;
}
function mapRefusal(e:unknown):FactsResolveResult|null{
 if(e instanceof RuleFailed)return {outcome:'rule_failed',code:e.rule};
 if(!(e instanceof FactsDbError))return null;
 if(CHOICE_CODES.includes(e.code))return {outcome:'invalid_choice',code:e.code};
 if(CONFLICT_CODES.includes(e.code))return {outcome:'conflict',code:e.code};
 return null;
}
/** Shape check of a persisted FactCandidate before any read; the SQL function stays the final authority. */
function candidateOf(x:unknown):FactCandidate|null{
 if(!x||typeof x!=='object'||Array.isArray(x))return null;
 const c=x as Record<string,unknown>;
 const s=(k:string)=>typeof c[k]==='string'&&(c[k] as string).length>0;
 if(!s('concept')||!s('sourceConcept')||!s('unit')||!s('filingRef')||!s('rawHash')||!s('periodEnd')||!s('value'))return null;
 if(!['IS','BS','CF','DEI'].includes(String(c.statement))||!['3M','6M','9M','12M','INSTANT'].includes(String(c.duration)))return null;
 if(!(c.periodStart===null||s('periodStart'))||(c.periodStart===null)!==(c.duration==='INSTANT'))return null;
 return c as unknown as FactCandidate;
}
/**
 * plan-2 §7 statement rules on {candidate} ∪ EVERY ok row of the candidate's filing at the filing's
 * active generation (the read carries history, so rows a later disclosure superseded still count —
 * they are the filing's own balancing inputs; plan audit P1); the failing rule id, else null.
 */
function ruleFailure(c:FactCandidate,filing:FilingRow,rows:FactRow[]):string|null{
 const row:FactInsert={fact_id:PROBE_ID,issuer_id:filing.issuer_id,market:filing.market,filing_id:filing.filing_id,concept:c.concept,source_concept:c.sourceConcept,statement:c.statement,period_start:c.periodStart,period_end:c.periodEnd,
  duration:c.duration,value:c.value,unit:c.unit,consolidation:'consolidated',available_date:filing.available_date,mapping_gen:filing.mapping_gen,mapping_version:MAPPING_VERSION,raw_hash:c.rawHash};
 const own=rows.filter(r=>r.filing_id===filing.filing_id&&r.mapping_gen===filing.mapping_gen&&r.status==='ok');
 const res=evaluateFactRules({newRows:[row],okRows:own,sourceRefOf:new Map([[filing.filing_id,filing.source_ref]]),issuerId:filing.issuer_id,market:filing.market,mappingGen:filing.mapping_gen});
 return res.quarantine.find(q=>q.factIds.includes(PROBE_ID))?.reason??null;
}

async function adopt(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
 const id=String(item.id);const index=input.chosenCandidateIndex!;const market=marketOfDataset(item.dataset);
 const cands=payloadOf(item).candidates;
 if(market===null||!Array.isArray(cands)||!Number.isInteger(index)||index<0||index>=cands.length)return {outcome:'invalid_choice',code:'invalid_choice'};
 const cand=candidateOf(cands[index]);if(!cand)return {outcome:'invalid_choice',code:'invalid_candidate'};
 const filing=await db.findFilingBySourceRef(market==='US'?'edgar':'tushare',cand.filingRef);
 if(!filing||filing.market!==market)return {outcome:'conflict',code:'filing_not_found'};
 const today=input.today??now().toISOString().slice(0,10);
 const evaluate=async()=>{
  // history:true — a later disclosure must not hide the candidate filing's own rows; a truncated read could (plan audit P1)
  const read=await db.readFacts(filing.issuer_id,filing.market,{concepts:[...CONCEPT_IDS],asOf:today,from:cand.periodEnd,to:cand.periodEnd,history:true});
  if(read.truncated)throw new FactsDbError('read_truncated');
  return {stateRev:read.stateRev,failure:ruleFailure(cand,filing,read.rows)};
 };
 let ev:Awaited<ReturnType<typeof evaluate>>;
 try{ev=await evaluate();}catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 if(ev.failure!==null)return {outcome:'rule_failed',code:ev.failure};
 let out:Awaited<ReturnType<FactsDb['adoptCandidate']>>;
 try{
  out=await withBatch(tables,String(item.dataset),async batchId=>{
   try{return await db.adoptCandidate(id,index,batchId,ev.stateRev,input.resolvedBy);}
   catch(e){
    if(!(e instanceof FactsDbError)||e.code!=='stale_evaluation')throw e;
    ev=await evaluate();                                                     // one re-read and re-evaluation
    if(ev.failure!==null)throw new RuleFailed(ev.failure);
    return db.adoptCandidate(id,index,batchId,ev.stateRev,input.resolvedBy);
   }
  });
 }catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 // committed: nothing below may throw
 const hook=await runHook(db,tables,id,{issuer:out.issuerId,market:out.market},now);
 return {outcome:'resolved',hook,adoptedFactId:out.factId,chosenFactIds:[out.factId]};
}

async function restore(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
 if(!input.inputsHashNow)return {outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'};
 const id=String(item.id);const hash=await input.inputsHashNow(item);
 if(typeof hash!=='string')return {outcome:'conflict',code:'not_passing',restoreNote:hash.unavailable};
 let r:Awaited<ReturnType<FactsDb['restoreReconciled']>>;
 try{r=await withBatch(tables,String(item.dataset),batchId=>db.restoreReconciled(id,batchId,hash,input.resolvedBy));}
 catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 const hook=await runHook(db,tables,id,hookTarget(item),now);
 return {outcome:'resolved',hook,promoted:r.promoted,restore:{promoted:r.promoted,skipped:r.skipped,...(r.promoted===0?{restore_note:'no_rows_promoted' as const}:{})}};
}

async function lineageVerdict(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput,now:()=>Date):Promise<FactsResolveResult>{
 if(input.keepFactId===undefined)return {outcome:'invalid_choice',code:'keep_fact_id_required'};
 const id=String(item.id);const keep=input.keepFactId;const market=marketOfDataset(item.dataset);
 let r:{quarantined:number};
 try{r=await withBatch(tables,String(item.dataset),batchId=>db.resolveLineageConflict(id,keep,batchId,input.resolvedBy));}
 catch(e){const m=mapRefusal(e);if(m)return m;throw e;}
 const target=String(item.natural_key).split(':')[0];
 const hook=await runHook(db,tables,id,market?{issuer:target,market}:null,now);
 return {outcome:'resolved',hook,quarantined:r.quarantined,chosenFactIds:[keep]};
}

/**
 * Resolves one facts.* item (dispatch in the header). Throws FactsDbError('run_pending') straight
 * from the FactsDb when any member row's run is still staged (the route answers 409 and the item
 * stays open), and item_not_open / batch_mismatch / unknown errors likewise.
 */
export async function resolveFactsItem(db:FactsDb,tables:TableClient,item:Row,input:ResolveFactsInput):Promise<FactsResolveResult>{
 const now=input.now??(()=>new Date());const id=String(item.id);const where=hookTarget(item);
 if(item.status!=='open'){
  const hook=hookOf(item);
  if(input.status==='resolved_accept'&&unfinished(item)&&where!==null){
   const audited=detailOf(item).audit_written===true;
   const ran=await runHook(db,tables,id,where,now);
   const persisted=detailOf(item).chosen_fact_ids;
   const chosenFactIds=Array.isArray(persisted)?persisted.map(String):typeof detailOf(item).adopted_fact_id==='string'?[String(detailOf(item).adopted_fact_id)]:[];
   const base:FactsResolveResult={outcome:'hook_retried',hook:ran,chosenFactIds,auditAs:audited?(ran.state==='done'?'hook_retried':null):'resolved'};
   if(audited)return base;
   return {...base,recovered:{resolvedBy:String(item.resolved_by),status:'resolved_accept',chosenFactIds,recoveredBy:input.resolvedBy,recoveredAt:now().toISOString()}};
  }
  return hook===undefined?{outcome:'already_resolved'}:{outcome:'already_resolved',hook};
 }
 if(input.status==='resolved_reject')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_reject',resolvedBy:input.resolvedBy})};
 const reason=String(item.reason_code);
 if(reason==='reconcile_review')return {outcome:await resolveQuarantine(tables,id,{status:'resolved_accept',resolvedBy:input.resolvedBy})};
 if(reason==='ambiguous_value'&&input.chosenCandidateIndex!==undefined)return adopt(db,tables,item,input,now);
 if(reason==='reconcile_mismatch')return restore(db,tables,item,input,now);
 if(reason==='lineage_conflict')return lineageVerdict(db,tables,item,input,now);
 const members=payloadOf(item).fact_ids??[];
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
