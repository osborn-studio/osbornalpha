// src/lib/evals/run-gold-set.test.ts
import {describe,expect,it} from 'vitest';
import {fakeReader,gcase,gset,env,readRow} from './kinds/official-test-support';
import type {FakeReader,FakeReaderOptions} from './kinds/official-test-support';
import {artifactVerified,runGoldSet,selectCases,verifiedOf} from './run-gold-set';
import {goldBlockOf} from './summary';
import type {RunGoldSetOptions} from './run-gold-set';
import type {CaseReport,CaseTarget,FactTarget,GoldCase,ReadRow,ReportEnvironment} from './types';

const ENVIRONMENT:ReportEnvironment={db_host:null,app_origin:null,db_state_rev:null};
const FACT=gcase().target as FactTarget;
const at=(id:string,concept:string,over:Partial<GoldCase>={})=>gcase({case_id:id,target:{...FACT,concept},...over});
const THREE=()=>[at('c1','revenue'),at('c2','net_income_parent'),at('c3','total_assets')];
const conceptOf=(t:CaseTarget)=>t.type==='fact'?t.concept:t.metric;
const rowsBy=(by:Record<string,ReadRow[]>):NonNullable<FakeReaderOptions['rows']>=>t=>by[conceptOf(t)]??[readRow()];
const run=(o:Partial<RunGoldSetOptions>&Pick<RunGoldSetOptions,'set'>,reader:FakeReader=fakeReader())=>runGoldSet({mode:'ci',reader,env:env(),environment:ENVIRONMENT,...o});
const RETRACTED={at:'2026-11-01',by:'owner',reason:'test'};

