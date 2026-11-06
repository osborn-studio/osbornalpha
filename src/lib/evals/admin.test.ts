// src/lib/evals/admin.test.ts
import {describe,expect,it} from 'vitest';
import {EVAL_CASE_ROWS_MAX,getEvalRun,listEvalRuns,parseEvalListQuery,whitelistSummary} from './admin';
import {RUN_A,RUN_B,SENTINEL,caseRow,evalTables,runRow,summaryRow} from './test-support/eval-rows';

const RUN_KEYS=['artifact_class','evaluator_code_version','finished_at','kind','mode','module','privileged','report_ref','report_sha256','run_id','set_id','set_sha256','set_version','started_at','status','summary','triggered_by'];
const SUMMARY_KEYS=['correctness','coverage','evidence_class','execution','gate','gold','population','reconciliations_truncated','required','thresholds'];
const CASE_KEYS=['abs_diff','case_id','document_id','left_text','locator','reason','rel_diff','result','right_text','tolerance'];
const keys=(o:object)=>Object.keys(o).sort();
const NOW=new Date('2026-11-06T12:00:00.000Z');
const daysAgo=(n:number)=>new Date(NOW.getTime()-n*86_400_000).toISOString();
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

describe('parseEvalListQuery',()=>{
 it('defaults and bounds',()=>{
  expect(parseEvalListQuery(new URLSearchParams(''))).toEqual({ok:true,query:{limit:20}});
  expect(parseEvalListQuery(new URLSearchParams('limit=100&module=facts&kind=replay_consistency'))).toEqual({ok:true,query:{limit:100,module:'facts',kind:'replay_consistency'}});
  for(const [qs,error] of [['limit=0','invalid_limit'],['limit=101','invalid_limit'],['limit=1.5','invalid_limit'],['limit=abc','invalid_limit'],['module=bonds','invalid_module'],['kind=vibes','invalid_kind']])
   expect(parseEvalListQuery(new URLSearchParams(qs))).toEqual({ok:false,error});
 });
});

describe('whitelistSummary',()=>{
 it('copies exactly the §3.2 keys (nested ones too) and drops everything else',()=>{
  const s=whitelistSummary(summaryRow())!;
  expect(keys(s)).toEqual(SUMMARY_KEYS);
  expect(keys(s.correctness)).toEqual(['fail','pass','provenance_incomplete','unexplained_diff','unit_mismatch']);
  expect(keys(s.coverage)).toEqual(['evaluated','evaluated_optional','missing_optional','missing_required','not_visible','skipped']);
  expect(keys(s.execution)).toEqual(['read_error','subset','truncated']);
  expect(keys(s.thresholds)).toEqual(['max_fail','min_coverage_optional']);
  expect(keys(s.gold)).toEqual(['format','pending','provenance_gaps','ready']);
  expect(JSON.stringify(s)).not.toContain(SENTINEL);
 });
 it('an empty (running) or malformed summary is null',()=>{
  expect(whitelistSummary({})).toBeNull();
  expect(whitelistSummary(summaryRow({gate:'maybe'}))).toBeNull();
  expect(whitelistSummary(summaryRow({population:-1}))).toBeNull();
  expect(whitelistSummary(summaryRow({thresholds:{max_fail:0,min_coverage_optional:0.95}}))).toBeNull();
  expect(whitelistSummary('{"gate":"pass"}')).toBeNull();
 });
});

