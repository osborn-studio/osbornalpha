'use client';

import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCheck,
  FileSearch,
  FileText,
  Newspaper,
  NotebookPen,
  RefreshCw,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink } from '@/components/ExternalLink';
import { PerspectiveCard } from '@/components/PerspectiveCard';
import { QuotaNotice } from '@/components/QuotaNotice';
import { PerspectiveFeedbackControls } from './PerspectiveFeedbackControls';
import { useWatchlistResearchBundle } from '@/lib/hooks/useWatchlistResearchBundle';
import type { EvidenceSearchStatus } from '@/lib/external-evidence/types';
import type { PerspectiveAnalysisRequestMode } from '@/lib/stocks/perspective-analysis';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import type { WatchlistResearchTimelineKind } from '@/lib/watchlist/research-timeline';
import { weightedSentiment } from '@/lib/watchlist/research-summary';

type TimelineFilter = 'all' | WatchlistResearchTimelineKind;
type PerspectiveFilter = 'all' | 'bullish' | 'neutral' | 'bearish';
type TimelineRange = '7d' | '30d' | 'all';
type ResearchSection = 'timeline' | 'perspectives';

const FILTERS: TimelineFilter[] = ['all', 'news', 'filing', 'report', 'perspective', 'calendar', 'decision', 'alert'];
const TIMELINE_ICONS: Record<WatchlistResearchTimelineKind, LucideIcon> = {
  news: Newspaper,
  filing: FileSearch,
  report: FileText,
  perspective: Sparkles,
  calendar: CalendarDays,
  decision: NotebookPen,
  alert: Bell,
};

function telemetryTotal(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) : null;
}

function statusTone(status: EvidenceSearchStatus) {
  if (status === 'complete') return 'border-status-good/25 bg-status-good/10 text-status-good';
  if (status === 'partial') return 'border-warn/25 bg-warn/10 text-warn';
  return 'border-status-bad/20 bg-status-bad/10 text-status-bad';
}

const PERSPECTIVE_ERROR_KEYS = new Set([
  'external_evidence_required',
  'external_evidence_rate_limited',
  'external_evidence_quota_unavailable',
  'budget_unavailable',
  'pricing_unavailable',
  'usage_audit_unavailable',
  'usage_audit_invariant',
]);

function perspectiveErrorKey(code: string | null): string {
  return code && PERSPECTIVE_ERROR_KEYS.has(code) ? code : 'perspectives_unavailable';
}

function InsightMetric({ label, value, detail, tone = 'text-text' }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className="min-w-0 border-r border-border/70 px-3 py-2.5 last:border-r-0">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className={`mt-0.5 truncate text-base font-semibold tabular-nums ${tone}`}>{value}</div>
      {detail && <div className="mt-0.5 truncate text-[11px] text-text-muted" title={detail}>{detail}</div>}
    </div>
  );
}

