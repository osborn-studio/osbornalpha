import {digest,inputDigest,replayObservation} from 'dsh-trade-strategy-evaluator/engine';
import type {S4Actor} from '../s4/db';
import {transaction,serverTime} from '../s4/db';
import {addRecord} from '../s4/records';
import {weekPeriod} from '../s4/cards';
import {fail} from '../ingest/pa-v1/json.js';
import {enabled,observationFor,currentMarketIds,marketFor} from './store';

/** Display and export append exposure before returning material, in the same transaction. */
export async function observationReport(actor:S4Actor,id:string,replayId?:string){
 enabled();return transaction(actor,async db=>{
  const o=await observationFor(db,actor,id),at=await serverTime(db);
  const rows=replayId?[]:(await db.query('select id,result,result_hash,receipt,created_at from research_s6_evaluations where user_id=$1 and observation_id=$2 order by (receipt->>\'revision\')::int desc limit 101',[actor.userId,id])).rows;
  const selected=replayId?(await db.query('select * from research_s6_evaluations where user_id=$1 and observation_id=$2 and id=$3',[actor.userId,id,replayId])).rows[0]:undefined;
  if(replayId&&!selected)fail('not_found');
  for(const r of rows)if(digest(r.result)!==r.result_hash)fail('hash_mismatch');
  const candidate=(await db.query('select imported from research_s4_candidates where user_id=$1 and id=$2',[actor.userId,o.candidate_id])).rows[0];
  const source=candidate.imported.sourceRef;
  await addRecord(db,actor,o.candidate_id,'ExposureEvent',{actor_ref:actor.userId,actor_kind:actor.kind,evaluation_period_id:weekPeriod(at),
   subject_refs:[digest([source.owner_system,source.owner_scope,source.source_id])],exposed_artifact_ids:replayId?[replayId]:rows.slice(0,100).map(r=>r.id),
   displayed_at:at,origin:replayId?'alpha_evaluation_replay':'alpha_evaluation_report',shadow_exposed:o.payload.observation_kind==='shadow'});
  if(selected){
   if(digest(selected.result)!==selected.result_hash||selected.receipt.result_sha256!==selected.result_hash||selected.receipt.input_sha256!==inputDigest(selected.input)||selected.receipt.evaluation_ref!==selected.id||selected.receipt.observation_ref!==id)fail('hash_mismatch');
   const outcome={ok:true as const,result:selected.result,result_sha256:selected.result_hash};
   const replay=replayObservation(selected.input,outcome);if(!replay.matches)fail('hash_mismatch');
   const markets=[];
   for(const frozen of selected.input.market_snapshots){const m=await marketFor(db,actor,frozen.id);if(m.observation_id!==id||digest(m.snapshot)!==digest(frozen))fail('hash_mismatch');markets.push(m);}
   return {schema_version:'alpha-replay-export/1.0',input:selected.input,outcome,receipt:selected.receipt,replay,anchor_status_now:o.current_anchor,
    market_evidence:markets.map(m=>({id:m.id,raw_sha256:m.snapshot.raw_sha256,evidence_sha256:m.evidence_hash,kind:m.evidence.kind,raw_response:m.raw_response,evidence:m.evidence})),
    authorization_as_of:at,synthetic:o.payload.synthetic,research_stream:o.payload.research_stream};
  }
  return {observationId:id,revision:o.revision,anchorStatus:o.current_anchor,synthetic:o.payload.synthetic,researchStream:o.payload.research_stream,
   contaminationReasons:o.payload.contamination_reasons,observationKind:o.payload.observation_kind,marketIds:await currentMarketIds(db,actor,id,at),
   brier:'not_applicable',jev:'not_run',independentBaseline:false,historyTruncated:rows.length>100,
   evaluations:rows.slice(0,100)};
 });
}
