import Ajv from 'ajv';
import observationSchema from '../../../../docs/handoffs/alpha-s4/alpha-observation-contract.schema.json';
const validObservation=new Ajv({strict:true}).compile(observationSchema);
import { randomUUID } from 'node:crypto';
import { fail } from '../ingest/pa-v1/json.js';
import { timestamp, CALENDAR_HASH, MARKET_POLICY, MARKET_POLICY_HASH, planObservationSessions } from '../market-policy';
import { addRecord, candidateFor, replayRequest, saveRequest } from './records';
import { assertWritableChain, serverTime, transaction, type S4Actor } from './db';
import { weekPeriod } from './cards';
const uuid={type:'string',pattern:'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'};
export const DECISION_ACTIONS=['research','observe','adopt','reject','defer','refute'] as const;
export interface DecisionInput {
  requestKey:string; expectedRevision:number; action:typeof DECISION_ACTIONS[number]; reason:string;
  cardId:string; labelId:string; exposureId:string; securityTicker:string|null; companyEntityId:string|null;
  newObservation:boolean; reviewAt:string|null;
}
const validate=new Ajv({strict:true}).compile({type:'object',additionalProperties:false,
  required:['requestKey','expectedRevision','action','reason','cardId','labelId','exposureId','securityTicker','companyEntityId','newObservation','reviewAt'],
  properties:{requestKey:{type:'string',minLength:8,maxLength:128},expectedRevision:{type:'integer',minimum:0},
    action:{enum:DECISION_ACTIONS},reason:{type:'string',minLength:1,maxLength:4000},cardId:uuid,labelId:uuid,exposureId:uuid,
    securityTicker:{anyOf:[{type:'null'},{type:'string',minLength:1,maxLength:40}]},companyEntityId:{anyOf:[{type:'null'},uuid]},
    newObservation:{type:'boolean'},reviewAt:{anyOf:[{type:'null'},{type:'string',maxLength:40}]}}});

