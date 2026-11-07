// src/lib/evals/validate/handlers.ts
// The Task-12 flags of scripts/evals/validate.ts (entries in validate/cli.ts HANDLERS): --expert <file> [--release], --audit <dir> [--release]
// (the --manifest [--online] entry is manifestHandler below, the only --manifest implementation). The manifest reads committed bytes only (`git show <commit>:<path>` in root), checks
// ancestry with `git merge-base --is-ancestor`, the origin remote with `git remote get-url origin`, and with --online
// the CI run with `gh api repos/<owner>/<repo>/actions/runs/<id>` (Codex plan round 1 P1-3). `args` are the flag's value followed by its modifiers (validate/cli.ts passes [value,...modifiers]). Production DB
// access for --manifest is the service-role client when SUPABASE_SERVICE_ROLE_KEY and
// NEXT_PUBLIC_SUPABASE_URL are set; without them the manifest fails with manifest_no_db (spec §10).
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {supabaseTableClient} from '../../db/table-client';
import type {TableClient} from '../../db/table-client';
import {getAdminSupabase} from '../../supabase/admin';
import {LOCK_PATH as GOLD_LOCK_PATH,RECORDERS_PATH,loadGoldSet,parseGoldBytes,parseLock,parseRecorders} from '../gold/load';
import {evalStore} from '../store';
import type {GoldLock} from '../types';
import {validateAuditDir} from './audit';
import {findSetBySha,validateExpertRecord,verifyExpertRun} from './expert';
import {finding} from './finding';
import type {ValidatorFinding} from './finding';
import {validateManifest} from './manifest';
import type {ManifestDeps,ManifestOptions} from './manifest';
import type {ValidateHandler} from './cli';

export const LOCK_PATH='src/lib/evals/fixtures/gold/lock.json';
export type Handler=(args:string[])=>Promise<ValidatorFinding[]>;
const abs=(root:string,p:string)=>isAbsolute(p)?p:join(root,p);
const readJson=(root:string,p:string):unknown=>JSON.parse(readFileSync(abs(root,p),'utf8'));
export const readLock=(root=process.cwd()):GoldLock=>readJson(root,LOCK_PATH) as GoldLock;
const usage=(flag:string,what:string)=>[finding('cli_usage',flag,`${flag} requires ${what}`)];

/** Service-role TableClient when credentials are configured; null otherwise. */
export function serviceTables():TableClient|null{
 try{return supabaseTableClient(getAdminSupabase());}catch{return null;}
}
const gitEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_'))) as NodeJS.ProcessEnv;
export const gitShowAt=(root:string)=>(commit:string,path:string):Uint8Array|null=>{
 try{return new Uint8Array(execFileSync('git',['show',`${commit}:${path}`],{cwd:root,env:gitEnv(),stdio:['ignore','pipe','ignore'],maxBuffer:256*1024*1024}));}catch{return null;}
};
/** 'owner/repo' (lowercase) of a GitHub remote URL (https or ssh); null otherwise. */
export function repoOfRemote(url:string):string|null{
 const m=/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.trim());
 return m?`${m[1]}/${m[2]}`.toLowerCase():null;
}
export function manifestDeps(root=process.cwd(),tables:TableClient|null=serviceTables(),opts:{online?:boolean}={}):ManifestDeps{
 const store=tables?evalStore(tables):null;
 const show=gitShowAt(root);
 const json=(c:string,p:string)=>{const b=show(c,p);if(!b)throw new Error(`${p} is not committed at ${c}`);return JSON.parse(new TextDecoder().decode(b)) as unknown;};
 return {
  readAt:show,
  lockAt:c=>parseLock(json(c,GOLD_LOCK_PATH)),
  loadSetAt:(c,p)=>{const b=show(c,p);if(!b)throw new Error(`${p} is not committed at ${c}`);return parseGoldBytes(b,p,parseRecorders(json(c,RECORDERS_PATH)));},
  isAncestor:(a,b)=>{try{execFileSync('git',['merge-base','--is-ancestor',a,b],{cwd:root,env:gitEnv(),stdio:'ignore'});return true;}catch{return false;}},
  originRepo:()=>{try{return repoOfRemote(execFileSync('git',['remote','get-url','origin'],{cwd:root,env:gitEnv(),encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{return null;}},
  ...(opts.online?{ciRun:async(o:string,r:string,id:string)=>{
   try{const v=JSON.parse(execFileSync('gh',['api',`repos/${o}/${r}/actions/runs/${id}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']})) as {conclusion?:unknown;head_sha?:unknown};
    return {conclusion:typeof v.conclusion==='string'?v.conclusion:null,head_sha:typeof v.head_sha==='string'?v.head_sha:''};}catch{return null;}
  }}:{}),
  getRun:store?id=>store.getRun(id):undefined,
  freshness:tables?async dataset=>{
   const [row]=await tables.select('dq_freshness',{dataset},{limit:1});
   return row?{expected_cadence:String(row.expected_cadence),last_ok_at:row.last_ok_at==null?null:String(row.last_ok_at),consecutive_errors:Number(row.consecutive_errors??0)}:null;
  }:undefined,
  audit:{root},
 };
}
/** The --manifest [--online] entry of validate/cli.ts HANDLERS (deps injectable for the CLI-level test). ok iff no finding;
 *  offline the unperformed CI identity check is a finding, so ok:false and exit 1 (R2-1). */
export function manifestHandler(depsFor:(root:string,o:{online:boolean})=>ManifestDeps=(root,o)=>manifestDeps(root,serviceTables(),o)):ValidateHandler{
 return {flag:'--manifest',name:'manifest',takesValue:true,modifiers:['--online'],run:async(root,value,mods)=>{
  const notices:ValidatorFinding[]=[];
  const findings=await manifestFindings(root,value!,depsFor(root,{online:mods.has('--online')}),{notices});
  return {ok:findings.length===0,findings,notices};
 }};
}
/** --manifest <file> [--online]: the manifest file itself is read from the working tree (it names the commits). */
export async function manifestFindings(root:string,file:string,deps:ManifestDeps,opts:ManifestOptions={}):Promise<ValidatorFinding[]>{
 let m:unknown;
 try{m=readJson(root,file);}catch(e){return [finding('manifest_invalid',file,`cannot read JSON: ${(e as Error).message}`)];}
 return validateManifest(m,deps,file,opts);
}

export function f6Handlers(root=process.cwd(),deps:(o:{online:boolean})=>ManifestDeps=o=>manifestDeps(root,serviceTables(),o)):Record<string,Handler>{
 return {
  '--expert':async args=>{
   const file=args[0];
   if(!file||file.startsWith('--'))return usage('--expert','<file>');
   let rec:unknown;
   try{rec=readJson(root,file);}catch(e){return [finding('expert_invalid',file,`cannot read JSON: ${(e as Error).message}`)];}
   const sha=(rec as {population?:{set_sha256?:unknown}})?.population?.set_sha256;
   const set=typeof sha==='string'?findSetBySha(readLock(root),sha,p=>loadGoldSet(p,root)):null;
   // P2: the evaluated run is authenticated through the service-role store; without access this fails closed (expert_run_unverified)
   const found=validateExpertRecord(rec,set,{release:args.includes('--release'),where:file});
   return [...found,...await verifyExpertRun(rec,deps({online:false}).getRun,file)];
  },
  '--audit':async args=>{
   const dir=args[0];
   if(!dir||dir.startsWith('--'))return usage('--audit','<dir>');
   return validateAuditDir(dir,{root,release:args.includes('--release')});
  },
 };
}
