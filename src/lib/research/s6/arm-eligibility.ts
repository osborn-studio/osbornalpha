import {fail} from '../ingest/pa-v1/json.js';
import {isUuid,DECISION_ACTIONS} from '../s4/ledger';

/** Routing projection only. Passing this check does NOT authorize disclosure:
 * caller must still prove ledger/S4 lineage and guard every candidate together. */
export interface ArmRoutingRow {
 decision_id:string;thesis_id:string;week_of:string;arm:'human_baseline'|'ai_candidate'|'collab';
 action:string;observation_id:string;research_card_id:string;
}
export function validateArmSince(value:unknown):string|undefined {
 if(value===undefined)return undefined;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('invalid_schema');
 return value as string;
}
/** Reject the entire bounded window, never silently filter rows or deduplicate observations. */
export function validateRegisteredArmWindow(input:unknown):ReadonlyArray<Readonly<ArmRoutingRow>> {
 if(!Array.isArray(input))fail('invalid_schema');
 const rows=input as unknown[];
 if(rows.length>100)fail('input_limit');
 const decisions=new Set<string>(),observations=new Set<string>(),cohorts=new Set<string>();
 const out:ArmRoutingRow[]=[];
 for(const value of rows){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('invalid_schema');
  const r=value as Record<string,unknown>;
  // Snapshot each routing field once; getters must not change emitted values after validation.
  const {decision_id,thesis_id,week_of,arm,action,observation_id,card_id:research_card_id,cited_judgment_ids}=r;
  if(!isUuid(decision_id)||!isUuid(thesis_id)||typeof week_of!=='string'||!DECISION_ACTIONS.includes(action as typeof DECISION_ACTIONS[number]))fail('invalid_schema');
  validateArmSince(week_of);
  if(!isUuid(observation_id)||!isUuid(research_card_id)||!['human_baseline','ai_candidate','collab'].includes(arm as string))fail('not_configured');
  if(!Array.isArray(cited_judgment_ids))fail('invalid_schema');
  if((cited_judgment_ids as unknown[]).length)fail('not_configured');
  const row={decision_id,thesis_id,week_of,arm,action,observation_id,research_card_id} as ArmRoutingRow;
  if(decisions.has(row.decision_id)||observations.has(row.observation_id))fail('not_configured');
  // One observation per thesis/week/arm: never select a latest winner by input order.
  const cohort=JSON.stringify([row.thesis_id,row.week_of,row.arm]);
  if(cohorts.has(cohort))fail('not_configured');
  cohorts.add(cohort);
  decisions.add(row.decision_id);observations.add(row.observation_id);
  out.push(Object.freeze(row));
 }
 return Object.freeze(out);
}
