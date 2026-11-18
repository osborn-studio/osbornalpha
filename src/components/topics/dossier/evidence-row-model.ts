// Dossier evidence presentation (spec §4.1, §7.2); suppress values before formatting.
import type {PublicEvidence} from '@/lib/topics/public-dto';
import {formatDossierDate} from './dossier-model';
import {formatTopicSlot} from '../format';
import {basisBadge,driftBadge,stateBadge,type TopicBadgeModel} from '../badge-model';
import zh from '../../../../messages/zh/topics.json';
import en from '../../../../messages/en/topics.json';
export function evidenceRowModel(e:PublicEvidence,locale:string){
 const lang=locale==='en'?'en':'zh',copy=(lang==='en'?en:zh).dossier;
 const visible=e.state==='ok'&&!e.masked,slot=visible?e.fact?.slots.value:null;
 const valueText=slot&&typeof slot!=='string'?formatTopicSlot(slot,lang):null;
 const metric=e.fact?.slots.metric,messages=lang==='en'?en:zh;
 const metricLabel=typeof metric==='string'?(messages.metrics as Record<string,string>)[metric]??metric:null;
 const label=e.kind==='industry_metric'&&metricLabel?`${e.label[lang]} · ${metricLabel}`:e.label[lang],period=e.period??'—';
 const n=e.fact?.slots.n_with_data,total=e.fact?.slots.n_members;
 const coverage=visible&&e.kind==='industry_metric'&&typeof n==='string'&&typeof total==='string'?copy.coverage.replace('{n}',n).replace('{total}',total):null;
 let factBefore='',factAfter='',factText='—';
 if(e.masked)factText=copy.masked;
 else if(visible&&valueText!==null){
  factBefore=lang==='zh'?`${period} 为 `:'';
  factAfter=lang==='zh'?'':` in ${period}`;factText=factBefore+valueText+factAfter;
 }else if(visible&&e.fact?.template==='topic.citation'){
  const {title,page}=e.fact.slots;
  if(typeof title==='string'&&typeof page==='string')factText=lang==='zh'?`${title} · 第 ${page} 页`:`${title} · page ${page}`;
 }
 const badge:TopicBadgeModel=e.masked?{kind:'ok',atPublication:true,reasonKey:null}:stateBadge(e.state,e.reason);
 const driftDetail=!visible||!e.current?null:e.drift==='revised'?`${copy.currentValue} ${formatTopicSlot(e.current,lang)}`:
  e.drift==='newer_period'?copy.periodPublished.replace('{period}',e.current.period):null;
 return {ordinal:e.ordinal,label,coverage,kind:e.kind,factText,factBefore,factAfter,valueText,valueButton:visible&&valueText!==null,
  stateBadge:badge,driftBadge:driftBadge(e.drift),basisBadge:basisBadge(e.basis),driftDetail,
  sourceButton:e.state!=='not_served'&&e.state!=='unsupported',dim:!visible,period,available:visible?(e.available_at?formatDossierDate(e.available_at):'—'):'—'};
}
