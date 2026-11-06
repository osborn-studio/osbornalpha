// src/lib/evals/reduce.test.ts
import {describe,expect,it} from 'vitest';
import {CANARY_SERIES,CANARY_VALUE,REFERENCE_THRESHOLDS,evaluateReference,referenceSummary} from './kinds/reference';
import type {ReferenceSample} from './kinds/reference';
import {gcase,gset} from './kinds/official-test-support';
import {reduceForKind} from './reduce';
import type {CaseReport,CaseOutcome} from './types';

const rep=(case_id:string,outcome:CaseOutcome={result:'pass'},required=true):CaseReport=>({case_id,required,outcome,left:'1',right:'1',abs_diff:'0',rel_diff:'0',tolerance:'0',provenance:null,detail:{}});
const sample=(p:Partial<ReferenceSample>={}):ReferenceSample=>({sample_id:'s1',doc:'macro-strategy',doc_sha256:'a'.repeat(64),line:1,page_url:'https://chaos.example/macro',page_sha256:'b'.repeat(64),captured_at:'2026-11-04T00:00:00Z',
 as_displayed:'100',parsed_value:'100',parsed_unit:'index',their_declared_source:null,our_target:{series_id:'cn.cpi',period_end:'2026-09-30',which:'latest'},canary:false,...p});

describe('reduceForKind (P1-2, P2-2)',()=>{
 const set=gset([gcase({case_id:'a'}),gcase({case_id:'b'}),gcase({case_id:'r',retracted:{at:'2026-11-01',by:'owner',reason:'wrong period'}})]);
 const good=[rep('a'),rep('b'),rep('r',{result:'skipped',reason:'retracted'})];
 it('official: population, required flags, thresholds and gold come from the set; a complete report reduces cleanly',()=>{
  const r=reduceForKind('official_reconciliation',good,{kind:'official_reconciliation',set});
  expect(r.problems).toEqual([]);
  expect(r.summary).toMatchObject({population:2,required:2,gate:'pass',thresholds:set.thresholds,evidence_class:'truth'});
 });
 it('rejects a dropped failing case, an extra case, a reclassified case and a fake retraction',()=>{
  expect(reduceForKind('official_reconciliation',[rep('a'),good[2]],{kind:'official_reconciliation',set}).problems).toEqual(['missing case b']);
  expect(reduceForKind('official_reconciliation',[...good,rep('z')],{kind:'official_reconciliation',set}).problems).toEqual(['extra case z']);
  expect(reduceForKind('official_reconciliation',[rep('a'),rep('b',{result:'missing'},false),good[2]],{kind:'official_reconciliation',set}).problems).toEqual(['case b: required=false but the fixture says true']);
  const r=reduceForKind('official_reconciliation',[rep('a'),rep('b',{result:'skipped',reason:'retracted'}),rep('r')],{kind:'official_reconciliation',set});
  expect(r.problems).toEqual(['case b is skipped(retracted) but not retracted in the fixture','case r is retracted but not skipped(retracted)']);
 });
 it('a misclassified required flag is reduced with the fixture value (missing required → incomplete)',()=>{
  expect(reduceForKind('official_reconciliation',[rep('a'),rep('b',{result:'missing'},false),good[2]],{kind:'official_reconciliation',set}).summary.gate).toBe('incomplete');
 });
 it('reference: the fixture canary is excluded consistently and the result equals referenceSummary of the same run',async()=>{
  const samples={schema_version:1 as const,samples:[sample(),sample({sample_id:'s2',parsed_value:null}),sample({sample_id:'canary',parsed_value:CANARY_VALUE,our_target:{series_id:CANARY_SERIES,period_end:'2026-09-30',which:'latest'},canary:true})]};
  const run=await evaluateReference(samples.samples,[],{today:'2026-11-06',evaluatorCodeVersion:'d'.repeat(40),reader:{value:async t=>({value_text:t.series_id===CANARY_SERIES?'1':'100',unit:'index',run_id:'r1'})}});
  const r=reduceForKind('reference_regression',run.cases,{kind:'reference_regression',samples});
  expect(r.problems).toEqual([]);
  expect(r.summary).toEqual(referenceSummary(run.result,REFERENCE_THRESHOLDS));
  expect(r.summary).toMatchObject({population:2,gate:'pass',evidence_class:'comparison'});
 });
});
