'use client';

import { ArrowUpRight, CheckCircle2, CircleAlert, FileSearch, FileText, Newspaper } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink } from '@/components/ExternalLink';
import type { WatchlistResearchQualitySummary, WatchlistResearchSource } from '@/lib/watchlist/research-evidence';
import { watchlistProviderLabel } from '@/lib/watchlist/provider-label';

type SourceFilter = 'all' | WatchlistResearchSource['kind'];
const FILTERS: SourceFilter[] = ['all', 'news', 'filing', 'report'];
const SOURCE_ICONS = { news: Newspaper, filing: FileSearch, report: FileText };

export function WatchlistResearchSources({ sources, quality }: {
  sources: WatchlistResearchSource[];
  quality: WatchlistResearchQualitySummary;
}) {
  const t = useTranslations('market.table.drawer.research.sources');
  const providerT = useTranslations('market.table.providers');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const visible = useMemo(
    () => filter === 'all' ? sources : sources.filter((source) => source.kind === filter),
    [filter, sources],
  );

  return (
    <section aria-label={t('title')}>
      <div className="mb-3 grid grid-cols-2 border-y border-border/70 sm:grid-cols-4">
        <div className="px-2 py-2"><div className="text-[10px] text-text-muted">{t('total')}</div><div className="mt-0.5 font-mono text-sm font-semibold">{quality.totalSources}</div></div>
        <div className="px-2 py-2"><div className="text-[10px] text-text-muted">{t('eligible')}</div><div className="mt-0.5 font-mono text-sm font-semibold text-status-good">{quality.eligibleSources}</div></div>
        <div className="px-2 py-2"><div className="text-[10px] text-text-muted">{t('dated')}</div><div className="mt-0.5 font-mono text-sm font-semibold">{quality.datedSources}</div></div>
        <div className="px-2 py-2"><div className="text-[10px] text-text-muted">{t('averageQuality')}</div><div className="mt-0.5 font-mono text-sm font-semibold">{quality.averageQualityScore == null ? '--' : `${Math.round(quality.averageQualityScore * 100)}%`}</div></div>
      </div>
      {quality.conflictedFacts > 0 && <div className="mb-3 flex items-start gap-2 border-l-2 border-warn bg-warn/5 px-2.5 py-2 text-[11px] text-warn"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t('conflictedFacts', { count: quality.conflictedFacts })}</div>}
      <div className="mb-2 flex max-w-full gap-1 overflow-x-auto" role="group" aria-label={t('filter')}>
        {FILTERS.map((value) => {
          const count = value === 'all' ? sources.length : sources.filter((source) => source.kind === value).length;
          return <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`h-7 shrink-0 rounded px-2 text-[11px] ${filter === value ? 'bg-bg-hover font-semibold text-text' : 'text-text-muted hover:text-text'}`}>{t(`kinds.${value}`)} <span className="tabular-nums">{count}</span></button>;
        })}
      </div>
      {visible.length === 0 ? <div className="border-y border-border/70 py-8 text-center text-xs text-text-muted">{t('empty')}</div> : (
        <div className="divide-y divide-border/70 border-y border-border/70">
          {visible.map((source) => {
            const Icon = SOURCE_ICONS[source.kind];
            const EligibilityIcon = source.eligibleForAnalysis ? CheckCircle2 : CircleAlert;
            const body = (
              <>
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-bg-elevated text-text-muted"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-text">{source.title}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-text-muted"><span>{watchlistProviderLabel(source.publisher, providerT)}</span>{source.publishedAt && <time>{new Date(source.publishedAt).toLocaleString()}</time>}<span>{t('quality', { value: Math.round(source.qualityScore * 100) })}</span>{source.corroborationCount > 1 && <span>{t('corroborated', { count: source.corroborationCount })}</span>}</span>
                  <span className={`mt-1 inline-flex items-center gap-1 text-[11px] ${source.eligibleForAnalysis ? 'text-status-good' : 'text-warn'}`}><EligibilityIcon className="h-3 w-3" aria-hidden="true" />{source.eligibleForAnalysis ? t('included') : t('excluded')}</span>
                </span>
                {source.url && <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}
              </>
            );
            return <ExternalLink key={source.id} href={source.url} className="flex items-start gap-2.5 py-3 text-text hover:no-underline">{body}</ExternalLink>;
          })}
        </div>
      )}
    </section>
  );
}
