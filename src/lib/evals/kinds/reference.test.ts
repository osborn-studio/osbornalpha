// src/lib/evals/kinds/reference.test.ts
import {describe,expect,it,vi} from 'vitest';
import {EvalError} from '../errors';
import {renderMarkdown} from '../report';
import type {EvalReport,Summary} from '../types';
import {CANARY_SERIES,CANARY_VALUE,REFERENCE_REL,evaluateReference,parseReferenceLedger,parseReferenceResult,parseReferenceSamples,referenceSummary,referenceSummaryWriter} from './reference';
import type {ReferenceReadDeps,ReferenceSample} from './reference';

const sample=(p:Partial<ReferenceSample>={}):ReferenceSample=>({sample_id:'s1',doc:'macro-strategy',doc_sha256:'a'.repeat(64),line:1,page_url:'https://chaos.example/macro',page_sha256:'b'.repeat(64),captured_at:'2026-11-04T00:00:00Z',
 as_displayed:'100.5',parsed_value:'100.5',parsed_unit:'index',their_declared_source:'NBS',our_target:{series_id:'cn.cpi',period_end:'2026-09-30',which:'latest'},canary:false,...p});
const canary=()=>sample({sample_id:'canary',as_displayed:CANARY_VALUE,parsed_value:CANARY_VALUE,our_target:{series_id:CANARY_SERIES,period_end:'2026-09-30',which:'latest'},canary:true});
const deps=(values:Record<string,string|null>):ReferenceReadDeps=>({today:'2026-11-06',evaluatorCodeVersion:'d'.repeat(40),reader:{value:async t=>t.series_id in values&&values[t.series_id]!==null?{value_text:values[t.series_id]!,unit:'index',run_id:'r1'}:null}});
const entry=(p:Record<string,unknown>={})=>({sample_id:'s1',their_value:'100.5',our_value:'110',our_run_id:'r1',reason_code:'aggregation_method',evidence:{type:'computation',ref:'docs/evals/notes/cpi.md'},added_by:'claude-code',approved_by:'owner',approval_ref:'https://github.com/osborn-studio/OsbornAlpha/pull/9#pullrequestreview-1',...p});
const code=(f:()=>unknown)=>{try{f();return 'ok';}catch(e){return e instanceof EvalError?e.code:`other:${String(e)}`;}};
const THRESHOLDS={max_fail:0,min_coverage_optional:'0.95'};

describe('parseReferenceResult (strict)',()=>{
 it('accepts exactly {total, within, beyond_explained, beyond_unexplained, unavailable, missing} of non-negative integers that add up',()=>{
  expect(parseReferenceResult({total:3,within:1,beyond_explained:1,beyond_unexplained:0,unavailable:1,missing:0})).toEqual({total:3,within:1,beyond_explained:1,beyond_unexplained:0,unavailable:1,missing:0});
 });
 it('refuses extra / missing keys, negatives, fractions, strings, a wrong total, arrays and class instances',()=>{
  const ok={total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0,missing:0};
  class R{total=1;within=1;beyond_explained=0;beyond_unexplained=0;unavailable=0;missing=0;}
  for(const bad of [{...ok,value:'918273645.5'},{total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0},{...ok,within:-1,total:-1},{...ok,within:0.5,total:0.5},{...ok,within:'1'},{...ok,total:2},[1,1,0,0,0,0],new R(),null,'ok'])
   expect(code(()=>parseReferenceResult(bad))).toBe('reference_result_schema');
 });
});

describe('ReadDeps reflection',()=>{
 it('the deps object has no insert/update/upsert/store/delete/rpc members; a write-capable reader is refused',async()=>{
  const d=deps({});
  const names:string[]=[];
  const walk=(o:object,p:string)=>{for(const k of Object.keys(o)){names.push(`${p}${k}`);const v=(o as Record<string,unknown>)[k];if(v&&typeof v==='object')walk(v as object,`${p}${k}.`);}};
  walk(d,'');
  expect(names.filter(n=>/(^|\.)(insert|update|upsert|store|delete|rpc)/.test(n))).toEqual([]);
  const bad={...d,reader:{...d.reader,insert:async()=>undefined}} as unknown as ReferenceReadDeps;
  await expect(evaluateReference([sample()],[],bad)).rejects.toMatchObject({code:'reference_write_attempt'});
 });
});

