import {types} from 'node:util';
import {digest, fail} from '../ingest/pa-v1/json.js';
import {isUuid} from '../s4/ledger';
import {exactPlanObject as object} from './arm-plan-object';
import {nextJournalState, parseJournalEnvelope, type JournalEnvelope, type JournalState} from './arm-journal-wire';
function hash(v: unknown): v is string {return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);}
function instant(v: unknown): number {
 if(typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) fail('invalid_schema');
 const ms=Date.parse(v as string);
 if(!Number.isFinite(ms)||new Date(ms).toISOString()!==v)fail('invalid_schema');
 return ms;
}
function boundedOwnArray(value: unknown): unknown[] {
 if(!value || typeof value!=='object' || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype)fail('invalid_schema');
 const length=Object.getOwnPropertyDescriptor(value,'length')!.value as number;
 if(length>100)fail('input_limit');
 const ds=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(ds).length!==length+1)fail('invalid_schema');
 const out:unknown[]=[];
 for(let i=0;i<length;i++){
  const d=ds[String(i)];if(!d||!('value' in d)||!d.enumerable)fail('invalid_schema');out.push(d.value);
 }
 return out;
}
export function allocatedJournalRefs(e:JournalEnvelope):string[] {
  switch(e.type){
   case 'baseline.confirmed': case 'collaboration.confirmed': return [e.payload.plan_ref,e.payload.confirmation_ref];
   case 'generation.reserved': return [e.payload.reservation_ref];
   case 'stance.generated': return [e.payload.stance_ref];
   case 'ai.exposed': return [e.payload.ai_plan_ref,e.payload.disclosure_ref,e.payload.reveal_confirmation_ref];
   case 'bindings.completed': return [e.payload.baseline_binding_ref,e.payload.ai_binding_ref,e.payload.collaboration_binding_ref];
   case 'terminated': return [e.payload.cause_ref];
  }
}

/** Inactive STRUCTURAL integrity replay only. Caller must load this head and all rows
 * under owner lock from trusted storage, not a submitted prefix. Does NOT resolve v2
 * genesis, typed actors/origins, grants, deadline/exposure or current report authority.
 * Never use a successful result as admission or genuine human evidence. */
export function replayJournalIntegrity(rows: unknown, trustedHead: unknown) {
 const h=object(trustedHead,['protocol','owner_id','enrollment_id','genesis_hash','created_at','event_count','last_sequence','last_event_hash']);
 if(h.protocol!=='alpha-arm-head/1.0'||!isUuid(h.owner_id)||!isUuid(h.enrollment_id)||!hash(h.genesis_hash)||!hash(h.last_event_hash)||!Number.isSafeInteger(h.event_count)||(h.event_count as number)<0||(h.event_count as number)>100||h.last_sequence!==h.event_count)fail('invalid_schema');
 const values=boundedOwnArray(rows),created=instant(h.created_at);
 if(values.length!==h.event_count)fail('hash_mismatch');
 let state:JournalState='enrolled',previous=h.genesis_hash as string,time=created;
 let baseline:JournalEnvelope|undefined,reservation:JournalEnvelope|undefined,stance:JournalEnvelope|undefined,exposure:JournalEnvelope|undefined;
 const ids=new Set<string>(),requests=new Set<string>(),artifactIds=new Set<string>();const events:JournalEnvelope[]=[];
 for(let i=0;i<values.length;i++){
  const row=object(values[i],['envelope','event_hash']);if(!hash(row.event_hash))fail('invalid_schema');
  const e=parseJournalEnvelope(row.envelope),eventHash=digest(e),now=instant(e.occurred_at);
  if(row.event_hash!==eventHash||e.owner_id!==h.owner_id||e.enrollment_id!==h.enrollment_id||e.cohort_hash!==h.genesis_hash||e.sequence!==i+1||e.previous_event_hash!==previous||ids.has(e.id)||requests.has(e.request_ref)||now<time)fail('hash_mismatch');
  const nextState=nextJournalState(state,e.type);
  if(e.type==='terminated'&&e.payload.previous_state!==state)fail('hash_mismatch');
  // New arm artifact IDs are globally distinct within this cohort, including event
  // and request identities. Repeated links to an existing artifact keep its identity.
  if(e.id===e.request_ref||requests.has(e.id)||ids.has(e.request_ref)||artifactIds.has(e.id)||artifactIds.has(e.request_ref))fail('hash_mismatch');
  for(const ref of allocatedJournalRefs(e)){
   if(artifactIds.has(ref)||ids.has(ref)||requests.has(ref)||ref===e.id||ref===e.request_ref)fail('hash_mismatch');
   artifactIds.add(ref);
  }
  // Explicit cross-event identity checks supplement hashes. They still do not prove
  // that the referenced reservation/stance/confirmation records exist or are lawful.
  if(e.type==='generation.reserved'){
   if(!baseline||e.payload.baseline_event_ref!==baseline.id||e.payload.baseline_event_hash!==digest(baseline))fail('hash_mismatch');
   reservation=e;
  }
  if(e.type==='stance.generated'){
   if(!baseline||!reservation||reservation.type!=='generation.reserved'||now<=instant(baseline.occurred_at)||e.payload.reservation_ref!==reservation.payload.reservation_ref||e.payload.reservation_hash!==reservation.payload.reservation_hash)fail('hash_mismatch');
   stance=e;
  }
  if(e.type==='ai.exposed'){
   if(!stance||stance.type!=='stance.generated'||e.payload.stance_ref!==stance.payload.stance_ref||e.payload.stance_hash!==stance.payload.stance_hash)fail('hash_mismatch');
   exposure=e;
  }
  if(e.type==='collaboration.confirmed'&&(!exposure||exposure.type!=='ai.exposed'||e.payload.disclosure_ref!==exposure.payload.disclosure_ref||e.payload.disclosure_hash!==exposure.payload.disclosure_hash))fail('hash_mismatch');
  state=nextState;
  if(e.type==='baseline.confirmed')baseline=e;
  ids.add(e.id);requests.add(e.request_ref);previous=eventHash;time=now;events.push(e);
 }
 if(previous!==h.last_event_hash)fail('hash_mismatch');
 return Object.freeze({integrity_only:true as const,state,event_count:events.length,last_event_hash:previous,events:Object.freeze(events)});
}
