'use client';

import { AlertTriangle, Building2, FileSearch, Newspaper, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WatchlistResearchFact, WatchlistResearchSource } from '@/lib/watchlist/research-evidence';
import { watchlistProviderLabel } from '@/lib/watchlist/provider-label';

const FACT_ICONS = {
  market_event: Newspaper,
  filing: FileSearch,
  broker_view: Building2,
};

function metricValue(key: string, value: number): string {
  if (key === 'sentiment') return `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
  if (key === 'targetChangePct') return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  return value.toFixed(2);
}

export function WatchlistResearchFacts({ facts, sources }: {
  facts: WatchlistResearchFact[];
  sources: WatchlistResearchSource[];
}) {
  const t = useTranslations('market.table.drawer.research.facts');
  const providerT = useTranslations('market.table.providers');
  const sourcesById = new Map(sources.map((source) => [source.id, source]));

  if (facts.length === 0) {
    return <div className="border-y border-border/70 py-8 text-center text-xs text-text-muted">{t('empty')}</div>;
  }

  return (
    <div className="divide-y divide-border/70 border-y border-border/70">
      {facts.map((fact) => {
        const Icon = FACT_ICONS[fact.kind];
        const factSources = fact.sourceIds.map((id) => sourcesById.get(id)).filter((source): source is WatchlistResearchSource => !!source);
        const DirectionIcon = fact.direction === 'positive' ? TrendingUp : fact.direction === 'negative' ? TrendingDown : null;
        const directionTone = fact.direction === 'positive' ? 'text-up' : fact.direction === 'negative' ? 'text-down' : 'text-text-muted';
        return (
          <article key={fact.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-bg-elevated text-text-muted">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <h5 className="min-w-0 flex-1 text-sm font-medium leading-snug text-text">{fact.statement}</h5>
                {DirectionIcon && <DirectionIcon className={`mt-0.5 h-4 w-4 shrink-0 ${directionTone}`} aria-label={t(`directions.${fact.direction}`)} />}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-text-muted">
                <span>{t(`kinds.${fact.kind}`)}</span>
                <span>{t('confidence', { value: Math.round(fact.confidence * 100) })}</span>
                {fact.sourceCount > 1 && <span>{t('sourceCount', { count: fact.sourceCount })}</span>}
                {fact.conflicted && <span className="inline-flex items-center gap-1 text-warn"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{t('conflicted')}</span>}
                {fact.observedAt && <time>{new Date(fact.observedAt).toLocaleString()}</time>}
              </div>
              {(factSources.length > 0 || Object.keys(fact.metrics).length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                  {factSources.map((source) => <span key={source.id} className="rounded border border-border px-1.5 py-0.5 text-text-dim">{watchlistProviderLabel(source.publisher, providerT)}</span>)}
                  {Object.entries(fact.metrics).map(([key, value]) => <span key={key} className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-text-dim">{t(`metrics.${key}`)} {metricValue(key, value)}</span>)}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