describe('evaluateReference',()=>{
 it(`within at rel ${REFERENCE_REL} (ours left, theirs right)`,async()=>{
  const r=await evaluateReference([sample()],[],deps({'cn.cpi':'100'}));
  expect(r.cases[0]).toMatchObject({case_id:'s1',outcome:{result:'within'},left:'100',right:'100.5',tolerance:'0.01'});
  expect(r.result).toEqual({total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0,missing:0});
 });
 it('beyond: explained only by an approved, non-unknown entry whose their/our values equal the compared values',async()=>{
  const run=async(e?:Record<string,unknown>)=>(await evaluateReference([sample()],e?parseReferenceLedger([e]):[],deps({'cn.cpi':'110'}))).cases[0].outcome;
  expect(await run()).toEqual({result:'beyond_unexplained'});
  expect(await run(entry())).toEqual({result:'beyond_explained',ledger_ids:['s1']});
  expect(await run(entry({our_value:'110.000'}))).toEqual({result:'beyond_explained',ledger_ids:['s1']});   // decimal equality
  expect(await run(entry({reason_code:'unknown'}))).toEqual({result:'beyond_unexplained'});
  expect(await run(entry({our_value:'111'}))).toEqual({result:'beyond_unexplained'});
  expect(await run(entry({their_value:'100'}))).toEqual({result:'beyond_unexplained'});
  expect(await run(entry({approved_by:'claude-code'}))).toEqual({result:'beyond_unexplained'});
 });
 it('sample without a value (LPR rows, asset prices) → skipped(unavailable); a value on their side but none on ours → missing (P1-1)',async()=>{
  const r=await evaluateReference([sample({sample_id:'lpr',parsed_value:null}),sample({sample_id:'gone'})],[],deps({}));
  expect(r.cases.map(c=>c.outcome)).toEqual([{result:'skipped',reason:'unavailable'},{result:'missing'}]);
  expect(r.result).toEqual({total:2,within:0,beyond_explained:0,beyond_unexplained:0,unavailable:1,missing:1});
  expect(referenceSummary(r.result,THRESHOLDS)).toMatchObject({coverage:{missing_required:1,skipped:1,evaluated:0},gate:'incomplete'});
 });
 it('P1-1: 36 unavailable samples and zero comparisons are incomplete, never pass',async()=>{
  const r=await evaluateReference(Array.from({length:36},(_,i)=>sample({sample_id:`s${i}`,parsed_value:null})),[],deps({}));
  expect(r.result).toMatchObject({total:36,unavailable:36});
  expect(referenceSummary(r.result,THRESHOLDS).gate).toBe('incomplete');
 });
 it('canary: full comparison path (beyond_unexplained, value only in cases[]); not counted; absent from result, summary, store and the public .md',async()=>{
  const r=await evaluateReference([sample(),canary()],[],deps({'cn.cpi':'100',[CANARY_SERIES]:'1'}));
  const c=r.cases.find(x=>x.case_id==='canary')!;
  expect(c).toMatchObject({outcome:{result:'beyond_unexplained'},left:'1',right:CANARY_VALUE});
  expect(r.countedCases.map(x=>x.case_id)).toEqual(['s1']);
  expect(r.result).toEqual({total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0,missing:0});
  const finishRun=vi.fn(async(_runId:string,_status:string,_summary:Summary,_at:string)=>{});
  const summary=await referenceSummaryWriter({finishRun},{thresholds:THRESHOLDS,now:()=>new Date('2026-11-06T00:00:00Z')}).writeReferenceSummary('run-1',r.result);
  expect(JSON.stringify(summary)).not.toContain(CANARY_VALUE);
  expect(JSON.stringify(finishRun.mock.calls)).not.toContain(CANARY_VALUE);
  const report:EvalReport={schema_version:1,run_id:'run-1',kind:'reference_regression',module:'macro',mode:'report',privileged:false,artifact_class:'public',
   set:{id:'reference/chaosai/macro-strategy',version:1,sha256:'f'.repeat(64),format:'f6',path:'src/lib/evals/fixtures/reference/chaosai/macro-strategy.json'},
   evaluator_code_version:'d'.repeat(40),dirty:false,started_at:'2026-11-06T00:00:00.000Z',finished_at:'2026-11-06T00:00:01.000Z',environment:{db_host:null,app_origin:null,db_state_rev:null},
   thresholds:THRESHOLDS,provenance:{verified:{artifacts:false,sources:false}},summary,cases:r.cases};
  expect(renderMarkdown(report)).not.toContain(CANARY_VALUE);
 });
 it('production has no __canary__ series → the canary is unavailable and still not counted',async()=>{
  const r=await evaluateReference([sample(),canary()],[],deps({'cn.cpi':'100'}));
  expect(r.cases.find(x=>x.case_id==='canary')!.outcome).toEqual({result:'skipped',reason:'unavailable'});
  expect(r.result.total).toBe(1);
 });
});

