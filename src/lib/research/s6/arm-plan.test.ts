import {describe,it,expect} from 'vitest';
import {digest} from '../ingest/pa-v1/json.js';
import {ARM_PAYOFF_PROTOCOL} from './arm-payoff';
import {ARM_PLAN_PROTOCOL,PLAN_ARMS,parseArmCohort,freezeArmPlan,type PlanArm} from './arm-plan';
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cohort=()=>({protocol:ARM_PLAN_PROTOCOL,enrollment_id:uuid(1),owner_id:uuid(2),candidate_id:uuid(3),thesis_id:uuid(4),security_identity_hash:'a'.repeat(64),calendar_hash:'b'.repeat(64),evaluation_policy_hash:'c'.repeat(64),enrolled_at:'2026-10-06T10:00:00.000Z',confirmation_deadline:'2026-10-06T11:00:00.000Z',session_anchor:'2026-10-07T13:30:00.000Z',observation_ids:{human_baseline:uuid(5),ai_candidate:uuid(6),collab:uuid(7)}});
const choice={protocol:ARM_PAYOFF_PROTOCOL,position:'long'};
describe('inactive prospective arm plan schema, synthetic structure only',()=>{
 it('preserves common anchor and three preallocated identities without inferring authority',()=>{
  const input=cohort();const ids=new Set<string>();
  for(const arm of PLAN_ARMS){const result=freezeArmPlan(input,arm,choice,'2026-10-06T10:30:00.000Z');ids.add(result.payload.observation_id);expect(result.payload.session_anchor).toBe(input.session_anchor);expect(result.payload_hash).toBe(digest(result.payload));expect(Object.isFrozen(result.payload.payoff)).toBe(true);}
  expect(ids.size).toBe(3);
 });
 it('takes detached frozen snapshots and binds every common field into the digest',()=>{
  const input=cohort(),parsed=parseArmCohort(input),frozen=freezeArmPlan(input,'collab',choice,'2026-10-06T10:30:00.000Z');
  input.observation_ids.collab=uuid(8);expect(parsed.observation_ids.collab).toBe(uuid(7));expect(frozen.payload.observation_id).toBe(uuid(7));expect(Object.isFrozen(parsed.observation_ids)).toBe(true);
  for(const mutation of [{enrollment_id:uuid(8)},{enrolled_at:'2026-10-06T10:00:01.000Z'},{confirmation_deadline:'2026-10-06T10:59:59.000Z'},{observation_ids:{...cohort().observation_ids,human_baseline:uuid(8)}},{owner_id:uuid(8)},{candidate_id:uuid(8)},{thesis_id:uuid(8)},{session_anchor:'2026-10-08T13:30:00.000Z'},{calendar_hash:'d'.repeat(64)},{evaluation_policy_hash:'d'.repeat(64)},{security_identity_hash:'d'.repeat(64)}])expect(freezeArmPlan({...cohort(),...mutation},'collab',choice,'2026-10-06T10:30:00.000Z').payload_hash).not.toBe(frozen.payload_hash);
 });
 it('binds arm, explicit choice and trusted cutoff, and accepts the start boundary',()=>{
  const base=freezeArmPlan(cohort(),'collab',choice,'2026-10-06T10:00:00.000Z');
  expect(base.payload.information_cutoff).toBe('2026-10-06T10:00:00.000Z');
  expect(parseArmCohort(cohort()).calendar_hash).toBe('b'.repeat(64));
  expect(freezeArmPlan(cohort(),'human_baseline',choice,'2026-10-06T10:00:00.000Z').payload_hash).not.toBe(base.payload_hash);
  expect(freezeArmPlan(cohort(),'collab',{...choice,position:'cash'},'2026-10-06T10:00:00.000Z').payload_hash).not.toBe(base.payload_hash);
  expect(freezeArmPlan(cohort(),'collab',choice,'2026-10-06T10:00:00.001Z').payload_hash).not.toBe(base.payload_hash);
  for(const arm of ['__proto__','toString'])expect(()=>freezeArmPlan(cohort(),arm as PlanArm,choice,'2026-10-06T10:30:00.000Z')).toThrow('invalid_schema');
  expect(()=>parseArmCohort({...cohort(),observation_ids:{...cohort().observation_ids,collab:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase()}})).toThrow('invalid_schema');
 });
 it('refuses construction-time deadline extension, noncanonical instants and legacy/extra fields',()=>{
  for(const time of ['2026-10-06T09:59:59.999Z','2026-10-06T11:00:00.000Z','2026-10-08T10:00:00.000Z'])expect(()=>freezeArmPlan(cohort(),'collab',choice,time)).toThrow('not_configured');
  for(const patch of [{protocol:'old'},{session_anchor:'2026-02-30T13:30:00.000Z'},{session_anchor:'2026-10-06T11:00:00.000Z'},{enrolled_at:'2026-10-06T11:00:00.000Z'},{confirmation_deadline:'2026-10-06T11:00:00Z'},{calendar_hash:'A'.repeat(64)},{actor_kind:'human'},{observation_ids:{...cohort().observation_ids,collab:uuid(5)}}])expect(()=>parseArmCohort({...cohort(),...patch})).toThrow('invalid_schema');
  expect(()=>freezeArmPlan(cohort(),'collab',{...choice,position:'adopt'},'2026-10-06T10:30:00.000Z')).toThrow('invalid_schema');
 });
 it('rejects accessor/symbol/prototype fields before evaluating accessors',()=>{
  let reads=0;const input=cohort();Object.defineProperty(input,'owner_id',{enumerable:true,get(){reads++;return uuid(2);}});expect(()=>parseArmCohort(input)).toThrow('invalid_schema');expect(reads).toBe(0);
  expect(()=>parseArmCohort({...cohort(),[Symbol('extra')]:1})).toThrow('invalid_schema');
  const proxy=new Proxy(cohort(),{getPrototypeOf(){reads++;return Object.prototype;}});expect(()=>parseArmCohort(proxy)).toThrow('invalid_schema');expect(reads).toBe(0);
  expect(()=>parseArmCohort(Object.assign(Object.create({authority:true}),cohort()))).toThrow('invalid_schema');
 });
});
