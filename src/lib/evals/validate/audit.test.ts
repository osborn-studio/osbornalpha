// src/lib/evals/validate/audit.test.ts
// Spec §9: report/disposition parsing rules, index.json validation on synthetic directories, and the
// REAL audit directory docs/audits/2026-11-04-evals-gold-sets (round-aware matching, Codex plan round 1 P1-9).
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {analyzeReport,decisionKind,isAccept,isOpenVerify,isOwner,markdownTables,parseDispositions,parseFindings,parseVerdict,tableCells,validateAuditDir} from './audit';

const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});

describe('markdown parsing',()=>{
 it('splits table cells but not inside backtick spans',()=>{
  expect(tableCells('| N3 x | ACCEPT | `not_visible(quarantined | superseded)` ok |')).toEqual(['N3 x','ACCEPT','`not_visible(quarantined | superseded)` ok']);
  expect(markdownTables('text\n| a | b |\n|---|---|\n| 1 | 2 |\n\n| c |\n| d |\n')).toEqual([{header:['a','b'],rows:[['1','2']]}]);
 });
 it('reads finding ids from a # column, from "P1 · id" severity cells, by synthesis, and from bold paragraphs',()=>{
  const md=[
   '| # | Severity (P1 blocking / P2 …) | Issue |','|---|---|---|','| 1 | P1 blocking | a |','| **N2** | **P2** | b |','',
   '| # | Status | Where |','|---|---|---|','| 1 | PARTIAL | not a findings table |','',
   '| Severity | Section | Issue |','|---|---|---|','| P1 | §1 | c |','| P1 | §2 | d |','| P2 | §3 | e |','',
   '| Severity | Section |','|---|---|','| **P1 · R3-1** | §4 |','',
   '**R5-1 · P1 — Abandonment loses the disposition.**  ','**R6-1 — PARTIAL:** not a finding',
  ].join('\n');
  expect(parseFindings(md,3)).toEqual([
   {id:'1',severity:'P1'},{id:'N2',severity:'P2'},{id:'R3-P1-1',severity:'P1'},{id:'R3-P1-2',severity:'P1'},{id:'R3-P2-1',severity:'P2'},
   {id:'R3-1',severity:'P1'},{id:'R5-1',severity:'P1'},
  ]);
 });
 it('reads disposition rows: first token id, "Round-1 #27" form, implemented_in column or the column after the decision',()=>{
  const md=[
   '| # | 决定 | 实施 / 理由 |','|---|---|---|','| 1 覆盖不足可过 | ACCEPT | §3.2 |','| N11 数值往返 | ACCEPT + OPEN-verify | §17.6 |','',
   '| # | Decision | How |','|---|---|---|','| Round-1 #27 Tushare paging | OPEN (verify) | runbook |','| N10 / A / C | **owner** | §14 |','',
   '| # | 级别 | 决定 | implemented_in |','|---|---|---|---|','| R5-1 | P1 | ACCEPT | 第 6 稿 §0 |','| R5-2 | P1 | ACCEPT |  |',
  ].join('\n');
  expect(parseDispositions(md,'03.md').map(r=>[r.id,r.decision,r.implemented_in])).toEqual([
   ['1','ACCEPT','§3.2'],['N11','ACCEPT + OPEN-verify','§17.6'],['27','OPEN (verify)','runbook'],['N10','owner','§14'],['R5-1','ACCEPT','第 6 稿 §0'],['R5-2','ACCEPT',''],
  ]);
  expect([isAccept('ACCEPT WITH LIMIT'),isAccept('DECLINE'),isOpenVerify('ACCEPT + OPEN-verify'),isOpenVerify('OPEN (verify)'),isOwner('**owner** (default)'),isOwner('ACCEPT')]).toEqual([true,false,true,true,true,false]);
 });
 it('parses the **Verdict: …** first line',()=>{
  expect(parseVerdict('\n**Verdict: not ready for implementation planning—x.** tail')).toBe('not ready for implementation planning—x');
  expect(parseVerdict('**Not ready.** body')).toBeNull();
 });
});

