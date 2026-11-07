// src/lib/evals/validate/cli.ts
// Evidence validators behind scripts/evals/validate.ts (spec §4.4, §4.5, §7.3; §8–§10 arrive in Task 12).
// One handler per flag in HANDLERS; adding a validator = appending one entry (Task 12: --expert <f>,
// --audit <dir>, --manifest <f>, each with the --release modifier where it applies). Checks run in
// HANDLERS order regardless of argv order, every selected check runs even after a failure, and a thrown
// error becomes {ok:false,error}. A handler may be async. Exit 0 when every selected check is ok, 1 when
// any selected check fails, 2 for usage errors (spec §3.2: 2 = refused before running).
import {EvalError} from '../errors';
import {REGISTRY} from '@/lib/judgments/registry';
import {calibrationAvailability} from '../kinds/f4-adapter';
import {KIND_REGISTRY} from '../kinds/registry';
import {goldDiffAgainst} from '../gold/diff';
import {LEGACY_PLAN2_PATH,checkLock,listGoldSetPaths,loadGoldSet,loadLock,loadRecorders} from '../gold/load';
import type {GoldLock,ValidatorFinding} from '../types';
import {redactScan,redactTargets} from '../redact';
import {f6Handlers,manifestHandler} from './handlers';

/** findings: the ValidatorFinding list of a Task-12 check (--expert/--audit/--manifest); gold/lock/diff/redact keep their own fields. */
export interface CheckResult{ok:boolean;findings?:unknown[];[k:string]:unknown}
/** modifiers: bare flags accepted right after this handler's flag/value (e.g. --release), passed to run as a set. */
export interface ValidateHandler{flag:string;name:string;takesValue:boolean;modifiers?:readonly string[];run(root:string,value:string|null,modifiers:ReadonlySet<string>):CheckResult|Promise<CheckResult>}
/** A Task-12 check result: ok iff no findings. */
export const findingsCheck=(findings:ValidatorFinding[]):CheckResult=>({ok:findings.length===0,findings});
export interface ValidateOutput{ok:boolean;checks:Record<string,CheckResult>;error?:string;usage?:string}

/** Gold sets to validate: everything listGoldSetPaths finds plus the mandatory legacy plan2.json, whatever lock.json says. */
const setPaths=(root:string,lock:GoldLock|null)=>[...new Set([...listGoldSetPaths(root,lock),LEGACY_PLAN2_PATH])].sort();
const errorOf=(e:unknown)=>e instanceof EvalError?{code:e.code,message:e.message,...e.detail}:{message:e instanceof Error?e.message:String(e)};

export const HANDLERS:ValidateHandler[]=[
 {flag:'--gold',name:'gold',takesValue:false,run(root){
  const errors:Record<string,unknown>[]=[];
  let lock:GoldLock|null=null;
  try{lock=loadLock(root);}catch{/* reported by --lock */}
  try{loadRecorders(root);}catch(e){errors.push(errorOf(e));}
  const sets:Record<string,unknown>[]=[];
  for(const path of setPaths(root,lock)){
   try{const s=loadGoldSet(path,root);sets.push({path,set_id:s.set_id,version:s.version,format:s.format,cases:s.cases.length,ready:s.ready});}
   catch(e){errors.push({path,...errorOf(e)});}
  }
  return {ok:errors.length===0,sets,errors};
 }},
 {flag:'--lock',name:'lock',takesValue:false,run(root){
  const lock=loadLock(root);
  const paths=setPaths(root,lock);
  const errors:Record<string,unknown>[]=[];
  for(const path of paths){
   try{checkLock(loadGoldSet(path,root),lock);}catch(e){errors.push({path,...errorOf(e)});}
  }
  for(const f of lock.files)if(!paths.includes(f.path))errors.push({path:f.path,code:'gold_lock_mismatch',message:'locked file not found'});
  return {ok:errors.length===0,files:lock.files.length,errors};
 }},
 {flag:'--gold-diff',name:'gold_diff',takesValue:true,run(root,value){
  const r=goldDiffAgainst(value!,root);
  return {ok:r.violations.length===0,base:r.base,changed:r.changed,violations:r.violations,notices:r.notices};
 }},
 {flag:'--redact',name:'redact',takesValue:false,run(root){
  const files=redactTargets(root);
  const findings=redactScan(files);
  return {ok:findings.length===0,files:files.length,findings};
 }},
 // Task 12 (spec §8–§10): --expert <file> [--release], --audit <dir> [--release], --manifest <file> [--online].
 // f6Handlers takes the flag's tokens (value first, then modifiers) and returns ValidatorFinding[].
 {flag:'--expert',name:'expert',takesValue:true,modifiers:['--release'],run:async(root,value,mods)=>findingsCheck(await f6Handlers(root)['--expert']([value!,...mods]))},
 {flag:'--audit',name:'audit',takesValue:true,modifiers:['--release'],run:async(root,value,mods)=>findingsCheck(await f6Handlers(root)['--audit']([value!,...mods]))},
 // --manifest [--online]: offline the CI identity check is not performed → finding manifest_ci_unverified, ok:false, exit 1 (R2-1).
 manifestHandler(),
 // A successful inventory is not a passed eval or a licence/threshold approval.
 {flag:'--availability',name:'availability',takesValue:false,run(){
  return {ok:true,scope:'diagnostic_only',kinds:KIND_REGISTRY.map(k=>({...k})),
   methodologies:REGISTRY.map(m=>({id:m.id,version:m.version,kind:m.kind})),calibration:calibrationAvailability()};
 }},
];

const flagUsage=(h:ValidateHandler)=>`[${h.flag}${h.takesValue?' <value>':''}${(h.modifiers??[]).map(m=>` [${m}]`).join('')}]`;
export const usageOf=(handlers:readonly ValidateHandler[])=>`usage: validate.ts ${handlers.map(flagUsage).join(' ')} (at least one)`;

export async function runValidate(argv:readonly string[],opts:{root?:string;handlers?:readonly ValidateHandler[]}={}):Promise<{exitCode:0|1|2;output:ValidateOutput}>{
 const root=opts.root??process.cwd(),handlers=opts.handlers??HANDLERS;
 const usage=usageOf(handlers);
 const selected=new Map<ValidateHandler,{value:string|null;modifiers:Set<string>}>();
 for(let i=0;i<argv.length;i++){
  const h=handlers.find(x=>x.flag===argv[i]);
  if(!h||selected.has(h))return {exitCode:2,output:{ok:false,checks:{},error:h?`duplicate flag ${argv[i]}`:`unknown argument ${argv[i]}`,usage}};
  let value:string|null=null;
  if(h.takesValue){
   const v=argv[i+1];
   if(v===undefined||v.startsWith('--'))return {exitCode:2,output:{ok:false,checks:{},error:`${h.flag} needs a value`,usage}};
   value=v;i++;
  }
  const modifiers=new Set<string>();
  while(i+1<argv.length&&(h.modifiers??[]).includes(argv[i+1]))modifiers.add(argv[++i]);
  selected.set(h,{value,modifiers});
 }
 if(selected.size===0)return {exitCode:2,output:{ok:false,checks:{},error:'no check selected',usage}};
 const checks:Record<string,CheckResult>={};
 for(const h of handlers){
  const sel=selected.get(h);
  if(!sel)continue;
  try{checks[h.name]=await h.run(root,sel.value,sel.modifiers);}catch(e){checks[h.name]={ok:false,error:errorOf(e)};}
 }
 const ok=Object.values(checks).every(c=>c.ok);
 return {exitCode:ok?0:1,output:{ok,checks}};
}
