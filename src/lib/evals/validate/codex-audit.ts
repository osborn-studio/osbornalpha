// src/lib/evals/validate/codex-audit.ts
// Core of scripts/evals/codex-audit.ts (spec §9 new rule): run one Codex audit round against a COMMITTED
// target and append it to <dir>/index.json with target_sha256 of the committed bytes (git show HEAD:<path>)
// and target_git_ref = HEAD, so the audited bytes are retrievable from git. Refuses when the target has
// any working-tree/index change or is untracked (`git status --porcelain -- <path>` non-empty), when the
// prompt is missing, when the report file already exists, when Codex exits non-zero, or when the report
// lacks a `**Verdict: …**` first line (the report file is kept; index.json is untouched).
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {basename,isAbsolute,join} from 'node:path';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {parseFindings,parseVerdict,severityCounts} from './audit';
import type {AuditIndex,AuditRound} from './audit';

export const CODEX_MODEL='gpt-6-astra';
export const CODEX_EFFORT='medium';
/** argv for `codex exec … -o <out> -` (prompt on stdin). */
export const codexArgs=(outPath:string)=>['exec','-s','read-only','-c',`model="${CODEX_MODEL}"`,'-c',`model_reasoning_effort="${CODEX_EFFORT}"`,'--skip-git-repo-check','-o',outPath,'-'];
export interface CodexAuditDeps{
 /** `git <args>` in root; returns stdout (utf8). Throws on non-zero exit. */
 git(args:string[]):string;
 /** `git <args>` in root; returns stdout bytes. Throws on non-zero exit. */
 gitBytes(args:string[]):Uint8Array;
 /** Runs Codex with stdin = promptPath, last message written to outPath; returns the exit code. */
 runCodex(promptPath:string,outPath:string):number;
}
export interface CodexAuditOptions{root:string;dir:string;prompt:string;out:string;target?:string}

const fail=(m:string,detail:Record<string,unknown>={})=>new EvalError('audit_invalid',m,detail);
export function runCodexAudit(o:CodexAuditOptions,deps:CodexAuditDeps):AuditRound{
 const dir=isAbsolute(o.dir)?o.dir:join(o.root,o.dir);
 const indexPath=join(dir,'index.json');
 const index:AuditIndex=existsSync(indexPath)?JSON.parse(readFileSync(indexPath,'utf8')) as AuditIndex
  :{topic:basename(dir).replace(/^\d{4}-\d{2}-\d{2}-/,''),target:{path:o.target??''},rounds:[],dispositions:[],open:{owner:[],verify:[]},final_verdict:''};
 if(o.target&&index.target.path&&o.target!==index.target.path)throw fail(`--target ${o.target} differs from index.json target ${index.target.path}`);
 const target=index.target.path;
 if(!target)throw fail('no target: pass --target <repo-relative path> for a new audit directory');
 if(deps.git(['status','--porcelain','--',target]).trim()!=='')throw fail(`${target} has uncommitted or untracked changes; commit it first`,{target});
 const promptPath=join(dir,o.prompt);const outPath=join(dir,o.out);
 if(!existsSync(promptPath))throw fail(`prompt ${o.prompt} not found in ${o.dir}`);
 if(existsSync(outPath))throw fail(`report ${o.out} already exists; reports are never overwritten`);
 const head=deps.git(['rev-parse','HEAD']).trim();
 if(!/^[0-9a-f]{40}$/.test(head))throw fail(`unexpected HEAD ${head}`);
 let bytes:Uint8Array;
 try{bytes=deps.gitBytes(['show',`HEAD:${target}`]);}catch{throw fail(`${target} is not in HEAD`);}
 const code=deps.runCodex(promptPath,outPath);
 if(code!==0)throw fail(`codex exited ${code}`);
 if(!existsSync(outPath))throw fail(`codex wrote no report to ${o.out}`);
 const md=readFileSync(outPath,'utf8');
 const verdict=parseVerdict(md);
 if(verdict===null)throw fail(`${o.out} lacks a **Verdict: …** first line; index.json not updated`);
 const n=index.rounds.length+1;
 const round:AuditRound={n,target_sha256:sha256Hex(bytes),target_git_ref:head,prompt_file:o.prompt,report_file:o.out,model:CODEX_MODEL,effort:CODEX_EFFORT,verdict,findings:severityCounts(parseFindings(md,n))};
 index.rounds.push(round);
 writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');
 return round;
}