const TARGET='docs/superpowers/specs/x.md';
const TARGET_BYTES='spec bytes\n';
const REPORT='**Verdict: not ready.**\n\n| # | Severity | Issue |\n|---|---|---|\n| 1 | P1 | a |\n| 2 | P2 | b |\n| 3 | P3 | c |\n';
const DISPO='| # | 决定 | 实施 |\n|---|---|---|\n| 1 a | ACCEPT | §1 |\n| 2 b | ACCEPT + OPEN-verify | §17 |\n| 3 c | DECLINE | minor |\n';
function auditDir(o:{index?:Record<string,unknown>;round?:Record<string,unknown>;report?:string;dispo?:string}={}){
 const dir=mkdtempSync(join(tmpdir(),'f6-audit-'));dirs.push(dir);
 writeFileSync(join(dir,'00-prompt-round1.md'),'prompt');
 writeFileSync(join(dir,'01-codex-round1.md'),o.report??REPORT);
 writeFileSync(join(dir,'02-disposition.md'),o.dispo??DISPO);
 const index={topic:'x',target:{path:TARGET},
  rounds:[{n:1,target_sha256:sha(TARGET_BYTES),target_git_ref:'f'.repeat(40),prompt_file:'00-prompt-round1.md',report_file:'01-codex-round1.md',model:'gpt-6-astra',effort:'medium',verdict:'not ready',findings:{p1:1,p2:1,p3:1},...o.round}],
  dispositions:[{file:'02-disposition.md',covers_rounds:[1]}],open:{owner:[],verify:['§17 item']},final_verdict:'x',...o.index};
 writeFileSync(join(dir,'index.json'),JSON.stringify(index));
 return dir;
}
const gitShow=(ref:string,path:string)=>ref==='f'.repeat(40)&&path===TARGET?new TextEncoder().encode(TARGET_BYTES):null;
const codes=(dir:string,release=false)=>validateAuditDir(dir,{gitShow,release}).map(f=>f.code);

