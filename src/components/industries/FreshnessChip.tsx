// src/components/industries/FreshnessChip.tsx
// Freshness of the dataset behind the page (spec §8.2 header; canvas "Entry" components): a dot and a
// label. Brass = fresh, amber = stale, danger = error, dim = no record. Not red/green: freshness is an
// operational state, not a market signal.
import {useTranslations} from 'next-intl';
import type {FreshnessStatus} from '@/lib/dq/freshness';

const DOT:Record<FreshnessStatus,string>={fresh:'bg-accent',stale:'bg-warn',error:'bg-danger',missing:'bg-text-dim'};
const TEXT:Record<FreshnessStatus,string>={fresh:'text-text-dim',stale:'text-warn',error:'text-danger',missing:'text-text-dim'};

export function FreshnessChip({status}:{status:FreshnessStatus}){
  const t=useTranslations('industries.freshness');
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs ${TEXT[status]}`} data-freshness={status}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {t(status)}
    </span>
  );
}
