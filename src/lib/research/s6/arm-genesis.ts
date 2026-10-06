import {digest,fail} from '../ingest/pa-v1/json.js';
import {isUuid} from '../s4/ledger';
import {exactPlanObject as object} from './arm-plan-object';
import {ARM_PAYOFF_PROTOCOL} from './arm-payoff';
import {parseArmSourceBundle,type ArmSourceBundle} from './arm-source-bundle';
export const ARM_COHORT_PROTOCOL='alpha-arm-cohort/2.0';
const ARMS=['human_baseline','ai_candidate','collab'] as const;
export interface ArmGenesis {
 readonly protocol:typeof ARM_COHORT_PROTOCOL;
 readonly owner_id:string;readonly enrollment_id:string;readonly candidate_id:string;readonly thesis_id:string;
 readonly observation_ids:Readonly<Record<typeof ARMS[number],string>>;
 readonly calendar_session_ref:string;readonly calendar_hash:string;readonly security_identity_hash:string;readonly evaluation_policy_hash:string;
 readonly payoff_protocol:typeof ARM_PAYOFF_PROTOCOL;
 readonly created_at:string;readonly confirmation_deadline:string;readonly session_anchor:string;
 readonly creator_actor_ref:string;readonly authorization_ref:string;readonly authorization_hash:string;
 readonly source_bundle:Readonly<ArmSourceBundle>;
}
function hash(v:unknown){return typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);}
function instant(v:unknown):number {
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))fail('invalid_schema');
 const ms=Date.parse(v as string);if(!Number.isFinite(ms)||new Date(ms).toISOString()!==v)fail('invalid_schema');return ms;
}
/** Inactive v2 genesis wire only. All origins, source approvals, calendar/evaluation
 * versions, fresh thesis slot, creator/authorization and preallocated observations
 * require trusted owner-locked resolution. Submitted timestamps and UUIDs do not
 * establish server time, actual owner intent, source rights or human independence. */
export function parseArmGenesis(value:unknown):Readonly<ArmGenesis>{
 const r=object(value,['protocol','owner_id','enrollment_id','candidate_id','thesis_id','observation_ids','calendar_session_ref','calendar_hash','security_identity_hash','evaluation_policy_hash','payoff_protocol','created_at','confirmation_deadline','session_anchor','creator_actor_ref','authorization_ref','authorization_hash','source_bundle']);
 if(r.protocol!==ARM_COHORT_PROTOCOL||r.payoff_protocol!==ARM_PAYOFF_PROTOCOL||['owner_id','enrollment_id','candidate_id','thesis_id','calendar_session_ref','creator_actor_ref','authorization_ref'].some(k=>!isUuid(r[k]))||['calendar_hash','security_identity_hash','evaluation_policy_hash','authorization_hash'].some(k=>!hash(r[k])))fail('invalid_schema');
 const ids=object(r.observation_ids,[...ARMS]);
 if(ARMS.some(k=>!isUuid(ids[k]))||new Set(Object.values(ids)).size!==3)fail('invalid_schema');
 const start=instant(r.created_at),deadline=instant(r.confirmation_deadline),anchor=instant(r.session_anchor);
 if(!(start<deadline&&deadline<anchor))fail('invalid_schema');
 const source_bundle=parseArmSourceBundle(r.source_bundle);
 // New v2 objects have disjoint identities. Owner/creator principal identifiers
 // are excluded: an authenticated owner actor may legitimately reuse owner_id.
 const identities=[r.enrollment_id,r.candidate_id,r.thesis_id,r.calendar_session_ref,r.authorization_ref,...Object.values(ids),source_bundle.source_reference.feed_id,source_bundle.source_reference.source_id,...Object.values(source_bundle.purpose_map).filter(g=>g!==null).map(g=>g.grant_id)];
 if(new Set(identities).size!==identities.length)fail('invalid_schema');
 return Object.freeze({...r,observation_ids:Object.freeze(ids),source_bundle}) as unknown as Readonly<ArmGenesis>;
}
/** Expected digest must be independently loaded from trusted immutable genesis
 * storage, never supplied alongside a client-rehashed payload. No use authority is
 * granted by this integrity check; full typed-origin/permission resolution remains. */
export function verifyArmGenesis(value:unknown,expectedGenesisHash:unknown){
 if(!hash(expectedGenesisHash))fail('invalid_schema');
 const payload=parseArmGenesis(value),genesis_hash=digest(payload);
 if(genesis_hash!==expectedGenesisHash)fail('hash_mismatch');
 return Object.freeze({payload,genesis_hash,integrity_only:true as const});
}
