import {describe,it,expect,vi} from 'vitest';
import {digest} from '../ingest/pa-v1/json.js';
import {ARM_PAYOFF_PROTOCOL} from './arm-payoff';
import {ARM_PLAN_PROTOCOL,PLAN_ARMS,parseArmCohort,freezeArmPlan,verifyFrozenArmPlan,type PlanArm} from './arm-plan';
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

describe('delayed frozen-plan verification, synthetic integrity only',()=>{
 const freeze=()=>freezeArmPlan(cohort(),'collab',choice,'2026-10-06T10:30:00.000Z');
 it('recovers identical immutable bytes after JSON roundtrip without a construction clock',()=>{
  const original=freeze(),persisted=JSON.parse(JSON.stringify(original));
  const restored=verifyFrozenArmPlan(cohort(),'collab',persisted,original.payload_hash);
  expect(restored.payload).not.toBe(persisted.payload);expect(restored.payload.payoff).not.toBe(persisted.payload.payoff);
  for(const value of [restored,restored.payload,restored.payload.payoff])expect(Object.isFrozen(value)).toBe(true);
  expect(restored).toEqual(original);expect(digest(restored.payload)).toBe(original.payload_hash);
  persisted.payload.payoff.position='cash';persisted.payload.information_cutoff='2026-10-06T10:59:00.000Z';
  expect(restored.payload.payoff.position).toBe('long');expect(restored.payload.information_cutoff).toBe('2026-10-06T10:30:00.000Z');
 });
 it('rejects repaired payload hashes against the separately trusted origin and every identity binding',()=>{
  const original=freeze();
  for(const patch of [{owner_id:uuid(8)},{candidate_id:uuid(8)},{enrollment_id:uuid(8)},{thesis_id:uuid(8)},{arm:'human_baseline'},{observation_id:uuid(8)},{session_anchor:'2026-10-08T13:30:00.000Z'},{confirmation_deadline:'2026-10-06T11:00:01.000Z'},{information_cutoff:'2026-10-06T10:31:00.000Z'},{calendar_hash:'d'.repeat(64)},{evaluation_policy_hash:'d'.repeat(64)},{security_identity_hash:'d'.repeat(64)},{cohort_hash:'d'.repeat(64)},{protocol:'other'},{payoff:{...choice,position:'cash'}}]){
   const payload={...original.payload,...patch};expect(()=>verifyFrozenArmPlan(cohort(),'collab',{payload,payload_hash:digest(payload)},original.payload_hash)).toThrow('hash_mismatch');
  }
  expect(()=>verifyFrozenArmPlan(cohort(),'human_baseline',original,original.payload_hash)).toThrow('hash_mismatch');
  expect(()=>verifyFrozenArmPlan({...cohort(),observation_ids:{...cohort().observation_ids,human_baseline:uuid(8)}},'collab',original,original.payload_hash)).toThrow('hash_mismatch');
 });
 it('rejects unchanged-hash payload mutation and exact-shape violations',()=>{
  const original=freeze();
  expect(()=>verifyFrozenArmPlan(cohort(),'collab',{...original,payload:{...original.payload,owner_id:uuid(8)}},original.payload_hash)).toThrow('hash_mismatch');
  for(const value of [{...original,extra:true},{...original,payload:{...original.payload,extra:true}},{...original,payload:{...original.payload,payoff:{...choice,extra:true}}}])expect(()=>verifyFrozenArmPlan(cohort(),'collab',value,original.payload_hash)).toThrow('invalid_schema');
  expect(()=>verifyFrozenArmPlan(cohort(),'collab',original,'X'.repeat(64))).toThrow('invalid_schema');
 });
 it('separates integrity refusal from construction admission and ignores wall clock',()=>{
  const original=freeze();
  expect(()=>verifyFrozenArmPlan(cohort(),'collab',original,'d'.repeat(64))).toThrow('hash_mismatch');
  expect(()=>verifyFrozenArmPlan(cohort(),'collab',{...original,payload_hash:'d'.repeat(64)},original.payload_hash)).toThrow('hash_mismatch');
  for(const information_cutoff of ['2026-10-06T09:59:59.999Z','2026-10-06T11:00:00.000Z']){
   const payload={...original.payload,information_cutoff};const envelope={payload,payload_hash:digest(payload)};
   expect(()=>verifyFrozenArmPlan(cohort(),'collab',envelope,envelope.payload_hash)).toThrow('hash_mismatch');
  }
  for(const patch of [{enrolled_at:'2026-10-06T10:31:00.000Z'},{confirmation_deadline:'2026-10-06T10:29:59.000Z'},{owner_id:uuid(8)},{candidate_id:uuid(8)},{thesis_id:uuid(8)},{enrollment_id:uuid(8)},{session_anchor:'2026-10-08T13:30:00.000Z'},{calendar_hash:'d'.repeat(64)},{evaluation_policy_hash:'d'.repeat(64)},{security_identity_hash:'d'.repeat(64)}])expect(()=>verifyFrozenArmPlan({...cohort(),...patch},'collab',original,original.payload_hash)).toThrow('hash_mismatch');
  vi.useFakeTimers();try{vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));expect(verifyFrozenArmPlan(cohort(),'collab',original,original.payload_hash)).toEqual(original);}finally{vi.useRealTimers();}
  for(const arm of ['__proto__','toString'])expect(()=>verifyFrozenArmPlan(cohort(),arm as PlanArm,original,original.payload_hash)).toThrow('invalid_schema');
 });
 it('rejects every Proxy surface and nested accessors without executing user code',()=>{
  const original=freeze();
  for(const layer of ['cohort','envelope','payload','payoff']){
   let calls=0;const handlers={get(){calls++;},ownKeys(){calls++;return [];},getOwnPropertyDescriptor(){calls++;return undefined;},has(){calls++;return false;},getPrototypeOf(){calls++;return Object.prototype;}};
   const value=layer==='envelope'?new Proxy(original,handlers):layer==='payload'?{...original,payload:new Proxy(original.payload,handlers)}:layer==='payoff'?{...original,payload:{...original.payload,payoff:new Proxy(choice,handlers)}}:original;
   expect(()=>verifyFrozenArmPlan(layer==='cohort'?new Proxy(cohort(),handlers):cohort(),'collab',value,original.payload_hash)).toThrow('invalid_schema');expect(calls).toBe(0);
  }
  for(const layer of ['payload_hash','position']){
   let calls=0;const value=JSON.parse(JSON.stringify(original));Object.defineProperty(layer==='payload_hash'?value:value.payload.payoff,layer,{enumerable:true,get(){calls++;return 'long';}});
   expect(()=>verifyFrozenArmPlan(cohort(),'collab',value,original.payload_hash)).toThrow('invalid_schema');expect(calls).toBe(0);
  }
  for(const information_cutoff of [123,new Date('2026-10-06T10:30:00.000Z')])expect(()=>verifyFrozenArmPlan(cohort(),'collab',{...original,payload:{...original.payload,information_cutoff}},original.payload_hash)).toThrow('invalid_schema');
 });
 it('rejects traps on envelope, payload and payoff before invoking them',()=>{
  const original=freeze();let reads=0;
  for(const value of [new Proxy(original,{getPrototypeOf(){reads++;return Object.prototype;}}),{...original,payload:new Proxy(original.payload,{getPrototypeOf(){reads++;return Object.prototype;}})},{...original,payload:{...original.payload,payoff:new Proxy(choice,{getPrototypeOf(){reads++;return Object.prototype;}})}}])expect(()=>verifyFrozenArmPlan(cohort(),'collab',value,original.payload_hash)).toThrow('invalid_schema');
  const payload={...original.payload};Object.defineProperty(payload,'information_cutoff',{enumerable:true,get(){reads++;return original.payload.information_cutoff;}});
  expect(()=>verifyFrozenArmPlan(cohort(),'collab',{...original,payload},original.payload_hash)).toThrow('invalid_schema');expect(reads).toBe(0);
 });
});
