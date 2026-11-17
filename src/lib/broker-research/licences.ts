// Versioned licences and public switch (spec §4.1, §8.2, D1–D3). The DB trigger bumps
// versions and resets confirmation on material change; these predicates gate processing.
import {auditAdmin} from './audit';
import {bad,conflict,notFound} from './errors';
import type {CoreDeps} from './deps';
import type {LicenceInput,LicenceKind,LicenceRow,SettingsRow} from './types';

const KINDS:readonly LicenceKind[]=['terminal_subscription','direct_from_broker','owner_authored','other'];
const BOOLS=['allows_llm_processing','allows_public_metadata','allows_public_snippets','allows_public_summary','allows_public_target_price'] as const;
const KEYS=new Set<string>(['source_label','licence_kind','holder','terms_summary','evidence_path','snippet_max_chars','valid_from','valid_to',...BOOLS]);
export const SNIPPET_HARD_MAX=500;
const EVIDENCE_RE=/^licences\/[0-9a-f]{64}\.pdf$/;
export const isIsoDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const inv=(k:string)=>bad(`invalid_licence:${k}`);
const valueText=(v:unknown,k:string,max:number)=>{if(typeof v!=='string'||v.trim().length<1||v.length>max)throw inv(k);return v.trim();};

export function parseLicenceInput(body:Record<string,unknown>,mode:'create'):LicenceInput;
export function parseLicenceInput(body:Record<string,unknown>,mode:'patch'):Partial<LicenceInput>;
export function parseLicenceInput(body:Record<string,unknown>,mode:'create'|'patch'):Partial<LicenceInput>{
 for(const k of Object.keys(body))if(!KEYS.has(k))throw inv(k);
 if(mode==='patch'&&Object.keys(body).length===0)throw inv('empty');
 const has=(k:string)=>Object.prototype.hasOwnProperty.call(body,k);
 const need=(k:string)=>{if(mode==='create'&&!has(k))throw inv(k);return has(k);};
 const out:Partial<LicenceInput>={};
 if(need('source_label'))out.source_label=valueText(body.source_label,'source_label',120);
 if(need('licence_kind')){if(!KINDS.includes(body.licence_kind as LicenceKind))throw inv('licence_kind');out.licence_kind=body.licence_kind as LicenceKind;}
 if(need('holder'))out.holder=valueText(body.holder,'holder',200);
 if(need('terms_summary'))out.terms_summary=valueText(body.terms_summary,'terms_summary',4000);
 if(has('evidence_path')){const v=body.evidence_path;if(v!==null&&(typeof v!=='string'||!EVIDENCE_RE.test(v)))throw inv('evidence_path');out.evidence_path=v as string|null;}
 else if(mode==='create')out.evidence_path=null;
 for(const k of BOOLS){if(has(k)){if(typeof body[k]!=='boolean')throw inv(k);out[k]=body[k] as boolean;}else if(mode==='create')out[k]=false;}
 if(need('snippet_max_chars')){const v=body.snippet_max_chars;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>SNIPPET_HARD_MAX)throw inv('snippet_max_chars');out.snippet_max_chars=v;}
 if(need('valid_from')){if(!isIsoDate(body.valid_from))throw inv('valid_from');out.valid_from=body.valid_from;}
 if(has('valid_to')){const v=body.valid_to;if(v!==null&&!isIsoDate(v))throw inv('valid_to');out.valid_to=v as string|null;}
 else if(mode==='create')out.valid_to=null;
 if(out.valid_from&&out.valid_to&&out.valid_to<out.valid_from)throw inv('valid_to');
 return out;
}

export const utcToday=(now:Date)=>now.toISOString().slice(0,10);
/** Current confirmed licence predicate, evaluated at a UTC date (spec §4.1). */
export const licenceConfirmed=(l:LicenceRow,today:string)=>l.confirmed_at!==null&&l.confirmed_version===l.version&&today>=l.valid_from&&(l.valid_to===null||today<=l.valid_to);
/** Required before F3 or platform LLM receives document text. */
export const processingAllowed=(l:LicenceRow,today:string)=>licenceConfirmed(l,today)&&l.allows_llm_processing;

type LicDeps=Pick<CoreDeps,'db'|'tables'|'now'>;
export async function listLicences(deps:Pick<CoreDeps,'db'>):Promise<{licences:LicenceRow[];settings:SettingsRow}>{
 const [licences,settings]=await Promise.all([deps.db.listLicences(),deps.db.getSettings()]);return {licences,settings};
}
export async function getLicenceOr404(deps:Pick<CoreDeps,'db'>,id:string):Promise<LicenceRow>{
 const l=await deps.db.getLicence(id);if(!l)throw notFound('licence_not_found');return l;
}
export async function createLicence(deps:LicDeps,input:LicenceInput,by:string):Promise<LicenceRow>{
 const row=await deps.db.insertLicence(input);
 await auditAdmin(deps.tables,by,'broker_research.licence_create',row.licence_id,{version:row.version},deps.now());
 return row;
}
export async function patchLicence(deps:LicDeps,id:string,patch:Partial<LicenceInput>,by:string):Promise<{licence:LicenceRow;material:boolean}>{
 const cur=await getLicenceOr404(deps,id);
 const from=patch.valid_from??cur.valid_from,to=patch.valid_to===undefined?cur.valid_to:patch.valid_to;
 if(to!==null&&to<from)throw inv('valid_to');
 const licence=await deps.db.updateLicence(id,patch);
 const material=licence.version!==cur.version;
 await auditAdmin(deps.tables,by,'broker_research.licence_patch',id,{keys:Object.keys(patch).sort(),from_version:cur.version,to_version:licence.version,material},deps.now());
 return {licence,material};
}
export async function confirmLicence(deps:LicDeps,id:string,version:number,by:string):Promise<LicenceRow>{
 const cur=await getLicenceOr404(deps,id);
 if(await deps.db.confirmLicence(id,by,version)==='version_mismatch')throw conflict('version_mismatch',{current_version:cur.version});
 await auditAdmin(deps.tables,by,'broker_research.licence_confirm',id,{version},deps.now());
 return getLicenceOr404(deps,id);
}
/** Records the owner switch; public opening gates are checked before FR-6. */
export async function setPublicEnabled(deps:LicDeps,flag:boolean,by:string):Promise<SettingsRow>{
 await deps.db.setPublicEnabled(flag,by);
 await auditAdmin(deps.tables,by,'broker_research.public_switch',null,{enabled:flag},deps.now());
 return deps.db.getSettings();
}
