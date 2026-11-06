// src/lib/evals/summary.test.ts
import {describe,expect,it} from 'vitest';
import {bucketOf,exitCodeOf,gateOf,goldBlockOf,isPassOutcome,statusOfGate,summarize} from './summary';
import type {CaseOutcome,CaseReport,GoldCase,GoldSet,Summary,SummaryContext} from './types';

let n=0;
const rep=(outcome:CaseOutcome,required=true):CaseReport=>({case_id:`c${++n}`,required,outcome,left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail:{}});
const ctx=(over:Partial<SummaryContext>={}):SummaryContext=>({thresholds:{max_fail:0,min_coverage_optional:'0.95'},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:'truth',...over});
const PASS:CaseOutcome={result:'pass'};

describe('summarize: §3.3 reduction table (one row each)',()=>{
 const rows:[string,CaseOutcome,boolean,(s:Summary)=>number][]=[
  ['official pass',{result:'pass'},true,s=>s.correctness.pass],
  ['fail(value)',{result:'fail',reason:'value'},true,s=>s.correctness.fail],
  ['fail(ambiguous)',{result:'fail',reason:'ambiguous'},true,s=>s.correctness.fail],
  ['fail(unexpected_value)',{result:'fail',reason:'unexpected_value'},true,s=>s.correctness.fail],
  ['unit_mismatch',{result:'unit_mismatch'},true,s=>s.correctness.unit_mismatch],
  ['provenance_incomplete',{result:'provenance_incomplete',reason:'raw_hash'},true,s=>s.correctness.provenance_incomplete],
  ['expected_absent',{result:'expected_absent'},true,s=>s.correctness.pass],
  ['missing (required)',{result:'missing'},true,s=>s.coverage.missing_required],
  ['missing (optional)',{result:'missing'},false,s=>s.coverage.missing_optional],
  ['not_visible(quarantined)',{result:'not_visible',reason:'quarantined'},true,s=>s.coverage.not_visible],
  ['not_visible(superseded_generation)',{result:'not_visible',reason:'superseded_generation'},true,s=>s.coverage.not_visible],
  ['skipped(retracted)',{result:'skipped',reason:'retracted'},true,s=>s.coverage.skipped],
  ['skipped(subset)',{result:'skipped',reason:'subset'},true,s=>s.coverage.skipped],
  ['skipped(pending)',{result:'skipped',reason:'pending'},true,s=>s.coverage.skipped],
  ['read_error(filing_not_found)',{result:'read_error',reason:'filing_not_found'},true,s=>s.execution.read_error],
  ['replay identical',{result:'identical'},true,s=>s.correctness.pass],
  ['replay explained_diff',{result:'explained_diff',ledger_ids:['L1']},true,s=>s.correctness.pass],
  ['replay data_drift with ledger',{result:'data_drift',ledger_ids:['L1'],hints:[]},true,s=>s.correctness.pass],
  ['replay data_drift without ledger',{result:'data_drift',ledger_ids:[],hints:[{kind:'late_fact',ref:'f',at:'2026-01-01'}]},true,s=>s.correctness.unexplained_diff],
  ['replay unexplained_diff',{result:'unexplained_diff',reason:'no_hints'},true,s=>s.correctness.unexplained_diff],
  ['reference within',{result:'within'},true,s=>s.correctness.pass],
  ['reference beyond_explained',{result:'beyond_explained',ledger_ids:['R1']},true,s=>s.correctness.pass],
  ['reference beyond_unexplained',{result:'beyond_unexplained'},true,s=>s.correctness.unexplained_diff],
  ['reference unavailable',{result:'skipped',reason:'unavailable'},true,s=>s.coverage.skipped],
  ['extraction zero_support',{result:'skipped',reason:'zero_support'},true,s=>s.coverage.skipped],
  ['calibration ineligible',{result:'skipped',reason:'ineligible'},true,s=>s.coverage.skipped],
 ];
 for(const [name,outcome,required,counter] of rows)it(name,()=>{
  const s=summarize([rep(outcome,required)],ctx());
  expect(counter(s)).toBe(1);
  const total=Object.values(s.correctness).reduce((a,b)=>a+b,0)+s.coverage.missing_required+s.coverage.missing_optional+s.coverage.not_visible+s.coverage.skipped+s.execution.read_error;
  expect(total,'each case lands in exactly one counter').toBe(1);
 });
 it('read_error(truncated) also counts in execution.truncated',()=>{
  const s=summarize([rep({result:'read_error',reason:'truncated'})],ctx());
  expect(s.execution).toEqual({read_error:1,truncated:1,subset:false});
 });
 it('an explanation without a ledger id is not an explanation',()=>{
  expect(bucketOf({result:'explained_diff',ledger_ids:[]})).toBe('unexplained_diff');
  expect(bucketOf({result:'beyond_explained',ledger_ids:[]})).toBe('unexplained_diff');
  expect(isPassOutcome({result:'expected_absent'})).toBe(true);
  expect(isPassOutcome({result:'missing'})).toBe(false);
 });
 it('population excludes retracted cases; evaluated counts correctness outcomes, evaluated_optional the optional ones',()=>{
  const s=summarize([rep(PASS),rep({result:'fail',reason:'value'},false),rep({result:'skipped',reason:'retracted'}),rep({result:'missing'},false),rep({result:'skipped',reason:'subset'})],ctx());
  expect(s.population).toBe(4);
  expect(s.required).toBe(2);
  expect(s.coverage).toEqual({evaluated:2,evaluated_optional:1,missing_required:0,missing_optional:1,not_visible:0,skipped:2});
 });
 it('copies thresholds, gold block, evidence class and reconciliations_truncated from the context',()=>{
  const s=summarize([rep(PASS)],ctx({evidenceClass:'comparison',reconciliationsTruncated:true}));
  expect(s.evidence_class).toBe('comparison');
  expect(s.reconciliations_truncated).toBe(true);
  expect(s.thresholds).toEqual({max_fail:0,min_coverage_optional:'0.95'});
  expect(summarize([rep(PASS)],ctx()).reconciliations_truncated).toBe(false);
 });
 it('rejects duplicate case ids',()=>{
  const a=rep(PASS);
  expect(()=>summarize([a,{...a}],ctx())).toThrow(RangeError);
 });
});

