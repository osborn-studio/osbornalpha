// src/lib/evals/validate/expert.test.ts
// Spec §8: seeded selection recompute, check coverage, summary recompute, the 80 % rule, follow-ups, release closure.
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import type {GoldCase,GoldSet} from '../types';
import {CLOSURE_REF,findSetBySha,seededSelection,validateExpertRecord,verifyExpertRun} from './expert';
import type {EvalRunRow} from '../types';
import type {ExpertRecord} from './expert';

const gc=(case_id:string,subject:GoldCase['subject'],retracted:GoldCase['retracted']=null):GoldCase=>({
 case_id,subject,target:{type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
 expect:'present',printed:{text:'1',unit_label:'In millions',scale:'1000000'},canonical:{value:'1000000'},binding:'document',as_of:null,
 source:{document_type:'10-K',url:'https://www.sec.gov/Archives/edgar/data/1/x.htm',sha256:'0'.repeat(64)},provenance_kind:'transcribed',
 recorded_by:'r1',recorded_at:'2026-11-01T00:00:00Z',reviewed_by:'r2',reviewed_at:'2026-11-02T00:00:00Z',retracted,notes:'',required:true,pending:false,provenance_gaps:[],
});
// Three companies × three cases, one retracted case, one ticker-keyed company.
const CASES:GoldCase[]=[
 ...['a','b','c'].map(x=>gc(`C1/${x}`,{market:'US',cik:'1001'})),
 ...['a','b','c'].map(x=>gc(`C2/${x}`,{market:'US',cik:'1002'})),
 ...['a','b'].map(x=>gc(`C3/${x}`,{market:'CN',ticker:'600000.SH'})),
 gc('C3/r',{market:'CN',ticker:'600000.SH'},{at:'2026-11-03T00:00:00Z',by:'r2',reason:'typo'}),
];
const SET:GoldSet={schema_version:1,format:'f6',set_id:'facts/expert-test',version:2,module:'facts',artifact_class:'public',module_implementers:['claude-code'],review_required:false,
 tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],cases:CASES,ready:true,path:'src/lib/evals/fixtures/gold/facts/expert-test.json',sha256:'9'.repeat(64)};
const DOC={document_id:{kind:'edgar_accession',value:'0000999061-24-000001'},sha256:'0'.repeat(64),locator:{page:1}};
const RUN='aaaaaaaa-0000-4000-8000-000000000001';
const record=(o:Partial<ExpertRecord>={}):ExpertRecord=>{
 const selected=seededSelection(SET.cases,'seed-1',2,2);
 return {
  schema_version:1,module:'facts',sampled_at:'2026-11-20T00:00:00Z',expert:{alias:'E1',background:'CPA',independence:'not an implementer',contact_held_by:'owner'},
  population:{set_id:SET.set_id,set_version:2,set_sha256:SET.sha256,case_count:8,evaluated_run_id:RUN,db_state_rev:'7'},
  selection:{method:'seeded_sha256',seed:'seed-1',companies:2,cases_per_company:2,selected_case_ids:selected},
  checks:selected.map(case_id=>({case_id,our_value:'1000000',document_value:'1000000',document:DOC,verdict:'agree' as const,note:''})),
  basis_review:[{topic:'revenue basis',verdict:'agree',note:''}],summary:{agree:4,disagree:0,cannot_verify:0},follow_ups:[],...o,
 };
};
const codes=(r:unknown,release=false,set:GoldSet|null=SET)=>validateExpertRecord(r,set,{release}).map(f=>f.code);
const h=(s:string)=>createHash('sha256').update(s).digest('hex');

