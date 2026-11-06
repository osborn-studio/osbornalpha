// src/lib/evals/gold/diff.ts
// Gold-set difference check against a base revision (spec §4.4). goldDiff is pure over two trees
// (repo-relative path → file bytes) holding only the files that differ; the git helpers build those
// trees with `git diff --name-only --no-renames <base> HEAD -- <paths>` and `git show <ref>:<path>`.
// Violations: a whole set deleted, a case removed, a case renamed (same content under a new id), a
// semantic or set-level change (or an added case) without a higher version, a version decrease,
// recorders.json deleted or changed without a higher version, an unparsable head file. Notices (listed
// in the job summary, not failing): set added, recorders.json changed, module_implementers changed.
// Semantic case fields: target, expect, printed, canonical, binding, source, retracted, required (from
// optional_cases); for legacy_plan2 sets: target, expect, canonical, binding, as_of, source, required,
// and the file's `ready` at set level. Field-level rules (§4.2) are --gold's job, not this file's.
import {execFileSync} from 'node:child_process';
import {canonicalJson} from '../canonical-json';
import {EvalError} from '../errors';
import {parseLegacyPlan2} from './legacy-plan2';
import {GOLD_DIR,LOCK_PATH,RECORDERS_PATH,detectGoldFormat} from './load';

export type GoldTree=Map<string,Uint8Array>;
export type DiffCode='set_deleted'|'case_removed'|'case_renamed'|'version_not_bumped'|'version_decreased'|'head_unparsable'|'recorders_deleted'|'recorders_version_not_bumped'
 |'set_added'|'recorders_changed'|'module_implementers_changed'|'base_unparsable';
export interface DiffFinding{code:DiffCode;path:string;case_id?:string;detail?:string}
export interface GoldDiffResult{violations:DiffFinding[];notices:DiffFinding[]}
interface SetView{version:number;setLevel:string;implementers:string;cases:Map<string,string>}
type J=Record<string,unknown>;
const isObj=(v:unknown):v is J=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const decode=(b:Uint8Array)=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b)) as unknown;
const pick=(o:J,keys:readonly string[])=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
const F6_CASE_FIELDS=['target','expect','printed','canonical','binding','source','retracted'] as const;
const F6_SET_FIELDS=['tolerance','thresholds','module','artifact_class','module_implementers'] as const;

/** Semantic view of a gold file; throws when the bytes are not a recognisable gold set. */
function viewOf(bytes:Uint8Array,path:string):SetView{
 const raw=decode(bytes);
 const format=detectGoldFormat(raw);
 if(format==='legacy_plan2'){
  const s=parseLegacyPlan2(raw,{path,sha256:''});
  return {version:s.version,implementers:canonicalJson(s.module_implementers),
   setLevel:canonicalJson({ready:s.ready,tolerance:s.tolerance,thresholds:s.thresholds,module:s.module,artifact_class:s.artifact_class,module_implementers:s.module_implementers}),
   cases:new Map(s.cases.map(c=>[c.case_id,canonicalJson({target:c.target,expect:c.expect,canonical:c.canonical,binding:c.binding,as_of:c.as_of,source:c.source,required:c.required})]))};
 }
 if(format!=='f6'||!isObj(raw))throw new Error('not_a_gold_set');
 const r=raw;
 if(typeof r.version!=='number'||!Array.isArray(r.cases))throw new Error('not_a_gold_set');
 const optional=Array.isArray(r.optional_cases)?r.optional_cases.filter((x):x is string=>typeof x==='string'):[];
 const cases=new Map<string,string>();
 for(const c of r.cases){
  if(!isObj(c)||typeof c.case_id!=='string')throw new Error('case_without_id');
  if(cases.has(c.case_id))throw new Error(`duplicate_case:${c.case_id}`);
  cases.set(c.case_id,canonicalJson({...pick(c,F6_CASE_FIELDS),required:!optional.includes(c.case_id)}));
 }
 return {version:r.version,implementers:canonicalJson(r.module_implementers??null),setLevel:canonicalJson({...pick(r,F6_SET_FIELDS),optional_cases:[...optional].sort()}),cases};
}
const versionOf=(bytes:Uint8Array):number=>{const raw=decode(bytes);if(!isObj(raw)||typeof raw.version!=='number')throw new Error('no_version');return raw.version;};
const sameBytes=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((x,i)=>x===b[i]);

