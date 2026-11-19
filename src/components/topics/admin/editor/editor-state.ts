// Topic plan T5.5: client-safe draft reducer; persistence and validation stay on the server.
import type {DraftBody,DraftRef,ExpectedSlot,Bilingual} from '@/lib/topics/types';
export type EditorAction=
 |{type:'confirmBlock';key:string}
 |{type:'setTitle'|'setDek';locale:'zh'|'en';value:string}
 |{type:'addSection';key:string}|{type:'removeSection';key:string}|{type:'moveSection';key:string;dir:-1|1}
 |{type:'setSectionTitle'|'setSectionNote';key:string;locale:'zh'|'en';value:string}
 |{type:'addEvidence';section:string;ref:DraftRef}|{type:'removeEvidence';ordinal:number}|{type:'moveItem';section:string;index:number;dir:-1|1}
 |{type:'addSlot';section:string;slot:ExpectedSlot}|{type:'removeSlot';key:string}
 |{type:'insertSlotText';field:string;at:number;ordinal:number;part:'value'|'period'}
 |{type:'replaceWithSlot';field:string;match:string;ordinal:number}
 |{type:'setOwnerNote';key:string;locale:'zh'|'en';value:string}|{type:'addOwnerNote';key:string}|{type:'removeEntry';key:string};