describe('gate (§3.2 rules)',()=>{
 it('rule 4: everything evaluated and correct → pass',()=>{
  expect(summarize([rep(PASS),rep({result:'expected_absent'})],ctx()).gate).toBe('pass');
 });
 it('rule 1: population 0 (empty set, all retracted) → incomplete',()=>{
  expect(summarize([],ctx()).gate).toBe('incomplete');
  const s=summarize([rep({result:'skipped',reason:'retracted'}),rep({result:'skipped',reason:'retracted'})],ctx());
  expect(s.population).toBe(0);expect(s.coverage.skipped).toBe(2);expect(s.gate).toBe('incomplete');
 });
 it('rule 1 (P1-1): nothing evaluated → incomplete — all unavailable, all zero_support, all skipped',()=>{
  for(const reason of ['unavailable','zero_support','ineligible','pending'] as const){
   const s=summarize([rep({result:'skipped',reason}),rep({result:'skipped',reason})],ctx());
   expect(s.population,reason).toBe(2);expect(s.coverage.evaluated).toBe(0);expect(s.gate,reason).toBe('incomplete');
  }
  const mixed=summarize([rep({result:'skipped',reason:'unavailable'}),rep({result:'skipped',reason:'zero_support'}),rep({result:'skipped',reason:'subset'})],ctx());
  expect(mixed.gate).toBe('incomplete');
  expect(summarize([rep(PASS),rep({result:'skipped',reason:'unavailable'})],ctx()).gate).toBe('pass');
 });
 it('rule 1: read_error, subset, missing_required, not_visible → incomplete',()=>{
  expect(summarize([rep(PASS),rep({result:'read_error',reason:'subject_unresolved'})],ctx()).gate).toBe('incomplete');
  expect(summarize([rep(PASS)],ctx({subset:true})).gate).toBe('incomplete');
  expect(summarize([rep(PASS),rep({result:'missing'})],ctx()).gate).toBe('incomplete');
  expect(summarize([rep(PASS),rep({result:'not_visible',reason:'quarantined'})],ctx()).gate).toBe('incomplete');
 });
 it('rule 1 (§0 R5-1): gold not ready, pending or provenance gaps → incomplete',()=>{
  expect(summarize([rep(PASS)],ctx({gold:{format:'legacy_plan2',ready:false,pending:0,provenance_gaps:0}})).gate).toBe('incomplete');
  expect(summarize([rep(PASS)],ctx({gold:{format:'legacy_plan2',ready:true,pending:1,provenance_gaps:0}})).gate).toBe('incomplete');
  expect(summarize([rep(PASS)],ctx({gold:{format:'legacy_plan2',ready:true,pending:0,provenance_gaps:3}})).gate).toBe('incomplete');
 });
 it('rule 1 precedes rule 2: a failing case plus a read error is incomplete, not fail',()=>{
  expect(summarize([rep({result:'fail',reason:'value'}),rep({result:'read_error',reason:'read_failed'})],ctx()).gate).toBe('incomplete');
 });
 it('rule 2: fail + unit_mismatch + provenance_incomplete + unexplained_diff > max_fail → fail',()=>{
  for(const o of [{result:'fail',reason:'value'},{result:'unit_mismatch'},{result:'provenance_incomplete',reason:'x'},{result:'unexplained_diff',reason:'diff'}] as CaseOutcome[])
   expect(summarize([rep(PASS),rep(o)],ctx()).gate,o.result).toBe('fail');
  const twoFailures=[rep({result:'fail',reason:'value'}),rep({result:'unit_mismatch'}),rep(PASS)];
  expect(summarize(twoFailures,ctx({thresholds:{max_fail:2,min_coverage_optional:'0.95'}})).gate).toBe('pass');
  expect(summarize(twoFailures,ctx({thresholds:{max_fail:1,min_coverage_optional:'0.95'}})).gate).toBe('fail');
 });
 it('rule 3: optional coverage below min_coverage_optional → incomplete; the boundary passes',()=>{
  expect(summarize([rep(PASS),rep({result:'missing'},false)],ctx()).gate).toBe('incomplete');
  const nineteenOfTwenty=[rep(PASS),...Array.from({length:19},()=>rep(PASS,false)),rep({result:'missing'},false)];
  expect(summarize(nineteenOfTwenty,ctx()).gate).toBe('pass');
  const eighteenOfTwenty=[rep(PASS),...Array.from({length:18},()=>rep(PASS,false)),rep({result:'missing'},false),rep({result:'skipped',reason:'unavailable'},false)];
  expect(summarize(eighteenOfTwenty,ctx()).gate).toBe('incomplete');
  expect(summarize([rep(PASS),rep({result:'missing'},false)],ctx({thresholds:{max_fail:0,min_coverage_optional:'0'}})).gate).toBe('pass');
 });
 it('gateOf decides from a summary alone',()=>{
  const s=summarize([rep(PASS)],ctx());
  const {gate:_gate,...rest}=s;
  expect(_gate).toBe('pass');
  expect(gateOf({...rest,correctness:{...rest.correctness,fail:1}})).toBe('fail');
  expect(gateOf({...rest,population:0})).toBe('incomplete');
 });
});

