// src/lib/evals/report.test.ts
import {existsSync,linkSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from './canonical-json';
import {EvalError} from './errors';
import {assertEnvironmentClean,buildReport,renderMarkdown,reportPaths,writeReportFiles} from './report';
import {summarize} from './summary';
import type {CaseOutcome,CaseReport,EvalReport,GoldSet,ReportEnvironment} from './types';

const RUN='3f2a9c1e-7b4d-4e2a-9c1e-7b4d4e2a9c1e';
const SHA='0123456789abcdef0123456789abcdef01234567';
const SET={schema_version:1,format:'f6',set_id:'facts/synthetic-us',version:2,module:'facts',artifact_class:'public',module_implementers:['claude-code'],review_required:false,tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},
 optional_cases:[],history:[],cases:[],ready:true,path:'src/lib/evals/fixtures/gold/facts/synthetic-us.json',sha256:'d'.repeat(64)} as GoldSet;
const rep=(id:string,outcome:CaseOutcome,left:string|null=null,right:string|null=null):CaseReport=>({case_id:id,required:true,outcome,left,right,abs_diff:null,rel_diff:null,tolerance:'0',provenance:null,detail:{}});
const CASES=[rep('Z/pass',{result:'pass'},'1','1'),rep('A|pipe/fail',{result:'fail',reason:'value'},'101','100'),rep('M/missing',{result:'missing'},null,'5')];
const ENV:ReportEnvironment={db_host:'127.0.0.1:54329',app_origin:null,db_state_rev:7};
const build=(over:Partial<Parameters<typeof buildReport>[0]>={})=>{
 const cases=over.cases??CASES;
 return buildReport({runId:RUN,kind:'official_reconciliation',mode:'report',privileged:false,set:SET,env:{today:'2026-11-06',now:()=>new Date(0),evaluatorCodeVersion:SHA,dirty:false},environment:ENV,
  startedAt:'2026-11-06T09:00:00.000Z',finishedAt:'2026-11-06T09:00:05.000Z',verified:{artifacts:false,sources:false},
  summary:summarize(cases,{thresholds:SET.thresholds,gold:{format:'f6',ready:true,pending:0,provenance_gaps:0},subset:false,evidenceClass:'truth'}),cases,...over});
};
const codeOf=(f:()=>unknown)=>{try{f();return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).code;}};
const roots:string[]=[];
afterAll(()=>{for(const r of roots)rmSync(r,{recursive:true,force:true});});
const tmp=()=>{const r=mkdtempSync(join(tmpdir(),'f6-report-'));roots.push(r);return r;};

describe('buildReport',()=>{
 it('assembles the §7.2 shape from the set, env and run; cases sorted by case_id',()=>{
  const r=build();
  expect(r).toMatchObject({schema_version:1,run_id:RUN,kind:'official_reconciliation',module:'facts',mode:'report',privileged:false,artifact_class:'public',
   set:{id:'facts/synthetic-us',version:2,sha256:'d'.repeat(64),format:'f6',path:SET.path},evaluator_code_version:SHA,dirty:false,
   environment:ENV,thresholds:SET.thresholds,provenance:{verified:{artifacts:false,sources:false}}});
  expect(r.cases.map(c=>c.case_id)).toEqual(['A|pipe/fail','M/missing','Z/pass']);
  expect(r).toMatchObject({started_at:'2026-11-06T09:00:00.000Z',finished_at:'2026-11-06T09:00:05.000Z'});
  expect(build({verified:{artifacts:true,sources:false},privileged:true})).toMatchObject({privileged:true,provenance:{verified:{artifacts:true,sources:false}}});
  expect(r.summary.gate).toBe('incomplete');
 });
 it('reportPaths re-validates run_id',()=>{
  expect(codeOf(()=>reportPaths({...build(),run_id:'../x'}))).toBe('report_write_failed');
 });
 it('markdown cells flatten CR, CRLF and LF',()=>{
  const md=renderMarkdown(build({cases:[rep('a\r\nb\rc\nd',{result:'missing'})]}));
  expect(md).toContain('| a b c d |');
 });
 it('rejects a non-uuid run id, a non-40-hex code version and thresholds that differ from the set',()=>{
  expect(codeOf(()=>build({runId:'run-1'}))).toBe('report_write_failed');
  expect(codeOf(()=>build({env:{today:'2026-11-06',now:()=>new Date(0),evaluatorCodeVersion:'abc',dirty:false}}))).toBe('code_version_missing');
  const s=build().summary;
  expect(codeOf(()=>build({summary:{...s,thresholds:{max_fail:3,min_coverage_optional:'0.95'}}}))).toBe('report_write_failed');
 });
});

