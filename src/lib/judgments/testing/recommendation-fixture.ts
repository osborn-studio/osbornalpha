// src/lib/judgments/testing/recommendation-fixture.ts
// Test / script helpers for recommendation_call@v1 (Task 20): synthetic recommendations / recommendation_scores rows and the
// private golden replay fixture (spec §14.4; replay 'inputs_only'). Production code never imports this file.
import type {Recommendation,RecommendationScore} from '@/lib/supabase/database.types';
import type {JudgmentRow} from '@/lib/judgments/types';
import {inputsHash} from '@/lib/judgments/canonical';
import {REPLAY_FIXTURE_VERSION,type ReplayFixture} from '@/lib/judgments/replay';
import {NO_ISSUERS,RECOMMENDATION_HORIZON,RECOMMENDATION_METHOD,legacyFillInput,toJudgmentCard} from '@/lib/judgments/adapters/recommendation';

export const FIXTURE_REC_ID='0b7d6c2e-3f41-4a8b-9c55-6e2a1d3f4b01';
export const FIXTURE_USER_ID='5a4f3e2d-1c0b-4a9b-8c7d-6e5f4a3b2c1d';
export const FIXTURE_ANALYST_ID='9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
export function fixtureRecommendation(patch:Partial<Recommendation>={}):Recommendation{
 return {id:FIXTURE_REC_ID,user_id:FIXTURE_USER_ID,analyst_id:FIXTURE_ANALYST_ID,ticker:'600519',market:'A',action:'buy',reference_price:null,
  rationale:'synthetic fixture (plan F4 Task 20)',confidence:72,target_price:null,stop_loss:null,horizon:'short',thesis_ref:null,source_type:'manual',source_ref:null,
  recommended_at:'2026-09-14T01:30:00.000Z',created_at:'2026-09-14T01:30:00.000Z',withdrawn_at:null,withdraw_reason:null,fill_price:1452.1,fill_date:'2026-09-14',...patch};
}
export function fixtureScore(patch:Partial<RecommendationScore>={}):RecommendationScore{
 return {recommendation_id:FIXTURE_REC_ID,user_id:FIXTURE_USER_ID,scored_at:'2026-09-22T09:00:00.000Z',forward_5d_pct:2.31,forward_20d_pct:null,forward_60d_pct:null,
  hit:true,score:2.3,calibration_bucket:'60-80',last_close:1485.64,last_close_date:'2026-09-21',base_close:1452.1,base_date:'2026-09-14',...patch};
}
/** Task 13 golden format: the private card as a JudgmentRow-shaped record (never stored; subject 'security' and producer
 *  'human' are outside the public table's types, hence the cast). replayJudgment checks only the frozen input hashes →
 *  'inputs_only'; the id is domain-separated and is not recomputed (spec §11.2, §14.4). */
export function buildRecommendationReplayFixture():ReplayFixture{
 const recommendation=fixtureRecommendation();const score=fixtureScore();
 const card=toJudgmentCard(recommendation,score,NO_ISSUERS);
 const fill=legacyFillInput(recommendation);
 if(!fill||!card.condition)throw new Error('recommendation replay fixture: no legacy_fill input / condition');
 const judgment={judgment_id:card.judgment_id,subject_type:card.subject.type,subject_key:card.subject.key,judgment_type:'recommendation_call',
  methodology_id:RECOMMENDATION_METHOD.id,methodology_version:RECOMMENDATION_METHOD.version,kind:'probability',producer_kind:'human',
  producer_ref:{analyst_id:recommendation.analyst_id,source_record:{table:'recommendations',id:recommendation.id}},
  producer_nonce:`${recommendation.analyst_id}:recommendations:${recommendation.id}`,as_of:card.as_of,registered_at:card.registered_at,retrospective:card.retrospective,
  inputs:[fill],inputs_hash:inputsHash([fill]),abstained:false,abstain_reason:null,
  claim:{p:recommendation.confidence!/100,event:card.condition.text},
  condition:{resolver:'recommendation_hit',params:{recommendation_id:recommendation.id},predicate:{op:'eq',rhs:true},text:card.condition.text},
  horizon:RECOMMENDATION_HORIZON,target:card.condition.target,label_policy:card.condition.label_policy,settle_after:card.condition.settle_after,settle_by:card.condition.settle_by,
  code_version:'private-adapter',batch_id:'00000000-0000-4000-8000-000000000000',created_at:card.registered_at} as unknown as JudgmentRow;
 return {fixture_version:REPLAY_FIXTURE_VERSION,description:'recommendation_call@v1 · private · 600519 buy (synthetic); inputs_only — tampering the frozen fill → input_hash_mismatch on legacy_fill',expect:'inputs_only',judgment};
}
