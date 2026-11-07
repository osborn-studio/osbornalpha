// src/lib/evals/validate/codex-audit.test.ts
// Spec §9 codex-audit.ts rule, in a temporary git repository with a fake Codex: refuse uncommitted /
// untracked targets, append the round with the committed bytes' sha256 and HEAD, parse verdict and counts.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import {codexArgs,runCodexAudit} from './codex-audit';
import type {CodexAuditDeps} from './codex-audit';
import {validateAuditDir} from './audit';

const TARGET='docs/spec.md';
const DIR='docs/audits/2026-11-20-topic';
const REPORT='**Verdict: not ready for implementation planning—two gaps.**\n\n| # | Severity | Issue |\n|---|---|---|\n| 1 | P1 | a |\n| 2 | P2 | b |\n| 3 | P2 | c |\n';
// Hooks export GIT_DIR/GIT_INDEX_FILE; the temporary repository must not inherit them.
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const repos:string[]=[];
afterEach(()=>{for(const r of repos.splice(0))rmSync(r,{recursive:true,force:true});});
function repo(){
 const root=mkdtempSync(join(tmpdir(),'f6-codex-audit-'));repos.push(root);
 const git=(...a:string[])=>execFileSync('git',['-c','user.email=f6@test.invalid','-c','user.name=f6','-c','commit.gpgsign=false',...a],{cwd:root,env,encoding:'utf8'});
 git('init','-q');
 mkdirSync(join(root,'docs/audits/2026-11-20-topic'),{recursive:true});
 writeFileSync(join(root,TARGET),'# spec v1\n');
 writeFileSync(join(root,DIR,'00-prompt-round1.md'),'audit docs/spec.md');
 git('add','.');git('commit','-q','-m','spec v1');
 return {root,git};
}
const deps=(root:string,report:string|null=REPORT,exit=0):CodexAuditDeps&{calls:string[][]}=>{
 const calls:string[][]=[];
 return {
  calls,
  git:a=>execFileSync('git',a,{cwd:root,env,encoding:'utf8'}),
  gitBytes:a=>execFileSync('git',a,{cwd:root,env}),
  runCodex:(prompt,out)=>{calls.push([prompt,out]);if(report!==null)writeFileSync(out,report);return exit;},
 };
};
const code=(f:()=>unknown)=>{try{f();}catch(e){if(e instanceof EvalError)return e.code;throw e;}return 'ok';};

describe('runCodexAudit',()=>{
 it('runs codex on a committed target and appends round 1 with the committed sha256, HEAD, verdict and counts',()=>{
  const {root,git}=repo();const d=deps(root);
  const round=runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},d);
  const head=git('rev-parse','HEAD').trim();
  expect(round).toEqual({n:1,target_sha256:createHash('sha256').update('# spec v1\n').digest('hex'),target_git_ref:head,prompt_file:'00-prompt-round1.md',report_file:'01-codex-round1.md',model:'gpt-6-astra',effort:'medium',verdict:'not ready for implementation planning—two gaps',findings:{p1:1,p2:2,p3:0}});
  const index=JSON.parse(readFileSync(join(root,DIR,'index.json'),'utf8'));
  expect(index).toMatchObject({topic:'topic',target:{path:TARGET},rounds:[round]});
  expect(d.calls).toEqual([[join(root,DIR,'00-prompt-round1.md'),join(root,DIR,'01-codex-round1.md')]]);
  // The validator can re-derive the audited bytes from git.
  expect(validateAuditDir(DIR,{root}).filter(f=>f.code.startsWith('audit_target'))).toEqual([]);
 });
 it('appends round 2 to an existing index without --target',()=>{
  const {root,git}=repo();
  runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},deps(root));
  writeFileSync(join(root,TARGET),'# spec v2\n');writeFileSync(join(root,DIR,'00-prompt-round2.md'),'round 2');
  git('add','.');git('commit','-q','-m','spec v2');
  const r2=runCodexAudit({root,dir:DIR,prompt:'00-prompt-round2.md',out:'02-codex-round2.md'},deps(root));
  expect([r2.n,r2.target_sha256]).toEqual([2,createHash('sha256').update('# spec v2\n').digest('hex')]);
  expect(JSON.parse(readFileSync(join(root,DIR,'index.json'),'utf8')).rounds).toHaveLength(2);
 });
 it('refuses a target with uncommitted, staged or untracked changes without running codex',()=>{
  const {root,git}=repo();
  writeFileSync(join(root,TARGET),'# spec v1 edited\n');
  const d=deps(root);
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},d))).toBe('audit_invalid');
  git('add',TARGET);
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},d))).toBe('audit_invalid');
  writeFileSync(join(root,'docs/new.md'),'untracked');
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:'docs/new.md'},d))).toBe('audit_invalid');
  expect(d.calls).toEqual([]);expect(existsSync(join(root,DIR,'index.json'))).toBe(false);
 });
 it('refuses a missing prompt, an existing report, a non-zero codex exit and a report without a Verdict line',()=>{
  const {root}=repo();
  const o={root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET};
  expect(code(()=>runCodexAudit({...o,prompt:'nope.md'},deps(root)))).toBe('audit_invalid');
  expect(code(()=>runCodexAudit(o,deps(root,REPORT,1)))).toBe('audit_invalid');
  rmSync(join(root,DIR,'01-codex-round1.md'),{force:true});
  expect(code(()=>runCodexAudit(o,deps(root,'Read-only review.\n')))).toBe('audit_invalid');
  expect(existsSync(join(root,DIR,'01-codex-round1.md'))).toBe(true);   // the report is kept for inspection
  expect(existsSync(join(root,DIR,'index.json'))).toBe(false);
  expect(code(()=>runCodexAudit(o,deps(root)))).toBe('audit_invalid');   // never overwrites an existing report
 });
 it('refuses a new directory without --target and a --target that differs from index.json',()=>{
  const {root}=repo();
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md'},deps(root)))).toBe('audit_invalid');
  runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET},deps(root));
  expect(code(()=>runCodexAudit({root,dir:DIR,prompt:'00-prompt-round1.md',out:'02-codex-round2.md',target:'docs/other.md'},deps(root)))).toBe('audit_invalid');
 });
 it('P1: refuses to write index.json when the report has uncaptured P1/P2 text or unexplained zero findings',()=>{
  const {root}=repo();
  const o={root,dir:DIR,prompt:'00-prompt-round1.md',out:'01-codex-round1.md',target:TARGET};
  expect(code(()=>runCodexAudit(o,deps(root,'**Verdict: not ready.**\n\nP1: something broke\n')))).toBe('audit_invalid');
  expect(existsSync(join(root,DIR,'index.json'))).toBe(false);
  rmSync(join(root,DIR,'01-codex-round1.md'),{force:true});
  expect(code(()=>runCodexAudit(o,deps(root,'**Verdict: ready.**\n\nLooks fine.\n')))).toBe('audit_invalid');
  expect(existsSync(join(root,DIR,'index.json'))).toBe(false);
  rmSync(join(root,DIR,'01-codex-round1.md'),{force:true});
  expect(code(()=>runCodexAudit(o,deps(root,'**Verdict: ready.**\n\nNo P1/P2 findings.\n')))).toBe('ok');
 });
 it('invokes codex exec read-only with gpt-6-astra at medium effort, prompt on stdin',()=>{
  expect(codexArgs('/tmp/out.md')).toEqual(['exec','-s','read-only','-c','model="gpt-6-astra"','-c','model_reasoning_effort="medium"','--skip-git-repo-check','-o','/tmp/out.md','-']);
 });
});