describe('environment carries no credentials',()=>{
 it('accepts bare hosts and origins, null fields',()=>{
  for(const e of [ENV,{db_host:null,app_origin:null,db_state_rev:null},{db_host:'db.abcdefgh.supabase.co',app_origin:'https://alpha.example.com',db_state_rev:0}] as ReportEnvironment[])expect(()=>assertEnvironmentClean(e)).not.toThrow();
 });
 it('rejects user:password@host, URLs in db_host, userinfo or paths in app_origin',()=>{
  for(const e of [{db_host:'postgres:secret@db.example.com'},{db_host:'postgres://db.example.com'},{db_host:'db.example.com/postgres?password=x'},{app_origin:'https://u:p@alpha.example.com'},{app_origin:'https://alpha.example.com/path?key=1'},{app_origin:'file:///etc'}])
   expect(codeOf(()=>assertEnvironmentClean({...ENV,...e} as ReportEnvironment)),JSON.stringify(e)).toBe('report_write_failed');
  expect(codeOf(()=>build({environment:{...ENV,db_host:'u:pw@h'}}))).toBe('report_write_failed');
 });
});

describe('renderMarkdown',()=>{
 it('two renders are byte-identical, also for a report rebuilt with keys in another order',()=>{
  const r=build();
  const reordered=JSON.parse(canonicalJson(r)) as EvalReport;
  expect(renderMarkdown(r)).toBe(renderMarkdown(r));
  expect(renderMarkdown(reordered)).toBe(renderMarkdown(r));
 });
 it('fixed section order, non-pass cases only, pipes escaped, ends with a newline',()=>{
  const md=renderMarkdown(build());
  const order=['# Eval report:','## Gate','## Summary','### Correctness','### Coverage','### Execution','### Thresholds','### Gold','## Non-pass cases (2 of 3)'].map(h=>md.indexOf(h));
  expect(order.every((x,i)=>x>=0&&(i===0||x>order[i-1]))).toBe(true);
  expect(md).toContain('| A\\|pipe/fail | true | fail | value | 101 | 100 | — | — | 0 |');
  expect(md).toContain('| M/missing | true | missing | — | — | 5 | — | — | 0 |');
  expect(md).not.toContain('Z/pass');
  expect(md.endsWith('\n')).toBe(true);
  expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}T(?!09:00:0[05]\.000Z)/);
 });
 it('reference_regression: never renders cases[] values, only summary counts (sentinel)',()=>{
  const canary=rep('__canary__',{result:'beyond_unexplained'},'1','918273645.5');
  const md=renderMarkdown(build({kind:'reference_regression',cases:[canary,rep('S1',{result:'within'},'2','2')]}));
  expect(md).not.toContain('918273645.5');
  expect(md).not.toContain('__canary__');
  expect(md).toContain('Case values are not rendered for reference_regression');
  expect(md).toContain('| 1 | 0 | 0 | 0 | 1 |');
 });
});

