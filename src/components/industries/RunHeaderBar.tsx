// src/components/industries/RunHeaderBar.tsx
// Run header of the list and detail pages (spec §8.2 first line; canvas "Main"): facts as of, the
// run's activation time and generation, freshness, method version, the history-class badge.
import {useTranslations} from 'next-intl';
import type {FreshnessStatus} from '@/lib/dq/freshness';
import type {RunHeader} from '@/lib/industry/read';
import {FreshnessChip} from './FreshnessChip';
import {HistoryClassBadge} from './HistoryClassBadge';

export function RunHeaderBar({header,freshness,extra}:{header:RunHeader|null;freshness:FreshnessStatus;extra?:string}){
  const t=useTranslations('industries.header');
  return (
    <div className="card-base flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-dim" style={{marginBottom:0}}>
      {header&&<span className="inline-flex items-center gap-1.5"><span className="uppercase tracking-wide">{t('factsAsOf')}</span><span className="font-mono tabular-nums text-text">{header.factsAsOf}</span></span>}
      {header&&<span className="inline-flex items-center gap-1.5"><span className="uppercase tracking-wide">{t('run')}</span><span className="font-mono tabular-nums text-text">{(header.activatedAt??'').replace('T',' ').slice(0,16)}</span><span className="font-mono">{t('generation',{n:header.generation})}</span></span>}
      <FreshnessChip status={freshness} />
      {header&&<span className="inline-flex items-center gap-1.5"><span className="uppercase tracking-wide">{t('method')}</span><span className="font-mono text-accent">{header.methodVersion}</span></span>}
      {header&&<HistoryClassBadge historyClass={header.historyClass} />}
      {extra&&<span className="ml-auto">{extra}</span>}
    </div>
  );
}