const validKey=(key:string)=>/^[a-z0-9-]{1,40}$/.test(key);
const blank=():Bilingual=>({zh:'',en:''});
export function nextSectionKey(body:DraftBody):string{
 let n=1;while(body.sections.some(s=>s.key===`s${n}`))n++;return `s${n}`;
}
export function fieldText(body:DraftBody,field:string):string|null{
 const p=field.split('.'),loc=p.at(-1);if(loc!=='zh'&&loc!=='en')return null;
 if(p.length===2&&(p[0]==='title'||p[0]==='dek'))return body[p[0]][loc];
 if(p.length===4&&p[0]==='sections'&&(p[2]==='note'||p[2]==='title')){
  const section=body.sections.find(s=>s.key===p[1]);return section?section[p[2]]?.[loc]??'':null;
 }
 if(p.length===4&&p[0]==='entries'&&p[2]==='body'){
  const entry=body.entries.find(e=>e.key===p[1]);return entry?.entry_type==='owner_note'?entry.body[loc]:null;
 }
 return null;
}
function setField(body:DraftBody,field:string,value:string):DraftBody{
 const p=field.split('.'),locale=p.at(-1) as 'zh'|'en';
 if(p[0]==='title'||p[0]==='dek')return reduce(body,{type:p[0]==='title'?'setTitle':'setDek',locale,value});
 if(p[0]==='sections')return reduce(body,{type:p[2]==='note'?'setSectionNote':'setSectionTitle',key:p[1],locale,value});
 return reduce(body,{type:'setOwnerNote',key:p[1],locale,value});
}
function move<T>(list:T[],index:number,dir:-1|1):T[]{
 if(index<0||index>=list.length)return list;
 const to=Math.max(0,Math.min(list.length-1,index+dir));if(to===index)return list;
 const next=[...list];[next[index],next[to]]=[next[to],next[index]];return next;
}
export function reduce(body:DraftBody,a:EditorAction):DraftBody{
 const review=(key:string)=>body.blocks_provenance[key]==='from_thesis'?{...body,blocks_provenance:{...body.blocks_provenance,[key]:'reviewed' as const}}:body;
 switch(a.type){
  case 'confirmBlock':return review(a.key);
  case 'setTitle':return {...review('title'),title:{...body.title,[a.locale]:a.value}};
  case 'setDek':return {...body,dek:{...body.dek,[a.locale]:a.value}};
  case 'addSection':return !validKey(a.key)||body.sections.some(s=>s.key===a.key)||body.sections.length>=20?body:{...body,sections:[...body.sections,{key:a.key,title:blank(),note:null,items:[]}]};
  case 'removeSection':{
   const slots=new Set(body.sections.find(s=>s.key===a.key)?.items.flatMap(i=>'expected_slot' in i?[i.expected_slot]:[])??[]);
   return {...body,sections:body.sections.filter(s=>s.key!==a.key),evidence:body.evidence.filter(e=>e.section_key!==a.key),expected_slots:body.expected_slots.filter(s=>!slots.has(s.key))};
  }
  case 'moveSection':return {...body,sections:move(body.sections,body.sections.findIndex(s=>s.key===a.key),a.dir)};
  case 'setSectionTitle':case 'setSectionNote':return {...body,sections:body.sections.map(s=>{
   if(s.key!==a.key)return s;if(a.type==='setSectionTitle')return {...s,title:{...s.title,[a.locale]:a.value}};
   const note={...(s.note??blank()),[a.locale]:a.value};return {...s,note:note.zh||note.en?note:null};
  })};
  case 'addEvidence':{
   if(!body.sections.some(s=>s.key===a.section)||body.evidence.length>=200||body.evidence.some(e=>e.ref.kind===a.ref.kind&&e.ref.id===a.ref.id&&e.ref.as_of===a.ref.as_of))return body;
   const ordinal=Math.max(0,...body.evidence.map(e=>e.ordinal))+1;
   return {...body,evidence:[...body.evidence,{ordinal,ref:a.ref,section_key:a.section}],sections:body.sections.map(s=>s.key===a.section?{...s,items:[...s.items,{ordinal}]}:s)};
  }
  case 'removeEvidence':return {...body,evidence:body.evidence.filter(e=>e.ordinal!==a.ordinal),sections:body.sections.map(s=>({...s,items:s.items.filter(i=>!('ordinal' in i)||i.ordinal!==a.ordinal)}))};
  case 'moveItem':return {...body,sections:body.sections.map(s=>s.key===a.section?{...s,items:move(s.items,a.index,a.dir)}:s)};
  case 'addSlot':return !validKey(a.slot.key)||!body.sections.some(s=>s.key===a.section)||body.expected_slots.length>=50||body.expected_slots.some(s=>s.key===a.slot.key)?body:
   {...body,expected_slots:[...body.expected_slots,a.slot],sections:body.sections.map(s=>s.key===a.section?{...s,items:[...s.items,{expected_slot:a.slot.key}]}:s)};
  case 'removeSlot':return {...body,expected_slots:body.expected_slots.filter(s=>s.key!==a.key),sections:body.sections.map(s=>({...s,items:s.items.filter(i=>!('expected_slot' in i)||i.expected_slot!==a.key)}))};
  case 'insertSlotText':case 'replaceWithSlot':{
   const text=fieldText(body,a.field);if(text===null)return body;
   if(a.type==='replaceWithSlot')return a.match?setField(body,a.field,text.replace(a.match,`{{ev:${a.ordinal}}}`)):body;
   const at=Math.max(0,Math.min(text.length,a.at));return setField(body,a.field,`${text.slice(0,at)}{{ev:${a.ordinal}${a.part==='period'?'.period':''}}}${text.slice(at)}`);
  }
  case 'addOwnerNote':return !validKey(a.key)||body.entries.length>=50||body.entries.some(e=>e.key===a.key)?body:{...body,entries:[...body.entries,{key:a.key,entry_type:'owner_note',body:blank()}]};
  case 'setOwnerNote':return {...review('entry.'+a.key),entries:body.entries.map(e=>e.key===a.key&&e.entry_type==='owner_note'?{...e,body:{...e.body,[a.locale]:a.value}}:e)};
  case 'removeEntry':{
   const provenance={...body.blocks_provenance};delete provenance['entry.'+a.key];
   return {...body,blocks_provenance:provenance,entries:body.entries.filter(e=>e.key!==a.key)};
  }
 }
}
export function unreviewedBlocks(body:DraftBody,locale:'zh'|'en'){
 return Object.entries(body.blocks_provenance).flatMap(([key,state])=>{
  if(state!=='from_thesis')return [];
  const field=key==='title'?'title.'+locale:`entries.${key.slice('entry.'.length)}.body.${locale}`;
  const text=fieldText(body,field);
  return text===null?[]:[{key,field,text}];
 });
}