describe('validateAuditDir on synthetic directories',()=>{
 it('accepts a consistent directory',()=>expect(codes(auditDir())).toEqual([]));
 it('reports a missing or invalid index.json',()=>{
  const d=auditDir();writeFileSync(join(d,'index.json'),'{');expect(codes(d)).toEqual(['audit_index_invalid']);
  rmSync(join(d,'index.json'));expect(codes(d)).toEqual(['audit_index_missing']);
  expect(codes(auditDir({index:{rounds:[]}}))).toEqual(['audit_index_invalid']);
 });
 it('reports missing files',()=>{
  expect(codes(auditDir({round:{report_file:'99.md'}}))).toContain('audit_file_missing');
  expect(codes(auditDir({round:{prompt_file:'nope.md'}}))).toEqual(['audit_file_missing']);
  expect(codes(auditDir({round:{prompt_file:null}}))).toEqual([]);
  expect(codes(auditDir({index:{dispositions:[{file:'gone.md',covers_rounds:[1]}]}}))).toContain('audit_file_missing');
 });
 it('checks the findings counts against the report',()=>expect(codes(auditDir({round:{findings:{p1:2,p2:1,p3:1}}}))).toEqual(['audit_findings_count']));
 it("requires unverified_target: true for 'uncommitted' rounds and verifies committed bytes",()=>{
  expect(codes(auditDir({round:{target_git_ref:'uncommitted',target_sha256:null}}))).toEqual(['audit_unverified_target']);
  expect(codes(auditDir({round:{target_git_ref:'uncommitted',target_sha256:null,unverified_target:true}}))).toEqual([]);
  expect(codes(auditDir({round:{target_sha256:'0'.repeat(64)}}))).toEqual(['audit_target_mismatch']);
  expect(codes(auditDir({round:{target_git_ref:'e'.repeat(40)}}))).toEqual(['audit_target_unreadable']);
  expect(codes(auditDir({round:{target_git_ref:'HEAD'}}))).toEqual(['audit_target_ref']);
 });
 it('requires every finding id in some disposition table',()=>{
  expect(validateAuditDir(auditDir({dispo:DISPO.replace('| 3 c | DECLINE | minor |\n','')}),{gitShow})).toEqual([{code:'audit_finding_undisposed',where:'round 1 #3',message:'no disposition row for this round and id'}]);
 });
 it('P1-9: dispositions are matched by (round, id): covers_rounds and Round-N qualifiers; ambiguous reuse disposes nothing',()=>{
  const two=(dispo:string,covers:number[])=>{
   const d=auditDir({dispo,index:{dispositions:[{file:'02-disposition.md',covers_rounds:covers}]}});
   writeFileSync(join(d,'03-codex-round2.md'),REPORT);
   const idx=JSON.parse(readFileSync(join(d,'index.json'),'utf8'));
   idx.rounds.push({...idx.rounds[0],n:2,prompt_file:null,report_file:'03-codex-round2.md'});
   writeFileSync(join(d,'index.json'),JSON.stringify(idx));
   return validateAuditDir(d,{gitShow}).map(f=>[f.code,f.where]);
  };
  // round 1's table cannot close round 2's #1–#3
  expect(two(DISPO,[1])).toEqual([['audit_finding_undisposed','round 2 #1'],['audit_finding_undisposed','round 2 #2'],['audit_finding_undisposed','round 2 #3']]);
  // one unqualified table covering both rounds with ids repeated in both: ambiguous, nothing disposed
  const amb=two(DISPO,[1,2]);
  expect(amb.filter(x=>x[0]==='audit_disposition_ambiguous').length).toBe(3);
  expect(amb.filter(x=>x[0]==='audit_finding_undisposed').length).toBe(6);
  // explicit qualifiers resolve it
  const q='| # | 决定 | 实施 |\n|---|---|---|\n'+[1,2].flatMap(n=>[`| Round-${n} #1 a | ACCEPT | §1 |`,`| Round-${n} #2 b | ACCEPT | §17 |`,`| Round-${n} #3 c | DECLINE | minor |`]).join('\n')+'\n';
  expect(two(q,[1,2])).toEqual([]);
 });
 it('reads through deps.readFile (committed bytes) when given, never the working tree',()=>{
  const d=auditDir();const rel=(f:string)=>relative(process.cwd(),join(d,f)).split('\\').join('/');
  const files=new Map(['index.json','00-prompt-round1.md','01-codex-round1.md','02-disposition.md'].map(f=>[rel(f),new Uint8Array(readFileSync(join(d,f)))]));
  rmSync(join(d,'02-disposition.md'));
  expect(validateAuditDir(d,{gitShow,readFile:p=>files.get(p)??null})).toEqual([]);
  expect(validateAuditDir(d,{gitShow,readFile:()=>null}).map(f=>f.code)).toEqual(['audit_index_missing']);
 });
 it('requires implemented_in on ACCEPT rows',()=>expect(codes(auditDir({dispo:DISPO.replace('| 1 a | ACCEPT | §1 |','| 1 a | ACCEPT |  |')}))).toEqual(['audit_accept_unimplemented']));
 it('requires open.verify / open.owner to be non-empty when such dispositions exist',()=>{
  expect(codes(auditDir({index:{open:{owner:[],verify:[]}}}))).toEqual(['audit_open_inconsistent']);
  expect(codes(auditDir({dispo:DISPO+'| 9 z | OWNER | §16 |\n'}))).toEqual(['audit_open_inconsistent']);
 });
 it('release mode: last round committed; no P1/P2 OPEN-verify; P3 OPEN-verify is allowed',()=>{
  expect(codes(auditDir(),true)).toEqual(['audit_release_open_verify']);
  expect(codes(auditDir({dispo:DISPO.replace('ACCEPT + OPEN-verify','ACCEPT')}),true)).toEqual([]);
  expect(codes(auditDir({dispo:DISPO.replace('ACCEPT + OPEN-verify','ACCEPT').replace('| 3 c | DECLINE | minor |','| 3 c | OPEN-verify | later |')}),true)).toEqual([]);
  expect(codes(auditDir({dispo:DISPO.replace('ACCEPT + OPEN-verify','ACCEPT'),round:{target_git_ref:'uncommitted',target_sha256:null,unverified_target:true}}),true)).toEqual(['audit_release_uncommitted']);
 });
});

