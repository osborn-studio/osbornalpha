// src/lib/evals/kinds/calibration.test.ts
// Hand-computed: p/outcome = 0.8/1, 0.3/0, 1/1, 0/1 → squared errors 0.04, 0.09, 0, 1 → Brier 1.13/4 = 0.2825.
// Buckets [0,0.1) … [0.9,1.0]: 0 → bucket 0, 0.3 → 3, 0.8 → 8, 1 (endpoint) → 9.
import {describe,expect,it} from 'vitest';
import {evaluateCalibration,summarizeCalibration} from './calibration';
import type {SettledForecast} from './calibration';

const f=(id:string,p:string,outcome:0|1,o:Partial<SettledForecast>={},s:Partial<SettledForecast['settlement']>={}):SettledForecast=>({forecast_id:id,forecast_sha256:'a'.repeat(64),methodology_version:'f4/1',claim:`claim ${id}`,p,
 registered_at:'2025-01-01T00:00:00Z',input_snapshot_sha256:'b'.repeat(64),horizon_end:'2025-06-30',revision_of:null,...o,
 settlement:{outcome,settled_at:'2025-07-02T00:00:00Z',evidence_ref:`ev-${id}`,evidence_available_date:'2025-07-01',...s}});
const TH={max_fail:0,min_coverage_optional:'0.95'};

