// Dossier evidence presentation (spec §4.1, §7.2); suppress values before formatting.
import type {PublicEvidence} from '@/lib/topics/public-dto';
import {formatSlot} from '@/lib/macro/strategy/explain-render';
import {basisBadge,driftBadge,stateBadge,type TopicBadgeModel} from '../badge-model';
import zh from '../../../../messages/zh/topics.json';
import en from '../../../../messages/en/topics.json';
export function evidenceRowModel(e:PublicEvidence,locale:string){
 const lang=locale==='en'?'en':'zh',copy=(lang==='en'?en:zh).dossier;
 const visible=e.state==='ok'&&!e.masked,slot=visible?e.fact?.slots.value:null;
 const valueText=slot&&typeof slot!=='string'?formatSlot(slot,lang):null;
 const label=e.label[lang],period=e.period??'—';
 const qualifiers=visible&&e.kind==='financial_fact'?['concept','duration'].flatMap(key=>{const v=e.fact?.slots[key];return typeof v==='string'?[v]:[];}):[];
 const subject=[label,...qualifiers].join(' · ');
 let factBefore='',factAfter='',factText='—';
 if(e.masked)factText=copy.masked;
 else if(visible&&valueText!==null){
  factBefore=lang==='zh'?`${subject}（${period}）为 `:`${subject} (${period}) was `;
  factAfter=lang==='zh'?'。':'.';factText=factBefore+valueText+factAfter;
 }else if(visible&&e.fact?.template==='topic.citation'){
  const {title,page}=e.fact.slots;
  if(typeof title==='string'&&typeof page==='string')factText=lang==='zh'?`${title} · 第 ${page} 页`:`${title} · page ${page}`;
 }
 const badge:TopicBadgeModel=e.masked?{kind:'ok',atPublication:true,reasonKey:null}:stateBadge(e.state,e.reason);
 const driftDetail=!visible||!e.current?null:e.drift==='revised'?`${copy.currentValue} ${formatSlot(e.current,lang)}`:
  e.drift==='newer_period'?copy.periodPublished.replace('{period}',e.current.period):null;
 return {ordinal:e.ordinal,label,kind:e.kind,factText,factBefore,factAfter,valueText,valueButton:visible&&valueText!==null,
  stateBadge:badge,driftBadge:driftBadge(e.drift),basisBadge:basisBadge(e.basis),driftDetail,
  sourceButton:e.state!=='not_served'&&e.state!=='unsupported',dim:!visible,period,available:visible?(e.available_at??'—'):'—'};
}
