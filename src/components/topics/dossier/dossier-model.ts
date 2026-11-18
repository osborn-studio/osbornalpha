// Dossier frame and ordered section model (spec §7.2, X22).
import {seriesModel} from './series-model';
import type {DossierDto} from '@/lib/topics/public-dto';
import type {UnpublishReason} from '@/lib/topics/types';
import {renderSlots} from '@/lib/topics/slots';
import {formatTopicSlot} from '../format';
import zh from '../../../../messages/zh/topics.json';
import en from '../../../../messages/en/topics.json';
export type DossierBannerModel=null|{kind:'superseded';current:number}|{kind:'unpublished';reason:UnpublishReason|null}|{kind:'replay';asOf:string};
export function dossierModel(dto:DossierDto,locale:string){
 const lang=locale==='en'?'en':'zh',messages=lang==='en'?en:zh;
 const banner:DossierBannerModel=dto.version.unpublished_at?{kind:'unpublished',reason:dto.version.unpublish_reason}:
  dto.view==='replay'&&dto.replay_as_of?{kind:'replay',asOf:dto.replay_as_of}:
  dto.view==='version'&&dto.version.superseded&&dto.current_version_no!==null?{kind:'superseded',current:dto.current_version_no}:null;
 const lookup=(ordinal:number)=>{
  const e=dto.evidence.find(e=>e.ordinal===ordinal);if(!e)return null;
  const slot=e.fact?.slots.value,visible=e.state==='ok'&&!e.masked;
  return {state:e.state,text:visible&&slot&&typeof slot!=='string'?formatTopicSlot(slot,lang):null,period:visible?e.period:null};
 };
 return {breadcrumb:[messages.meta.title,messages.directory.categories[dto.topic.category]],title:dto.topic.title[lang],dek:dto.topic.dek[lang],banner,
  sections:banner?.kind==='unpublished'?[]:dto.sections.map(s=>{
   const ordinals=new Set(s.items.flatMap(i=>'ordinal' in i?[i.ordinal]:[]));
   const evidence=dto.evidence.filter(e=>ordinals.has(e.ordinal)&&e.section_key===s.key).sort((a,b)=>a.ordinal-b.ordinal);
   return {key:s.key,title:s.title[lang],noteParts:renderSlots(s.note?.[lang]??'',lookup),rows:evidence.filter(e=>e.kind!=='judgment'),judgments:evidence.filter(e=>e.kind==='judgment'),
    slots:s.items.flatMap(i=>'expected_slot' in i?dto.expected_slots.filter(slot=>slot.key===i.expected_slot):[]),chart:seriesModel(evidence.filter(e=>e.kind!=='judgment'))};
  }),entries:banner?.kind==='unpublished'?[]:dto.entries,footer:{counts:dto.counts,stale:dto.stale,freshness:dto.freshness_at_publication}};
}
export type DossierSection=ReturnType<typeof dossierModel>['sections'][number];

// UTC display shared by evidence availability, version metadata and judgments.
export function formatDossierDate(value:string):string{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return value;
 const iso=date.toISOString();
 return iso.slice(11)==='00:00:00.000Z'?iso.slice(0,10):`${iso.slice(0,16).replace('T',' ')} UTC`;
}
