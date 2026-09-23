/** Synthetic readiness only. No network transport or paid account permission.
 * Durable incurred state precedes adapter dispatch; uncertain outcomes retain the
 * entire reservation until an explicit fixture receipt settles the run.
 */
import type {PoolClient} from 'pg';
import {digest} from 'dsh-trade-strategy-evaluator/engine';
import {fail} from '../ingest/pa-v1/json';
import {transaction,type S4Actor} from '../s4/db';
import {addRecord} from '../s4/records';
import {enabled,observationFor} from './store';
import type {RelChoice} from './shadow';

export interface RelFixtureRequest {
 purpose:'REL'; mode:'fixture'; observation_ref:string; observation_sha256:string;
 policy:{source_scope:'authorized_synthetic';external_processing:'deny';external_calls:0;unit:'fixture_credit';max_credits:number;timeout_ms:number;not_probability:true};
}
export interface RelFixtureAdapter {
 kind:'fixture'; version:string;
 evaluate(request:RelFixtureRequest,signal:AbortSignal):Promise<unknown>;
}
type Run={request_key:string;observation_id:string;candidate_id:string;request_hash:string;request:RelFixtureRequest;state:string;reserved:number|string;actual:number|string|null;receipt_hash:string|null;choice:RelChoice|null;failure_code:string|null};
const validKey=(s:string)=>typeof s==='string'&&/^[A-Za-z0-9:_-]{8,128}$/.test(s);
const credits=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=1_000_000_000;
async function getRun(db:PoolClient,actor:S4Actor,key:string):Promise<Run>{
 const r=(await db.query('select * from research_s6_rel_runs where user_id=$1 and request_key=$2',[actor.userId,key])).rows[0];
 if(!r)fail('not_found');return r;
}
function summary(run:Run){return {mode:'fixture',real_shadow:'not_run',key:run.request_key,state:run.state,reservedCredits:Number(run.reserved),actualCredits:run.actual===null?null:Number(run.actual),unit:'fixture_credit',failureCode:run.failure_code};}
async function event(db:PoolClient,actor:S4Actor,run:Run,type:string,detail:Record<string,unknown>={}){
 await addRecord(db,actor,run.candidate_id,'ControlEvent',{type:'rel.readiness.'+type,request_key:run.request_key,observation_ref:run.observation_id,request_sha256:run.request_hash,mode:'fixture',unit:'fixture_credit',...detail});
}

