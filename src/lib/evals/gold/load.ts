// src/lib/evals/gold/load.ts
// Gold-set loading (spec §4.1, §4.4). The format is decided by CONTENT, not by path: a top-level
// `schema_version` → f6, else `entries` (array) + `ready` (boolean) → legacy_plan2. The set hash is the
// sha256 of the file BYTES as read; `path` is repo-relative POSIX. recorders.json and lock.json are
// validated here too; checkLock compares a loaded set with its lock entry.
import {readFileSync,readdirSync} from 'node:fs';
import {isAbsolute,join,relative,sep} from 'node:path';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import type {EvalModule,GoldFormat,GoldLock,GoldSet,RecordersFile} from '../types';
import {parseLegacyPlan2} from './legacy-plan2';
import {EVAL_MODULES,parseGoldSetF6} from './schema';

export const GOLD_DIR='src/lib/evals/fixtures/gold';
export const RECORDERS_PATH=`${GOLD_DIR}/recorders.json`;
export const LOCK_PATH=`${GOLD_DIR}/lock.json`;
const HEX64=/^[0-9a-f]{64}$/;
type J=Record<string,unknown>;
const isObj=(v:unknown):v is J=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const invalid=(path:string,code:string,code2?:EvalError['code'])=>new EvalError(code2??'gold_invalid',`${path}: ${code}`,{path,errors:[code]});

/** Repo-relative POSIX path of `path` (absolute or relative to root); throws when it leaves the repo. */
export function repoPath(path:string,root:string):string{
 const rel=relative(root,isAbsolute(path)?path:join(root,path)).split(sep).join('/');
 if(rel===''||rel.startsWith('../')||rel==='..'||isAbsolute(rel))throw invalid(path,'outside_repository');
 return rel;
}
export function detectGoldFormat(raw:unknown):GoldFormat|null{
 if(!isObj(raw))return null;
 if('schema_version' in raw)return 'f6';
 if(Array.isArray(raw.entries)&&typeof raw.ready==='boolean')return 'legacy_plan2';
 return null;
}
function readJson(rel:string,root:string):{bytes:Buffer;raw:unknown}{
 let bytes:Buffer;
 try{bytes=readFileSync(join(root,rel));}catch{throw invalid(rel,'not_found');}
 try{return {bytes,raw:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};}catch{throw invalid(rel,'invalid_json');}
}
/** Parses bytes already in hand (used by loadGoldSet and by gold-diff on git blobs). */
export function parseGoldBytes(bytes:Uint8Array,path:string,recorders:RecordersFile|null):GoldSet{
 let raw:unknown;
 try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw invalid(path,'invalid_json');}
 const meta={path,sha256:sha256Hex(bytes)};
 const format=detectGoldFormat(raw);
 if(format==='legacy_plan2')return parseLegacyPlan2(raw,meta);
 if(format==='f6'){
  if(!recorders)throw invalid(path,'recorders_required');
  return parseGoldSetF6(raw,meta,recorders);
 }
 throw invalid(path,'unknown_format');
}
export function loadGoldSet(path:string,root:string=process.cwd()):GoldSet{
 const rel=repoPath(path,root);
 const {bytes,raw}=readJson(rel,root);
 return parseGoldBytes(bytes,rel,detectGoldFormat(raw)==='f6'?loadRecorders(root):null);
}

