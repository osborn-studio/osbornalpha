// Owner entries use evidence slots (spec §7.2, §4.5).
import {useLocale,useTranslations} from 'next-intl';
import {excerptLines} from './entry-model';
import {httpsUrl} from '@/lib/topics/excerpts';
import {renderSlots} from '@/lib/topics/slots';
import {formatTopicSlot} from '../format';
import type {DossierDto} from '@/lib/topics/public-dto';
export function EntriesBlock({dto,onOpenSource}:{dto:DossierDto;onOpenSource:(ordinal:number)=>void}){
 const lang=useLocale()==='en'?'en':'zh',t=useTranslations('topics');
 return <div className="min-w-0 space-y-3">{dto.entries.map(entry=>entry.entry_type==='licensed_excerpt'?
 <article key={entry.key} className={`space-y-2 break-words rounded border border-border p-4 ${'masked' in entry?'border-dashed':''}`}>
  <h2 className="text-sm font-medium">{t('excerpt.'+('masked' in entry?'masked':'caption'))}</h2>
  {'masked' in entry&&<p className="text-sm text-text-dim">{t('excerpt.reason')}</p>}
  {excerptLines(entry).map((line,i)=><div key={i}>{line.text!==null&&<blockquote className="font-mono tabular-nums">“{line.text}”</blockquote>}
   <p className="text-xs text-text-dim">— {line.attribution}{line.date&&<> · <time className="font-mono tabular-nums">{line.date}</time></>}{httpsUrl(line.url)&&<> · <a href={line.url} className="text-accent underline">{t('excerpt.link')}</a></>}</p>
  </div>)}
  {!('masked' in entry)&&<p className="text-xs text-text-muted">{t('excerpt.note')}</p>}
 </article>:<article key={entry.key} className="rounded border border-border p-4 space-y-2 break-words">
  <h2 className="text-sm font-medium">{t('footer.ownerNote')}</h2>
  <p className="text-sm text-text-dim whitespace-pre-wrap">{renderSlots(entry.body[lang],ordinal=>{
   const e=dto.evidence.find(e=>e.ordinal===ordinal);if(!e)return null;
   const value=e.state==='ok'&&!e.masked?e.fact?.slots.value:null;
   return {state:e.state,text:value&&typeof value!=='string'?formatTopicSlot(value,lang):null,period:e.state==='ok'&&!e.masked?e.period:null};
  }).map((part,i)=>part.type==='text'?<span key={i}>{part.text}</span>:<button key={i} type="button" className="min-h-[44px] font-mono tabular-nums text-accent" onClick={()=>onOpenSource(part.ordinal)}>{part.text??t('dossier.maskedSlot')}</button>)}</p>
 </article>)}</div>;
}