describe('validateAuditDir on the real audit directories',()=>{
 // Round 5 of the F6 spec audit targets commit 394d5141…; its bytes are read with the real `git show`
 // (CI checks out with fetch-depth 0). These expectations pin the CURRENT state of those directories.
 it('docs/audits/2026-11-04-evals-gold-sets is consistent; release mode reports only N11 (P1, OPEN-verify)',()=>{
  expect(validateAuditDir('docs/audits/2026-11-04-evals-gold-sets')).toEqual([]);
  expect(validateAuditDir('docs/audits/2026-11-04-evals-gold-sets',{release:true})).toEqual([{code:'audit_release_open_verify',where:'round 2 #N11',message:'P1 finding is OPEN-verify'}]);
 });
});

describe('P1 fail-closed report parsing (analyzeReport / parseFindings)',()=>{
 it('reads "# | P1/P2/P3 | …" and "# | Severity | …" headers',()=>{
  expect(parseFindings('| # | P1/P2/P3 | Issue |\n|---|---|---|\n| R1 | P1 | a |\n| R2 | P2 | b |\n',1)).toEqual([{id:'R1',severity:'P1'},{id:'R2',severity:'P2'}]);
  expect(parseFindings('| # | Severity | Issue |\n|---|---|---|\n| 7 | P2 | a |\n',2)).toEqual([{id:'7',severity:'P2'}]);
 });
 it('reads numbered and bulleted list findings and P-level headings with synthesized ids',()=>{
  expect(parseFindings('1. **P1** — a\n2) **P2**: b\n- P3 c\n* **R7 · P1** d\n### P2 heading\n',4)).toEqual([
   {id:'R4-P1-1',severity:'P1'},{id:'R4-P2-1',severity:'P2'},{id:'R4-P3-1',severity:'P3'},{id:'R7',severity:'P1'},{id:'R4-P2-2',severity:'P2'}]);
 });
 it('synthesized ids are unique report-wide (the counter is not reset per table)',()=>{
  const md='| Severity | Issue |\n|---|---|\n| P1 | a |\n\n| Severity | Issue |\n|---|---|\n| P1 | b |\n\n1. **P1** c\n';
  expect(parseFindings(md,1).map(f=>f.id)).toEqual(['R1-P1-1','R1-P1-2','R1-P1-3']);
 });
 it('flags P1/P2 lines it did not capture (fail closed)',()=>{
  expect(analyzeReport('| Priority | Issue |\n|---|---|\n| P1 | foo |\n',1).unparsed.length).toBe(1);
  expect(analyzeReport('P1: the thing is broken\n',1).unparsed.length).toBe(1);
  expect(analyzeReport('| # | Severity | Issue |\n|---|---|---|\n| | P1 | no id |\n',1).unparsed.length).toBe(1);
  expect(analyzeReport('| x | y |\n|---|---|\n| a | P2 |\n',1).unparsed.length).toBeGreaterThan(0);
  expect(analyzeReport('| # | Severity | Issue |\n|---|---|---|\n| 1 | P1 | a |\n',1).unparsed).toEqual([]);
  // status tables that merely mention P1 in a header are not findings
  expect(analyzeReport('| Round-3 P1 | Status |\n|---|---|\n| x | CLOSED |\n\nNo new P1/P2 findings.\n',1)).toMatchObject({unparsed:[],explicitNone:true,findings:[]});
 });
 it('accepts zero findings only when the report says so explicitly',()=>{
  for(const t of ['No P1/P2 findings.','No new P1/P2 findings within scope.','No actionable defects were identified.','no actionable defects were found','No findings.'])
   expect(analyzeReport(`**Verdict: ready**\n\n${t}\n`,1).explicitNone).toBe(true);
  expect(analyzeReport('**Verdict: ready**\n\nLooks fine to me.\n',1).explicitNone).toBe(false);
 });
 it('validateAuditDir: audit_findings_unparsed for unexplained zero findings or uncaptured P1/P2 lines',()=>{
  const zero={round:{findings:{p1:0,p2:0,p3:0}},dispo:'| # | 决定 | 实施 |\n|---|---|---|\n'};
  expect(codes(auditDir({...zero,report:'**Verdict: ready.**\n\nLooks fine.\n',index:{open:{owner:[],verify:[]}}}))).toEqual(['audit_findings_unparsed']);
  expect(codes(auditDir({...zero,report:'**Verdict: ready.**\n\nNo P1/P2 findings.\n',index:{open:{owner:[],verify:[]}}}))).toEqual([]);
  expect(codes(auditDir({report:REPORT+'\nP1: an uncaptured finding\n',dispo:DISPO}))).toEqual(['audit_findings_unparsed']);
 });
});

