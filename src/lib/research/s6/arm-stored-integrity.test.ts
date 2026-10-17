import {describe,expect,it} from 'vitest';
import {digest} from '../ingest/pa-v1/json.js';
import {bindStoredArmJournalIntegrity} from './arm-stored-integrity';
import vectors from './__fixtures__/arm-genesis-v2.json';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,h='a'.repeat(64);
// Synthetic refusal snapshots only; no genuine owner action, approval or auth context.
function fixture(){
 const payload=JSON.parse(vectors.local.canonical),hash=vectors.local.genesis_hash;
 const scope={owner_id:payload.owner_id,enrollment_id:payload.enrollment_id,candidate_id:payload.candidate_id};
 const row={protocol:'alpha-arm-genesis-record/1.0',record_type:'ArmCohortGenesis',id:id(20),...scope,payload,payload_hash:hash};
 const head={protocol:'alpha-arm-bound-head/1.0',...scope,genesis_ref:row.id,genesis_hash:hash,created_at:payload.created_at,event_count:0,last_sequence:0,last_event_hash:hash};
 return {scope,row,head};
}
function refusal(f:ReturnType<typeof fixture>){const envelope={protocol:'alpha-arm-journal/1.0',id:id(31),owner_id:f.scope.owner_id,enrollment_id:f.scope.enrollment_id,cohort_hash:f.head.genesis_hash,sequence:1,previous_event_hash:f.head.genesis_hash,type:'terminated',occurred_at:'2026-10-06T13:24:00.001Z',actor_ref:id(33),authorization_ref:id(34),authorization_hash:h,request_ref:id(32),request_hash:h,payload:{reason:'refusal',previous_state:'enrolled',cause_ref:id(30),cause_hash:h}};const rows=[{envelope,event_hash:digest(envelope)}];return {rows,head:{...f.head,event_count:1,last_sequence:1,last_event_hash:rows[0].event_hash}};}
describe('inactive stored snapshot identity binding, not a trusted DB loader',()=>{
 it('binds empty/refused synthetic snapshots to independently supplied scope/genesis/head',()=>{
  const f=fixture(),empty=bindStoredArmJournalIntegrity(f.scope,f.row,f.head,[]);expect(empty.replay.state).toBe('enrolled');expect(empty.integrity_only).toBe(true);expect(Object.isFrozen(empty)).toBe(true);
  const r=refusal(f);expect(bindStoredArmJournalIntegrity(f.scope,f.row,r.head,r.rows).replay.state).toBe('terminated');
  f.row.payload.source_bundle.purpose_map.capture.grant_version=2;expect(empty.genesis.source_bundle.purpose_map.capture.grant_version).toBe(1);
 });
 it('rejects every scope/row/head tuple mismatch, wrong record type/version/ref and altered time',()=>{
  for(const key of ['owner_id','enrollment_id','candidate_id']){const f=fixture();for(const where of ['scope','row','head'] as const)expect(()=>bindStoredArmJournalIntegrity(where==='scope'?{...f.scope,[key]:id(99)}:f.scope,where==='row'?{...f.row,[key]:id(99)}:f.row,where==='head'?{...f.head,[key]:id(99)}:f.head,[])).toThrow('hash_mismatch');}
  for(const patch of [{record_type:'ChangeCard'},{protocol:'legacy'},{id:id(99)},{payload_hash:h}]){const f=fixture();expect(()=>bindStoredArmJournalIntegrity(f.scope,{...f.row,...patch},f.head,[])).toThrow(['record_type','protocol'].some(k=>k in patch)?'invalid_schema':'hash_mismatch');}
  for(const patch of [{genesis_ref:id(99)},{genesis_hash:h},{created_at:'2026-10-06T13:24:00.001Z'}]){const f=fixture();expect(()=>bindStoredArmJournalIntegrity(f.scope,f.row,{...f.head,...patch},[])).toThrow('hash_mismatch');}
 });
 it('rejects a self-rehashed wrong principal and corrupt payload despite consistent wrapper/head hashes',()=>{
  const f=fixture();f.row.payload.owner_id=id(99);f.row.payload_hash=digest(f.row.payload);f.head.genesis_hash=f.row.payload_hash;f.head.last_event_hash=f.row.payload_hash;expect(()=>bindStoredArmJournalIntegrity(f.scope,f.row,f.head,[])).toThrow('hash_mismatch');
  const other=fixture();other.row.payload.source_bundle.purpose_map.capture.grant_version=2;expect(()=>bindStoredArmJournalIntegrity(other.scope,other.row,other.head,[])).toThrow('hash_mismatch');
 });
 it('rejects genesis-row and event/request/cause aliases to reserved logical IDs even after rehash',()=>{
  const f=fixture();for(const n of [1,9,2,3,4,5,8,10,11,12,13,14]){const row={...f.row,id:id(n)},head={...f.head,genesis_ref:id(n)};expect(()=>bindStoredArmJournalIntegrity(f.scope,row,head,[])).toThrow('hash_mismatch');}
  for(const key of ['id','request_ref','cause_ref'])for(const n of [1,9,20,2,3,4,5,8,10,11,12,13,14]){const f=fixture(),r=refusal(f);if(key==='cause_ref')r.rows[0].envelope.payload.cause_ref=id(n);else Object.assign(r.rows[0].envelope,{[key]:id(n)});r.rows[0].event_hash=digest(r.rows[0].envelope);r.head.last_event_hash=r.rows[0].event_hash;expect(()=>bindStoredArmJournalIntegrity(f.scope,f.row,r.head,r.rows)).toThrow('hash_mismatch');}
 });
 it('separates event authorization and actor namespaces from all record/event/request/artifact IDs',()=>{
  for(const key of ['authorization_ref','actor_ref'])for(const n of [20,2,3,4,5,8,11,12,13,14,30,31,32]){const f=fixture(),r=refusal(f);Object.assign(r.rows[0].envelope,{[key]:id(n)});r.rows[0].event_hash=digest(r.rows[0].envelope);r.head.last_event_hash=r.rows[0].event_hash;expect(()=>bindStoredArmJournalIntegrity(f.scope,f.row,r.head,r.rows)).toThrow('hash_mismatch');}
  const f=fixture(),r=refusal(f);r.rows[0].envelope.authorization_ref=f.scope.owner_id;r.rows[0].event_hash=digest(r.rows[0].envelope);r.head.last_event_hash=r.rows[0].event_hash;expect(()=>bindStoredArmJournalIntegrity(f.scope,f.row,r.head,r.rows)).toThrow('hash_mismatch');
 });
 it('rejects malformed snapshot metadata and returns detached frozen replay payloads',()=>{
  const f=fixture();for(const scope of [{...f.scope,owner_id:null},{...f.scope,extra:true},{owner_id:f.scope.owner_id}])expect(()=>bindStoredArmJournalIntegrity(scope,f.row,f.head,[])).toThrow('invalid_schema');
  for(const row of [{...f.row,id:null},{...f.row,extra:true}])expect(()=>bindStoredArmJournalIntegrity(f.scope,row,f.head,[])).toThrow('invalid_schema');
  for(const head of [{...f.head,protocol:'legacy'},{...f.head,genesis_ref:null},{...f.head,extra:true}])expect(()=>bindStoredArmJournalIntegrity(f.scope,f.row,head,[])).toThrow('invalid_schema');
  const r=refusal(f),result=bindStoredArmJournalIntegrity(f.scope,f.row,r.head,r.rows);expect(Object.isFrozen(result.replay.events)).toBe(true);expect(Object.isFrozen(result.replay.events[0])).toBe(true);expect(Object.isFrozen(result.replay.events[0].payload)).toBe(true);r.rows[0].envelope.payload.reason='revocation';expect(result.replay.events[0].type==='terminated'&&result.replay.events[0].payload.reason).toBe('refusal');
 });
 it('refuses omitted head rows, unsafe snapshot shapes and unknown metadata without running traps',()=>{
  const f=fixture(),r=refusal(f);expect(()=>bindStoredArmJournalIntegrity(f.scope,f.row,r.head,[])).toThrow('hash_mismatch');
  let calls=0;const proxy=new Proxy({},{ownKeys(){calls++;throw Error('trap');},getPrototypeOf(){calls++;throw Error('trap');}});for(const where of ['scope','row','head'] as const)expect(()=>bindStoredArmJournalIntegrity(where==='scope'?proxy:f.scope,where==='row'?proxy:f.row,where==='head'?proxy:f.head,[])).toThrow('invalid_schema');
  const row={...f.row};Object.defineProperty(row,'payload',{enumerable:true,get(){calls++;return f.row.payload;}});expect(()=>bindStoredArmJournalIntegrity(f.scope,row,f.head,[])).toThrow('invalid_schema');expect(calls).toBe(0);
  expect(()=>bindStoredArmJournalIntegrity(f.scope,f.row,{...f.head,authorized:true},[])).toThrow('invalid_schema');
 });
});