describe('listEvalRuns',()=>{
 it('whitelisted run rows newest first, filters, limit, and the 30-day gate-failing count (global)',async()=>{
  const t=evalTables();
  await t.insert('dq_eval_runs',runRow({run_id:uuid(1),status:'failed',started_at:daysAgo(10),finished_at:daysAgo(10)}));
  await t.insert('dq_eval_runs',runRow({run_id:uuid(2),status:'incomplete',started_at:daysAgo(40),finished_at:daysAgo(40)}));
  await t.insert('dq_eval_runs',runRow({run_id:uuid(3),status:'error',kind:'replay_consistency',started_at:daysAgo(1),finished_at:daysAgo(1)}));
  await t.insert('dq_eval_runs',runRow({run_id:uuid(4),status:'passed',started_at:daysAgo(2),finished_at:daysAgo(2)}));
  await t.insert('dq_eval_runs',runRow({run_id:uuid(5),status:'running',started_at:daysAgo(0.01),finished_at:null,summary:{}}));
  const all=await listEvalRuns(t,{limit:20},NOW);
  expect(keys(all)).toEqual(['gate_failing_30d','refreshed_at','runs']);
  expect(all.runs.map(r=>r.run_id)).toEqual([uuid(5),uuid(3),uuid(4),uuid(1),uuid(2)]);
  expect(all.gate_failing_30d).toBe(2);   // failed (10 d) + error (1 d); the 40-day incomplete is outside
  expect(all.refreshed_at).toBe(NOW.toISOString());
  for(const r of all.runs)expect(keys(r)).toEqual(RUN_KEYS);
  expect(all.runs[0].summary).toBeNull();
  expect(keys(all.runs[1].summary!)).toEqual(SUMMARY_KEYS);
  expect(JSON.stringify(all)).not.toContain(SENTINEL);
  const replay=await listEvalRuns(t,{limit:20,kind:'replay_consistency'},NOW);
  expect(replay.runs.map(r=>r.run_id)).toEqual([uuid(3)]);
  expect(replay.gate_failing_30d).toBe(2);
  expect((await listEvalRuns(t,{limit:2},NOW)).runs.map(r=>r.run_id)).toEqual([uuid(5),uuid(3)]);
  expect((await listEvalRuns(t,{limit:20,module:'macro'},NOW)).runs).toEqual([]);
 });
});

describe('getEvalRun',()=>{
 it('run + whitelisted case rows (text columns, locator, document_id) and nothing else',async()=>{
  const t=evalTables();
  await t.insert('dq_eval_runs',runRow());
  await t.insert('dq_eval_case_results',caseRow(RUN_A,'ZZEVA/revenue/2023'));
  await t.insert('dq_eval_case_results',caseRow(RUN_A,'ZZEVA/cash/2023',{result:'missing',reason:null,left_text:null,abs_diff:null,rel_diff:null,detail:{locator:{page:'x',nested:{a:1}},document_id:{kind:'edgar_accession'}}}));
  const d=(await getEvalRun(t,RUN_A))!;
  expect(keys(d)).toEqual(['case_total','cases','cases_truncated','run']);
  expect(keys(d.run)).toEqual(RUN_KEYS);
  expect(d.cases.map(c=>c.case_id)).toEqual(['ZZEVA/cash/2023','ZZEVA/revenue/2023']);
  for(const c of d.cases)expect(keys(c)).toEqual(CASE_KEYS);
  expect(d.cases[1]).toEqual({case_id:'ZZEVA/revenue/2023',result:'fail',reason:'value',left_text:'383285000001',right_text:'383285000000',abs_diff:'1',rel_diff:'0.0000000000',tolerance:'0',
   locator:{page:28,table:'CONSOLIDATED STATEMENTS OF OPERATIONS',row:'Total net sales'},document_id:{kind:'edgar_accession',value:'0009990601-24-000001'}});
  expect(d.cases[0]).toMatchObject({result:'missing',reason:null,left_text:null,locator:null,document_id:null});
  expect(d).toMatchObject({case_total:2,cases_truncated:false});
  expect(JSON.stringify(d)).not.toContain(SENTINEL);
 });
 it(`at most ${EVAL_CASE_ROWS_MAX} case rows; total and truncation reported; unknown run → null; other runs' rows excluded`,async()=>{
  const t=evalTables();
  await t.insert('dq_eval_runs',runRow());
  await t.insert('dq_eval_runs',runRow({run_id:RUN_B}));
  for(let i=0;i<101;i++)await t.insert('dq_eval_case_results',caseRow(RUN_A,`case-${String(i).padStart(3,'0')}`));
  await t.insert('dq_eval_case_results',caseRow(RUN_B,'other'));
  const d=(await getEvalRun(t,RUN_A))!;
  expect(d.cases.length).toBe(EVAL_CASE_ROWS_MAX);
  expect(d).toMatchObject({case_total:101,cases_truncated:true});
  expect(d.cases.some(c=>c.case_id==='other')).toBe(false);
  expect(await getEvalRun(t,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toBeNull();
 });
});
