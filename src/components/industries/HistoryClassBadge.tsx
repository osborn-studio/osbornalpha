// src/components/industries/HistoryClassBadge.tsx
// Run-level history class (spec §4.6, owner decision G default "show + badge"): every v1 sw2021 run
// is 'reconstruction' (membership availability is assumed, issuers resolved by today's ownership).
import {useTranslations} from 'next-intl';
import type {HistoryClass} from '@/lib/industry/types';

export function HistoryClassBadge({historyClass}:{historyClass:HistoryClass}){
  const t=useTranslations('industries.historyClass');
  const reconstruction=historyClass==='reconstruction';
  return (
    <span
      data-history-class={historyClass}
      className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-xs ${reconstruction?'border-warn text-warn':'border-border text-text-dim'}`}
    >
      {t(historyClass)}
    </span>
  );
}