describe('runGoldSet — report and gate (spec §3.2, §7.2)',()=>{
 it('a passing set: gate pass, exit 0, report header from the set, evidence_class truth, db_state_rev from the reader',async()=>{
  const set=gset(THREE());
  const o=await run({set,runId:'11111111-1111-4111-8111-111111111111'});
  expect(o.exitCode).toBe(0);
  expect(o.report).toMatchObject({run_id:'11111111-1111-4111-8111-111111111111',kind:'official_reconciliation',module:'facts',mode:'ci',privileged:false,artifact_class:'public',
   set:{id:'facts/unit',version:1,sha256:'e'.repeat(64),format:'f6',path:set.path},evaluator_code_version:'a'.repeat(40),dirty:false,
   environment:{db_host:null,app_origin:null,db_state_rev:7},provenance:{verified:{artifacts:false,sources:false}}});
  expect(o.report.summary).toMatchObject({gate:'pass',population:3,evidence_class:'truth',execution:{read_error:0,subset:false},gold:{format:'f6',ready:true,pending:0,provenance_gaps:0}});
  expect(o.report.cases.map(c=>c.case_id)).toEqual(['c1','c2','c3']);
 });
 it('a run id is generated when none is given; an explicit db_state_rev is kept',async()=>{
  const o=await run({set:gset(THREE()),environment:{...ENVIRONMENT,db_state_rev:99}});
  expect(o.report.run_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(o.report.environment.db_state_rev).toBe(99);
 });
 it('privileged reader: report.privileged and verified.artifacts; an unprivileged reader never claims verified artifacts',async()=>{
  const p=await run({set:gset(THREE()),verify:{artifacts:true,sources:false}},fakeReader({privileged:{}}));
  expect(p.report).toMatchObject({privileged:true,provenance:{verified:{artifacts:true,sources:false}}});
  const u=await run({set:gset(THREE()),verify:{artifacts:true,sources:false}});
  expect(u.report).toMatchObject({privileged:false,provenance:{verified:{artifacts:false,sources:false}}});
 });
 it('P1-8: verified.sources is derived from completed checks, not from the flag',async()=>{
  const noFetch=await run({set:gset(THREE()),verify:{artifacts:false,sources:true}});
  expect(noFetch.report.provenance.verified.sources).toBe(false);   // no fetchSource → every case provenance_incomplete, nothing verified
  expect(verifiedOf([{case_id:'a',required:true,outcome:{result:'expected_absent'},left:null,right:null,abs_diff:null,rel_diff:null,tolerance:'0',provenance:{ok:true,missing:[],source_verified:true},detail:{}}],{artifacts:true,sources:true},true)).toEqual({artifacts:false,sources:true});
  const passed=(over:Partial<CaseReport>={}):CaseReport=>({case_id:'p',required:true,outcome:{result:'pass'},left:'1',right:'1',abs_diff:'0',rel_diff:'0',tolerance:'0',provenance:{ok:true,missing:[],source_verified:true,object_path:'edgar/x/y.json'},detail:{},...over});
  expect(verifiedOf([passed()],{artifacts:true,sources:true},true)).toEqual({artifacts:true,sources:true});
  expect(verifiedOf([passed(),passed({case_id:'q',outcome:{result:'provenance_incomplete',reason:'source_sha256_mismatch'},provenance:{ok:false,missing:[],source_verified:false}})],{artifacts:true,sources:true},true).sources).toBe(false);
  expect(artifactVerified(passed({provenance:{ok:true,missing:[],source_verified:true}}))).toBe(false);
  expect(verifiedOf([passed()],{artifacts:false,sources:false},true)).toEqual({artifacts:false,sources:false});
  expect(verifiedOf([{case_id:'a',required:true,outcome:{result:'fail',reason:'value'},left:'1',right:'2',abs_diff:'1',rel_diff:'0.5',tolerance:'0',provenance:null,detail:{}}],{artifacts:true,sources:true},true)).toEqual({artifacts:false,sources:false});
  expect(verifiedOf([],{artifacts:true,sources:true},true)).toEqual({artifacts:false,sources:false});
 });
 it('R2-3: a derived-metric case is artifact-verified iff every input chain is ok with an object_path (no top-level path needed)',()=>{
  const chain=(p:Record<string,unknown>={})=>({fact_id:'f-1',concept:'revenue',ok:true,reason:null,source_ref:'a',raw_hash:'h',producer_code_version:'c'.repeat(40),object_path:'edgar/x/y.json',locator:'l',...p});
  const metric=(inputs:unknown):Parameters<typeof artifactVerified>[0]=>({case_id:'m',required:true,outcome:{result:'pass'},left:'0.4',right:'0.4',abs_diff:'0',rel_diff:'0',tolerance:'0',provenance:{ok:true,missing:[],source_verified:true},detail:{inputs}});
  expect(artifactVerified(metric([chain(),chain({concept:'gross_profit'})]))).toBe(true);
  expect(verifiedOf([metric([chain()])],{artifacts:true,sources:true},true)).toEqual({artifacts:true,sources:true});
  expect(artifactVerified(metric([]))).toBe(false);
  expect(artifactVerified(metric([chain(),chain({object_path:null})]))).toBe(false);
  expect(artifactVerified(metric([chain({ok:false})]))).toBe(false);
  expect(artifactVerified({...metric([chain()]),provenance:{ok:false,missing:[],reason:'input:x'}})).toBe(false);
 });
});

describe('runGoldSet — refusals before anything is read (spec §14)',()=>{
 it('a synthetic case in report mode → synthetic_in_report; ci allows it',async()=>{
  const reader=fakeReader();
  const synthetic=gset([gcase({provenance_kind:'synthetic'})]);
  await expect(run({set:synthetic,mode:'report'},reader)).rejects.toMatchObject({name:'EvalError',code:'synthetic_in_report'});
  expect(reader.calls.resolve).toEqual([]);
  expect((await run({set:synthetic})).exitCode).toBe(0);
 });
 it('restricted sets: ci → restricted_in_ci, report → kind_not_enabled (§16 D8); a module without a facts reader → kind_not_enabled',async()=>{
  await expect(run({set:gset([gcase()],{artifact_class:'restricted'})})).rejects.toMatchObject({code:'restricted_in_ci'});
  await expect(run({set:gset([gcase()],{artifact_class:'restricted'}),mode:'report'})).rejects.toMatchObject({code:'kind_not_enabled'});
  await expect(run({set:gset([gcase()],{module:'macro'})})).rejects.toMatchObject({code:'kind_not_enabled'});
 });
 it('dirty tree: report → dirty_tree; ci records dirty:true',async()=>{
  await expect(run({set:gset([gcase()]),mode:'report',env:env({dirty:true})})).rejects.toMatchObject({code:'dirty_tree'});
  expect((await run({set:gset([gcase()]),env:env({dirty:true})})).report.dirty).toBe(true);
 });
 it('an evaluator code version that is not 40 hex → code_version_missing',async()=>{
  await expect(run({set:gset([gcase()]),env:env({evaluatorCodeVersion:'abc'})})).rejects.toMatchObject({code:'code_version_missing'});
  await expect(run({set:gset([gcase()]),env:env({evaluatorCodeVersion:`${'a'.repeat(40)}-dirty`})})).rejects.toMatchObject({code:'code_version_missing'});
 });
});

describe('runGoldSet — subset (spec §7.1: --case / --limit → subset=true → incomplete)',()=>{
 it('--case: the others are skipped(subset), only the chosen case is read',async()=>{
  const reader=fakeReader();
  const o=await run({set:gset(THREE()),caseIds:['c2']},reader);
  expect(o.report.cases.map(c=>[c.case_id,c.outcome])).toEqual([['c1',{result:'skipped',reason:'subset'}],['c2',{result:'pass'}],['c3',{result:'skipped',reason:'subset'}]]);
  expect(o.report.summary).toMatchObject({gate:'incomplete',execution:{subset:true}});expect(o.exitCode).toBe(3);
  expect(reader.calls.resolve).toHaveLength(1);
 });
 it('--limit: the first N cases in file order; an unselected retracted case stays skipped(retracted)',async()=>{
  const o=await run({set:gset(THREE()),limit:2});
  expect(o.report.cases.map(c=>c.outcome.result==='skipped'?c.outcome.reason:c.outcome.result)).toEqual(['pass','pass','subset']);
  const r=await run({set:gset([at('c1','revenue'),at('c2','net_income_parent',{retracted:RETRACTED})]),caseIds:['c1']});
  expect(r.report.cases[1].outcome).toEqual({result:'skipped',reason:'retracted'});
 });
 it('an unknown --case id is gold_invalid; a non-positive limit is a RangeError',async()=>{
  await expect(run({set:gset(THREE()),caseIds:['nope']})).rejects.toMatchObject({code:'gold_invalid'});
  expect(()=>selectCases(gset(THREE()),undefined,0)).toThrow(RangeError);
  expect([...selectCases(gset(THREE()),['c3','c1'],1)]).toEqual(['c1']);
 });
});

describe('runGoldSet — mutation tests (spec §13.1)',()=>{
 it('one changed value → correctness.fail 1 → gate fail, exit 1',async()=>{
  const o=await run({set:gset(THREE())},fakeReader({rows:rowsBy({net_income_parent:[readRow({value_text:'1001'})]})}));
  expect(o.report.summary).toMatchObject({gate:'fail',correctness:{fail:1,pass:2}});expect(o.exitCode).toBe(1);
 });
 it('raw_hash removed → provenance_incomplete → gate fail, exit 1',async()=>{
  const o=await run({set:gset(THREE())},fakeReader({rows:rowsBy({total_assets:[readRow({raw_hash:undefined})]})}));
  expect(o.report.cases[2].outcome).toEqual({result:'provenance_incomplete',reason:'fields_missing'});
  expect(o.report.summary).toMatchObject({gate:'fail',correctness:{provenance_incomplete:1}});expect(o.exitCode).toBe(1);
 });
 it('a required case removed from the read → missing_required 1 → incomplete, exit 3',async()=>{
  const o=await run({set:gset(THREE())},fakeReader({rows:rowsBy({net_income_parent:[]})}));
  expect(o.report.summary).toMatchObject({gate:'incomplete',coverage:{missing_required:1},correctness:{fail:0}});expect(o.exitCode).toBe(3);
 });
 it('optional coverage below min_coverage_optional → incomplete; full optional coverage passes',async()=>{
  const cases=[at('c1','revenue'),at('o1','total_assets',{required:false}),at('o2','cash',{required:false})];
  const short=await run({set:gset(cases)},fakeReader({rows:rowsBy({cash:[]})}));
  expect(short.report.summary).toMatchObject({gate:'incomplete',coverage:{missing_optional:1,missing_required:0},correctness:{fail:0}});expect(short.exitCode).toBe(3);
  expect((await run({set:gset(cases)})).report.summary.gate).toBe('pass');
 });
 it('population 0 (every case retracted) → incomplete, exit 3',async()=>{
  const o=await run({set:gset(THREE().map(c=>({...c,retracted:RETRACTED})))});
  expect(o.report.summary).toMatchObject({population:0,gate:'incomplete'});expect(o.exitCode).toBe(3);
 });
 it('a legacy_plan2 set is incomplete even when every recorded value matches (spec §0 R5-1)',async()=>{
  const gaps=['source.sha256','source.locator','reviewed_by'];
  const set=gset([at('c1','revenue',{provenance_gaps:gaps}),at('c2','net_income_parent',{provenance_gaps:gaps}),at('c3','total_assets',{pending:true,provenance_gaps:gaps})],{format:'legacy_plan2',ready:false});
  const o=await run({set});
  expect(o.report.cases.map(c=>c.outcome)).toEqual([{result:'pass'},{result:'pass'},{result:'skipped',reason:'pending'}]);
  expect(o.report.summary).toMatchObject({gate:'incomplete',gold:{format:'legacy_plan2',ready:false,pending:1,provenance_gaps:3}});
  expect(o.exitCode).toBe(3);
 });
 it('summary.gold is summary.ts::goldBlockOf: pending cases and cases with any provenance gap',()=>{
  expect(goldBlockOf(gset([gcase({case_id:'a',pending:true}),gcase({case_id:'b',provenance_gaps:['reviewed_by']}),gcase({case_id:'c'})],{format:'legacy_plan2',ready:false}))).toEqual({format:'legacy_plan2',ready:false,pending:1,provenance_gaps:1});
 });
});

describe('runGoldSet — robustness (Codex challenge)',()=>{
 it('a valid 257-digit facts value between two ordinary cases: the run completes with all three reports',async()=>{
  const big='1'.repeat(257);
  const o=await run({set:gset(THREE())},fakeReader({rows:rowsBy({net_income_parent:[readRow({value_text:big})]})}));
  expect(o.report.cases).toHaveLength(3);
  expect(o.report.cases[1].outcome).toEqual({result:'fail',reason:'value'});
 });
 it('a value beyond 512 chars is read_error(read_failed) for that case only',async()=>{
  const o=await run({set:gset(THREE())},fakeReader({rows:rowsBy({net_income_parent:[readRow({value_text:'1'.repeat(513)})]})}));
  expect(o.report.cases.map(c=>c.outcome.result)).toEqual(['pass','read_error','pass']);
 });
});