describe('goldBlockOf / exitCodeOf / statusOfGate',()=>{
 const gc=(over:Partial<GoldCase>):GoldCase=>({case_id:`g${++n}`,subject:{market:'US',ticker:'AAPL'},target:{type:'fact',concept:'revenue',period_end:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},expect:'present',binding:'current',as_of:null,source:{document_type:'unspecified',url:''},provenance_kind:'transcribed',recorded_by:'<pending>',recorded_at:null,reviewed_by:null,reviewed_at:null,retracted:null,notes:'',required:true,pending:false,provenance_gaps:[],...over});
 it('counts pending and gap cases among non-retracted cases only',()=>{
  const set={format:'legacy_plan2',ready:false,cases:[gc({pending:true,provenance_gaps:['source.sha256']}),gc({provenance_gaps:['printed']}),gc({pending:true,provenance_gaps:['x'],retracted:{at:'2026-11-06',by:'owner',reason:'r'}}),gc({})]} as unknown as GoldSet;
  expect(goldBlockOf(set)).toEqual({format:'legacy_plan2',ready:false,pending:1,provenance_gaps:2});
 });
 it('maps gates to exit codes and run statuses',()=>{
  expect([exitCodeOf('pass'),exitCodeOf('fail'),exitCodeOf('incomplete')]).toEqual([0,1,3]);
  expect([statusOfGate('pass'),statusOfGate('fail'),statusOfGate('incomplete')]).toEqual(['passed','failed','incomplete']);
 });
});