describe('P1 disposition decisions are validated against the supported states',()=>{
 it('classifies every decision found in the real disposition files',()=>{
  const ok=['ACCEPT','ACCEPT WITH LIMIT','ACCEPT (partial)','ACCEPT + OWNER','ACCEPT + OPEN-verify','ACCEPT：§3.2 规则 1','ACCEPT（备注：x）','ACCEPT — implemented per Codex\'s prescribed fix (round 4), not re-audited（第 5 稿 §10）',
   'DECLINE','DECLINE（部分）','PARTIAL：不建 index.json','owner','OWNER','owner (default: publish with `citation` state)','OPEN (verify)','OPEN-verify','OPEN-verify / OWNER','RESOLVED by the same function.',"implemented per Codex's prescribed fix (round 4), not re-audited",'ACCEPT (persist) / DECLINE (exact arithmetic)'];
  for(const d of ok)expect(decisionKind(d),d).not.toBe('unknown');
  for(const d of ['','TBD','maybe','pending review'])expect(decisionKind(d),d).toBe('unknown');
 });
 it('a blank or unknown decision disposes nothing and is reported (so release is blocked)',()=>{
  const blank=DISPO.replace('| 3 c | DECLINE | minor |','| 3 c |  | minor |');
  expect(codes(auditDir({dispo:blank}))).toEqual(expect.arrayContaining(['audit_decision_unknown','audit_finding_undisposed']));
  expect(codes(auditDir({dispo:blank}),true)).toEqual(expect.arrayContaining(['audit_decision_unknown']));
  expect(codes(auditDir({dispo:DISPO.replace('DECLINE','maybe')}))).toEqual(expect.arrayContaining(['audit_decision_unknown']));
 });
});

describe('release: a P1/P2 finding whose latest disposition is PARTIAL blocks (latest row wins)',()=>{
 const rel=(dispo:string)=>validateAuditDir(auditDir({dispo:dispo.replace('ACCEPT + OPEN-verify','ACCEPT')}),{gitShow,release:true}).map(f=>`${f.code} ${f.where}`);
 it('PARTIAL on a P1/P2 blocks release; on P3 it does not; not a finding outside release',()=>{
  expect(rel(DISPO.replace('| 1 a | ACCEPT | §1 |','| 1 a | PARTIAL | §1 |'))).toEqual(['audit_release_partial round 1 #1']);
  expect(rel(DISPO.replace('| 3 c | DECLINE | minor |','| 3 c | PARTIAL | minor |'))).toEqual([]);
  expect(codes(auditDir({dispo:DISPO.replace('| 1 a | ACCEPT | §1 |','| 1 a | PARTIAL | §1 |')}))).toEqual([]);
 });
 it('a later row for the same finding supersedes an earlier PARTIAL (and a later PARTIAL supersedes an earlier ACCEPT)',()=>{
  const later=(d:string)=>DISPO+`| 1 a again | ${d} | §9 |\n`;
  expect(rel(later('ACCEPT').replace('| 1 a | ACCEPT | §1 |','| 1 a | PARTIAL | §1 |'))).toEqual([]);
  expect(rel(later('PARTIAL'))).toEqual(['audit_release_partial round 1 #1']);
 });
});
