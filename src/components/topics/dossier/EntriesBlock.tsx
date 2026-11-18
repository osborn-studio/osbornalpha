// Owner entries use evidence slots (spec §7.2, §4.5).
import {useLocale,useTranslations} from 'next-intl';
import {renderSlots} from '@/lib/topics/slots';
import {formatSlot} from '@/lib/macro/strategy/explain-render';
import type {DossierDto} from '@/lib/topics/public-dto';
export function EntriesBlock({dto,onOpenSource}:{dto:DossierDto;onOpenSource:(ordinal:number)=>void}){
 const lang=useLocale()==='en'?'en':'zh',t=useTranslations('topics');
 return <div className="min-w-0 space-y-3">{dto.entries.flatMap(entry=>entry.entry_type!=='owner_note'?[]:[<article key={entry.key} className="rounded border border-border p-4 space-y-2 break-words">
  <h2 className="text-sm font-medium">{t('footer.ownerNote')}</h2>
  <p className="text-sm text-text-dim whitespace-pre-wrap">{renderSlots(entry.body[lang],ordinal=>{
   const e=dto.evidence.find(e=>e.ordinal===ordinal);if(!e)return null;
   const value=e.state==='ok'&&!e.masked?e.fact?.slots.value:null;
   return {state:e.state,text:value&&typeof value!=='string'?formatSlot(value,lang):null,period:e.state==='ok'&&!e.masked?e.period:null};
  }).map((part,i)=>part.type==='text'?<span key={i}>{part.text}</span>:<button key={i} type="button" className="min-h-[44px] font-mono tabular-nums text-accent" onClick={()=>onOpenSource(part.ordinal)}>{part.text??t('dossier.maskedSlot')}</button>)}</p>
 </article>])}</div>;
}
