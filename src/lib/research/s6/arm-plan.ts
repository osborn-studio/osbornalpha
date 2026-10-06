import {digest,fail} from '../ingest/pa-v1/json.js';
import {exactPlanObject as object} from './arm-plan-object';
import {isUuid} from '../s4/ledger';
import {parseArmPayoffPlan,type ArmPayoffPlan} from './arm-payoff';
export const ARM_PLAN_PROTOCOL='alpha-arm-plan/1.0';
export const PLAN_ARMS=['human_baseline','ai_candidate','collab'] as const;
export type PlanArm=typeof PLAN_ARMS[number];
export interface ArmCohort {
 protocol:typeof ARM_PLAN_PROTOCOL;enrollment_id:string;owner_id:string;candidate_id:string;thesis_id:string;
 security_identity_hash:string;calendar_hash:string;evaluation_policy_hash:string;
 enrolled_at:string;confirmation_deadline:string;session_anchor:string;
 observation_ids:Readonly<Record<PlanArm,string>>;
}
function instant(value:unknown):number{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))fail('invalid_schema');
 const ms=Date.parse(value as string);
 if(!Number.isFinite(ms)||new Date(ms).toISOString()!==value)fail('invalid_schema');
 return ms;
}
/** Immutable wire schema only: no proof of owner authentication, registered grants,
 * calendar validity, independent human confirmation or exposure ordering. */
export function parseArmCohort(value:unknown):Readonly<ArmCohort>{
 const r=object(value,['protocol','enrollment_id','owner_id','candidate_id','thesis_id','security_identity_hash','calendar_hash','evaluation_policy_hash','enrolled_at','confirmation_deadline','session_anchor','observation_ids']);
 if(r.protocol!==ARM_PLAN_PROTOCOL||['enrollment_id','owner_id','candidate_id','thesis_id'].some(k=>!isUuid(r[k])))fail('invalid_schema');
 if(['security_identity_hash','calendar_hash','evaluation_policy_hash'].some(k=>typeof r[k]!=='string'||!/^[0-9a-f]{64}$/.test(r[k] as string)))fail('invalid_schema');
 const start=instant(r.enrolled_at),deadline=instant(r.confirmation_deadline),anchor=instant(r.session_anchor);
 if(!(start<deadline&&deadline<anchor))fail('invalid_schema');
 const ids=object(r.observation_ids,[...PLAN_ARMS]);
 if(PLAN_ARMS.some(a=>!isUuid(ids[a]))||new Set(Object.values(ids)).size!==3)fail('invalid_schema');
 return Object.freeze({...r,observation_ids:Object.freeze(ids)}) as unknown as Readonly<ArmCohort>;
}
/** Caller supplies persisted, owner-locked cohort and trusted server time. No runtime
 * caller yet. Caller must enforce one freeze per enrollment/arm and unique observation
 * binding with first-write persistence and idempotent retries. Never recalculate cutoff/anchor/IDs at delayed observation construction.
 * The returned hash is an integrity digest, not a signature or consent receipt. */
export function freezeArmPlan(cohort:unknown,arm:PlanArm,payoff:unknown,serverTime:string){
 const c=parseArmCohort(cohort),now=instant(serverTime);
 if(!PLAN_ARMS.includes(arm))fail('invalid_schema');
 if(now<instant(c.enrolled_at)||now>=instant(c.confirmation_deadline))fail('not_configured');
 const choice:Readonly<ArmPayoffPlan>=parseArmPayoffPlan(payoff);
 return buildArmPlan(c,arm,choice,serverTime);
}
function buildArmPlan(c:Readonly<ArmCohort>,arm:PlanArm,choice:Readonly<ArmPayoffPlan>,cutoff:string){
 const payload=Object.freeze({protocol:ARM_PLAN_PROTOCOL,cohort_hash:digest(c),enrollment_id:c.enrollment_id,owner_id:c.owner_id,candidate_id:c.candidate_id,thesis_id:c.thesis_id,
  arm,observation_id:c.observation_ids[arm],security_identity_hash:c.security_identity_hash,calendar_hash:c.calendar_hash,evaluation_policy_hash:c.evaluation_policy_hash,
  information_cutoff:cutoff,confirmation_deadline:c.confirmation_deadline,session_anchor:c.session_anchor,payoff:choice});
 return Object.freeze({payload,payload_hash:digest(payload)});

}

/** Verify canonical field equality at delayed construction against the separately trusted
 * originating freeze-event hash. Caller must resolve that event under owner lock;
 * a client-supplied expected hash would provide no immutability/authority proof.
 * No current time parameter: preserve the original cutoff and common anchor.
 * Revocation, freshness and whether construction is now allowed remain caller checks. */
export function verifyFrozenArmPlan(cohort:unknown,arm:PlanArm,value:unknown,expectedPlanHash:string){
 if(typeof expectedPlanHash!=='string'||!/^[0-9a-f]{64}$/.test(expectedPlanHash))fail('invalid_schema');
 const envelope=object(value,['payload','payload_hash']);
 const p=object(envelope.payload,['protocol','cohort_hash','enrollment_id','owner_id','candidate_id','thesis_id','arm','observation_id','security_identity_hash','calendar_hash','evaluation_policy_hash','information_cutoff','confirmation_deadline','session_anchor','payoff']);
 if(envelope.payload_hash!==expectedPlanHash)fail('hash_mismatch');
 const c=parseArmCohort(cohort),cutoff=instant(p.information_cutoff);
 if(!PLAN_ARMS.includes(arm))fail('invalid_schema');
 if(cutoff<instant(c.enrolled_at)||cutoff>=instant(c.confirmation_deadline))fail('hash_mismatch');
 const expected=buildArmPlan(c,arm,parseArmPayoffPlan(p.payoff),p.information_cutoff as string);
 if(expected.payload_hash!==expectedPlanHash)fail('hash_mismatch');
 for(const [key,v] of Object.entries(expected.payload)){
  if(key!=='payoff'&&p[key]!==v)fail('hash_mismatch');
 }
 return expected;
}
