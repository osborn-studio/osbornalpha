'use client';

import { Globe2, Layers3, Network } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DataEnvelope } from '@/lib/watchlist/overview-contract';
import type { WatchlistComposition } from '@/lib/watchlist/composition';
import { WatchlistDataStatus } from './WatchlistDataStatus';

function leading(values: WatchlistComposition['markets']) {
  return [...values].sort((left, right) => right.sharePct - left.sharePct)[0] ?? null;
}

export function WatchlistCompositionStrip({ envelope }: { envelope?: DataEnvelope<WatchlistComposition> | null }) {
  const t = useTranslations('market.table.composition');
  const value = envelope?.value;
  if (!value) return null;
  const market = leading(value.markets);
  const industry = leading(value.industries);
  return (
    <section className="border-b border-border bg-bg-elevated/35" aria-label={t('label')}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold text-text-dim">{t('label')}</h3>
          <p className="text-[10px] text-text-muted">{t('scopeAll', { count: value.totalSecurities })}</p>
        </div>
        <WatchlistDataStatus label={t('dataStatus')} envelope={envelope} />
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x sm:divide-border">
        <div className="flex min-w-0 items-center gap-2.5 px-4 py-2.5">
          <Globe2 className="h-4 w-4 shrink-0 text-status-info" aria-hidden="true" />
          <div className="min-w-0"><div className="text-[10px] text-text-muted">{t('largestMarket')}</div><div className="truncate text-xs font-semibold text-text">{market ? `${market.key} · ${market.sharePct.toFixed(0)}%` : '--'}</div></div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 px-4 py-2.5">
          <Layers3 className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0"><div className="text-[10px] text-text-muted">{t('largestIndustry')}</div><div className="truncate text-xs font-semibold text-text" title={industry?.key}>{industry ? `${industry.key} · ${industry.sharePct.toFixed(0)}%` : '--'}</div></div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 px-4 py-2.5">
          <Network className={`h-4 w-4 shrink-0 ${value.highCorrelationCount > 0 ? 'text-status-bad' : 'text-status-good'}`} aria-hidden="true" />
          <div className="min-w-0"><div className="text-[10px] text-text-muted">{t('correlation')}</div><div className="truncate text-xs font-semibold text-text">{value.correlations.length > 0 ? t('highPairs', { count: value.highCorrelationCount, total: value.correlations.length }) : t('pending')}</div></div>
        </div>
      </div>
    </section>
  );
}
