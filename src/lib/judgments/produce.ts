// src/lib/judgments/produce.ts
// The producer runner (spec §6.4). For each work item {subject, asOf, binding?}: gather → (binding
// must appear in some input ref: spec §6.4 / G25, so two snapshots of one region and day are two
// judgments and compensation can match by snapshot_id) → resolveTarget (Abstained →
// target_unresolvable abstention) → compute → condition → registerJudgment. Gather-time builder codes
// in ABSTAIN_CODES become abstentions. One item's failure never stops the others. Receipt for the
// caller's batch (dataset judgments.produce.<methodology_id>, plan conventions): fetched = items
// attempted; inserted = new rows (abstentions included); duplicates; quarantined (idempotency_conflict);
// failed (everything else); errors carry {code, key: subject_key, message incl. the binding} and one
// informational abstained_summary {reason: count}. An aborted signal stops before the next item and is checked right before each register RPC (the item is then 'deferred', nothing written)
// (deadline_hit, the rest 'skipped' and not counted as fetched). The caller starts / finishes the batch.
import type {BatchCounts,BatchError} from '@/lib/dq/batches';
import {emptyCounts} from '@/lib/dq/batches';
import type {Abstained,Active,Claim,Condition,Input,Methodology,ProducerRef,Target,WorkItem} from './types';
import {AbortedError,raceAbort} from './abort';
import {JudgmentError} from './errors';
import {ABSTAIN_CODES,buildOrAbstain} from './inputs';
import {IdempotencyConflict,RegisterDeferred,registerJudgment} from './register';
import type {RegisterActor,RegisterDeps} from './register';

export interface ProduceDeps extends RegisterDeps{batchId:string;codeVersion:string;signal?:AbortSignal;dryRun?:boolean;producerRef?:ProducerRef;actor?:RegisterActor['actor']}
export type ProduceItemStatus='inserted'|'duplicate'|'quarantined'|'failed'|'skipped'|'planned_insert'|'planned_abstain'|'deferred';
export interface ProduceItemResult{key:string;as_of:string;binding:Record<string,string>|null;status:ProduceItemStatus;judgment_id:string|null;abstained:boolean;code:string|null}
/** `planned` = dry-run items that would have been written (they are not in counts.inserted). */
export type ProduceWork=Omit<WorkItem,'observedAt'>;
export interface ProduceResult{counts:BatchCounts;errors:BatchError[];items:ProduceItemResult[];planned:number}
const isAbstention=(x:unknown):x is Abstained=>typeof x==='object'&&x!==null&&!Array.isArray(x)&&(x as {abstained?:unknown}).abstained===true;
export function bindingReferenced(binding:Record<string,string>,inputs:readonly Input[]):boolean{
 return Object.entries(binding).every(([k,v])=>inputs.some(x=>(x.ref as unknown as Record<string,unknown>)[k]===v));
}
interface Evaluated{inputs:Input[];outcome:Active<Claim>|Abstained;condition:Condition|null;target:Target|null}
/** Commander decision D1 (spec §6.4 / §7.1): a bound item that abstains in gather keeps its binding's own input
 *  (v1 bindings are {snapshot_id} → the macro_snapshot input) when that input can be built, so two snapshots of
 *  one region and day stay two judgments and the compensation scan finds the abstention by snapshot_id. Only the
 *  explicit permanent outcomes of buildOrAbstain (its abstain codes) yield inputs = []; any thrown error (transient
 *  fetch, macro_unavailable, …) propagates as the item's failure (review R-02). */