export function WatchlistResearchPanel({ ticker, overview }: { ticker: string; overview?: WatchlistOverviewRow }) {
  const t = useTranslations('market.table.drawer.research');
  const [section, setSection] = useState<ResearchSection>('timeline');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [perspectiveFilter, setPerspectiveFilter] = useState<PerspectiveFilter>('all');
  const [analysisMode, setAnalysisMode] = useState<PerspectiveAnalysisRequestMode>('auto');
  const [timelineQuery, setTimelineQuery] = useState('');
  const [timelineRange, setTimelineRange] = useState<TimelineRange>('30d');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [timelineLimit, setTimelineLimit] = useState(25);
  const research = useWatchlistResearchBundle(ticker);
  useEffect(() => {
    setSection('timeline');
    setTimelineQuery('');
    setTimelineRange('30d');
    setUnreadOnly(false);
    setTimelineLimit(25);
  }, [ticker]);
  const metas = [research.news?.meta, research.reports?.meta].filter((value) => !!value);
  const status: EvidenceSearchStatus = metas.some((meta) => meta?.status === 'error' || meta?.status === 'unavailable')
    ? (metas.some((meta) => meta?.status === 'complete' || meta?.status === 'partial') ? 'partial' : 'unavailable')
    : metas.some((meta) => meta?.status === 'partial') ? 'partial' : 'complete';
  const providers = [...new Set(metas.flatMap((meta) => meta?.providers ?? []))];
  const fetchedAt = metas.map((meta) => meta?.fetchedAt).filter((value): value is string => !!value).sort().at(-1);
  const warnings = [...new Set([
    ...metas.flatMap((meta) => meta?.warnings ?? []),
    ...(research.activity?.warnings ?? []),
  ])];
  const queryCount = telemetryTotal(metas.map((meta) => meta?.queryCount));
  const resultCount = telemetryTotal(metas.map((meta) => meta?.resultCount));
  const durationMs = telemetryTotal(metas.map((meta) => meta?.durationMs));
  const estimatedCostMicrousd = telemetryTotal(metas.map((meta) => meta?.estimatedCostMicrousd));
  const news = research.news?.items ?? [];
  const reports = research.reports?.items ?? [];
  const sentiment = weightedSentiment(news);
  const sentimentValues = news.map((item) => item.sentiment)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const sentimentCoverage = overview?.research.value?.sentimentCoverageRatio
    ?? (news.length > 0 ? sentimentValues.length / news.length : 0);
  const averageSentiment = sentiment.value ?? overview?.research.value?.averageSentiment ?? null;
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
  const stance = stanceCounts.bullish > stanceCounts.bearish ? 'bullish'
    : stanceCounts.bearish > stanceCounts.bullish ? 'bearish' : 'neutral';
  const visiblePerspectives = perspectiveFilter === 'all'
    ? research.perspectives
    : research.perspectives.filter((item) => item.stance === perspectiveFilter);
  const filteredTimeline = useMemo(() => {
    const query = timelineQuery.trim().toLocaleLowerCase();
    const cutoff = timelineRange === 'all' ? null : Date.now() - Number.parseInt(timelineRange, 10) * 24 * 60 * 60_000;
    return research.timeline.filter((item) => {
      if (timelineFilter !== 'all' && item.kind !== timelineFilter) return false;
      if (query && !`${item.title} ${item.source} ${item.detail ?? ''}`.toLocaleLowerCase().includes(query)) return false;
      if (cutoff != null && item.at && new Date(item.at).getTime() < cutoff) return false;
      const unseenByActivity = !!item.at && !!research.activity?.lastSeenAt && item.at > research.activity.lastSeenAt;
      if (unreadOnly && item.read !== false && !unseenByActivity) return false;
      return true;
    });
  }, [research.activity?.lastSeenAt, research.timeline, timelineFilter, timelineQuery, timelineRange, unreadOnly]);
  const visibleTimeline = filteredTimeline.slice(0, timelineLimit);
  useEffect(() => setTimelineLimit(25), [timelineFilter, timelineQuery, timelineRange, unreadOnly]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((filter) => [
    filter,
    filter === 'all' ? research.timeline.length : research.timeline.filter((item) => item.kind === filter).length,
  ])), [research.timeline]);

  return (
    <section aria-label={t('title')}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text">{t('title')}</h3>
            {!research.loading && metas.length > 0 && <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${statusTone(status)}`}>{t(`status.${status}`)}</span>}
            {(research.activity?.unseenCount ?? 0) > 0 && <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">{t('unseen', { count: research.activity!.unseenCount })}</span>}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">{t('summary', { news: overview?.research.value?.recentNewsCount ?? news.length, reports: reports.length })}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {(research.activity?.unseenCount ?? 0) > 0 && <button type="button" onClick={() => void research.markActivitySeen()} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('markSeen')} title={t('markSeen')}><CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /></button>}
          <button type="button" onClick={() => void research.refresh()} disabled={research.loading || research.refreshing} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('refresh')} title={t('refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${research.refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {research.changes?.hasChanges && (
        <div className="mb-3 flex items-start gap-2 border-l-2 border-status-info bg-status-info/5 px-3 py-2 text-[11px] text-text-dim" role="status">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-info" aria-hidden="true" />
          <span>{t('changes', { news: research.changes.newNews, reports: research.changes.newReports, ratings: research.changes.ratingChanges.length })}{research.changes.perspectivesChanged ? ` · ${t('perspectivesChanged')}` : ''}</span>
        </div>
      )}

      {!research.loading && (
        <div className="mb-4 grid grid-cols-2 overflow-hidden border-y border-border/70 sm:grid-cols-4" aria-label={t('decisionSummary')}>
          <InsightMetric label={t('averageSentiment')} value={averageSentiment == null ? '--' : `${averageSentiment > 0 ? '+' : ''}${(averageSentiment * 100).toFixed(0)}%`} detail={t('sentimentSample', { count: overview?.research.value?.sentimentSampleSize ?? sentimentValues.length, coverage: Math.round(sentimentCoverage * 100) })} tone={averageSentiment == null ? 'text-text-muted' : averageSentiment > 0.1 ? 'text-up' : averageSentiment < -0.1 ? 'text-down' : 'text-text'} />
          <InsightMetric label={t('targetUpside')} value={targetUpside == null ? '--' : `${targetUpside > 0 ? '+' : ''}${targetUpside.toFixed(1)}%`} detail={consensus ? t('targetMedianValue', { value: consensus.targetMedian.toFixed(2), count: consensus.count }) : undefined} tone={targetUpside == null ? 'text-text-muted' : targetUpside >= 0 ? 'text-up' : 'text-down'} />
          <InsightMetric label={t('committeeStance')} value={research.perspectives.length > 0 ? t(`perspectiveFilters.${stance}`) : '--'} detail={research.perspectives.length > 0 ? t('stanceSplit', stanceCounts) : undefined} tone={stance === 'bullish' ? 'text-up' : stance === 'bearish' ? 'text-down' : 'text-warn'} />
          <InsightMetric label={t('evidenceCoverage')} value={research.perspectiveProvenance ? `${Math.round(research.perspectiveProvenance.evidenceCoverageRatio * 100)}%` : '--'} detail={research.perspectiveProvenance ? t('evidenceItems', { count: research.perspectiveProvenance.evidenceResultCount }) : undefined} />
        </div>
      )}

      {!research.loading && metas.length > 0 && (
        <details className="mb-4 border-b border-border/70 pb-2 text-[11px] text-text-muted">
          <summary className="cursor-pointer font-medium text-text-dim">{t('provenance')}</summary>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {providers.length > 0 && <span>{t('providers', { value: providers.join(', ') })}</span>}
            {fetchedAt && <span>{t('fetchedAt', { value: new Date(fetchedAt).toLocaleString() })}</span>}
            {queryCount != null && <span>{t('queryCount', { count: queryCount })}</span>}
            {resultCount != null && <span>{t('resultCount', { count: resultCount })}</span>}
            {durationMs != null && <span>{t('duration', { value: durationMs })}</span>}
            {estimatedCostMicrousd != null && <span>{t('estimatedCost', { value: (estimatedCostMicrousd / 1_000_000).toFixed(4) })}</span>}
            {warnings.length > 0 && <span className="text-warn" title={warnings.join(', ')}>{t('warnings', { count: warnings.length })}</span>}
          </div>
        </details>
      )}

      <div className="mb-4 grid grid-cols-2 rounded-md border border-border bg-bg-elevated p-0.5" role="tablist" aria-label={t('title')}>
        <button type="button" role="tab" aria-selected={section === 'timeline'} onClick={() => setSection('timeline')} className={`flex h-8 items-center justify-center gap-2 rounded border text-xs font-medium transition ${section === 'timeline' ? 'border-accent/30 bg-accent-wash text-accent' : 'border-transparent text-text-muted hover:text-text'}`}>
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />{t('timeline.title')}<span className="tabular-nums text-text-muted">{research.timeline.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={section === 'perspectives'} onClick={() => setSection('perspectives')} className={`flex h-8 items-center justify-center gap-2 rounded border text-xs font-medium transition ${section === 'perspectives' ? 'border-accent/30 bg-accent-wash text-accent' : 'border-transparent text-text-muted hover:text-text'}`}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{t('aiSection')}<span className="tabular-nums text-text-muted">{research.perspectives.length}</span>
        </button>
      </div>

      {section === 'timeline' && <section role="tabpanel" aria-label={t('timeline.title')}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold text-text">{t('timeline.title')}</h4>
          <span className="text-[11px] text-text-muted">{t('timeline.count', { count: visibleTimeline.length })}</span>
        </div>
        <div className="mb-2 flex max-w-full gap-1 overflow-x-auto pb-1" role="group" aria-label={t('timeline.filter')}>
          {FILTERS.map((filter) => <button key={filter} type="button" aria-pressed={timelineFilter === filter} onClick={() => setTimelineFilter(filter)} className={`h-7 shrink-0 rounded px-2 text-[11px] ${timelineFilter === filter ? 'bg-bg-hover font-semibold text-text' : 'text-text-muted hover:text-text'}`}>{t(`timeline.kinds.${filter}`)} <span className="tabular-nums">{counts[filter] ?? 0}</span></button>)}
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="relative"><span className="sr-only">{t('timeline.search')}</span><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" /><input value={timelineQuery} onChange={(event) => setTimelineQuery(event.target.value)} placeholder={t('timeline.search')} className="h-8 w-full pl-8 text-xs" /></label>
          <select value={timelineRange} onChange={(event) => setTimelineRange(event.target.value as TimelineRange)} aria-label={t('timeline.range')} className="h-8 text-xs"><option value="7d">{t('timeline.ranges.7d')}</option><option value="30d">{t('timeline.ranges.30d')}</option><option value="all">{t('timeline.ranges.all')}</option></select>
          <label className="inline-flex h-8 items-center gap-2 rounded border border-border px-2.5 text-[11px] text-text-dim"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />{t('timeline.unreadOnly')}</label>
        </div>
        {research.loading ? <div className="space-y-2" role="status" aria-label={t('loading')}>{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse bg-bg-elevated" />)}</div>
          : research.error ? <div className="border-y border-border py-8 text-center text-xs text-text-muted"><p>{t('unavailable')}</p><button type="button" onClick={() => void research.refresh()} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded border border-border px-3 text-text-dim hover:text-text"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{t('retry')}</button></div>
            : visibleTimeline.length === 0 ? <div className="border-y border-border py-8 text-center text-xs text-text-muted"><p>{t('timeline.empty')}</p>{(timelineFilter !== 'all' || timelineQuery || timelineRange !== 'all' || unreadOnly) && <button type="button" onClick={() => { setTimelineFilter('all'); setTimelineQuery(''); setTimelineRange('all'); setUnreadOnly(false); }} className="mt-3 h-8 rounded border border-border px-3 text-text-dim hover:text-text">{t('timeline.clearFilters')}</button>}</div>
              : <><div className="divide-y divide-border/70 border-y border-border/70">{visibleTimeline.map((item) => {
                const Icon = TIMELINE_ICONS[item.kind];
                const body = <><span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-bg-elevated ${item.read === false ? 'text-accent' : 'text-text-muted'}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium leading-snug text-text">{item.title}</span><span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-text-muted"><span>{t(`timeline.kinds.${item.kind}`)}</span><span>{item.source}</span>{item.stance && <span>{t(`perspectiveFilters.${item.stance}`)}</span>}{item.confidence != null && <span>{t('timeline.confidence', { value: item.confidence.toFixed(1) })}</span>}{item.at && <time>{new Date(item.at).toLocaleString()}</time>}</span>{item.detail && <span className="mt-1 line-clamp-2 block text-[11px] text-text-dim">{item.detail}</span>}</span>{item.url && <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}</>;
                return <ExternalLink key={item.id} href={item.url} className="flex items-start gap-2.5 py-3 text-text hover:no-underline">{body}</ExternalLink>;
              })}</div>{visibleTimeline.length < filteredTimeline.length && <button type="button" onClick={() => setTimelineLimit((current) => current + 25)} className="mt-2 h-8 w-full rounded border border-border text-xs text-text-dim hover:text-text">{t('timeline.loadMore', { count: filteredTimeline.length - visibleTimeline.length })}</button>}</>}
      </section>}

      {section === 'perspectives' && <section role="tabpanel" aria-label={t('aiSection')}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
          <div className="text-[11px] text-text-muted">
            {research.perspectivesGeneratedAt ? <>{t('perspectivesGeneratedAt', { value: new Date(research.perspectivesGeneratedAt).toLocaleString() })}{research.perspectiveSource && <span className="ml-2">{t('perspectivesSource', { value: research.perspectiveSource })}</span>}{averagePerspectiveConfidence != null && <span className="ml-2">{t('averageConfidence')}: {averagePerspectiveConfidence.toFixed(1)}/10</span>}{research.perspectiveProvenance && <><span className="mt-1 block">{t('perspectivesProvenance', { model: research.perspectiveProvenance.modelVersion ?? '--', prompt: research.perspectiveProvenance.promptVersion ?? '--', evidence: research.perspectiveProvenance.evidenceResultCount, coverage: Math.round(research.perspectiveProvenance.evidenceCoverageRatio * 100) })}</span><span className="mt-1 block">{t('analysisModeResult', { value: t(`analysisModes.${research.perspectiveProvenance.resolvedAnalysisMode}`) })}</span>{research.perspectiveProvenance.resolvedAnalysisMode === 'structured_only' && <span className="mt-1 block text-warn">{t('evidenceUnavailable')}</span>}</>}</> : t('perspectivesNotGenerated')}
          </div>
          <div className="flex items-center gap-1.5"><label className="sr-only" htmlFor={`perspective-analysis-mode-${ticker}`}>{t('analysisModeLabel')}</label><select id={`perspective-analysis-mode-${ticker}`} value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value as PerspectiveAnalysisRequestMode)} disabled={research.generating} className="h-8 max-w-36 text-xs"><option value="auto">{t('analysisModes.auto')}</option><option value="evidence_required">{t('analysisModes.evidence_required')}</option><option value="structured_only">{t('analysisModes.structured_only')}</option></select><button type="button" onClick={() => void research.generatePerspectives(analysisMode)} disabled={research.generating} className="inline-flex h-8 items-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${research.generating ? 'animate-spin' : ''}`} aria-hidden="true" />{research.generating ? t('generatingPerspectives') : t('generatePerspectives')}</button>{research.generating && research.perspectiveJob && <button type="button" onClick={() => void research.cancelPerspectiveGeneration()} className="icon-button !h-8 !w-8 !basis-8" title={t('cancelGeneration')} aria-label={t('cancelGeneration')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}</div>
        </div>
        {research.generating && research.perspectiveJob && <div className="border-b border-border/70 py-3" role="status" aria-live="polite"><div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]"><span className="font-medium text-text-dim">{t(`jobStages.${research.perspectiveJob.stage}`)}</span><span className="font-mono tabular-nums text-text-muted">{research.perspectiveJob.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${research.perspectiveJob.progress}%` }} /></div></div>}
        {research.perspectives.length > 0 && <div className="my-3 flex max-w-full gap-1 overflow-x-auto" role="group" aria-label={t('perspectiveFilter')}>{(['all', 'bullish', 'neutral', 'bearish'] as PerspectiveFilter[]).map((value) => <button key={value} type="button" aria-pressed={perspectiveFilter === value} onClick={() => setPerspectiveFilter(value)} className={`h-7 shrink-0 rounded border px-2.5 text-[11px] ${perspectiveFilter === value ? 'border-accent/40 bg-accent/10 font-semibold text-accent' : 'border-border text-text-dim hover:text-text'}`}>{t(`perspectiveFilters.${value}`)} <span className="tabular-nums">{value === 'all' ? research.perspectives.length : stanceCounts[value]}</span></button>)}</div>}
        {research.quota && <QuotaNotice {...research.quota} />}
        {research.feedbackError && <p className="mb-2 text-[11px] text-status-bad" role="alert">{t('feedback.error')}</p>}
        {(research.loading || research.generating) && research.perspectives.length === 0 ? <div className="space-y-2 border-y border-border/70 py-3" role="status" aria-label={research.generating ? t('generatingPerspectives') : t('loading')}>{[0, 1].map((item) => <div key={item} className="border-l-2 border-border bg-bg-elevated/60 px-3 py-3"><div className="h-3 w-28 animate-pulse rounded-sm bg-border" /><div className="mt-3 h-2.5 w-full animate-pulse rounded-sm bg-border/70" /><div className="mt-2 h-2.5 w-3/4 animate-pulse rounded-sm bg-border/50" /></div>)}</div>
          : research.perspectiveError && research.perspectives.length === 0 ? <div className="py-8 text-center text-xs text-warn" role="alert">{t(`perspectiveErrors.${perspectiveErrorKey(research.perspectiveErrorCode)}`)}</div>
            : research.perspectives.length === 0 ? <div className="border-y border-border/70 py-8 text-center"><Sparkles className="mx-auto h-5 w-5 text-text-muted" aria-hidden="true" /><p className="mt-2 text-xs text-text-muted">{t('emptyPerspectives')}</p></div>
              : <div className="mt-3">{visiblePerspectives.map((item) => <PerspectiveCard key={item.id ?? item.persona} {...item} footer={<PerspectiveFeedbackControls perspective={item} saving={research.feedbackSavingId === item.id} onSave={research.saveFeedback} onClear={research.clearFeedback} />} />)}</div>}
      </section>}
    </section>
  );
}