describe('referenceSummary / referenceSummaryWriter',()=>{
 it('§3.2 shape from counts: comparison evidence; beyond_unexplained 0 → pass, > 0 → fail; total 0 → incomplete',()=>{
  const s:Summary=referenceSummary({total:4,within:2,beyond_explained:1,beyond_unexplained:0,unavailable:1,missing:0},THRESHOLDS);
  expect(s).toMatchObject({population:4,required:4,correctness:{pass:3,fail:0,unit_mismatch:0,provenance_incomplete:0,unexplained_diff:0},coverage:{evaluated:3,skipped:1},evidence_class:'comparison',gate:'pass'});
  expect(referenceSummary({total:2,within:1,beyond_explained:0,beyond_unexplained:1,unavailable:0,missing:0},THRESHOLDS).gate).toBe('fail');
  expect(referenceSummary({total:0,within:0,beyond_explained:0,beyond_unexplained:0,unavailable:0,missing:0},THRESHOLDS).gate).toBe('incomplete');
 });
 it('the writer validates before writing and finishes the run with the gate status',async()=>{
  const finishRun=vi.fn(async(_runId:string,_status:string,_summary:Summary,_at:string)=>{});
  const w=referenceSummaryWriter({finishRun},{thresholds:THRESHOLDS,now:()=>new Date('2026-11-06T00:00:00Z')});
  await expect(w.writeReferenceSummary('run-1',{total:1,within:1,beyond_explained:0,beyond_unexplained:0,unavailable:0,extra:1})).rejects.toMatchObject({code:'reference_result_schema'});
  expect(finishRun).not.toHaveBeenCalled();
  await w.writeReferenceSummary('run-1',{total:1,within:0,beyond_explained:0,beyond_unexplained:1,unavailable:0,missing:0});
  expect(finishRun).toHaveBeenCalledWith('run-1','failed',expect.objectContaining({gate:'fail'}),'2026-11-06T00:00:00.000Z');
 });
});

describe('parseReferenceSamples / parseReferenceLedger',()=>{
 it('valid file; refusals are gold_invalid',()=>{
  expect(parseReferenceSamples({schema_version:1,samples:[sample(),canary()]}).samples.length).toBe(2);
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[sample({sample_id:''})]}))).toBe('gold_invalid');
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[sample({doc_sha256:'x'})]}))).toBe('gold_invalid');
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[sample({canary:true})]}))).toBe('gold_invalid');   // canary must target __canary__
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[canary(),{...canary(),sample_id:'canary2'}]}))).toBe('gold_invalid');   // at most one canary
  expect(code(()=>parseReferenceSamples({schema_version:1,samples:[sample(),sample()]}))).toBe('gold_invalid');   // duplicate sample_id
  expect(code(()=>parseReferenceLedger([entry({reason_code:'vibes'})]))).toBe('gold_invalid');
  expect(code(()=>parseReferenceLedger([entry({evidence:{type:'hunch',ref:'x'}})]))).toBe('gold_invalid');
  expect(code(()=>parseReferenceLedger([entry({approval_ref:''})]))).toBe('gold_invalid');
 });
});
