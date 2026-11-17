// src/lib/topics/slots.ts
// Owner text carries numbers only as slots (spec §4.5, D4): {{ev:<ordinal>}} or {{ev:<ordinal>.period}}.
import type {ResolveState} from '@/lib/evidence/resolve';
export const SLOT_RE=/\{\{ev:([1-9]\d{0,3})(\.period)?\}\}/;
const GLOBAL=new RegExp(SLOT_RE.source,'g');
export interface SlotToken{ordinal:number;part:'value'|'period';start:number;end:number;raw:string}
export function parseSlots(text:string):SlotToken[]{
 return [...text.matchAll(GLOBAL)].map(m=>({ordinal:Number(m[1]),part:m[2]?'period':'value',start:m.index!,end:m.index!+m[0].length,raw:m[0]}));
}
export const withoutSlots=(text:string):string=>text.replace(GLOBAL,'');
export type SlotLookup=(ordinal:number)=>{state:ResolveState;text:string|null;period:string|null}|null;
export type SlotPart={type:'text';text:string}|{type:'slot';ordinal:number;part:'value'|'period';state:ResolveState|'dangling';text:string|null};
export function renderSlots(text:string,lookup:SlotLookup):SlotPart[]{
 const out:SlotPart[]=[];let at=0;
 for(const t of parseSlots(text)){
  if(t.start>at)out.push({type:'text',text:text.slice(at,t.start)});
  const e=lookup(t.ordinal);
  out.push(e===null?{type:'slot',ordinal:t.ordinal,part:t.part,state:'dangling',text:null}
   :{type:'slot',ordinal:t.ordinal,part:t.part,state:e.state,text:e.state!=='ok'?null:t.part==='period'?e.period:e.text});
  at=t.end;
 }
 if(at<text.length)out.push({type:'text',text:text.slice(at)});
 return out;
}