export async function submitDecision(actor:S4Actor,candidateId:string,input:DecisionInput) {
  if(!validate(input)||!input.reason.trim()) fail('invalid_schema');
  return transaction(actor,async db=>{
    await assertWritableChain(db,actor);
    const {row}=await candidateFor(db,actor,candidateId);
    const request={candidateId,...input,actor_kind:actor.kind};
    const replay=await replayRequest(db,actor,input.requestKey,request);if(replay)return replay;
    if(row.revision!==input.expectedRevision) fail('revision_conflict');
    const records=(await db.query('select id,kind,payload,payload_hash,recorded_at from public.research_s4_records where user_id=$1 and candidate_id=$2 and id=any($3::uuid[])',
      [actor.userId,candidateId,[input.cardId,input.labelId,input.exposureId]])).rows;
    const card=records.find(r=>r.id===input.cardId&&r.kind==='ChangeCard');
    const label=records.find(r=>r.id===input.labelId&&r.kind==='HumanLabel');
    const exposure=records.find(r=>r.id===input.exposureId&&r.kind==='ExposureEvent');
    const eligibilityAt=await serverTime(db),period=weekPeriod(eligibilityAt);
    if(!card||!label||!exposure||exposure.payload.baseline_label_ref!==label.id||
      !exposure.payload.exposed_artifact_ids.includes(card.id)||label.payload.evaluation_period_id!==period||
      exposure.payload.actor_kind!==actor.kind) fail('exposure_required');
    if(input.reviewAt && timestamp(input.reviewAt)<=Date.parse(eligibilityAt)) fail('invalid_schema');
    const security=input.securityTicker?(await db.query('select ticker,exchange,currency,market,metadata from public.stocks_universe where ticker=$1 and is_active=true',[input.securityTicker])).rows[0]:null;
    if(input.securityTicker&&(!security||!['XNYS','NYSE'].includes(security.exchange)||security.currency!=='USD')) fail('security_unresolved');
    if(security && !!security.metadata?.synthetic !== row.imported.synthetic) fail('scope_denied');
    const company=input.companyEntityId?(await db.query("select id,name from public.research_entities where user_id=$1 and id=$2 and type='COMPANY'",[actor.userId,input.companyEntityId])).rows[0]:null;
    if(input.companyEntityId&&!company) fail('scope_denied');
    const decisionId=randomUUID();
    const frozenAt=await serverTime(db);
    let observationId:string|null=row.last_observation_id;
    // Defer preserves the existing observation, including its original windows.
    const makeObservation=!observationId || (input.newObservation&&input.action!=='defer');
    if(makeObservation && !security) fail('security_unresolved');
    if(!makeObservation){
      const old=(await db.query("select payload from public.research_s4_records where user_id=$1 and id=$2 and kind='Observation'",[actor.userId,observationId])).rows[0]?.payload;
      if(!old || (security&&security.ticker!==old.securities[0].ticker) || (company&&company.id!==old.securities[0].company_entity_id) || card.payload.thesis_revision_ref!==old.thesis_revision_ref)fail('observation_scope_conflict');
    }
    const snapshot=await addRecord(db,actor,row.id,'InputSnapshot',{purpose:'decision_freeze',source_refs:[row.imported.sourceRef],
      source_version_id:row.source_version_id,card_ref:card.id,card_hash:card.payload_hash,
      judgment_ref:card.payload.judgment_ref,thesis_revision_ref:card.payload.thesis_revision_ref,
      wiki_reference:row.imported.wiki,wiki_available_at:row.created_at.toISOString(),input_cutoff_at:frozenAt,
      label_ref:label.id,exposure_refs:[exposure.id],rights_policy_ref:row.imported.rights.policy_id,
      company_mapping:company||null,security_mapping:security?{ticker:security.ticker,exchange:'XNYS',source_exchange:security.exchange,currency:security.currency}:null});
    if(makeObservation) {
      const predecessor=observationId;observationId=randomUUID();
      const plan=planObservationSessions(frozenAt,eligibilityAt);
      const observation={schema_version:'alpha-observation-contract/1.0',id:observationId,
        owner_scope:{user_id:actor.userId,workspace_id:null},decision_or_candidate_ref:decisionId,
        candidate_ref:row.id,thesis_revision_ref:card.payload.thesis_revision_ref,input_snapshot_ref:snapshot.id,
        input_snapshot_hash:snapshot.payload_hash,record_origin:'forward',research_stream:'descriptive',
        contamination_reasons:label.payload.contamination_reasons,actor_kind:actor.kind,synthetic:row.imported.synthetic,
        observation_kind:input.action==='reject'?'shadow':'decision',securities:[{ticker:security.ticker,exchange:'XNYS',currency:'USD',company_entity_id:company?.id||null,synthetic:!!security.metadata?.synthetic}],
        frozen_at:frozenAt,recorded_at:frozenAt,eligibility_at:eligibilityAt,start_rule:MARKET_POLICY.start_rule,
        start_plan:plan,actual_start_at:null,windows:MARKET_POLICY.windows_trading_sessions.map(n=>({trading_sessions:n,starts_at:null,ends_at:null,result:null})),
        benchmarks:[MARKET_POLICY.benchmark],currency_basis:MARKET_POLICY.currency,return_method:MARKET_POLICY.return_method,
        market_policy_version:MARKET_POLICY.schema_version,market_policy_hash:MARKET_POLICY_HASH,market_policy:MARKET_POLICY,
        calendar_version:MARKET_POLICY.calendar_version,calendar_hash:CALENDAR_HASH,status:'pending_start',
        predecessor_id:predecessor,anchor_status:'anchor_pending',provenance_level:'local_receipt'};
      if(!validObservation(observation)) fail('invalid_schema');
      await addRecord(db,actor,row.id,'Observation',observation,{id:observationId});
      await db.query('insert into public.research_s4_observation_state(user_id,observation_id) values($1,$2)',[actor.userId,observationId]);
    }
    const relatedAfter=(await db.query("select id,payload from public.research_s4_records where user_id=$1 and kind='ExposureEvent' and payload->>'evaluation_period_id'=$2 and payload->'subject_refs' ?| $3::text[]",[actor.userId,period,exposure.payload.subject_refs])).rows;
    const afterReasons=[...label.payload.contamination_reasons,...(relatedAfter.some(e=>e.payload.shadow_exposed)?['shadow_exposed']:[])];
    const after=await addRecord(db,actor,row.id,'HumanLabel',{phase:'after_display',actor_kind:actor.kind,judgment:input.reason,action:input.action,baseline_label_ref:label.id,baseline_workflow_exposure_refs:relatedAfter.map(e=>e.id),independent:false,research_stream:'descriptive',contamination_reasons:afterReasons,evaluation_period_id:period});
    await addRecord(db,actor,row.id,'Decision',{id:decisionId,candidate_ref:row.id,actor_ref:actor.userId,actor_kind:actor.kind,
      action:input.action,reason:input.reason,expected_revision:input.expectedRevision,revision:row.revision+1,
      card_ref:card.id,input_snapshot_ref:snapshot.id,observation_ref:observationId,thesis_revision_ref:card.payload.thesis_revision_ref,
      prior_label_ref:label.id,after_label_ref:after.id,exposure_refs:[exposure.id],decided_at:frozenAt,recorded_at:frozenAt,
      research_stream:'descriptive',review_at:input.reviewAt,preserves_original_window:!makeObservation,
      selection:{security_ticker:security?.ticker||null,company_entity_id:company?.id||null}},{id:decisionId});
    await addRecord(db,actor,row.id,'Review',{decision_ref:decisionId,action:input.action,reason:input.reason,
      review_at:input.reviewAt,previous_observation_ref:row.last_observation_id,observation_ref:observationId,
      status:input.action==='defer'?'deferred':'recorded',old_windows_preserved:true});
    const updated=await db.query(`update public.research_s4_candidates set revision=revision+1,status=$3,last_observation_id=$4
      where user_id=$1 and id=$2 and revision=$5`,[actor.userId,row.id,input.action,observationId,input.expectedRevision]);
    if(updated.rowCount!==1) fail('revision_conflict');
    const state=(await db.query('select status,anchor_status from public.research_s4_observation_state where user_id=$1 and observation_id=$2',[actor.userId,observationId])).rows[0];
    const response={decisionId,observationId,revision:row.revision+1,status:state.status,anchorStatus:state.anchor_status,duplicate:false};
    await saveRequest(db,actor,input.requestKey,request,response);return response;
  });
}
