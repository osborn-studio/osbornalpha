// First-class expected evidence slots (spec §4.1, §7.2).
import {useLocale,useTranslations} from 'next-intl';
import type {ExpectedSlot} from '@/lib/topics/types';
export function ExpectedSlotRow({slot}:{slot:ExpectedSlot}){
 const t=useTranslations('topics'),locale=useLocale()==='en'?'en':'zh';
 return <div data-expected-slot={slot.key} className="flex flex-wrap items-center gap-2 rounded border border-dashed border-border p-3 text-xs text-text-dim">
  <span>{t('dossier.expectedSlot')}</span><span className="text-text">{slot.label[locale]}</span><span>{t(`reasons.${slot.reason_code}`)}</span><code className="font-mono tabular-nums">{slot.reason_code}</code>
 </div>;
}
