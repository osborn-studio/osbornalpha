import {verifyStoredIntent} from './intent-receipt';
import {fail} from '../ingest/pa-v1/json';
import type {S4Actor} from '../s4/db';
import {addRecord} from '../s4/records';
import {registeredObservationTransaction} from './registered';
import {enabled,observationFor,cancelledEvaluationIntent} from './store';
/** Explicit user resolution, serialized with evaluation commits by the owner lock.
 * A negative lookup alone is insufficient: persist cancellation before acknowledging.
 */
export async function resolveEvaluationIntent(actor:S4Actor,id:string,key:string){
 enabled();if(typeof key!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(key))fail('invalid_schema');
 return registeredObservationTransaction(actor,id,async db=>{
  const observation=await observationFor(db,actor,id);
  const found=(await db.query('select * from research_s6_evaluations where user_id=$1 and idempotency_key=$2',[actor.userId,key])).rows;
  if(found.length>1)fail('hash_mismatch');const old=found[0];
  if(old&&old.observation_id!==id)fail('idempotency_conflict');
  const cancelled=await cancelledEvaluationIntent(db,actor,id,key,observation.candidate_id);
  if(old&&cancelled)fail('hash_mismatch');
  if(old){
   verifyStoredIntent(old,actor.userId,id,key);
   return {status:'committed' as const,key,evaluationId:old.id};
  }
  if(!cancelled)await addRecord(db,actor,observation.candidate_id,'ControlEvent',{
   type:'evaluation.intent_cancel',observation_ref:id,idempotency_key:key,actor_ref:actor.userId,actor_kind:actor.kind,
  });
  return {status:'cancelled' as const,key};
 });
}