describe('evaluateCalibration',()=>{
 it('Brier and 10-bucket reliability with the endpoint in the last bucket',()=>{
  const r=evaluateCalibration([f('a','0.8',1),f('b','0.3',0),f('c','1',1),f('d','0',1)]);
  expect(r.eligible).toBe(4);
  expect(r.brier).toBe('0.2825');
  expect(r.reliability.map(b=>[b.index,b.lower,b.upper,b.n,b.mean_p,b.observed_rate]).filter(x=>x[3]!==0)).toEqual([[0,'0','0.1',1,'0','1'],[3,'0.3','0.4',1,'0.3','0'],[8,'0.8','0.9',1,'0.8','1'],[9,'0.9','1',1,'1','1']]);
  expect(r.reliability.length).toBe(10);
  expect(r.reliability[5]).toEqual({index:5,lower:'0.5',upper:'0.6',n:0,mean_p:null,observed_rate:null});
  expect(r.cases.map(c=>c.outcome.result)).toEqual(['pass','pass','pass','pass']);
  expect(r.cases[0]).toMatchObject({case_id:'a',left:'0.8',right:'1'});
  expect(summarizeCalibration(r,TH).gate).toBe('pass');
 });
 it('eligibility: p range and syntax, outcome, registered_at + 1 day ≤ evidence date, settled_at ≥ horizon_end, one settlement per id, timestamps',()=>{
  const r=evaluateCalibration([
   f('ok','0.5',1),
   f('p-high','1.2',1),f('p-bad','.5',1),f('p-neg','-0.1',0),
   f('out','0.5',1,{},{outcome:2 as 0|1}),
   f('soon','0.5',1,{registered_at:'2025-06-30T12:00:00Z'},{evidence_available_date:'2025-07-01'}),
   f('edge','0.5',1,{registered_at:'2025-06-30T00:00:00Z'},{evidence_available_date:'2025-07-01'}),   // exactly one day: eligible
   f('early','0.5',1,{},{settled_at:'2025-06-29T00:00:00Z'}),
   f('dup','0.5',1),f('dup','0.6',0),
   f('ts','0.5',1,{registered_at:'yesterday'}),
  ]);
  expect(Object.fromEntries(r.ineligible.map(x=>[x.case_id,x.reason]))).toEqual({'p-high':'p_out_of_range','p-bad':'p_invalid','p-neg':'p_invalid',out:'outcome_invalid',soon:'evidence_too_soon',early:'settled_before_horizon',dup:'multiple_settlements','dup#2':'multiple_settlements',ts:'timestamp_invalid'});
  expect(r.eligible).toBe(2);
  expect(r.cases.filter(c=>c.outcome.result==='skipped').every(c=>c.outcome.result==='skipped'&&c.outcome.reason==='ineligible')).toBe(true);
 });
 it('strict dates and timestamps: calendar round-trip, ISO-8601 with Z or an explicit offset',()=>{
  const r=evaluateCalibration([
   f('ok-offset','0.5',1,{registered_at:'2025-01-01T08:00:00+08:00'}),
   f('feb30','0.5',1,{},{evidence_available_date:'2025-02-30'}),
   f('zoneless','0.5',1,{registered_at:'2025-01-01T00:00:00'}),
   f('dateonly','0.5',1,{registered_at:'2025-01-01'}),
   f('hor','0.5',1,{horizon_end:'2025-06-31T00:00:00Z'}),
   f('settled','0.5',1,{},{settled_at:'2025-07-02T00:00:00'}),
  ]);
  expect(Object.fromEntries(r.ineligible.map(x=>[x.case_id,x.reason]))).toEqual({feb30:'timestamp_invalid',zoneless:'timestamp_invalid',dateonly:'timestamp_invalid',hor:'timestamp_invalid',settled:'timestamp_invalid'});
  expect(r.eligible).toBe(1);
 });
 it('thresholds are F4\'s: without them the result and its summary are incomplete even with eligible samples',()=>{
  const none=evaluateCalibration([f('a','0.8',1)]);
  expect(none).toMatchObject({eligible:1,gate:'incomplete',detail:{reason:'thresholds_pending_f4'}});
  expect(summarizeCalibration(none).gate).toBe('incomplete');
  const given=evaluateCalibration([f('a','0.8',1)],TH);
  expect(given.gate).toBeNull();
  expect(summarizeCalibration(given).gate).toBe('pass');
 });
 it('a revision whose parent is a duplicated settlement is revision_parent_ineligible',()=>{
  const r=evaluateCalibration([f('d','0.5',1),f('d','0.6',0),f('kid','0.7',1,{revision_of:'d'})]);
  expect(Object.fromEntries(r.ineligible.map(x=>[x.case_id,x.reason]))).toEqual({d:'multiple_settlements','d#2':'multiple_settlements',kid:'revision_parent_ineligible'});
 });
 it('revision chain: the last eligible registration counts, earlier ones are superseded, an ineligible later revision is ignored',()=>{
  const r=evaluateCalibration([
   f('v1','0.6',1),
   f('v2','0.7',1,{revision_of:'v1',registered_at:'2025-02-01T00:00:00Z'}),
   f('v3','0.9',1,{revision_of:'v2',registered_at:'2025-06-30T12:00:00Z'}),   // evidence 2025-07-01 is < 1 day later → ineligible
  ]);
  expect(r.cases.map(c=>[c.case_id,c.outcome.result])).toEqual([['v1','skipped'],['v2','pass'],['v3','skipped']]);
  expect(Object.fromEntries(r.ineligible.map(x=>[x.case_id,x.reason]))).toEqual({v1:'superseded_in_chain',v3:'evidence_too_soon'});
  expect(r.brier).toBe('0.09');   // (0.7 − 1)²
 });
 it('broken chains: unknown parent and cycles are ineligible',()=>{
  const r=evaluateCalibration([f('orphan','0.5',1,{revision_of:'ghost'}),f('x','0.5',1,{revision_of:'y'}),f('y','0.5',1,{revision_of:'x'})]);
  expect(Object.fromEntries(r.ineligible.map(x=>[x.case_id,x.reason]))).toEqual({orphan:'revision_parent_missing',x:'revision_cycle',y:'revision_cycle'});
 });
 it('no eligible sample → no Brier, empty buckets, summary incomplete (population 0)',()=>{
  const r=evaluateCalibration([f('p','2',1)]);
  expect(r).toMatchObject({eligible:0,brier:null});
  expect(r.reliability.every(b=>b.n===0)).toBe(true);
  expect(summarizeCalibration(r,TH)).toMatchObject({population:0,coverage:{skipped:1,evaluated:0},gate:'incomplete'});
  expect(summarizeCalibration(evaluateCalibration([]),TH).gate).toBe('incomplete');
 });
 it('P2-5: population = eligible forecasts; ineligible ones are skipped outside it (mixed and all-ineligible alike)',()=>{
  const mixed=evaluateCalibration([f('ok','0.5',1),...Array.from({length:9},(_,i)=>f(`bad${i}`,'2',1))]);
  expect(summarizeCalibration(mixed,TH)).toMatchObject({population:1,required:1,coverage:{evaluated:1,skipped:9},gate:'pass'});
  const none=evaluateCalibration(Array.from({length:9},(_,i)=>f(`bad${i}`,'2',1)));
  expect(summarizeCalibration(none,TH)).toMatchObject({population:0,coverage:{evaluated:0,skipped:9},gate:'incomplete'});
 });
});