describe('reportPaths',()=>{
 it('ci → reports/evals/<run_id>.json without .md',()=>{
  expect(reportPaths(build({mode:'ci'}))).toEqual({json:`reports/evals/${RUN}.json`,md:null});
 });
 it('report → docs/evals/<date of started_at>/<module>-<kind>-<run8>.{json,md}',()=>{
  expect(reportPaths(build())).toEqual({json:'docs/evals/2026-11-06/facts-official_reconciliation-3f2a9c1e.json',md:'docs/evals/2026-11-06/facts-official_reconciliation-3f2a9c1e.md'});
  expect(reportPaths(build(),'/r').json).toBe('/r/docs/evals/2026-11-06/facts-official_reconciliation-3f2a9c1e.json');
 });
 it('restricted: restricted_in_ci in ci, kind_not_enabled in report (§16 D8)',()=>{
  const restricted={...SET,artifact_class:'restricted'} as GoldSet;
  expect(codeOf(()=>reportPaths(build({set:restricted,mode:'ci'})))).toBe('restricted_in_ci');
  expect(codeOf(()=>reportPaths(build({set:restricted})))).toBe('kind_not_enabled');
 });
});

describe('writeReportFiles',()=>{
 it('writes canonicalJson + newline and returns the sha256 of exactly those bytes',()=>{
  const root=tmp(),r=build();
  const w=writeReportFiles(r,root);
  const bytes=readFileSync(join(root,w.json));
  expect(w.sha256).toBe(sha256Hex(bytes));
  expect(bytes.toString('utf8')).toBe(`${canonicalJson(r)}\n`);
  expect(JSON.parse(bytes.toString('utf8'))).toEqual(r);
  expect(readFileSync(join(root,w.md!),'utf8')).toBe(renderMarkdown(r));
 });
 it('ci writes only the JSON',()=>{
  const root=tmp();
  expect(writeReportFiles(build({mode:'ci'}),root)).toMatchObject({json:`reports/evals/${RUN}.json`,md:null});
 });
 it('report mode: a pre-existing .md is refused and no JSON is left behind',()=>{
  const root=tmp(),r=build(),p=reportPaths(r,root);
  mkdirSync(join(root,'docs/evals/2026-11-06'),{recursive:true});writeFileSync(p.md!,'keep');
  expect(codeOf(()=>writeReportFiles(r,root))).toBe('report_write_failed');
  expect(existsSync(p.json)).toBe(false);expect(readFileSync(p.md!,'utf8')).toBe('keep');
 });
 it('a failure on the second publish leaves no orphan, and a retry succeeds',()=>{
  const root=tmp(),r=build(),p=reportPaths(r,root);
  let n=0;
  const flaky=(a:string,b:string)=>{if(++n===2)throw new Error('disk');linkSync(a,b);};
  expect(codeOf(()=>writeReportFiles(r,root,{link:flaky}))).toBe('report_write_failed');
  expect(readdirSync(join(root,'docs/evals/2026-11-06'))).toEqual([]);
  expect(existsSync(p.json)).toBe(false);
  expect(writeReportFiles(r,root).sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(readdirSync(join(root,'docs/evals/2026-11-06')).sort()).toEqual(readdirSync(join(root,'docs/evals/2026-11-06')).filter(f=>!f.includes('.tmp-')).sort());
 });
 it('a write failure after the temp file is created leaves no temp or target',()=>{
  const root=tmp(),r=build(),dir=join(root,'docs/evals/2026-11-06');
  const enospc=(fd:number)=>{void fd;throw Object.assign(new Error('full'),{code:'ENOSPC'});};
  expect(codeOf(()=>writeReportFiles(r,root,{write:enospc}))).toBe('report_write_failed');
  expect(readdirSync(dir)).toEqual([]);
 });
 it('never overwrites an existing report',()=>{
  const root=tmp(),r=build({mode:'ci'});
  writeReportFiles(r,root);
  expect(codeOf(()=>writeReportFiles(r,root))).toBe('report_write_failed');
 });
 it('refuses a report whose environment carries credentials',()=>{
  const r={...build({mode:'ci'}),environment:{db_host:'u:p@h',app_origin:null,db_state_rev:null}};
  expect(codeOf(()=>writeReportFiles(r,tmp()))).toBe('report_write_failed');
 });
});