export function parseRecorders(raw:unknown,path:string=RECORDERS_PATH):RecordersFile{
 const errors:string[]=[];
 if(!isObj(raw))throw invalid(path,'not_an_object');
 if(typeof raw.version!=='number'||!Number.isSafeInteger(raw.version)||raw.version<1)errors.push('version: integer_>=_1');
 if(!Array.isArray(raw.recorders))errors.push('recorders: array');
 const ids=new Set<string>();
 for(const [i,r] of (Array.isArray(raw.recorders)?raw.recorders:[]).entries()){
  const at=`recorders[${i}]`;
  if(!isObj(r)){errors.push(`${at}: not_an_object`);continue;}
  if(typeof r.id!=='string'||!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(r.id))errors.push(`${at}.id: invalid`);
  else if(r.id==='synthetic')errors.push(`${at}.id: reserved`);
  else if(ids.has(r.id))errors.push(`${at}.id: duplicate`);
  else ids.add(r.id);
  if(typeof r.role!=='string'||r.role==='')errors.push(`${at}.role: required`);
  if(!Array.isArray(r.modules)||r.modules.length===0||!r.modules.every(m=>EVAL_MODULES.includes(m as EvalModule)))errors.push(`${at}.modules: non_empty_subset_of_modules`);
  if(typeof r.added_at!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.added_at))errors.push(`${at}.added_at: date`);
  if(typeof r.approved_by!=='string'||r.approved_by==='')errors.push(`${at}.approved_by: required`);
 }
 if(errors.length>0)throw new EvalError('gold_invalid',`${path}: ${errors.length} rule violation(s)`,{path,errors});
 return raw as unknown as RecordersFile;
}
export const loadRecorders=(root:string=process.cwd()):RecordersFile=>parseRecorders(readJson(RECORDERS_PATH,root).raw);

export function parseLock(raw:unknown,path:string=LOCK_PATH):GoldLock{
 const errors:string[]=[];
 const files=isObj(raw)&&Array.isArray(raw.files)?raw.files:null;
 if(!files||Object.keys(raw as J).join()!=='files')throw invalid(path,'must_be_{files:[]}');
 const seen=new Set<string>();
 for(const [i,f] of files.entries()){
  if(!isObj(f)||typeof f.path!=='string'||typeof f.sha256!=='string'||!HEX64.test(f.sha256)||typeof f.version!=='number'||!Number.isSafeInteger(f.version)||f.version<1||(f.format!=='f6'&&f.format!=='legacy_plan2'))errors.push(`files[${i}]: must_be_{path,sha256,version,format}`);
  else if(seen.has(f.path))errors.push(`files[${i}].path: duplicate`);
  else seen.add(f.path);
 }
 if(errors.length>0)throw new EvalError('gold_invalid',`${path}: ${errors.length} rule violation(s)`,{path,errors});
 return raw as unknown as GoldLock;
}
export const loadLock=(root:string=process.cwd()):GoldLock=>parseLock(readJson(LOCK_PATH,root).raw);

/** §4.4: the loaded set must match its lock entry exactly (path, bytes sha256, version, format). */
export function checkLock(set:GoldSet,lock:GoldLock):void{
 const entry=lock.files.find(f=>f.path===set.path);
 if(!entry)throw new EvalError('gold_lock_mismatch',`${set.path}: not in lock.json`,{path:set.path});
 const diffs=(['sha256','version','format'] as const).filter(k=>entry[k]!==set[k]);
 if(diffs.length>0)throw new EvalError('gold_lock_mismatch',`${set.path}: lock differs in ${diffs.join(',')}`,{path:set.path,fields:diffs,lock:entry,actual:{sha256:set.sha256,version:set.version,format:set.format}});
}

/** Every gold set in the repository: *.json under GOLD_DIR (lock.json and recorders.json excluded) plus lock entries outside it (plan2.json), sorted. */
export function listGoldSetPaths(root:string=process.cwd(),lock:GoldLock|null=null):string[]{
 const inDir=(readdirSync(join(root,GOLD_DIR),{recursive:true}) as string[])
  .map(p=>`${GOLD_DIR}/${p.split(sep).join('/')}`)
  .filter(p=>p.endsWith('.json')&&p!==LOCK_PATH&&p!==RECORDERS_PATH);
 const outside=(lock?.files??[]).map(f=>f.path).filter(p=>!p.startsWith(`${GOLD_DIR}/`));
 return [...new Set([...inDir,...outside])].sort();
}
