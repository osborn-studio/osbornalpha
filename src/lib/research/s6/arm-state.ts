import {fail} from '../ingest/pa-v1/json.js';
export const ARM_ENROLLMENT_STATES=Object.freeze(['enrolled','baseline_confirmed','ai_exposed','collaboration_confirmed','observation_bindings_complete','terminated'] as const);
export type ArmEnrollmentState=typeof ARM_ENROLLMENT_STATES[number];
export const ARM_ENROLLMENT_EVENTS=Object.freeze(['baseline.confirmed','ai.exposed','collaboration.confirmed','bindings.completed','terminated'] as const);
export type ArmEnrollmentEvent=typeof ARM_ENROLLMENT_EVENTS[number];
const forward:Partial<Record<ArmEnrollmentState,readonly [ArmEnrollmentEvent,ArmEnrollmentState]>>={
 enrolled:['baseline.confirmed','baseline_confirmed'],
 baseline_confirmed:['ai.exposed','ai_exposed'],
 ai_exposed:['collaboration.confirmed','collaboration_confirmed'],
 collaboration_confirmed:['bindings.completed','observation_bindings_complete'],
};
/** Inactive ordering gate only, not an event replay verifier or authority receipt.
 * Caller must authenticate owner confirmations, enforce deadline/exposure/source checks,
 * prove all distinct immutable plan bindings and append events under owner lock.
 * Exact retries must resolve persisted idempotency BEFORE this gate; a repeated event
 * must not append a second event or silently refreeze a plan. Termination is irreversible,
 * including source revocation after completion; completed does not authorize a report. */
export function nextArmEnrollmentState(state:unknown,event:unknown):ArmEnrollmentState{
 if(typeof state!=='string'||!ARM_ENROLLMENT_STATES.includes(state as ArmEnrollmentState)||typeof event!=='string'||!ARM_ENROLLMENT_EVENTS.includes(event as ArmEnrollmentEvent))fail('invalid_schema');
 if(state==='terminated')fail('terminal_state');
 if(event==='terminated')return 'terminated';
 const edge=forward[state as ArmEnrollmentState];
 if(!edge||edge[0]!==event)fail('invalid_transition');
 return edge![1];
}
