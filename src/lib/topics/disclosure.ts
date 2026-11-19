// Topic plan T6.3 / spec §6.6: deterministic disclosure checks with prose-free receipt diagnostics.
import type {Assembled} from './assemble';
import type {TopicSettingsRow} from './database-types';
import type {DisclosureCheck,DraftBody,DraftEntry} from './types';
import {draftLint,ownerTexts} from './drafts';
import {parseSlots,withoutSlots} from './slots';
export {ownerTexts} from './drafts';
export const DISCLOSURE_VERSION='topic-disclosure/1';
export const CHECK_KEYS=['evidence_kind','evidence_audience','private_fingerprint','unreviewed_block','lexical','excerpt','slots','summary','resolver_health','empty_dossier'] as const;
export const EXCERPT_CAPS={zhChars:120,enWords:60,fragments:3} as const;
export interface DisclosureInput{draft:DraftBody;assembled:Pick<Assembled,'snapshot'|'degraded'>;privateIds:ReadonlySet<string>;
 summary:{factsMatch?:boolean;status:'generated'|'approved'|'discarded';draft_hash:string;provider:string;model:string}|null;draftHash:string;
 settings:Pick<TopicSettingsRow,'summary_public_enabled'|'summary_provider_note'>;licences:ReadonlyMap<string,{status:'pending'|'approved'|'revoked';permits:Record<string,unknown>}>}
const unique=(codes:string[])=>[...new Set(codes)];
function excerptInvalid(e:Extract<DraftEntry,{entry_type:'licensed_excerpt'}>,i:DisclosureInput):boolean{
 const licence=i.licences.get(e.licence_id);
 if(licence?.status!=='approved'||licence.permits.display_excerpt!==true||e.fragments.length>EXCERPT_CAPS.fragments)return true;
 return e.fragments.some(f=>{
  let https=false;try{https=new URL(f.url).protocol==='https:';}catch{/* Invalid links cannot be disclosed. */}
  const han=(f.text.match(/\p{Script=Han}/gu)??[]).length;
  const words=f.text.replace(/\p{Script=Han}/gu,' ').trim().split(/\s+/u).filter(Boolean).length;
  return han>EXCERPT_CAPS.zhChars||words>EXCERPT_CAPS.enWords||!f.attribution.trim()||!f.date.trim()||!https;
 });
}
export function runDisclosure(i:DisclosureInput):{checks:DisclosureCheck[];passed:boolean;blocked:string[];warnings:string[]}{
 const checks:DisclosureCheck[]=[],texts=ownerTexts(i.draft),evidence=i.assembled.snapshot.evidence;
 const add=(codes:string[],detail:Record<string,unknown>={})=>{
  const n=checks.length;checks.push({id:n+1,key:CHECK_KEYS[n],result:codes.length?(n===1?'warn':'block'):'pass',codes:unique(codes),detail});
 };
 add(evidence.some(e=>e.resolved.state==='unsupported')?['kind_unsupported']:[]);
 const withheld=evidence.filter(e=>e.resolved.state==='withheld').length,total=evidence.length;
 add(withheld>total/2?['mostly_withheld']:[],{withheld,total});
 const fingerprints=texts.flatMap(({field,text})=>{
  const bare=withoutSlots(text),codes:string[]=[];
  if(bare.includes('/research/')||[...i.privateIds].some(id=>id.length>0&&bare.includes(id)))codes.push('private_reference');
  if(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(bare)||/\b[0-9a-f]{64}\b/i.test(bare))codes.push('identifier_in_text');
  return codes.map(code=>({field,code}));
 });
 add(fingerprints.map(f=>f.code),{findings:fingerprints});
 add(Object.values(i.draft.blocks_provenance).includes('from_thesis')?['unreviewed_private_block']:[]);
 const findings=draftLint(i.draft).filter(f=>f.code!=='dangling_slot').map(({field,code})=>({field,code}));
 const counts:Record<string,number>={};for(const f of findings)counts[f.code]=(counts[f.code]??0)+1;
 add(findings.map(f=>f.code),{findings,counts});
 add(i.draft.entries.some(e=>e.entry_type==='licensed_excerpt'&&excerptInvalid(e,i))?['excerpt_violation']:[]);
 const ordinals=new Set(i.draft.evidence.map(e=>e.ordinal));
 const dangling=texts.flatMap(({field,text})=>parseSlots(text).filter(t=>!ordinals.has(t.ordinal)).map(t=>({field,slot:t.raw})));
 add(dangling.length?['dangling_slot']:[],{findings:dangling});
 const summaryCodes:string[]=[];
 if(i.summary){
  if(i.summary.draft_hash!==i.draftHash||i.summary.status!=='approved'||i.summary.factsMatch===false)summaryCodes.push('summary_mismatch');
  if(!i.settings.summary_public_enabled)summaryCodes.push('summary_provider_unconfirmed');
  if(!i.summary.provider.trim()||!i.settings.summary_provider_note?.toLowerCase().includes(i.summary.provider.toLowerCase()))summaryCodes.push('summary_provider_mismatch');
 }
 add(summaryCodes,{attached:i.summary!==null});
 add(i.assembled.degraded?['resolver_degraded']:[]);
 const expected_slots=i.assembled.snapshot.expected_slots.length;
 add(total===0&&expected_slots===0?['empty_dossier']:[],{evidence:total,expected_slots});
 const blocked=unique(checks.filter(c=>c.result==='block').flatMap(c=>c.codes)),warnings=unique(checks.filter(c=>c.result==='warn').flatMap(c=>c.codes));
 return {checks,passed:blocked.length===0,blocked,warnings};
}
