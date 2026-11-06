// src/lib/evals/version.ts
// evaluator_code_version (spec §6.4; Codex plan round 1 P1-7). Inside a git checkout the checkout itself decides:
// sha = `git rev-parse HEAD`, dirty = `git status --porcelain --untracked-files=normal` is non-empty — and
// VERCEL_GIT_COMMIT_SHA is IGNORED there (an exported env sha must never make a dirty tree look clean). Only without a
// checkout (a Vercel function bundle) is VERCEL_GIT_COMMIT_SHA used, with dirty false. The sha must be 40 lowercase
// hex (dq_eval_runs check). ci records dirty:true, report refuses it (run.ts), record-replay refuses it. Plan 2's
// src/lib/facts/deps.ts::resolveCodeVersion is not used (it prefers the env sha) and not changed.
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
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

function hasGitEntry(from:string):boolean{
 let d=resolve(from);
 for(;;){
  if(existsSync(join(d,'.git')))return true;
  const up=dirname(d);
  if(up===d)return false;
  d=up;
 }
}

export function evaluatorVersion(deps:VersionDeps={}):{sha:string;dirty:boolean}{
 const env=deps.env??process.env,cwd=deps.cwd??process.cwd(),git=deps.git??defaultGit;
 // Fail closed: a .git entry anywhere up the tree means a checkout; any probe failure there is an error, never an env fallback.
 if(hasGitEntry(cwd)){
  const fail=(why:string)=>new EvalError('code_version_missing',`git inspection failed: ${why}`,{reason:'git_inspection_failed'});
  let head:string,status:string;
  try{
   if(git(['rev-parse','--is-inside-work-tree'],cwd).trim()!=='true')throw new Error('not inside a work tree');
   head=git(['rev-parse','HEAD'],cwd).trim();
   status=git(['status','--porcelain','--untracked-files=normal'],cwd);
  }catch(e){throw fail((e as Error).message.slice(0,120));}
  if(!SHA.test(head))throw new EvalError('code_version_missing',`not a 40-hex commit: ${head.slice(0,60)}`,{value:head.slice(0,60)});
  return {sha:head,dirty:status.trim().length>0};
 }
 const v=env.VERCEL_GIT_COMMIT_SHA;
 if(v===undefined||v==='')throw new EvalError('code_version_missing','no git checkout and no VERCEL_GIT_COMMIT_SHA');
 if(!SHA.test(v))throw new EvalError('code_version_missing',`not a 40-hex commit: ${v.slice(0,60)}`,{value:v.slice(0,60)});
 return {sha:v,dirty:false};
}
