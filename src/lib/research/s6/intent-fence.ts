import {digest,fail} from '../ingest/pa-v1/json';
import type {S4Actor} from '../s4/db';
import {addRecord,replayRequest,saveRequest} from '../s4/records';
import {registeredObservationTransaction} from './registered';
import {enabled,observationFor} from './store';
/** Recovery primitive behind the authenticated fence-intents route. Explicitly advances the observation revision so any
 * previously prepared, uncommitted evaluation is rejected. Already committed
 * evaluations remain intact. Retrying a recovery key must not fence newer work.
 */
export async function fenceEvaluationIntents(actor:S4Actor,id:string,key:string){
 enabled();if(typeof key!=='string'||!/^[A-Za-z0-9:_-]{8,100}$/.test(key))fail('invalid_schema');
// This entry point always acquires the owner lock itself; there is no unlocked
 // database-client overload. Unique indexes are defense in depth, not arbitration.
 return registeredObservationTransaction(actor,id,async db=>{
  const observation=await observationFor(db,actor,id),requestKey='intent-fence:'+key;
  const request={operation:'evaluation.intent_fence',observationId:id,key};
  const events=(await db.query("select id,candidate_id,payload,payload_hash from research_s4_records where user_id=$1 and kind='ControlEvent' and payload->>'type'='evaluation.intent_fence' and payload->>'request_key'=$2",[actor.userId,key])).rows;
  if(events.length>1)fail('hash_mismatch');
  const old=await replayRequest(db,actor,requestKey,request);
  if(old){
   if(old.status!=='fenced'||old.key!==key||!Number.isSafeInteger(old.revision)||old.revision<1||old.revision>observation.revision||typeof old.recordId!=='string')fail('hash_mismatch');
   const row=events[0];
   if(!row||row.id!==old.recordId)fail('hash_mismatch');
   const expected={type:'evaluation.intent_fence',observation_ref:id,request_key:key,previous_revision:old.revision-1,revision:old.revision,actor_ref:actor.userId,actor_kind:row?.payload.actor_kind};
   if(!row||row.candidate_id!==observation.candidate_id||!['human','agent'].includes(row.payload.actor_kind)||digest(row.payload)!==row.payload_hash||digest(row.payload)!==digest(expected))fail('hash_mismatch');
   return {status:'fenced' as const,key,revision:old.revision,recordId:old.recordId};
  }
  // An orphan immutable event must never cause a second fence after receipt loss.
  if(events.length)fail('hash_mismatch');
  if(!Number.isSafeInteger(observation.revision)||observation.revision>=2147483647)fail('revision_conflict');
  const revision=observation.revision+1;
  const changed=await db.query('update research_s4_observation_state set revision=$3 where user_id=$1 and observation_id=$2 and revision=$4',[actor.userId,id,revision,observation.revision]);
  if(changed.rowCount!==1)fail('revision_conflict');
  const event=await addRecord(db,actor,observation.candidate_id,'ControlEvent',{type:'evaluation.intent_fence',observation_ref:id,request_key:key,previous_revision:observation.revision,revision,actor_ref:actor.userId,actor_kind:actor.kind});
  const response={status:'fenced' as const,key,revision,recordId:event.id};
  await saveRequest(db,actor,requestKey,request,response);
  return response;
 });
}
