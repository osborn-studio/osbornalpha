// Dossier section composition and owner note slots (spec §7.2, X22).
import {useTranslations} from 'next-intl';
import type {DossierSection} from './dossier-model';
import {EvidenceTable} from './EvidenceTable';
import {ExpectedSlotRow} from './ExpectedSlotRow';
import {JudgmentBlock} from './JudgmentBlock';
export function SectionBlock({section,onOpenSource}:{section:DossierSection;onOpenSource:(ordinal:number)=>void}){
 const t=useTranslations('topics.dossier');
 return <section aria-labelledby={`section-${section.key}`} className="min-w-0 space-y-3">
  <h2 id={`section-${section.key}`} className="text-base font-semibold">{section.title}</h2>
  {section.noteParts.length>0&&<p className="text-sm text-text-dim">{section.noteParts.map((part,i)=>part.type==='text'?<span key={i}>{part.text}</span>:<button key={i} type="button" onClick={()=>onOpenSource(part.ordinal)} className="font-mono tabular-nums text-accent underline underline-offset-4">{part.text??t('maskedSlot')}</button>)}</p>}
  {/* T4.6: chart/table switch mount point. */}
  <EvidenceTable rows={section.rows} onOpenSource={onOpenSource}/>
  {section.slots.map(slot=><ExpectedSlotRow key={slot.key} slot={slot}/>)}
  <div className="space-y-3">{section.judgments.map(e=><JudgmentBlock key={e.ordinal} evidence={e} onOpenSource={onOpenSource}/>)}</div>
 </section>;
}
