import {describe, expect, it} from 'vitest';
import {ARM_JOURNAL_PROTOCOL, JOURNAL_EVENTS, JOURNAL_STATES, JOURNAL_TERMINAL_REASONS, journalEnvelopeHash, nextJournalState, parseJournalEnvelope, parseJournalPayload} from './arm-journal-wire';
const ref='11111111-1111-4111-8111-111111111111', hash='a'.repeat(64);
const payloads={
 'baseline.confirmed':{plan_ref:ref,plan_hash:hash,confirmation_ref:ref,confirmation_hash:hash},
 'generation.reserved':{reservation_ref:ref,reservation_hash:hash,baseline_event_ref:ref,baseline_event_hash:hash},
 'stance.generated':{reservation_ref:ref,reservation_hash:hash,stance_ref:ref,stance_hash:hash},
 'ai.exposed':{ai_plan_ref:ref,ai_plan_hash:hash,stance_ref:ref,stance_hash:hash,disclosure_ref:ref,disclosure_hash:hash,reveal_confirmation_ref:ref,reveal_confirmation_hash:hash},
 'collaboration.confirmed':{plan_ref:ref,plan_hash:hash,confirmation_ref:ref,confirmation_hash:hash,disclosure_ref:ref,disclosure_hash:hash},
 'bindings.completed':{baseline_binding_ref:ref,baseline_binding_hash:hash,ai_binding_ref:ref,ai_binding_hash:hash,collaboration_binding_ref:ref,collaboration_binding_hash:hash},
 terminated:{reason:'refusal',previous_state:'enrolled',cause_ref:ref,cause_hash:hash},
};
function envelope(){return {protocol:ARM_JOURNAL_PROTOCOL,id:ref,owner_id:ref,enrollment_id:ref,cohort_hash:hash,sequence:1,previous_event_hash:hash,type:'terminated',occurred_at:'2026-10-06T11:54:00.000Z',actor_ref:ref,authorization_ref:ref,authorization_hash:hash,request_ref:ref,request_hash:hash,payload:{...payloads.terminated}};}
describe('inactive journal wire, synthetic structure not human evidence',()=>{
 it('enumerates all56 state/event pairs including generation and irreversible terminal',()=>{
  const edges=new Map([['enrolled|baseline.confirmed','baseline_confirmed'],['baseline_confirmed|generation.reserved','generation_reserved'],['generation_reserved|stance.generated','stance_generated'],['stance_generated|ai.exposed','ai_exposed'],['ai_exposed|collaboration.confirmed','collaboration_confirmed'],['collaboration_confirmed|bindings.completed','observation_bindings_complete']]);
  for(const s of JOURNAL_STATES)for(const e of JOURNAL_EVENTS){
   const result=s!=='terminated'&&e==='terminated'?'terminated':edges.get(`${s}|${e}`);
   if(result)expect(nextJournalState(s,e)).toBe(result);
   else expect(()=>nextJournalState(s,e)).toThrow(s==='terminated'?'terminal_state':'invalid_transition');
  }
  for(const v of ['constructor','__proto__',null,{},1]){expect(()=>nextJournalState(v,'terminated')).toThrow('invalid_schema');expect(()=>nextJournalState('enrolled',v)).toThrow('invalid_schema');}
 });
 it('parses every closed payload and rejects missing/extra/wrong-type/ref/hash fields',()=>{
  for(const type of JOURNAL_EVENTS){
   const original=payloads[type];const parsed=parseJournalPayload(type,original);expect(parsed).toEqual(original);expect(parsed).not.toBe(original);expect(Object.isFrozen(parsed)).toBe(true);
   expect(()=>parseJournalPayload(type,{...original,actor_kind:'human'})).toThrow('invalid_schema');
   for(const key of Object.keys(original)){
    const missing={...original} as Record<string,unknown>;delete missing[key];expect(()=>parseJournalPayload(type,missing)).toThrow('invalid_schema');
    for(const value of [null,{},0,true,''])expect(()=>parseJournalPayload(type,{...original,[key]:value})).toThrow('invalid_schema');
    if(key.endsWith('_hash'))expect(()=>parseJournalPayload(type,{...original,[key]:hash.toUpperCase()})).toThrow('invalid_schema');
    if(key.endsWith('_ref'))expect(()=>parseJournalPayload(type,{...original,[key]:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase()})).toThrow('invalid_schema');
   }
  }
  for(const reason of JOURNAL_TERMINAL_REASONS)for(const s of JOURNAL_STATES.filter(x=>x!=='terminated'))expect(parseJournalPayload('terminated',{...payloads.terminated,reason,previous_state:s})).toMatchObject({reason,previous_state:s});
  for(const p of [{reason:'integrity_failure'},{previous_state:'terminated'},{reason:'unknown'},{previous_state:'constructor'}])expect(()=>parseJournalPayload('terminated',{...payloads.terminated,...p})).toThrow('invalid_schema');
  for(const type of ['constructor','toString',null,{}])expect(()=>parseJournalPayload(type,{})).toThrow('invalid_schema');
 });
 it('detaches and freezes canonical envelope; digest binds every supplied field',()=>{
  const original=envelope(),parsed=parseJournalEnvelope(original);expect(Object.isFrozen(parsed)).toBe(true);expect(Object.isFrozen(parsed.payload)).toBe(true);
  const h=journalEnvelopeHash(parsed);original.payload.reason='revocation';expect(parsed.type === 'terminated' && parsed.payload.reason).toBe('refusal');expect(journalEnvelopeHash(original)).not.toBe(h);
  const changes={id:'22222222-2222-4222-8222-222222222222',owner_id:'22222222-2222-4222-8222-222222222222',enrollment_id:'22222222-2222-4222-8222-222222222222',cohort_hash:'b'.repeat(64),sequence:2,previous_event_hash:'b'.repeat(64),occurred_at:'2026-10-06T11:54:00.001Z',actor_ref:'22222222-2222-4222-8222-222222222222',authorization_ref:'22222222-2222-4222-8222-222222222222',authorization_hash:'b'.repeat(64),request_ref:'22222222-2222-4222-8222-222222222222',request_hash:'b'.repeat(64)};
  for(const [k,v] of Object.entries(changes))expect(journalEnvelopeHash({...parsed,[k]:v})).not.toBe(h);
  expect(journalEnvelopeHash(JSON.parse(JSON.stringify(parsed)))).toBe(h);
  const reordered=Object.fromEntries(Object.entries(parsed).reverse());reordered.payload=Object.fromEntries(Object.entries(parsed.payload).reverse());expect(journalEnvelopeHash(reordered)).toBe(h);
  expect(journalEnvelopeHash({...parsed,type:'baseline.confirmed',payload:payloads['baseline.confirmed']})).not.toBe(h);
  expect(()=>parseJournalEnvelope({...parsed,type:'baseline.confirmed'})).toThrow('invalid_schema');
 });
 it('rejects envelope version, time, numeric bounds, omissions and legacy null genesis',()=>{
  const e=envelope();for(const k of Object.keys(e)){const missing={...e} as Record<string,unknown>;delete missing[k];expect(()=>parseJournalEnvelope(missing)).toThrow('invalid_schema');}
  for(const change of [{protocol:'alpha-arm-plan/1.0'},{event_hash:hash},{sequence:0},{sequence:101},{sequence:1.5},{sequence:'1'},{sequence:NaN},{sequence:Infinity},{previous_event_hash:null},{occurred_at:'2026-02-30T00:00:00.000Z'},{occurred_at:'2026-10-06T11:54:00Z'},{occurred_at:'2026-10-06T11:54:00.000+00:00'},{type:'integrity_failure'}])expect(()=>parseJournalEnvelope({...e,...change})).toThrow('invalid_schema');
  for(const sequence of [1,100])expect(parseJournalEnvelope({...e,sequence}).sequence).toBe(sequence);
 });
 it('does not invoke Proxy/accessor traps at any layer or accept inherited/symbol fields',()=>{
  let calls=0;const trap=new Proxy({}, {ownKeys(){calls++;throw Error('trap');},getPrototypeOf(){calls++;throw Error('trap');}});
  for(const v of [trap,[],Object.create(envelope()),{...envelope(),[Symbol('extra')]:1}])expect(()=>parseJournalEnvelope(v)).toThrow('invalid_schema');
  expect(()=>parseJournalEnvelope({...envelope(),payload:trap})).toThrow('invalid_schema');
  const e=envelope();Object.defineProperty(e,'type',{enumerable:true,get(){calls++;return 'terminated';}});expect(()=>parseJournalEnvelope(e)).toThrow('invalid_schema');
  const p={...payloads.terminated};Object.defineProperty(p,'reason',{enumerable:true,get(){calls++;return 'refusal';}});expect(()=>parseJournalPayload('terminated',p)).toThrow('invalid_schema');const coercion={toString(){calls++;return ref;},[Symbol.toPrimitive](){calls++;return ref;}};
  expect(()=>parseJournalEnvelope({...envelope(),actor_ref:coercion})).toThrow('invalid_schema');
  expect(()=>parseJournalPayload('terminated',{...payloads.terminated,cause_ref:coercion})).toThrow('invalid_schema');expect(calls).toBe(0);
 });
});

// Type-only assertions: a narrowed terminal event cannot supply a machine stance;
// no fictional owner action or label is generated by these checks.
function assertDiscriminatedEnvelope(value: ReturnType<typeof parseJournalEnvelope>) {
 if (value.type === 'terminated') {
  const reason: typeof JOURNAL_TERMINAL_REASONS[number] = value.payload.reason;
  // @ts-expect-error terminal payload has no machine stance reference
  const stance = value.payload.stance_ref;
  return [reason, stance];
 }
 if (value.type === 'stance.generated') {
  // @ts-expect-error machine completion is not a human confirmation
  const confirmation = value.payload.confirmation_ref;
  return [value.payload.stance_ref, confirmation];
 }
 return value.type;
}
void assertDiscriminatedEnvelope;
