import {digest} from 'dsh-trade-strategy-evaluator/engine';
import {fail} from '../ingest/pa-v1/json.js';
import {transaction,serverTime,type S4Actor} from '../s4/db';
import {weekPeriod} from '../s4/cards';
import {candidateFor,addRecord,replayRequest,saveRequest} from '../s4/records';
import {enabled,observationFor} from './store';
export type RelChoice='relevant'|'not_relevant'|'abstain';
/** This delivery supports disabled/fixture only. No live transport or billing permission
 * can be inferred from a document, browser field, or fixture result. */
export async function runRelFixture(actor:S4Actor,id:string,options:{mode:'disabled'|'fixture';key:string;choice:RelChoice}){
 enabled();
 if(!['disabled','fixture'].includes(options.mode))fail('not_configured');
 if(!['relevant','not_relevant','abstain'].includes(options.choice)||!/^[A-Za-z0-9:_-]{8,128}$/.test(options.key))fail('invalid_schema');
 return transaction(actor,async db=>{
  const o=await observationFor(db,actor,id),{row:candidate}=await candidateFor(db,actor,o.candidate_id);
  if(options.mode==='disabled')return {mode:'disabled',status:'not_run',calls:0};
  if(!o.payload.synthetic)fail('policy_blocked');
  const request={type:'s6.rel.fixture',observation_ref:id,input_sha256:o.payload_hash,choice:options.choice};
  const expose=async(recordId:string)=>{
   const at=await serverTime(db),source=candidate.imported.sourceRef;
   await addRecord(db,actor,o.candidate_id,'ExposureEvent',{actor_ref:actor.userId,actor_kind:actor.kind,evaluation_period_id:weekPeriod(at),
    subject_refs:[digest([source.owner_system,source.owner_scope,source.source_id])],exposed_artifact_ids:[recordId],displayed_at:at,origin:'alpha_rel_fixture',shadow_exposed:true});
  };
  const key='s6-rel:'+options.key,old=await replayRequest(db,actor,key,request);if(old){await expose(old.recordId);return old;}
  // Store only in an explicitly tagged control record; normal ChangeCards never read it.
  const run=await addRecord(db,actor,o.candidate_id,'ControlEvent',{...request,mode:'fixture',purpose:'REL',output_sha256:digest({choice:options.choice}),
   policy:{source_scope:'authorized_synthetic',external_processing:'deny',external_calls:0,budget_limit:0},
   billing:{currency:null,reservation:0,incurred:0,settled:0,state:'fixture_no_charge'},not_probability:true,baseline_effect:false});
  await expose(run.id);
  const response={mode:'fixture',status:'fixture_completed',calls:0,recordId:run.id,choice:options.choice,baseline_effect:false,real_shadow:'not_run'};
  await saveRequest(db,actor,key,request,response);return response;
 });
}