describe('seededSelection',()=>{
 it('ranks companies by their smallest sha256(seed + case_id), takes the first N, then the M smallest per company; retracted cases never count',()=>{
  const eligible=CASES.filter(c=>!c.retracted);
  const key=(c:GoldCase)=>c.subject.cik??c.subject.ticker!;
  const byCompany=new Map<string,string[]>();
  for(const c of eligible){byCompany.set(key(c),[...(byCompany.get(key(c))??[]),c.case_id]);}
  const ranked=[...byCompany.values()].map(ids=>ids.sort((a,b)=>h('seed-1'+a)<h('seed-1'+b)?-1:1)).sort((a,b)=>h('seed-1'+a[0])<h('seed-1'+b[0])?-1:1);
  expect(seededSelection(CASES,'seed-1',2,2)).toEqual(ranked.slice(0,2).flatMap(ids=>ids.slice(0,2)));
  expect(seededSelection(CASES,'seed-1',9,9)).toHaveLength(8);
  expect(seededSelection(CASES,'seed-1',9,9)).not.toContain('C3/r');
 });
 it('is deterministic for a seed',()=>expect(seededSelection(CASES,'x',3,1)).toEqual(seededSelection([...CASES].reverse(),'x',3,1)));
});

describe('validateExpertRecord',()=>{
 it('accepts a complete record, in release mode too',()=>{expect(codes(record())).toEqual([]);expect(codes(record(),true)).toEqual([]);});
 it('accepts selected_case_ids in any order',()=>{const r=record();r.selection.selected_case_ids=[...r.selection.selected_case_ids].reverse();expect(codes(r)).toEqual([]);});
 it('rejects malformed records with expert_invalid',()=>{
  expect(codes({...record(),schema_version:2})).toEqual(['expert_invalid']);
  expect(codes({...record(),selection:{...record().selection,method:'random'}})).toEqual(['expert_invalid']);
  expect(codes({...record(),expert:{...record().expert,contact_held_by:'expert'}})).toEqual(['expert_invalid']);
  expect(codes({...record(),checks:[{...record().checks[0],verdict:'maybe'}]})).toEqual(['expert_invalid']);
 });
 it('needs the population set',()=>expect(codes(record(),false,null)).toEqual(['expert_set_unresolved']));
 it('rejects a population that does not describe the set',()=>{
  expect(codes(record({population:{...record().population,set_version:1}}))).toContain('expert_population');
  expect(codes(record({population:{...record().population,case_count:9}}))).toContain('expert_population');
 });
 it('rejects a selection that does not recompute (swapped id, duplicate)',()=>{
  const r=record();const other=CASES.find(c=>!c.retracted&&!r.selection.selected_case_ids.includes(c.case_id))!.case_id;
  r.selection.selected_case_ids=[...r.selection.selected_case_ids.slice(1),other];
  expect(codes(r)).toContain('expert_selection_mismatch');
  const d=record();d.selection.selected_case_ids=[...d.selection.selected_case_ids,d.selection.selected_case_ids[0]];
  expect(codes(d)).toContain('expert_selection_mismatch');
 });
 it('requires one check per selected case and no others',()=>{
  const r=record();r.checks=r.checks.slice(1);r.summary={agree:3,disagree:0,cannot_verify:0};
  expect(codes(r)).toEqual(expect.arrayContaining(['expert_check_missing']));
  const x=record();x.checks=[...x.checks,{...x.checks[0],case_id:'C9/zz'}];x.summary={agree:5,disagree:0,cannot_verify:0};
  expect(codes(x)).toContain('expert_check_extra');
  const d=record();d.checks=[...d.checks,d.checks[0]];d.summary={agree:5,disagree:0,cannot_verify:0};
  expect(codes(d)).toContain('expert_check_duplicate');
 });
 it('recomputes the summary',()=>expect(codes(record({summary:{agree:3,disagree:1,cannot_verify:0}}))).toEqual(['expert_summary_mismatch']));
 it('requires agree + disagree ≥ 0.8 × selected (cannot_verify does not complete a sample)',()=>{
  const r=record();r.checks[0].verdict='cannot_verify';r.summary={agree:3,disagree:0,cannot_verify:1};
  expect(codes(r)).toEqual(['expert_coverage']);   // 3 of 4 < 3.2
 });
 it('requires a follow-up for every disagree, including basis_review',()=>{
  const r=record();r.checks[0].verdict='disagree';r.summary={agree:3,disagree:1,cannot_verify:0};
  expect(codes(r)).toEqual(['expert_follow_up_missing']);
  r.follow_ups=[{ref:r.checks[0].case_id,action:'re-check the filing',owner:'owner',due:'2026-12-01',closed_at:null,closure_ref:null}];
  expect(codes(r)).toEqual([]);
  r.basis_review=[{topic:'revenue basis',verdict:'disagree',note:'gross vs net'}];
  expect(codes(r)).toEqual(['expert_follow_up_missing']);
 });
 it('release mode requires every follow-up closed with a quarantine, PR or gold-history closure_ref',()=>{
  const r=record();r.checks[0].verdict='disagree';r.summary={agree:3,disagree:1,cannot_verify:0};
  r.follow_ups=[{ref:r.checks[0].case_id,action:'fix',owner:'owner',due:'2026-12-01',closed_at:null,closure_ref:null}];
  expect(codes(r,true)).toEqual(['expert_follow_up_open']);
  r.follow_ups[0]={...r.follow_ups[0],closed_at:'2026-11-25T00:00:00Z',closure_ref:'see chat'};
  expect(codes(r,true)).toEqual(['expert_follow_up_open']);
  for(const ref of ['dq_quarantine:3f2c1d4e-1111-4222-8333-444455556666','https://github.com/osborn-studio/OsbornAlpha/pull/123','gold:facts/expert-test@2']){
   r.follow_ups[0]={...r.follow_ups[0],closure_ref:ref};expect(codes(r,true)).toEqual([]);
  }
  expect(CLOSURE_REF.test('gold:facts/x')).toBe(false);
  // the gold ref must resolve against the population set (id + a version in its history or current)
  const set3={...SET,history:[{version:1,changed_at:'2026-11-01',changed_by:'r1',reason:'x',fields:['cases']}]};
  for(const ref of ['gold:facts/expert-test@1','gold:facts/expert-test@2']){r.follow_ups[0]={...r.follow_ups[0],closure_ref:ref};expect(validateExpertRecord(r,set3,{release:true}).map(f=>f.code)).toEqual([]);}
  for(const ref of ['gold:facts/expert-test@3','gold:facts/other@2']){r.follow_ups[0]={...r.follow_ups[0],closure_ref:ref};expect(validateExpertRecord(r,set3,{release:true}).map(f=>f.code)).toEqual(['expert_follow_up_open']);}
 });
 it('P1: agree/disagree need decimal values and document identity, else the check counts as cannot_verify (not toward 80 %)',()=>{
  for(const bad of [{our_value:null},{document_value:null},{our_value:'1e6'},{document_value:'abc'},{document:{page:1}},{document:{...DOC,sha256:'x'}},{document:{...DOC,locator:null}},{document:{url:'https://x.example/a',sha256:'0'.repeat(64)}}]){
   const r=record();Object.assign(r.checks[0],bad);
   expect(codes(r),JSON.stringify(bad)).toEqual(['expert_check_evidence','expert_coverage']);
  }
  const url=record();url.checks[0].document={url:'https://www.sec.gov/Archives/x.htm',sha256:'1'.repeat(64),locator:'p.3 line 4'};expect(codes(url)).toEqual([]);
  const neg=record();neg.checks[0].our_value='-12.50';neg.checks[0].document_value='-12.50';expect(codes(neg)).toEqual([]);
 });
 it('P1: an expected-absent case is checked with the explicit absent marker (null values), and only then',()=>{
  const sel=seededSelection(SET.cases,'seed-1',2,2);const T=sel[0];
  const set={...SET,cases:SET.cases.map(c=>c.case_id===T?{...c,expect:'missing' as const}:c)};
  const mk=(f:(c:ExpertRecord['checks'][number])=>void)=>{const r=record({population:{...record().population,case_count:8},selection:{...record().selection,selected_case_ids:sel},checks:sel.map(case_id=>({case_id,our_value:'1000000',document_value:'1000000',document:DOC,verdict:'agree' as const,note:''}))});f(r.checks.find(c=>c.case_id===T)!);return r;};
    expect(validateExpertRecord(mk(c=>{c.our_value=null;c.document_value=null;(c as {absent?:boolean}).absent=true;}),set,{}).map(f=>f.code)).toEqual([]);
  expect(validateExpertRecord(mk(()=>{}),set,{}).map(f=>f.code)).toEqual(['expert_check_evidence','expert_coverage']);
  // disagree on an expected-absent case: the expert found a value in the document → decimal document_value, our_value null, absent:false
  const dis=(f:(c:ExpertRecord['checks'][number])=>void)=>mk(c=>{c.verdict='disagree';f(c);});
  const withFollowUp=(r:ExpertRecord)=>({...r,summary:{agree:3,disagree:1,cannot_verify:0},follow_ups:[{ref:T,action:'fix',owner:'owner',due:'2026-12-01',closed_at:null,closure_ref:null}]});
  expect(validateExpertRecord(withFollowUp(dis(c=>{c.our_value=null;c.document_value='42.5';})),set,{}).map(f=>f.code)).toEqual([]);
  expect(validateExpertRecord(withFollowUp(dis(c=>{c.our_value=null;c.document_value=null;(c as {absent?:boolean}).absent=true;})),set,{}).map(f=>f.code)).toEqual(['expert_check_evidence','expert_coverage']);
  expect(validateExpertRecord(withFollowUp(dis(c=>{c.our_value=null;c.document_value='n/a';})),set,{}).map(f=>f.code)).toEqual(['expert_check_evidence','expert_coverage']);
  expect(validateExpertRecord(withFollowUp(dis(c=>{c.our_value=null;c.document_value='42.5';c.document={page:1};})),set,{}).map(f=>f.code)).toEqual(['expert_check_evidence','expert_coverage']);
  // agree on an expected-absent case keeps the absent:true + both null rule
  expect(validateExpertRecord(mk(c=>{c.our_value=null;c.document_value='42.5';}),set,{}).map(f=>f.code)).toEqual(['expert_check_evidence','expert_coverage']);
 });
 it('P2: verifyExpertRun fails closed without a store and requires a passed privileged official run of the same set',async()=>{
  const row=(o:Partial<EvalRunRow>={}):EvalRunRow=>({run_id:RUN,kind:'official_reconciliation',module:'facts',mode:'report',privileged:true,artifact_class:'public',set_id:SET.set_id,set_version:2,set_sha256:SET.sha256,evaluator_code_version:'c'.repeat(40),started_at:'x',finished_at:'y',status:'passed',summary:{} as never,report_ref:'r',report_sha256:'0'.repeat(64),triggered_by:'script',...o});
  const rec=record();const c=async(g?:(id:string)=>Promise<EvalRunRow|null>)=>(await verifyExpertRun(rec,g)).map(f=>f.code);
  expect(await c()).toEqual(['expert_run_unverified']);
  expect(await c(async()=>null)).toEqual(['expert_run_missing']);
  expect(await c(async()=>row())).toEqual([]);
  expect(await c(async()=>row({privileged:false}))).toEqual(['expert_run_invalid']);
  expect(await c(async()=>row({status:'failed'}))).toEqual(['expert_run_invalid']);
  expect(await c(async()=>row({kind:'replay_consistency'}))).toEqual(['expert_run_invalid']);
  expect(await c(async()=>row({set_sha256:'7'.repeat(64)}))).toEqual(['expert_run_invalid']);
  expect(await verifyExpertRun({}, async()=>row())).toEqual([]);   // shape errors are validateExpertRecord's business
 });
 it('findSetBySha loads the locked set with that sha256',()=>{
  const lock={files:[{path:'a.json',sha256:'1'.repeat(64),version:1,format:'f6' as const},{path:SET.path,sha256:SET.sha256,version:2,format:'f6' as const}]};
  expect(findSetBySha(lock,SET.sha256,p=>({...SET,path:p}))?.path).toBe(SET.path);
  expect(findSetBySha(lock,'2'.repeat(64),()=>SET)).toBeNull();
 });
});