export function goldDiff(base:GoldTree,head:GoldTree):GoldDiffResult{
 const violations:DiffFinding[]=[],notices:DiffFinding[]=[];
 const paths=[...new Set([...base.keys(),...head.keys()])].filter(p=>p!==LOCK_PATH).sort();
 for(const path of paths){
  const b=base.get(path),h=head.get(path);
  if(path===RECORDERS_PATH){
   if(b&&!h){violations.push({code:'recorders_deleted',path});continue;}
   if(!h||(b&&sameBytes(b,h)))continue;
   let hv:number;
   try{hv=versionOf(h);}catch(e){violations.push({code:'head_unparsable',path,detail:(e as Error).message});continue;}
   notices.push({code:'recorders_changed',path});
   if(b){
    let bv:number|null=null;
    try{bv=versionOf(b);}catch{notices.push({code:'base_unparsable',path});}
    if(bv!==null&&hv<=bv)violations.push({code:'recorders_version_not_bumped',path,detail:`${bv} -> ${hv}`});
   }
   continue;
  }
  if(b&&!h){violations.push({code:'set_deleted',path});continue;}
  if(!h)continue;
  let hv:SetView;
  try{hv=viewOf(h,path);}catch(e){violations.push({code:'head_unparsable',path,detail:(e as Error).message});continue;}
  if(!b){notices.push({code:'set_added',path});continue;}
  let bv:SetView;
  try{bv=viewOf(b,path);}catch{notices.push({code:'base_unparsable',path});continue;}
  let changed=bv.setLevel!==hv.setLevel;
  const added=[...hv.cases.keys()].filter(id=>!bv.cases.has(id));
  for(const [id,content] of bv.cases){
   const now=hv.cases.get(id);
   if(now===undefined){
    const renamedTo=added.find(a=>hv.cases.get(a)===content);
    violations.push(renamedTo?{code:'case_renamed',path,case_id:id,detail:renamedTo}:{code:'case_removed',path,case_id:id});
    changed=true;
   }else if(now!==content)changed=true;
  }
  if(added.length>0)changed=true;
  if(bv.implementers!==hv.implementers)notices.push({code:'module_implementers_changed',path,detail:`${bv.implementers} -> ${hv.implementers}`});
  if(hv.version<bv.version)violations.push({code:'version_decreased',path,detail:`${bv.version} -> ${hv.version}`});
  else if(changed&&hv.version===bv.version)violations.push({code:'version_not_bumped',path,detail:`version ${hv.version}`});
 }
 const order=(a:DiffFinding,b:DiffFinding)=>a.path<b.path?-1:a.path>b.path?1:a.code<b.code?-1:a.code>b.code?1:(a.case_id??'')<(b.case_id??'')?-1:(a.case_id??'')>(b.case_id??'')?1:0;
 return {violations:violations.sort(order),notices:notices.sort(order)};
}

// ---- git side (CI: ci.yml computes <base>, see §4.4) ----
const git=(cwd:string,args:string[]):Buffer=>execFileSync('git',args,{cwd,stdio:['ignore','pipe','pipe'],maxBuffer:256*1024*1024});

/** The commit sha of `ref`; EvalError('gold_diff_violation') when it is not a commit in this repository. */
export function resolveCommit(ref:string,cwd:string=process.cwd()):string{
 try{return git(cwd,['rev-parse','--verify','--quiet',`${ref}^{commit}`]).toString('utf8').trim();}
 catch{throw new EvalError('gold_diff_violation',`base not found: ${ref}`,{ref,reason:'base_not_found'});}
}
/** Paths whose difference between <base> and HEAD matters: the gold directory and every lock entry outside it (base or head lock). */
export function goldDiffPaths(base:string,cwd:string=process.cwd()):string[]{
 const outside=new Set<string>();
 const addFrom=(bytes:Uint8Array|undefined)=>{
  if(!bytes)return;
  try{const raw=decode(bytes);if(isObj(raw)&&Array.isArray(raw.files))for(const f of raw.files)if(isObj(f)&&typeof f.path==='string'&&!f.path.startsWith(`${GOLD_DIR}/`))outside.add(f.path);}catch{/* an unreadable lock adds no paths; --lock reports it */}
 };
 addFrom(gitTreeAt(base,[LOCK_PATH],cwd).get(LOCK_PATH));
 addFrom(gitTreeAt('HEAD',[LOCK_PATH],cwd).get(LOCK_PATH));
 return [GOLD_DIR,...[...outside].sort()];
}
export function changedGoldFiles(base:string,paths:string[],cwd:string=process.cwd()):string[]{
 return git(cwd,['diff','--name-only','--no-renames',base,'HEAD','--',...paths]).toString('utf8').split('\n').filter(Boolean).sort();
}
/** Bytes of each path at `ref`; a path absent at `ref` is absent from the map. */
export function gitTreeAt(ref:string,paths:string[],cwd:string=process.cwd()):GoldTree{
 const tree:GoldTree=new Map();
 for(const p of paths){
  try{tree.set(p,new Uint8Array(git(cwd,['show',`${ref}:${p}`])));}catch{/* absent at ref */}
 }
 return tree;
}
/** --gold-diff <base>: diff the committed HEAD against <base>. */
export function goldDiffAgainst(baseRef:string,cwd:string=process.cwd()):GoldDiffResult&{base:string;changed:string[]}{
 const base=resolveCommit(baseRef,cwd);
 const changed=changedGoldFiles(base,goldDiffPaths(base,cwd),cwd);
 return {base,changed,...goldDiff(gitTreeAt(base,changed,cwd),gitTreeAt('HEAD',changed,cwd))};
}
