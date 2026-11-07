// src/components/industries/SourcesFooter.tsx
// Sources strip at the foot of every industry page (spec §8.2 last line; canvas "Main" footer): the
// primary sources behind the page's numbers, each named with its adapter ("Tushare → 申万宏源研究所").
import {useTranslations} from 'next-intl';
import type {SourceId} from '@/lib/industry/read';

export function SourcesFooter({sources}:{sources:readonly SourceId[]}){
  const t=useTranslations('industries.sources');
  return (
    <footer className="card-base flex flex-wrap items-center gap-2.5 text-xs" aria-label={t('title')}>
      <span className="uppercase tracking-wide text-text-dim">{t('title')}</span>
      {sources.map(s=><span key={s} className="rounded-full border border-border px-2 py-0.5 text-text-dim">{t(s)}</span>)}
    </footer>
  );
}
