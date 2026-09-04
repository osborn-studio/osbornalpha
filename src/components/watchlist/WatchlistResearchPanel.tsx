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
import { weightedSentiment } from '@/lib/watchlist/research-summary';

type ResearchTab = 'news' | 'reports' | 'perspectives';
type PerspectiveFilter = 'all' | 'bullish' | 'neutral' | 'bearish';

function telemetryTotal(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) : null;
}

function statusTone(status: EvidenceSearchStatus) {
  if (status === 'complete') return 'border-status-good/25 bg-status-good/10 text-status-good';
  if (status === 'partial') return 'border-warn/25 bg-warn/10 text-warn';
  return 'border-status-bad/20 bg-status-bad/10 text-status-bad';
}

export function WatchlistResearchPanel({ ticker, overview }: { ticker: string; overview?: WatchlistOverviewRow }) {
  const t = useTranslations('market.table.drawer.research');
  const [tab, setTab] = useState<ResearchTab>('news');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [perspectiveFilter, setPerspectiveFilter] = useState<PerspectiveFilter>('all');
  const research = useWatchlistResearchBundle(ticker);
  const metas = [research.news?.meta, research.reports?.meta].filter((value) => !!value);
  const status: EvidenceSearchStatus = metas.some((meta) => meta?.status === 'error' || meta?.status === 'unavailable')
    ? (metas.some((meta) => meta?.status === 'complete' || meta?.status === 'partial') ? 'partial' : 'unavailable')
    : metas.some((meta) => meta?.status === 'partial') ? 'partial' : 'complete';
  const providers = [...new Set(metas.flatMap((meta) => meta?.providers ?? []))];
  const fetchedAt = metas.map((meta) => meta?.fetchedAt).filter((value): value is string => !!value).sort().at(-1);
  const warnings = [...new Set(metas.flatMap((meta) => meta?.warnings ?? []))];
  const queryCount = telemetryTotal(metas.map((meta) => meta?.queryCount));
  const resultCount = telemetryTotal(metas.map((meta) => meta?.resultCount));
  const durationMs = telemetryTotal(metas.map((meta) => meta?.durationMs));
  const estimatedCostMicrousd = telemetryTotal(metas.map((meta) => meta?.estimatedCostMicrousd));
  const news = research.news?.items ?? [];
  const reports = research.reports?.items ?? [];
  const sourceOptions = [...new Set([
    ...news.map((item) => item.source),
    ...reports.map((item) => item.broker || item.source),
  ].filter(Boolean))].sort();
  const visibleNews = sourceFilter === 'all' ? news : news.filter((item) => item.source === sourceFilter);
  const visibleReports = sourceFilter === 'all' ? reports : reports.filter((item) => (item.broker || item.source) === sourceFilter);
  const sentiment = weightedSentiment(news);
  const sentimentValues = news
    .map((item) => item.sentiment)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const sentimentCoverage = overview?.research.value?.sentimentCoverageRatio
    ?? (news.length > 0 ? sentimentValues.length / news.length : 0);
  const averageSentiment = sentiment.value != null
    ? sentiment.value
    : overview?.research.value?.averageSentiment ?? null;
  const consensus = research.reports?.consensus ?? null;
  const currentPrice = overview?.market?.value?.quote.price ?? null;
  const targetUpside = consensus?.targetMedian != null && currentPrice != null && currentPrice > 0
    ? ((consensus.targetMedian / currentPrice) - 1) * 100
    : null;
  const stanceCounts = research.perspectives.reduce((counts, item) => {
    counts[item.stance] += 1;
    return counts;
  }, { bullish: 0, neutral: 0, bearish: 0 });
  const averagePerspectiveConfidence = research.perspectives.length > 0
    ? research.perspectives.reduce((sum, item) => sum + item.confidence, 0) / research.perspectives.length
    : null;
  const visiblePerspectives = perspectiveFilter === 'all'
    ? research.perspectives
    : research.perspectives.filter((item) => item.stance === perspectiveFilter);
  const moveResearchTab = (current: ResearchTab, direction: 'next' | 'prev' | 'first' | 'last') => {
    const values: ResearchTab[] = ['news', 'reports', 'perspectives'];
    const index = values.indexOf(current);
    const target = direction === 'first' ? 0
      : direction === 'last' ? values.length - 1
        : (index + (direction === 'next' ? 1 : -1) + values.length) % values.length;
    const next = values[target];
    setTab(next);
    window.requestAnimationFrame(() => document.getElementById(`research-tab-${ticker}-${next}`)?.focus());
  };

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
          const tabId = `research-tab-${ticker}-${value}`;
          const panelId = `research-panel-${ticker}-${value}`;
          return (
            <button key={value} id={tabId} type="button" role="tab" aria-selected={tab === value} aria-controls={panelId} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveResearchTab(value, 'next'); } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveResearchTab(value, 'prev'); } else if (event.key === 'Home') { event.preventDefault(); moveResearchTab(value, 'first'); } else if (event.key === 'End') { event.preventDefault(); moveResearchTab(value, 'last'); } }} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-3 text-xs transition ${tab === value ? 'bg-bg-card font-semibold text-text' : 'text-text-dim hover:text-text'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />{t(`tabs.${value}`)}<span className="font-mono text-[10px] text-text-muted">{count}</span>
            </button>
          );
        })}
      </div>

      {tab !== 'perspectives' && !research.loading && metas.length > 0 && (
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
            {providers.length > 0 && <span>{t('providers', { value: providers.join(', ') })}</span>}
            {fetchedAt && <span>{t('fetchedAt', { value: new Date(fetchedAt).toLocaleString() })}</span>}
            {sourceOptions.length > 1 && <label className="ml-auto inline-flex items-center gap-1.5"><span>{t('sourceFilter')}</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label={t('sourceFilter')} className="h-7 py-1 text-[10px]"><option value="all">{t('allSources')}</option>{sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>}
          </div>
          <details className="mt-2 border-y border-border/70 py-1.5 text-[10px] text-text-muted">
            <summary className="cursor-pointer font-medium text-text-dim">{t('provenance')}</summary>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {queryCount != null && <span>{t('queryCount', { count: queryCount })}</span>}
              {resultCount != null && <span>{t('resultCount', { count: resultCount })}</span>}
              {durationMs != null && <span>{t('duration', { value: durationMs })}</span>}
              {estimatedCostMicrousd != null && <span>{t('estimatedCost', { value: (estimatedCostMicrousd / 1_000_000).toFixed(4) })}</span>}
              {warnings.length > 0 && <span className="text-warn" title={warnings.join(', ')}>{t('warnings', { count: warnings.length })}</span>}
            </div>
          </details>
        </div>
      )}

      {tab !== 'perspectives' && !research.loading && (averageSentiment != null || consensus) && (
        <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4" aria-label={t('decisionSummary')}>
          {averageSentiment != null && <div className="bg-bg-elevated px-3 py-2"><div className="text-[10px] text-text-muted">{t('averageSentiment')}</div><div className={`mt-0.5 text-sm font-semibold tabular-nums ${averageSentiment > 0.1 ? 'text-up' : averageSentiment < -0.1 ? 'text-down' : 'text-text'}`}>{averageSentiment > 0 ? '+' : ''}{(averageSentiment * 100).toFixed(0)}%</div><div className="mt-0.5 text-[9px] text-text-muted">{t('sentimentSample', { count: overview?.research.value?.sentimentSampleSize ?? sentimentValues.length, coverage: Math.round(sentimentCoverage * 100) })}</div></div>}
          {consensus && <div className="bg-bg-elevated px-3 py-2"><div className="text-[10px] text-text-muted">{t('targetMedian')}</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-text">{consensus.targetMedian.toFixed(2)}</div></div>}
          {consensus?.targetMin != null && consensus.targetMax != null && <div className="bg-bg-elevated px-3 py-2"><div className="text-[10px] text-text-muted">{t('targetRange')}</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-text">{consensus.targetMin.toFixed(2)} - {consensus.targetMax.toFixed(2)}</div></div>}
          {targetUpside != null && <div className="bg-bg-elevated px-3 py-2"><div className="text-[10px] text-text-muted">{t('targetUpside')}</div><div className={`mt-0.5 text-sm font-semibold tabular-nums ${targetUpside >= 0 ? 'text-up' : 'text-down'}`}>{targetUpside > 0 ? '+' : ''}{targetUpside.toFixed(1)}%</div></div>}
        </div>
      )}

      {tab !== 'perspectives' && research.loading ? (
        <div className="space-y-2" role="status" aria-label={t('loading')}>{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded bg-bg-elevated" />)}</div>
      ) : tab !== 'perspectives' && research.error ? (
        <div className="border-y border-border py-8 text-center text-xs text-text-muted">{t('unavailable')}</div>
      ) : tab === 'news' ? (
        <div id={`research-panel-${ticker}-news`} role="tabpanel" aria-labelledby={`research-tab-${ticker}-news`} className="divide-y divide-border/70 border-y border-border/70">
          {visibleNews.map((item) => (
            <ExternalLink key={item.id} href={item.url} className="flex items-start gap-3 py-3 text-text hover:no-underline">
              <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</span>{item.snippet && <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-text-dim">{item.snippet}</span>}<span className="mt-1.5 flex flex-wrap gap-x-2 text-[10px] text-text-muted"><span>{item.source}</span>{item.sentiment != null && <span className={item.sentiment > 0 ? 'text-up' : 'text-down'} title={t('sentimentBasis', { value: [...(item.sentimentPositiveMatches ?? []), ...(item.sentimentNegativeMatches ?? [])].join(', ') || t('sentimentUnknown') })}>{t('sentiment', { value: `${item.sentiment > 0 ? '+' : ''}${item.sentiment.toFixed(1)}` })}</span>}<span>{t('trust', { value: Math.round(item.trustScore * 100) })}</span><span title={t('qualityFlags', { value: item.qualityFlags?.join(', ') || '--' })}>{t('quality', { value: Math.round((item.qualityScore ?? item.trustScore) * 100) })}</span>{(item.corroborationCount ?? 1) > 1 && <span className="text-status-info" title={item.corroboratingSources?.map((source) => source.domain).join(', ')}>{t('corroborated', { count: item.corroborationCount ?? 1 })}</span>}{!item.url && <span>{t('metadataOnly')}</span>}{item.publishedAt && <time>{new Date(item.publishedAt).toLocaleDateString()}</time>}</span></span>
              {item.url && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}
            </ExternalLink>
          ))}
          {visibleNews.length === 0 && <div className="py-8 text-center text-xs text-text-muted">{news.length === 0 ? t('emptyNews') : t('noSourceResults')}</div>}
        </div>
      ) : tab === 'reports' ? (
        <div id={`research-panel-${ticker}-reports`} role="tabpanel" aria-labelledby={`research-tab-${ticker}-reports`} className="divide-y divide-border/70 border-y border-border/70">
          {visibleReports.map((item) => {
            const content = <><FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium">{item.title}</span><span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-text-muted"><span>{item.broker || item.source}</span>{item.rating && <span>{item.rating}</span>}{item.ratingNormalized && item.ratingNormalized !== 'unknown' && <span className="rounded border border-border bg-bg-elevated px-1 py-0.5 text-text-dim">{t(`ratingValues.${item.ratingNormalized}`)}</span>}<span>{t('trust', { value: Math.round(item.trustScore * 100) })}</span><span title={t('qualityFlags', { value: item.qualityFlags?.join(', ') || '--' })}>{t('quality', { value: Math.round((item.qualityScore ?? item.trustScore) * 100) })}</span>{(item.corroborationCount ?? 1) > 1 && <span className="text-status-info" title={item.corroboratingSources?.map((source) => source.domain).join(', ')}>{t('corroborated', { count: item.corroborationCount ?? 1 })}</span>}{item.publishedAt && <time>{new Date(item.publishedAt).toLocaleDateString()}</time>}</span></span>{item.url && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}</>;
            return <ExternalLink key={item.id} href={item.url} className="flex items-start gap-3 py-3 text-text">{content}</ExternalLink>;
          })}
          {visibleReports.length === 0 && <div className="py-8 text-center text-xs text-text-muted">{reports.length === 0 ? t('emptyReports') : t('noSourceResults')}</div>}
        </div>
      ) : (
        <div id={`research-panel-${ticker}-perspectives`} role="tabpanel" aria-labelledby={`research-tab-${ticker}-perspectives`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="text-[10px] text-text-muted">
              {research.perspectivesGeneratedAt ? <>
                <span>{t('perspectivesGeneratedAt', { value: new Date(research.perspectivesGeneratedAt).toLocaleString() })}</span>
                {research.perspectiveSource && <span className="ml-2">{t('perspectivesSource', { value: research.perspectiveSource })}</span>}
                {research.perspectiveProvenance && <span className="ml-2" title={research.perspectiveProvenance.evidenceRequestId ?? undefined}>
                  {t('perspectivesProvenance', {
                    model: research.perspectiveProvenance.modelVersion ?? '--',
                    prompt: research.perspectiveProvenance.promptVersion ?? '--',
                    coverage: Math.round(research.perspectiveProvenance.evidenceCoverageRatio * 100),
                    evidence: research.perspectiveProvenance.evidenceResultCount,
                  })}
                </span>}
                {research.perspectiveProvenance && research.perspectiveProvenance.evidenceResultCount === 0 && (
                  <span className="ml-2 text-warn">{t('evidenceUnavailable')}</span>
                )}
              </> : t('perspectivesNotGenerated')}
            </div>
            <button type="button" onClick={() => void research.generatePerspectives()} disabled={research.generating} className="inline-flex h-8 items-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${research.generating ? 'animate-spin' : ''}`} aria-hidden="true" />{research.generating ? t('generatingPerspectives') : t('generatePerspectives')}
            </button>
          </div>
          {research.perspectives.length > 0 && <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4" aria-label={t('perspectiveSummary')}>
            <div className="bg-bg-elevated px-3 py-2"><div className="text-[10px] text-text-muted">{t('bullish')}</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-up">{stanceCounts.bullish}</div></div>
            <div className="bg-bg-elevated px-3 py-2"><div className="text-[10px] text-text-muted">{t('neutral')}</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-warn">{stanceCounts.neutral}</div></div>
            <div className="bg-bg-elevated px-3 py-2"><div className="text-[10px] text-text-muted">{t('bearish')}</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-down">{stanceCounts.bearish}</div></div>
            <div className="bg-bg-elevated px-3 py-2"><div className="text-[10px] text-text-muted">{t('averageConfidence')}</div><div className="mt-0.5 text-sm font-semibold tabular-nums text-text">{averagePerspectiveConfidence?.toFixed(1)}/10</div></div>
          </div>}
          {research.perspectives.length > 0 && <div className="mb-3 flex max-w-full gap-1 overflow-x-auto" role="group" aria-label={t('perspectiveFilter')}>
            {(['all', 'bullish', 'neutral', 'bearish'] as PerspectiveFilter[]).map((value) => {
              const count = value === 'all' ? research.perspectives.length : stanceCounts[value];
              return <button key={value} type="button" aria-pressed={perspectiveFilter === value} onClick={() => setPerspectiveFilter(value)} className={`h-7 shrink-0 rounded border px-2.5 text-[10px] transition ${perspectiveFilter === value ? 'border-accent/40 bg-accent/10 font-semibold text-accent' : 'border-border text-text-dim hover:text-text'}`}>{t(`perspectiveFilters.${value}`)} <span className="font-mono text-text-muted">{count}</span></button>;
            })}
          </div>}
          {research.quota && <QuotaNotice {...research.quota} />}
          {(research.loading || research.generating) && research.perspectives.length === 0 ? (
            <div className="space-y-2" role="status"><div className="h-28 animate-pulse rounded bg-bg-elevated" /><div className="h-28 animate-pulse rounded bg-bg-elevated" /></div>
          ) : research.perspectiveError && research.perspectives.length === 0 ? (
            <div className="py-8 text-center text-xs text-warn">{t('perspectivesUnavailable')}</div>
          ) : research.perspectives.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">{t('emptyPerspectives')}</div>
          ) : visiblePerspectives.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">{t('emptyPerspectiveFilter')}</div>
          ) : <div>{visiblePerspectives.map((item) => <PerspectiveCard key={item.persona} {...item} />)}</div>}
        </div>
      )}
    </section>
  );
}
