// src/lib/judgments/methodology-sync.ts
// Core of scripts/judgments/sync-methodologies.ts (spec §4.1, §5.1 / §5.1b, §8.2). For each registry
// module: validate, hash (formula-hash.ts), compare with judgment_methodologies, and plan one action —
// register (new row), update (status / publishable changed), resync (unchanged; the RPC only bumps
// synced_at), drift (formula_hash or any immutable column differs from the stored row: the code or
// document changed without a new version — refused) or invalid (validation problems — refused). If
// any item is drift / invalid nothing is written and the script exits 2 (spec §13 formula_hash_drift).
// publishable becomes true only through --publishable <id@version> with an owner confirmation text
// (≥ 10 chars), recorded as the event reason, AND every origin key reachable from the method's
// input_kinds confirmed in docs/methodologies/licenses.json (commander decision D3: licences live
// outside every import closure; the script reads the file and passes it as o.licenses); without a
// flag the stored value is kept and a new method starts false (spec §4.1, §17). publishable is a
// metadata column: it never changes formula_hash. Validation: id / version patterns, public producer / subject / input
// kinds, markets ⊆ {A, HK, US}, label_policy, grace_days, horizon.n, window_years × 365 ≥ 3 × the
// horizon's calendar-day upper bound (§8.2; trading sessions × 1.52 as in §7.3, months × 31, quarters
// × 92), module / doc / deps exist, and no deps entry is already in the import closure (deps lists only
// what the import graph cannot see). Node-only (uses formula-hash.ts).
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {Horizon,JudgmentsDb,Methodology,MethodologyRow} from './types';
import {PUBLIC_INPUT_KINDS,PUBLIC_PRODUCER_KINDS,PUBLIC_SUBJECT_TYPES} from './types';
import {canonicalize} from './canonical';
import {JudgmentError} from './errors';
import {formulaHashOf} from './formula-hash';
import type {FormulaHashes} from './formula-hash';
import {methodologyRowOf} from './registry';
import type {MethodologySyncRow} from './registry';
import {ORIGINS} from './origins';
import {labelPolicyOf} from './target';
import {graceDaysOf} from './time';