export async function runRelReadiness(actor:S4Actor,id:string,options:{mode:'disabled'|'fixture';key:string;maxCredits:number;timeoutMs:number},adapter?:RelFixtureAdapter){
 enabled();
 if(options.mode==='disabled')return {mode:'disabled',real_shadow:'not_run',state:'not_run'};
 if(options.mode!=='fixture'||!adapter||adapter.kind!=='fixture')fail('not_configured');
 if(!adapter)throw Error('unreachable');
 if(!validKey(options.key)||!validKey(adapter.version)||!credits(options.maxCredits)||options.maxCredits===0||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>30000)fail('invalid_schema');
 const reserved=await transaction(actor,async db=>{
  const o=await observationFor(db,actor,id);if(!o.payload.synthetic)fail('policy_blocked');
  const request:RelFixtureRequest={purpose:'REL',mode:'fixture',observation_ref:id,observation_sha256:o.payload_hash,
   policy:{source_scope:'authorized_synthetic',external_processing:'deny',external_calls:0,unit:'fixture_credit',max_credits:options.maxCredits,timeout_ms:options.timeoutMs,not_probability:true}};
  const hash=digest({request,adapter_version:adapter.version});
  const old=(await db.query('select * from research_s6_rel_runs where user_id=$1 and request_key=$2',[actor.userId,options.key])).rows[0];
  if(old){if(old.request_hash!==hash)fail('idempotency_conflict');return {run:old as Run,dispatch:false};}
  const limit=(await db.query('select * from research_s6_rel_limits where user_id=$1',[actor.userId])).rows[0];
  const used=Number((await db.query("select coalesce(sum(case when state='settled' then actual when state='released' then 0 else reserved end),0) as used from research_s6_rel_runs where user_id=$1",[actor.userId])).rows[0].used);
  if(!limit||limit.hard_stop||used+options.maxCredits>Number(limit.credit_limit))fail('budget_blocked');
  await db.query("insert into research_s6_rel_runs(user_id,request_key,observation_id,candidate_id,request_hash,request,state,reserved) values($1,$2,$3,$4,$5,$6,'reserved',$7)",[actor.userId,options.key,id,o.candidate_id,hash,request,options.maxCredits]);
  const run=await getRun(db,actor,options.key);await event(db,actor,run,'reserved',{credits:options.maxCredits});return {run,dispatch:true};
 });
 if(!reserved.dispatch)return summary(reserved.run); // Never dispatch a replay, even after a crash.
 const incurred=await transaction(actor,async db=>{
  const run=await getRun(db,actor,options.key);if(run.state!=='reserved')return false;
  await observationFor(db,actor,id);
  const limit=(await db.query('select * from research_s6_rel_limits where user_id=$1',[actor.userId])).rows[0];
  const used=Number((await db.query("select coalesce(sum(case when state='settled' then actual when state='released' then 0 else reserved end),0) as used from research_s6_rel_runs where user_id=$1",[actor.userId])).rows[0].used);
  if(!limit||limit.hard_stop||used>Number(limit.credit_limit)){await db.query("update research_s6_rel_runs set state='released' where user_id=$1 and request_key=$2",[actor.userId,options.key]);await event(db,actor,run,'released',{reason:'hard_stop_before_dispatch'});return false;}
  await db.query("update research_s6_rel_runs set state='incurred' where user_id=$1 and request_key=$2",[actor.userId,options.key]);await event(db,actor,run,'incurred');return true;
 });
 if(!incurred)return transaction(actor,async db=>summary(await getRun(db,actor,options.key)));
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 let receipt:unknown,failureCode='invalid_receipt';
 try{
  receipt=await Promise.race([Promise.resolve().then(()=>adapter.evaluate(structuredClone(reserved.run.request),controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},options.timeoutMs);})]);
 }catch{receipt=null;failureCode=controller.signal.aborted?'timeout':'adapter_error';}finally{clearTimeout(timer);}
 return transaction(actor,async db=>{
  const run=await getRun(db,actor,options.key);
  const r=receipt as {choice?:unknown;actualCredits?:unknown;receiptRef?:unknown}|null;
  const valid=r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).sort().join(',')==='actualCredits,choice,receiptRef'&&typeof r.choice==='string'&&['relevant','not_relevant','abstain'].includes(r.choice)&&credits(r.actualCredits)&&typeof r.receiptRef==='string'&&validKey(r.receiptRef);
  // Reconciliation may have won the lock while the adapter was still running.
  // Preserve the late accounting evidence without exposing its REL choice.
  if(run.state!=='incurred'){
   if(valid){
    await event(db,actor,run,'late_receipt',{actual_credits:r.actualCredits,receipt_ref:r.receiptRef,receipt_sha256:digest({actualCredits:r.actualCredits,receiptRef:r.receiptRef})});
    if(Number(r.actualCredits)!==Number(run.actual??run.reserved))await db.query('update research_s6_rel_limits set hard_stop=true where user_id=$1',[actor.userId]);
   }else await event(db,actor,run,'late_receipt_invalid',{reason:failureCode});
   return summary(run);
  }
  if(!valid){await db.query("update research_s6_rel_runs set state='unknown',failure_code=$3 where user_id=$1 and request_key=$2",[actor.userId,options.key,failureCode]);await event(db,actor,run,'unknown',{reason:failureCode});}
  else{
   await db.query("update research_s6_rel_runs set state='settled',actual=$3,choice=$4,receipt_hash=$5 where user_id=$1 and request_key=$2",[actor.userId,options.key,r.actualCredits,r.choice,digest(receipt)]);
   if(Number(r.actualCredits)>Number(run.reserved))await db.query('update research_s6_rel_limits set hard_stop=true where user_id=$1',[actor.userId]);
   await event(db,actor,run,'settled',{actual_credits:r.actualCredits,receipt_ref:r.receiptRef,receipt_sha256:digest({actualCredits:r.actualCredits,receiptRef:r.receiptRef})});
  }
  // No REL choice is returned/displayed here. Display must use the exposure path.
  return summary(await getRun(db,actor,options.key));
 });
}

/** Explicit fixture reconciliation, no inferred release on timeout/401/restart. */
export async function settleRelFixture(actor:S4Actor,key:string,receipt:{actualCredits:number;receiptRef:string}){
 enabled();if(!receipt||Object.keys(receipt).sort().join(',')!=='actualCredits,receiptRef'||!validKey(key)||!credits(receipt.actualCredits)||!validKey(receipt.receiptRef))fail('invalid_schema');
 return transaction(actor,async db=>{
  const run=await getRun(db,actor,key);
  if(run.state==='settled'){if(run.receipt_hash!==digest(receipt))fail('idempotency_conflict');return summary(run);}
  if(!['unknown','incurred'].includes(run.state))fail('revision_conflict');
  await db.query("update research_s6_rel_runs set state='settled',actual=$3,receipt_hash=$4 where user_id=$1 and request_key=$2",[actor.userId,key,receipt.actualCredits,digest(receipt)]);
  if(receipt.actualCredits>Number(run.reserved))await db.query('update research_s6_rel_limits set hard_stop=true where user_id=$1',[actor.userId]);
  await event(db,actor,run,'reconciled',{actual_credits:receipt.actualCredits,receipt_ref:receipt.receiptRef,receipt_sha256:digest(receipt)});
  return summary(await getRun(db,actor,key));
 });
}

/** Crash before incurred means dispatch never began. Release only that state. */
export async function releaseRelReservation(actor:S4Actor,key:string){
 enabled();if(!validKey(key))fail('invalid_schema');
 return transaction(actor,async db=>{
  const run=await getRun(db,actor,key);if(run.state==='released')return summary(run);
  if(run.state!=='reserved')fail('revision_conflict');
  await db.query("update research_s6_rel_runs set state='released' where user_id=$1 and request_key=$2",[actor.userId,key]);
  await event(db,actor,run,'released',{reason:'explicit_pre_dispatch_recovery'});
  return summary(await getRun(db,actor,key));
 });
}
