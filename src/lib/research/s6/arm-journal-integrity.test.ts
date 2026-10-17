import {describe,expect,it} from 'vitest';
import {digest} from '../ingest/pa-v1/json.js';
import {replayJournalIntegrity} from './arm-journal-integrity';
import {ARM_JOURNAL_PROTOCOL,type JournalEnvelope} from './arm-journal-wire';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64),ref=id(100);
const h=(n:number)=>n.toString(16).padStart(64,'0');
const created='2026-10-06T12:24:00.000Z';
type Row={envelope:JournalEnvelope;event_hash:string};
// Synthetic protocol fixtures only; no actual owner confirmations or human labels.
function fixture(){
 const rows:Row[]=[];
 const payloads=[
  ['baseline.confirmed',{plan_ref:id(101),plan_hash:h(101),confirmation_ref:id(102),confirmation_hash:h(102)}],
  ['generation.reserved',{reservation_ref:id(103),reservation_hash:h(103),baseline_event_ref:id(1),baseline_event_hash:''}],
  ['stance.generated',{reservation_ref:id(103),reservation_hash:h(103),stance_ref:id(104),stance_hash:h(104)}],
  ['ai.exposed',{ai_plan_ref:id(105),ai_plan_hash:h(105),stance_ref:id(104),stance_hash:h(104),disclosure_ref:id(106),disclosure_hash:h(106),reveal_confirmation_ref:id(107),reveal_confirmation_hash:h(107)}],
  ['collaboration.confirmed',{plan_ref:id(108),plan_hash:h(108),confirmation_ref:id(109),confirmation_hash:h(109),disclosure_ref:id(106),disclosure_hash:h(106)}],
  ['bindings.completed',{baseline_binding_ref:id(110),baseline_binding_hash:h(110),ai_binding_ref:id(111),ai_binding_hash:h(111),collaboration_binding_ref:id(112),collaboration_binding_hash:h(112)}],
 ] as const;
 for(const [type,payload] of payloads){const i=rows.length;
  const p={...payload};if(type==='generation.reserved')Object.assign(p,{baseline_event_hash:rows[0].event_hash});
  const envelope={protocol:ARM_JOURNAL_PROTOCOL,id:id(i+1),owner_id:id(90),enrollment_id:id(91),cohort_hash:hash,sequence:i+1,previous_event_hash:i?rows[i-1].event_hash:hash,type,occurred_at:new Date(Date.parse(created)+i+1).toISOString(),actor_ref:ref,authorization_ref:ref,authorization_hash:hash,request_ref:id(50+i),request_hash:hash,payload:p} as JournalEnvelope;
  rows.push({envelope,event_hash:digest(envelope)});
 }
 return rows;
}
function head(rows:Row[]){return {protocol:'alpha-arm-head/1.0',owner_id:id(90),enrollment_id:id(91),genesis_hash:hash,created_at:created,event_count:rows.length,last_sequence:rows.length,last_event_hash:rows.at(-1)?.event_hash??hash};}
function clone(){return JSON.parse(JSON.stringify(fixture())) as Row[];}
function rehash(rows:Row[]){for(let i=0;i<rows.length;i++){
 rows[i].envelope={...rows[i].envelope,previous_event_hash:i?rows[i-1].event_hash:hash};
 if(rows[i].envelope.type==='generation.reserved')Object.assign(rows[i].envelope.payload,{baseline_event_hash:rows[0].event_hash});
 rows[i].event_hash=digest(rows[i].envelope);
}}
describe('inactive structural journal replay only',()=>{
 it('checks complete synthetic ordering against explicit head, empty genesis and frozen snapshots',()=>{
  const rows=fixture(),result=replayJournalIntegrity(rows,head(rows));expect(result.state).toBe('observation_bindings_complete');expect(result.integrity_only).toBe(true);expect(Object.isFrozen(result.events)).toBe(true);
  rows[0].envelope={...rows[0].envelope,id:id(300)};expect(result.events[0].id).toBe(id(1));
  expect(replayJournalIntegrity([],head([])).state).toBe('enrolled');
 });
 it('refuses omitted/truncated/reordered/duplicated rows and mismatched authoritative count/head',()=>{
  const rows=fixture();for(const v of [rows.slice(1),rows.slice(0,-1),[rows[1],rows[0],...rows.slice(2)],[rows[0],rows[0],...rows.slice(2)]])expect(()=>replayJournalIntegrity(v,head(rows))).toThrow('hash_mismatch');
  for(const c of [{last_event_hash:'b'.repeat(64)},{owner_id:id(200)},{enrollment_id:id(200)},{genesis_hash:'b'.repeat(64)},{last_sequence:5},{event_count:-1},{event_count:101},{created_at:'2026-10-06T12:24:01.000Z'}])expect(()=>replayJournalIntegrity(rows,{...head(rows),...c})).toThrow(['last_sequence','event_count'].some(k=>k in c)?'invalid_schema':'hash_mismatch');
 });
 it('refuses rehashed duplicate IDs/requests, source binding, sequence and time regressions',()=>{
  for(const [index,patch] of [[1,{id:id(1)}],[1,{request_ref:id(50)}],[1,{cohort_hash:'b'.repeat(64)}],[1,{sequence:3}],[1,{occurred_at:created}],[0,{owner_id:id(200)}]] as const){const rows=clone();rows[index].envelope={...rows[index].envelope,...patch};rehash(rows);expect(()=>replayJournalIntegrity(rows,head(rows))).toThrow('hash_mismatch');}
  const rows=clone();rows[1].event_hash='b'.repeat(64);expect(()=>replayJournalIntegrity(rows,head(rows))).toThrow('hash_mismatch');
 });
 it('refuses rehashed cross-event origin substitution and equal baseline/generation time',()=>{
  for(const [index,key,value] of [[1,'baseline_event_ref',id(200)],[2,'reservation_ref',id(200)],[2,'reservation_hash','b'.repeat(64)],[3,'stance_ref',id(200)],[3,'stance_hash','b'.repeat(64)],[4,'disclosure_ref',id(200)],[4,'disclosure_hash','b'.repeat(64)]] as const){const rows=clone();Object.assign(rows[index].envelope.payload,{[key]:value});rehash(rows);expect(()=>replayJournalIntegrity(rows,head(rows))).toThrow('hash_mismatch');}
  const rows=clone();rows[1].envelope={...rows[1].envelope,occurred_at:rows[0].envelope.occurred_at};rows[2].envelope={...rows[2].envelope,occurred_at:rows[0].envelope.occurred_at};rehash(rows);expect(()=>replayJournalIntegrity(rows,head(rows))).toThrow('hash_mismatch');
 });
 it('verifies terminal previous state and forbids subsequent events even if fully rehashed',()=>{
  const rows=clone().slice(0,2);const prior=rows.at(-1)!;
  const e={...prior.envelope,id:id(300),request_ref:id(301),sequence:3,previous_event_hash:prior.event_hash,type:'terminated',occurred_at:'2026-10-06T12:24:00.004Z',payload:{reason:'refusal',previous_state:'generation_reserved',cause_ref:id(113),cause_hash:h(113)}} as JournalEnvelope;
  rows.push({envelope:e,event_hash:digest(e)});expect(replayJournalIntegrity(rows,head(rows)).state).toBe('terminated');
  const wrong=JSON.parse(JSON.stringify(rows)) as Row[];Object.assign(wrong[2].envelope.payload,{previous_state:'enrolled'});rehash(wrong);expect(()=>replayJournalIntegrity(wrong,head(wrong))).toThrow('hash_mismatch');
  rows.push({...rows[2],envelope:{...e,id:id(302),request_ref:id(303),sequence:4}});rehash(rows);expect(()=>replayJournalIntegrity(rows,head(rows))).toThrow('terminal_state');
 });
 it('rejects artifact role reuse and producer-field swaps with distinct fixture identities',()=>{
  for(const [i,key,value] of [[2,'stance_ref',id(103)],[3,'stance_ref',id(103)],[3,'stance_hash',h(103)],[4,'plan_ref',id(101)],[1,'reservation_ref',id(1)],[1,'reservation_ref',id(50)]] as const){const rows=clone();Object.assign(rows[i].envelope.payload,{[key]:value});rehash(rows);expect(()=>replayJournalIntegrity(rows,head(rows))).toThrow('hash_mismatch');}
  const rows=clone();rows[1].envelope={...rows[1].envelope,request_ref:id(1)};rehash(rows);expect(()=>replayJournalIntegrity(rows,head(rows))).toThrow('hash_mismatch');
 });
 it('pins shortened valid prefix to original last hash and classifies early transition refusal',()=>{
  const rows=fixture(),prefix=rows.slice(0,5);expect(()=>replayJournalIntegrity(prefix,{...head(rows),event_count:5,last_sequence:5})).toThrow('hash_mismatch');
  const early=clone().slice(2,3);early[0].envelope={...early[0].envelope,sequence:1,previous_event_hash:hash};early[0].event_hash=digest(early[0].envelope);expect(()=>replayJournalIntegrity(early,head(early))).toThrow('invalid_transition');
 });
 it('rejects 101 overflow, sparse/extra/symbol/accessor/proxy arrays without traps',()=>{
  const rows=fixture();expect(()=>replayJournalIntegrity(Array(101),head(rows))).toThrow('input_limit');expect(()=>replayJournalIntegrity(Array(6),head(rows))).toThrow('invalid_schema');
  let calls=0;const getter=[...rows];Object.defineProperty(getter,'0',{get(){calls++;return rows[0];},enumerable:true});
  const proxy=new Proxy(rows,{ownKeys(){calls++;throw Error('trap');},getPrototypeOf(){calls++;throw Error('trap');}});
  for(const v of [getter,proxy,Object.assign([...rows],{extra:true}),Object.assign([...rows],{[Symbol('extra')]:true})])expect(()=>replayJournalIntegrity(v,head(rows))).toThrow('invalid_schema');
  const row=Object.defineProperty({},'envelope',{enumerable:true,get(){calls++;return rows[0].envelope;}});expect(()=>replayJournalIntegrity([row],head([rows[0]]))).toThrow('invalid_schema');expect(calls).toBe(0);
 });
});
