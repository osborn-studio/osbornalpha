// src/lib/evals/version.ts
// evaluator_code_version (spec §6.4; Codex plan round 1 P1-7). Inside a git checkout the checkout itself decides:
// sha = `git rev-parse HEAD`, dirty = `git status --porcelain --untracked-files=normal` is non-empty — and
// VERCEL_GIT_COMMIT_SHA is IGNORED there (an exported env sha must never make a dirty tree look clean). Only without a
// checkout (a Vercel function bundle) is VERCEL_GIT_COMMIT_SHA used, with dirty false. The sha must be 40 lowercase
// hex (dq_eval_runs check). ci records dirty:true, report refuses it (run.ts), record-replay refuses it. Plan 2's
// src/lib/facts/deps.ts::resolveCodeVersion is not used (it prefers the env sha) and not changed.
import {execFileSync} from 'node:child_process';
import {EvalError} from './errors';

const SHA=/^[0-9a-f]{40}$/;
export interface VersionDeps{
 env?:Record<string,string|undefined>;cwd?:string;
 /** runs git with args in cwd and returns stdout; throws when git fails (e.g. not a checkout). */
 git?:(args:string[],cwd:string)=>string;
}
// GIT_* variables (exported by git hooks) would point git at another repository.
const gitEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
const defaultGit=(args:string[],cwd:string)=>execFileSync('git',args,{cwd,env:gitEnv(),encoding:'utf8',stdio:['ignore','pipe','ignore']});

export function evaluatorVersion(deps:VersionDeps={}):{sha:string;dirty:boolean}{
 const env=deps.env??process.env,cwd=deps.cwd??process.cwd(),git=deps.git??defaultGit;
 let inside=false;
 try{inside=git(['rev-parse','--is-inside-work-tree'],cwd).trim()==='true';}catch{inside=false;}
 if(inside){
  let head:string;
  try{head=git(['rev-parse','HEAD'],cwd).trim();}catch{throw new EvalError('code_version_missing','git checkout without a HEAD commit');}
  if(!SHA.test(head))throw new EvalError('code_version_missing',`not a 40-hex commit: ${head.slice(0,60)}`,{value:head.slice(0,60)});
  const status=git(['status','--porcelain','--untracked-files=normal'],cwd);
  return {sha:head,dirty:status.trim().length>0};
 }
 const v=env.VERCEL_GIT_COMMIT_SHA;
 if(v===undefined||v==='')throw new EvalError('code_version_missing','no git checkout and no VERCEL_GIT_COMMIT_SHA');
 if(!SHA.test(v))throw new EvalError('code_version_missing',`not a 40-hex commit: ${v.slice(0,60)}`,{value:v.slice(0,60)});
 return {sha:v,dirty:false};
}
