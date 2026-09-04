'use client';

import { ArrowUpRight, FileText, Newspaper, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PerspectiveCard } from '@/components/PerspectiveCard';
import { QuotaNotice } from '@/components/QuotaNotice';
import { useWatchlistResearchBundle } from '@/lib/hooks/useWatchlistResearchBundle';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import type { EvidenceSearchStatus } from '@/lib/external-evidence/types';
import { ExternalLink } from '@/components/ExternalLink';

type ResearchTab = 'news' | 'reports' | 'perspectives';

function statusTone(status: EvidenceSearchStatus) {
  if (status === 'complete') return 'border-up/20 bg-up/10 text-up';
  if (status === 'partial') return 'border-warn/25 bg-warn/10 text-warn';
  return 'border-down/20 bg-down/10 text-down';
}

export function WatchlistResearchPanel({ ticker, overview }: { ticker: string; overview?: WatchlistOverviewRow }) {
  const t = useTranslations('market.table.drawer.research');
  const [tab, setTab] = useState<ResearchTab>('news');
  const research = useWatchlistResearchBundle(ticker);
  const metas = [research.news?.meta, research.reports?.meta].filter((value) => !!value);
  const status: EvidenceSearchStatus = metas.some((meta) => meta?.status === 'error' || meta?.status === 'unavailable')
    ? (metas.some((meta) => meta?.status === 'complete' || meta?.status === 'partial') ? 'partial' : 'unavailable')
    : metas.some((meta) => meta?.status === 'partial') ? 'partial' : 'complete';
  const providers = [...new Set(metas.flatMap((meta) => meta?.providers ?? []))];
  const fetchedAt = metas.map((meta) => meta?.fetchedAt).filter((value): value is string => !!value).sort().at(-1);
  const warnings = [...new Set(metas.flatMap((meta) => meta?.warnings ?? []))];
  const news = research.news?.items ?? [];
  const reports = research.reports?.items ?? [];

  return (
    <section aria-label={t('title')}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text">{t('title')}</h3>
          {overview?.research.value && <p className="mt-1 text-[11px] text-text-muted">{t('summary', { news: overview.research.value.recentNewsCount, reports: reports.length })}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!research.loading && metas.length > 0 && <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${statusTone(status)}`}>{t(`status.${status}`)}</span>}
          <button type="button" onClick={() => void research.refresh()} disabled={research.loading || research.refreshing} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('refresh')} title={t('refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${research.refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mb-4 inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-bg-elevated p-0.5" role="tablist" aria-label={t('tabs.label')}>
        {(['news', 'reports', 'perspectives'] as const).map((value) => {
          const Icon = value === 'news' ? Newspaper : value === 'reports' ? FileText : Sparkles;
          const count = value === 'news' ? news.length : value === 'reports' ? reports.length : research.perspectives.length;
          return (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-3 text-xs transition ${tab === value ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-dim hover:text-text'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{t(`tabs.${value}`)}<span className="font-mono text-[10px] text-text-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {tab !== 'perspectives' && !research.loading && metas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
          {providers.length > 0 && <span>{t('providers', { value: providers.join(', ') })}</span>}
          {fetchedAt && <span>{t('fetchedAt', { value: new Date(fetchedAt).toLocaleString() })}</span>}
          {warnings.length > 0 && <span className="text-warn" title={warnings.join(', ')}>{t('warnings', { count: warnings.length })}</span>}
        </div>
      )}

      {tab !== 'perspectives' && research.loading ? (
        <div className="space-y-2" role="status" aria-label={t('loading')}>{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded bg-bg-elevated" />)}</div>
      ) : tab !== 'perspectives' && research.error ? (
        <div className="border-y border-border py-8 text-center text-xs text-text-muted">{t('unavailable')}</div>
      ) : tab === 'news' ? (
        <div className="divide-y divide-border/70 border-y border-border/70">
          {news.map((item) => (
            <ExternalLink key={item.id} href={item.url} className="flex items-start gap-3 py-3 text-text hover:no-underline">
              <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</span>{item.snippet && <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-text-dim">{item.snippet}</span>}<span className="mt-1.5 flex flex-wrap gap-x-2 text-[10px] text-text-muted"><span>{item.source}</span><span>{t('trust', { value: Math.round(item.trustScore * 100) })}</span><span title={t('qualityFlags', { value: item.qualityFlags?.join(', ') || '--' })}>{t('quality', { value: Math.round((item.qualityScore ?? item.trustScore) * 100) })}</span>{item.publishedAt && <time>{new Date(item.publishedAt).toLocaleDateString()}</time>}</span></span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
            </ExternalLink>
          ))}
          {news.length === 0 && <div className="py-8 text-center text-xs text-text-muted">{t('emptyNews')}</div>}
        </div>
      ) : tab === 'reports' ? (
        <div className="divide-y divide-border/70 border-y border-border/70">
          {reports.map((item) => {
            const content = <><FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium">{item.title}</span><span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-text-muted"><span>{item.broker || item.source}</span>{item.rating && <span>{item.rating}</span>}<span>{t('trust', { value: Math.round(item.trustScore * 100) })}</span><span title={t('qualityFlags', { value: item.qualityFlags?.join(', ') || '--' })}>{t('quality', { value: Math.round((item.qualityScore ?? item.trustScore) * 100) })}</span>{item.publishedAt && <time>{new Date(item.publishedAt).toLocaleDateString()}</time>}</span></span>{item.url && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}</>;
            return <ExternalLink key={item.id} href={item.url} className="flex items-start gap-3 py-3 text-text">{content}</ExternalLink>;
          })}
          {reports.length === 0 && <div className="py-8 text-center text-xs text-text-muted">{t('emptyReports')}</div>}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="text-[10px] text-text-muted">{research.perspectivesGeneratedAt ? t('perspectivesGeneratedAt', { value: new Date(research.perspectivesGeneratedAt).toLocaleString() }) : t('perspectivesNotGenerated')}</div>
            <button type="button" onClick={() => void research.generatePerspectives()} disabled={research.generating} className="inline-flex h-8 items-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${research.generating ? 'animate-spin' : ''}`} aria-hidden="true" />{research.generating ? t('generatingPerspectives') : t('generatePerspectives')}
            </button>
          </div>
          {research.quota && <QuotaNotice {...research.quota} />}
          {(research.loading || research.generating) && research.perspectives.length === 0 ? (
            <div className="space-y-2" role="status"><div className="h-28 animate-pulse rounded bg-bg-elevated" /><div className="h-28 animate-pulse rounded bg-bg-elevated" /></div>
          ) : research.perspectiveError && research.perspectives.length === 0 ? (
            <div className="py-8 text-center text-xs text-warn">{t('perspectivesUnavailable')}</div>
          ) : research.perspectives.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">{t('emptyPerspectives')}</div>
          ) : <div>{research.perspectives.map((item) => <PerspectiveCard key={item.persona} {...item} />)}</div>}
        </div>
      )}
    </section>
  );
}