export type SyncAction='register'|'update'|'resync'|'drift'|'invalid';
export interface SyncPlanItem{key:string;action:SyncAction;problems:string[];row:MethodologySyncRow|null;existing:MethodologyRow|null;closure:string[];reason:string|null}
export const LICENSES_PATH='docs/methodologies/licenses.json';
export interface LicenseEntry{status:'unverified'|'confirmed';confirmed_by:string|null;confirmed_at:string|null;evidence:string|null}
export type LicenseTable=Readonly<Record<string,LicenseEntry>>;
export interface SyncOptions{repoRoot:string;codeVersion:string;only?:ReadonlySet<string>;publish?:ReadonlySet<string>;unpublish?:ReadonlySet<string>;ownerConfirmation?:string;licenses?:LicenseTable}
export const methodologyKey=(m:{id:string;version:string})=>`${m.id}@${m.version}`;
/** licenses.json: exactly the ORIGINS keys, each {status, confirmed_by, confirmed_at, evidence}; a confirmed row names who, when and the evidence. */
export function validateLicenseTable(raw:unknown):LicenseTable{
 const bad=(why:string):never=>{throw new JudgmentError('invalid_parameter',`${LICENSES_PATH}: ${why}`);};
 if(raw===null||typeof raw!=='object'||Array.isArray(raw))return bad('not an object');
 const t=raw as Record<string,unknown>;
 for(const k of Object.keys(ORIGINS))if(!(k in t))bad(`missing ${k}`);
 for(const [k,v] of Object.entries(t)){
  if(!(k in ORIGINS))bad(`unknown origin key ${k}`);
  const e=v as Record<string,unknown>|null;
  if(!e||typeof e!=='object'||Object.keys(e).sort().join(',')!=='confirmed_at,confirmed_by,evidence,status')bad(`${k}: fields must be status, confirmed_by, confirmed_at, evidence`);
  if(e!.status!=='unverified'&&e!.status!=='confirmed')bad(`${k}: status`);
  const str=(x:unknown)=>typeof x==='string'&&x.trim().length>0;
  if(e!.status==='confirmed'&&!(str(e!.confirmed_by)&&str(e!.confirmed_at)&&str(e!.evidence)))bad(`${k}: a confirmed licence needs confirmed_by, confirmed_at and evidence`);
 }
 return t as unknown as LicenseTable;
}
export const reachableOriginKeys=(m:Pick<Methodology,'input_kinds'>):string[]=>Object.keys(ORIGINS).filter(k=>(m.input_kinds as readonly string[]).includes(k.split('×')[0])).sort();
export const licenseProblems=(m:Pick<Methodology,'input_kinds'>,licenses:LicenseTable):string[]=>reachableOriginKeys(m).filter(k=>licenses[k]?.status!=='confirmed').map(k=>`license_unconfirmed:${k}`);
const IMMUTABLE=['judgment_type','kind','producer_kind','subject_types','input_kinds','markets','title_zh','title_en','doc_path','doc_sha256','implementation_sha256','params','params_json','horizon','upstream','deps_sha256'] as const;
export function horizonCalendarDays(h:Horizon):number{
 switch(h.unit){
  case 'trading_sessions':return Math.ceil(h.n*1.52);
  case 'calendar_days':return h.n;
  case 'calendar_months':return h.n*31;
  case 'fiscal_quarters':return h.n*92;
  default:return Number.NaN;
 }
}
const sameFile=(root:string,a:string,b:string)=>resolve(root,a)===resolve(root,b);
export function validateMethodology(m:Methodology,repoRoot:string,closure:readonly string[]=[]):string[]{
 const p:string[]=[];
 if(!/^[a-z][a-z0-9_]{1,63}$/.test(m.id))p.push('id_pattern');
 if(!/^v[1-9][0-9]{0,3}$/.test(m.version))p.push('version_pattern');
 if(!(PUBLIC_PRODUCER_KINDS as readonly string[]).includes(m.producer_kind))p.push(`producer_kind_not_public:${m.producer_kind}`);
 if(m.subject_types.length===0)p.push('subject_types_empty');
 for(const s of m.subject_types)if(!(PUBLIC_SUBJECT_TYPES as readonly string[]).includes(s))p.push(`subject_type_not_public:${s}`);
 if(m.input_kinds.length===0)p.push('input_kinds_empty');
 for(const k of m.input_kinds)if(!(PUBLIC_INPUT_KINDS as readonly string[]).includes(k))p.push(`input_kind_not_public:${k}`);
 for(const mk of m.markets??[])if(!['A','HK','US'].includes(mk))p.push(`market:${mk}`);
 try{labelPolicyOf(m.params);}catch{p.push('label_policy');}
 try{graceDaysOf(m.params,m.horizon);}catch{p.push('grace_days');}
 const unitOk=(['trading_sessions','calendar_days','calendar_months','fiscal_quarters'] as const).includes(m.horizon.unit);
 // n is a positive integer; calendar_months alone allows 0 (the as_of month, target.ts)
 const horizonOk=unitOk&&Number.isInteger(m.horizon.n)&&Number.isFinite(m.horizon.n)&&m.horizon.n>=(m.horizon.unit==='calendar_months'?0:1)&&Number.isFinite(horizonCalendarDays(m.horizon));
 if(!horizonOk)p.push('invalid_horizon');
 const wy=m.params.window_years??3;
 if(typeof wy!=='number'||!(wy>0))p.push('window_years');
 else if(horizonOk&&wy*365<3*horizonCalendarDays(m.horizon))p.push(`window_years_too_short:${wy}y<3x${horizonCalendarDays(m.horizon)}d`);
 if(!existsSync(join(repoRoot,m.module)))p.push(`module_missing:${m.module}`);
 if(!existsSync(join(repoRoot,m.doc)))p.push(`doc_missing:${m.doc}`);
 for(const d of m.deps){if(!existsSync(join(repoRoot,d)))p.push(`dep_missing:${d}`);if(closure.includes(d))p.push(`dep_in_import_closure:${d}`);if(sameFile(repoRoot,d,LICENSES_PATH)){p.push('licenses_in_deps');if(!p.includes('licenses_in_closure'))p.push('licenses_in_closure');}}
 if(closure.some(c=>sameFile(repoRoot,c,LICENSES_PATH))&&!p.includes('licenses_in_closure'))p.push('licenses_in_closure');
 return p;
}
export async function planMethodologySync(registry:readonly Methodology[],db:Pick<JudgmentsDb,'methodology'>,o:SyncOptions,hash:(m:Methodology,root:string)=>FormulaHashes=formulaHashOf):Promise<SyncPlanItem[]>{
 const seen=new Set<string>();const out:SyncPlanItem[]=[];
 for(const m of registry){
  const key=methodologyKey(m);
  if(o.only&&!o.only.has(key))continue;
  const problems:string[]=[];
  if(seen.has(key))problems.push('duplicate_in_registry');
  seen.add(key);
  const publish=o.publish?.has(key)===true,unpublish=o.unpublish?.has(key)===true;
  if(publish&&unpublish)problems.push('publish_and_unpublish');
  const confirmation=(o.ownerConfirmation??'').trim();
  if(publish&&confirmation.length<10)problems.push('owner_confirmation_required');
  const existing=await db.methodology(m.id,m.version);
  const wantPublishable=publish?true:unpublish?false:(existing?.publishable??false);
  const unlicensed=wantPublishable?licenseProblems(m,o.licenses??{}):[];
  let withdrawn=false;
  if(unlicensed.length>0){
   if(publish){if(confirmation.length>=10)problems.push(...unlicensed);}   // reported once the confirmation text is present
   else withdrawn=true;                                                    // already published, licence no longer confirmed
  }
  let h:FormulaHashes|null=null;
  try{h=hash(m,o.repoRoot);}catch(e){problems.push(`hash:${e instanceof Error?e.message:String(e)}`);}
  problems.push(...validateMethodology(m,o.repoRoot,h?.closure??[]));
  const publishable=withdrawn?false:wantPublishable;
  const row=h?methodologyRowOf(m,h,{publishable,code_version:o.codeVersion}):null;
  const reason=publish?`owner_confirmed:${confirmation}`:unpublish?'unpublished_by_script':withdrawn?'license_withdrawn':null;
  let action:SyncAction;
  if(problems.length>0||!row)action='invalid';
  else if(!existing)action='register';
  else{
   const changed=IMMUTABLE.filter(c=>canonicalize(existing[c]??null)!==canonicalize(row[c]??null));
   if(existing.formula_hash!==row.formula_hash||changed.length>0){action='drift';if(changed.length>0&&existing.formula_hash===row.formula_hash)problems.push(`immutable_columns_changed:${changed.join(',')}`);}
   else action=existing.status!==row.status||existing.publishable!==row.publishable?'update':'resync';
  }
  out.push({key,action,problems,row,existing,closure:h?.closure??[],reason});
 }
 return out;
}
export const planExitCode=(plan:readonly SyncPlanItem[]):0|2=>plan.some(p=>p.action==='drift'||p.action==='invalid')?2:0;
export async function applyMethodologySync(plan:readonly SyncPlanItem[],db:Pick<JudgmentsDb,'syncMethodology'>):Promise<{key:string;changed:boolean;seq:number}[]>{
 if(planExitCode(plan)!==0)throw new JudgmentError('formula_hash_drift','refusing to sync: the plan contains drift or invalid items');
 const out:{key:string;changed:boolean;seq:number}[]=[];
 for(const p of plan){const r=await db.syncMethodology(p.row!,'script',p.reason);out.push({key:p.key,...r});}
 return out;
}
