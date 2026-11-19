// Public dossier projection for Copilot (spec §11).
import {headers} from 'next/headers';
import {callApi} from '@/lib/agent/data-client';
import type {AgentTool} from '@/lib/agent/tools';
import {renderDossierNote} from '@/components/topics/dossier/dossier-model';
import {catalogById} from '@/lib/macro/catalog';
import {renderFact,type Locale} from '@/lib/macro/strategy/explain-render';
import en from '../../../messages/en/topics.json';
import zh from '../../../messages/zh/topics.json';
import type {DossierDto} from './public-dto';

export async function toToolOutput(dto:DossierDto,sections?:string[],locale:Locale='zh'){
 await import('./summary/templates');
 const selected=dto.sections.filter(s=>!sections||sections.includes(s.key));
 const keys=new Set(selected.map(s=>s.key));
 const rows=dto.evidence.filter(e=>keys.has(e.section_key));
 const visible=new Set(rows.filter(e=>e.state==='ok'&&!e.masked).map(e=>e.ordinal));
 const maskedSlot=(locale==='en'?en:zh).dossier.maskedSlot;
 const note=(text:string)=>renderDossierNote(text,dto.evidence,locale).map(p=>p.text??maskedSlot).join('');
 const evidence=rows.map(e=>{
  const base={ordinal:e.ordinal,kind:e.kind,state:e.state,reason:e.reason,masked:e.masked,drift:e.drift};
  if(!visible.has(e.ordinal)||!e.fact)return base;
  const fact={...e.fact,slots:{...e.fact.slots,...(e.basis?{basis:e.basis}:{})},fact_id:`ev:${e.ordinal}`,kind:'level' as const,source_inputs:[]};
  return {...base,text:renderFact(fact,locale,key=>catalogById(key)?.name??null)};
 });
 const sentences=(items:{text:string;refs:number[]}[])=>items.filter(s=>s.refs.every(n=>visible.has(n))).map(({text,refs})=>({text,refs}));
 const slots=new Set(selected.flatMap(s=>s.items.flatMap(i=>'expected_slot' in i?[i.expected_slot]:[])));
 return {version_no:dto.version.version_no,published_at:dto.version.published_at,evidence,
  sections:selected.map(s=>({key:s.key,title:s.title[locale],note:s.note?note(s.note[locale]):null})),
  expected_slots:dto.expected_slots.filter(s=>slots.has(s.key)).map(s=>({key:s.key,kind:s.kind,label:s.label[locale],reason_code:s.reason_code})),
  owner_notes:sections?[]:dto.entries.flatMap(e=>e.entry_type==='owner_note'?[note(e.body[locale])]:[]),
  summary:dto.summary?{facts:sentences(dto.summary.facts),points:sentences(dto.summary.points),counterpoints:sentences(dto.summary.counterpoints)}:null};
}

export const topicDossierTool:AgentTool={
 name:'topic_dossier',category:'研究',
 description:'读取已发布的公开专题。逐字引用返回的数字，并标注证据序号 ordinal 和版本号。证据缺失、受限或已遮蔽时须明确说明，不得从记忆或其他工具补数。',
 inputSchema:{type:'object',additionalProperties:false,properties:{slug:{type:'string'},version:{type:'integer',minimum:1,maximum:9999},
  asOf:{type:'string',format:'date'},locale:{type:'string',enum:['zh','en']},sections:{type:'array',items:{type:'string'}}},required:['slug','locale']},
 handler:async({slug,version,asOf,locale,sections},{origin})=>{
  if(typeof slug!=='string'||slug.length<3||slug.length>64||!(/^[a-z0-9]+(-[a-z0-9]+)*$/).test(slug)||
   (locale!=='zh'&&locale!=='en')||(version!==undefined&&(!Number.isInteger(version)||version<1||version>9999||asOf!==undefined))||
   (asOf!==undefined&&typeof asOf!=='string')||(sections!==undefined&&(!Array.isArray(sections)||!sections.every(s=>typeof s==='string')))){
   return {unavailable:true,code:'invalid_parameter'};
  }
  const path='/api/topics/'+encodeURIComponent(slug)+(version!==undefined?'/versions/'+version:asOf!==undefined?'?asOf='+encodeURIComponent(asOf):'');
  const cookie=(await headers()).get('cookie');
  const result=await callApi(origin,path,{headers:cookie?{cookie}:{},redirect:'error'});
  if(result.available===false)return {unavailable:true,code:result.status===404?'not_found':result.status?`http_${result.status}`:'unavailable'};
  return toToolOutput(result,sections,locale);
 },
};
