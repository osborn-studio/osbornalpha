// src/lib/evals/version.test.ts
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it} from 'vitest';
import {EvalError} from './errors';
import {evaluatorVersion} from './version';

const SHA='0123456789abcdef0123456789abcdef01234567';
const codeOf=(f:()=>unknown)=>{try{f();return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).code;}};
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const roots:string[]=[];
afterAll(()=>{for(const r of roots)rmSync(r,{recursive:true,force:true});});
function repo(){
 const root=mkdtempSync(join(tmpdir(),'f6-version-'));roots.push(root);
 const g=(...a:string[])=>execFileSync('git',['-c','user.name=f6','-c','user.email=f6@test.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null',...a],{cwd:root,env,encoding:'utf8'}).trim();
 g('init','-q');writeFileSync(join(root,'a.txt'),'1\n');g('add','.');g('commit','-q','-m','c1');
 return {root,head:g('rev-parse','HEAD')};
}

describe('evaluatorVersion fail closed',()=>{
 it('a .git entry with a failing git probe throws even when VERCEL_GIT_COMMIT_SHA is set',()=>{
  const d=mkdtempSync(join(tmpdir(),'f6-version-fake-'));roots.push(d);mkdirSync(join(d,'.git'));
  const boom=()=>{throw new Error('boom');};
  expect(codeOf(()=>evaluatorVersion({cwd:d,env:{VERCEL_GIT_COMMIT_SHA:SHA},git:boom}))).toBe('code_version_missing');
  // probe failing only at status
  const statusFails=(a:string[])=>{if(a[0]==='status')throw new Error('x');return a[1]==='HEAD'?SHA:'true';};
  expect(codeOf(()=>evaluatorVersion({cwd:d,env:{VERCEL_GIT_COMMIT_SHA:SHA},git:statusFails}))).toBe('code_version_missing');
 });
 it('a staged-only change is dirty',()=>{
  const {root,head}=repo();
  writeFileSync(join(root,'s.txt'),'s\n');
  execFileSync('git',['add','s.txt'],{cwd:root,env});
  expect(evaluatorVersion({cwd:root,env:{}})).toEqual({sha:head,dirty:true});
 });
 it('a repository without commits is code_version_missing',()=>{
  const root=mkdtempSync(join(tmpdir(),'f6-version-empty-'));roots.push(root);
  execFileSync('git',['init','-q'],{cwd:root,env});
  expect(codeOf(()=>evaluatorVersion({cwd:root,env:{VERCEL_GIT_COMMIT_SHA:SHA}}))).toBe('code_version_missing');
 });
});

describe('evaluatorVersion (P1-7)',()=>{
 it('a clean checkout: HEAD and dirty false; VERCEL_GIT_COMMIT_SHA is ignored inside a checkout',()=>{
  const {root,head}=repo();
  expect(evaluatorVersion({cwd:root,env:{VERCEL_GIT_COMMIT_SHA:SHA}})).toEqual({sha:head,dirty:false});
 });
 it('an env sha plus a dirty tree is reported dirty (modified or untracked files)',()=>{
  const {root,head}=repo();
  writeFileSync(join(root,'a.txt'),'2\n');
  expect(evaluatorVersion({cwd:root,env:{VERCEL_GIT_COMMIT_SHA:SHA}})).toEqual({sha:head,dirty:true});
  const u=repo();writeFileSync(join(u.root,'new.txt'),'x\n');
  expect(evaluatorVersion({cwd:u.root,env:{}})).toEqual({sha:u.head,dirty:true});
 });
 it('no checkout: VERCEL_GIT_COMMIT_SHA with dirty false; missing or malformed → code_version_missing',()=>{
  const outside=mkdtempSync(join(tmpdir(),'f6-version-nogit-'));roots.push(outside);
  const noGit=()=>{throw new Error('not a git repository');};
  expect(evaluatorVersion({cwd:outside,env:{VERCEL_GIT_COMMIT_SHA:SHA},git:noGit})).toEqual({sha:SHA,dirty:false});
  expect(codeOf(()=>evaluatorVersion({cwd:outside,env:{},git:noGit}))).toBe('code_version_missing');
  expect(codeOf(()=>evaluatorVersion({cwd:outside,env:{VERCEL_GIT_COMMIT_SHA:'abc123'},git:noGit}))).toBe('code_version_missing');
  expect(codeOf(()=>evaluatorVersion({cwd:outside,env:{VERCEL_GIT_COMMIT_SHA:SHA.toUpperCase()},git:noGit}))).toBe('code_version_missing');
 });
 it('this repository: a 40-hex HEAD and a boolean dirty flag',()=>{
  const v=evaluatorVersion();
  expect(v.sha).toMatch(/^[0-9a-f]{40}$/);expect(typeof v.dirty).toBe('boolean');
 });
});
