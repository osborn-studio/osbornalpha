// Topic plan T5.2 / spec §4.5: draft validation and advisory owner-text lint.
import {EVIDENCE_KINDS,parseRef} from '@/lib/evidence/ref';
import {TopicError} from './errors';
import {SLOT_REASONS,type Bilingual,type DraftBody,type DraftRef,type SectionItem} from './types';
import {ownerTextFailures} from './lexical';
import {parseSlots} from './slots';
export const DRAFT_LIMITS={title:120,dek:240,sectionTitle:120,note:4000,ownerNote:4000,slotLabel:120,sections:20,evidence:200,expectedSlots:50,entries:50} as const;
const bad=(path:string):never=>{throw new TopicError(path?`invalid_body:${path}`:'invalid_body');};
const object=(raw:unknown,path:string):Record<string,unknown>=>{
 if(raw===null||typeof raw!=='object'||Array.isArray(raw))return bad(path);
 return raw as Record<string,unknown>;
};
const list=(raw:unknown,path:string,max?:number):unknown[]=>{
 if(!Array.isArray(raw)||(max!==undefined&&raw.length>max))return bad(path);return raw;
};
const bilingual=(raw:unknown,path:string,max:number,min=0):Bilingual=>{
 const b=object(raw,path);
 const text=(loc:'zh'|'en')=>{const v=b[loc];if(typeof v!=='string'||v.length<min||v.length>max)return bad(`${path}.${loc}`);return v;};
 return {zh:text('zh'),en:text('en')};
};
const keyOf=(raw:unknown,path:string,seen:Set<string>):string=>{
 if(typeof raw!=='string'||!/^[a-z0-9-]{1,40}$/.test(raw)||seen.has(raw))return bad(path);
 seen.add(raw);return raw;
};
const ordinalOf=(raw:unknown,path:string):number=>{
 if(typeof raw!=='number'||!Number.isSafeInteger(raw)||raw<1)return bad(path);return raw;
};
export const emptyDraft=(title:Bilingual):DraftBody=>({title,dek:{zh:'',en:''},sections:[],evidence:[],expected_slots:[],entries:[],blocks_provenance:{}});
export function parseDraftBody(raw:unknown,licenceIds:ReadonlySet<string>=new Set()):DraftBody{
 const b=object(raw,'');
 const allowed=new Set(['title','dek','sections','evidence','expected_slots','entries','blocks_provenance']);
 for(const key of Object.keys(b))if(!allowed.has(key))bad(key);
 const title=bilingual(b.title,'title',DRAFT_LIMITS.title,1),dek=bilingual(b.dek,'dek',DRAFT_LIMITS.dek);
 const sectionKeys=new Set<string>(),slotKeys=new Set<string>(),entryKeys=new Set<string>(),ordinals=new Set<number>();
 const rawSections=list(b.sections,'sections',DRAFT_LIMITS.sections);
 const sections=rawSections.map((raw,i)=>{
  const path=`sections.${i}`,s=object(raw,path);
  return {key:keyOf(s.key,`${path}.key`,sectionKeys),title:bilingual(s.title,`${path}.title`,DRAFT_LIMITS.sectionTitle),
   note:s.note===null?null:bilingual(s.note,`${path}.note`,DRAFT_LIMITS.note),items:[] as SectionItem[]};
 });
 const evidence=list(b.evidence,'evidence',DRAFT_LIMITS.evidence).map((raw,i)=>{
  const path=`evidence.${i}`,e=object(raw,path),ordinal=ordinalOf(e.ordinal,`${path}.ordinal`);
  if(ordinals.has(ordinal))bad(`${path}.ordinal`);ordinals.add(ordinal);
  if(typeof e.section_key!=='string'||!sectionKeys.has(e.section_key))return bad(`${path}.section_key`);
  const r=object(e.ref,`${path}.ref`);let ref:DraftRef;
  try{
   const normalized=parseRef({...r,as_of:r.as_of??'2000-01-01T00:00:00.000Z'});
   if(r.as_of===undefined){const {as_of:unused,...rest}=normalized;void unused;ref=rest;}else ref=normalized;
  }catch{return bad(`${path}.ref`);}
  return {ordinal,ref,section_key:e.section_key};
 });
 const expected_slots=list(b.expected_slots,'expected_slots',DRAFT_LIMITS.expectedSlots).map((raw,i)=>{
  const path=`expected_slots.${i}`,s=object(raw,path),key=keyOf(s.key,`${path}.key`,slotKeys);
  const kind=EVIDENCE_KINDS.find(k=>k===s.kind);if(!kind)return bad(`${path}.kind`);
  const reason_code=SLOT_REASONS.find(r=>r===s.reason_code);if(!reason_code)return bad(`${path}.reason_code`);
  return {key,kind,label:bilingual(s.label,`${path}.label`,DRAFT_LIMITS.slotLabel),reason_code};
 });
 const listedEvidence=new Set<number>(),listedSlots=new Set<string>();
 sections.forEach((section,i)=>{
  section.items=list(object(rawSections[i],`sections.${i}`).items,`sections.${i}.items`).map((raw,j):SectionItem=>{
   const path=`sections.${i}.items.${j}`,item=object(raw,path),keys=Object.keys(item);
   if(keys.length!==1)return bad(path);
   if(keys[0]==='ordinal'){
    const ordinal=ordinalOf(item.ordinal,path);
    if(listedEvidence.has(ordinal)||!evidence.some(e=>e.ordinal===ordinal&&e.section_key===section.key))return bad(path);
    listedEvidence.add(ordinal);return {ordinal};
   }
   if(keys[0]==='expected_slot'&&typeof item.expected_slot==='string'&&slotKeys.has(item.expected_slot)&&!listedSlots.has(item.expected_slot)){
    listedSlots.add(item.expected_slot);return {expected_slot:item.expected_slot};
   }
   return bad(path);
  });
 });
 evidence.forEach((e,i)=>{if(!listedEvidence.has(e.ordinal))bad(`evidence.${i}.ordinal`);});
 expected_slots.forEach((s,i)=>{if(!listedSlots.has(s.key))bad(`expected_slots.${i}.key`);});
 const entries=list(b.entries,'entries',DRAFT_LIMITS.entries).map((raw,i)=>{
  const path=`entries.${i}`,e=object(raw,path);
  if(e.entry_type==='licensed_excerpt'){
   if(typeof e.licence_id!=='string'||!licenceIds.has(e.licence_id))return bad(path+'.licence_id');
   const fragments=list(e.fragments,path+'.fragments').map((raw,j)=>{
    const f=object(raw,path+'.fragments.'+j);
    if(typeof f.text!=='string'||typeof f.attribution!=='string'||typeof f.url!=='string'||typeof f.date!=='string')return bad(path+'.fragments.'+j);
    return {text:f.text,attribution:f.attribution,url:f.url,date:f.date};
   });
   return {entry_type:'licensed_excerpt' as const,key:keyOf(e.key,path+'.key',entryKeys),licence_id:e.licence_id,fragments};
  }
  if(e.entry_type!=='owner_note')return bad(`${path}.entry_type`);
  return {key:keyOf(e.key,`${path}.key`,entryKeys),entry_type:'owner_note' as const,body:bilingual(e.body,`${path}.body`,DRAFT_LIMITS.ownerNote)};
 });
 const provenance=object(b.blocks_provenance,'blocks_provenance');
 const pairs=Object.entries(provenance).map(([key,value])=>{
  if(value!=='owner'&&value!=='from_thesis'&&value!=='reviewed')return bad('blocks_provenance');
  return [key,value] as const;
 });
 return {title,dek,sections,evidence,expected_slots,entries,blocks_provenance:Object.fromEntries(pairs)};
}
export const nextOrdinal=(body:DraftBody):number=>Math.max(0,...body.evidence.map(e=>e.ordinal))+1;
export function ownerTexts(draft:DraftBody):{field:string;text:string}[]{
 const out:{field:string;text:string}[]=[];
 const add=(field:string,text:Bilingual)=>{for(const loc of ['zh','en'] as const)if(text[loc])out.push({field:`${field}.${loc}`,text:text[loc]});};
 add('title',draft.title);add('dek',draft.dek);
 for(const s of draft.sections){add(`sections.${s.key}.title`,s.title);if(s.note!==null)add(`sections.${s.key}.note`,s.note);}
 for(const e of draft.entries)if(e.entry_type==='owner_note')add(`entries.${e.key}.body`,e.body);
 return out;
}
export interface LintFinding{field:string;code:'numeral_in_owner_text'|'forbidden_term'|'advice_term'|'dangling_slot';match:string}
export function draftLint(body:DraftBody):LintFinding[]{
 const ordinals=new Set(body.evidence.map(e=>e.ordinal));
 return ownerTexts(body).flatMap(({field,text})=>[
  ...ownerTextFailures(text).map(f=>({field,...f})),
  ...parseSlots(text).filter(t=>!ordinals.has(t.ordinal)).map(t=>({field,code:'dangling_slot' as const,match:t.raw})),
 ]);
}