async function bindingInputs(m:Methodology,item:WorkItem,deps:ProduceDeps):Promise<Input[]>{
 const id=item.binding?.snapshot_id;
 if(id===undefined||!m.input_kinds.includes('macro_snapshot'))return [];
 const built=await buildOrAbstain({kind:'macro_snapshot',ref:{snapshot_id:id}},deps.inputsDb,item.asOf,item.observedAt,deps.build);
 return isAbstention(built)?[]:[built];
}
async function evaluate(m:Methodology,item:WorkItem,deps:ProduceDeps):Promise<Evaluated>{
 let gathered:Input[]|Abstained;
 try{gathered=await m.gather(item,deps.inputsDb);}
 catch(e){if(e instanceof JudgmentError&&(ABSTAIN_CODES as readonly string[]).includes(e.code))gathered={abstained:true,reason:e.code};else throw e;}
 if(isAbstention(gathered))return {inputs:await bindingInputs(m,item,deps),outcome:gathered,condition:null,target:null};
 const inputs=gathered;
 if(item.binding&&!bindingReferenced(item.binding,inputs))throw new JudgmentError('binding_not_referenced',`binding ${JSON.stringify(item.binding)} is not an input ref`);
 const target=await m.resolveTarget(item,inputs,deps.inputsDb);
 if(isAbstention(target))return {inputs,outcome:target,condition:null,target:null};
 const outcome=m.compute(item.subject,inputs);
 if(outcome.abstained)return {inputs,outcome,condition:null,target:null};
 return {inputs,outcome,condition:m.condition(item.subject,inputs,outcome.claim),target};
}
export async function produce(m:Methodology,work:readonly ProduceWork[],deps:ProduceDeps):Promise<ProduceResult>{
 let planned=0;const counts=emptyCounts();const errors:BatchError[]=[];const items:ProduceItemResult[]=[];const abstained=new Map<string,number>();
 for(let i=0;i<work.length;i++){
  const w0=work[i];const key=w0.subject.key;const binding=w0.binding??null;
  if(deps.signal?.aborted){
   errors.push({code:'deadline_hit',message:`${work.length-i} work items not processed`});
   for(const w of work.slice(i))items.push({key:w.subject.key,as_of:w.asOf,binding:w.binding??null,status:'skipped',judgment_id:null,abstained:false,code:null});
   break;
  }
  counts.fetched++;
  try{
   const item:WorkItem={...w0,observedAt:await raceAbort(deps.db.serverTime(),deps.signal,'produce.serverTime')};
   // evaluate contains reads and pure computation only; a late result cannot reach registration.
   const e=await raceAbort(evaluate(m,item,deps),deps.signal,'produce.evaluate');
   if(deps.signal?.aborted)throw new RegisterDeferred();
   const r=await registerJudgment({actor:deps.actor??'cron',dryRun:deps.dryRun},{...(item.binding?{binding:item.binding}:{}),methodology:m,subject:item.subject,asOf:item.asOf,producerRef:deps.producerRef??{},inputs:e.inputs,outcome:e.outcome,condition:e.condition,target:e.target,codeVersion:deps.codeVersion,batchId:deps.batchId},deps);
   const status:ProduceItemStatus=r.duplicate?'duplicate':r.dry_run?(r.abstained?'planned_abstain':'planned_insert'):'inserted';
   if(r.dry_run){if(!r.duplicate)planned++;}
   else if(r.duplicate)counts.duplicates++;
   else{counts.inserted++;if(r.abstained&&r.row.abstain_reason!==null)abstained.set(r.row.abstain_reason,(abstained.get(r.row.abstain_reason)??0)+1);}
   items.push({key,as_of:w0.asOf,binding,status,judgment_id:r.judgment_id,abstained:r.abstained,code:null});
  }catch(err){
   if(err instanceof RegisterDeferred||err instanceof AbortedError){   // T2-01: aborted before the register RPC — nothing written, counted deferred (info deadline_hit)
    counts.deferred=(counts.deferred??0)+1;
    errors.push({code:'deadline_hit',key,message:new RegisterDeferred().message});
    items.push({key,as_of:w0.asOf,binding,status:'deferred',judgment_id:null,abstained:false,code:'deadline_hit'});
    continue;
   }
   const code=err instanceof JudgmentError?err.code:'produce_error';
   const quarantined=err instanceof IdempotencyConflict&&err.quarantined;
   if(quarantined)counts.quarantined++;else counts.failed++;
   const message=`${err instanceof Error?err.message:String(err)}${binding?` binding=${JSON.stringify(binding)}`:''}`;
   errors.push({code,key,message});
   items.push({key,as_of:w0.asOf,binding,status:quarantined?'quarantined':'failed',judgment_id:null,abstained:false,code});
  }
 }
 if(abstained.size>0)errors.push({code:'abstained_summary',message:JSON.stringify(Object.fromEntries([...abstained].sort((a,b)=>a[0]<b[0]?-1:1)))});
 return {counts,errors,items,planned};
}
