import {digest,fail} from '../ingest/pa-v1/json.js';
import {isUuid} from '../s4/ledger';
import type {ArmRoutingRow} from './arm-eligibility';

export interface ArmLineageRecord {id:string;user_id:string;candidate_id:string;kind:string;payload:Record<string,unknown>;payload_hash:string}
/** Pure verification of S4 record linkage supplied by an owner-scoped DB read.
 * Does not authorize a grant or establish the separate ResearchCard provenance.
 * Caller must validate candidate registration, observation state/supersession, full arm provenance and ledger row in the same transaction. */
export function validateArmS4Lineage(owner:string,row:Readonly<ArmRoutingRow>,records:ReadonlyArray<ArmLineageRecord>){
 if(!isUuid(owner)||records.length!==6)fail('hash_mismatch');
 const byId=new Map(records.map(r=>[r.id,r]));
 if(byId.size!==6)fail('hash_mismatch');
 const observation=byId.get(row.observation_id);
 if(!observation||!isUuid(observation.candidate_id))fail('hash_mismatch');
 const candidate=observation!.candidate_id;
 const get=(id:unknown,kind:string)=>{
  if(!isUuid(id))fail('hash_mismatch');
  const r=byId.get(id as string);
  if(!r||r.kind!==kind||r.user_id!==owner||r.candidate_id!==candidate||digest(r.payload)!==r.payload_hash)fail('hash_mismatch');
  return r!;
 };
 const o=get(row.observation_id,'Observation');
 const d=get(o.payload.decision_or_candidate_ref,'Decision');
 const s=get(o.payload.input_snapshot_ref,'InputSnapshot');
 const c=get(s.payload.card_ref,'ChangeCard');
 const t=get(o.payload.thesis_revision_ref,'ThesisRevision');
 const l=get(s.payload.label_ref,'HumanLabel');
 if(o.payload.id!==o.id||o.payload.candidate_ref!==candidate||o.payload.input_snapshot_hash!==s.payload_hash||d.payload.observation_ref!==o.id||d.payload.input_snapshot_ref!==s.id||d.payload.card_ref!==c.id||s.payload.card_hash!==c.payload_hash||d.payload.prior_label_ref!==l.id)fail('hash_mismatch');
 if([d,s,c].some(r=>r.payload.thesis_revision_ref!==t.id)||c.payload.thesis_id!==row.thesis_id||t.payload.thesis_id!==row.thesis_id)fail('not_configured');
 if(l.payload.evaluation_period_id!==row.week_of||l.payload.phase!=='before_display')fail('not_configured');
 if(row.arm==='human_baseline'&&(l.payload.actor_kind!=='human'||l.payload.independent!==true))fail('not_configured');
 // Only the two actions with identical semantics in both namespaces are supported.
 if(row.action!=='adopt'&&row.action!=='reject')fail('not_configured');
 if(d.payload.action!==row.action||o.payload.observation_kind!==(row.action==='reject'?'shadow':'decision'))fail('not_configured');
 // row.decision_id belongs to research_decisions, not the S4 Decision record namespace.
 // Deliberately no comparison of row.research_card_id with c.id: different namespaces.
 return Object.freeze({candidate_id:candidate,observation_id:o.id,s4_decision_id:d.id,input_snapshot_id:s.id,s4_change_card_id:c.id,thesis_revision_id:t.id,prior_label_id:l.id});
}
