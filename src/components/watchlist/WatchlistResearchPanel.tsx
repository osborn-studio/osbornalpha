'use client';

import {
  Activity,
  CheckCheck,
  LibraryBig,
  ListChecks,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PerspectiveCard } from '@/components/PerspectiveCard';
import { QuotaNotice } from '@/components/QuotaNotice';
import { PerspectiveFeedbackControls } from './PerspectiveFeedbackControls';
import { PerspectiveClaimFeedbackControls } from './PerspectiveClaimFeedbackControls';
import type { WatchlistResearchBundleModel } from '@/lib/hooks/useWatchlistResearchBundle';
import type { EvidenceSearchStatus } from '@/lib/external-evidence/types';
import type { PerspectiveAnalysisRequestMode } from '@/lib/stocks/perspective-analysis';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import { weightedSentiment } from '@/lib/watchlist/research-summary';
import { buildWatchlistResearchDecisionBrief } from '@/lib/watchlist/research-decision-brief';
import { WatchlistResearchBrief } from './WatchlistResearchBrief';
import { PerspectiveClaimAlertDraftButton } from './PerspectiveClaimAlertDraftButton';
import { WatchlistFreshnessBadge, type WatchlistFreshnessStatus } from './WatchlistFreshnessBadge';
import { WatchlistResearchFacts } from './WatchlistResearchFacts';
import { WatchlistResearchSources } from './WatchlistResearchSources';
import { WatchlistResearchActivity } from './WatchlistResearchActivity';
import { nextRovingTab } from '@/lib/keyboard/roving-tabs';
import { watchlistProviderLabel } from '@/lib/watchlist/provider-label';

type PerspectiveFilter = 'all' | 'bullish' | 'neutral' | 'bearish';
type ResearchSection = 'facts' | 'sources' | 'perspectives' | 'activity';
const RESEARCH_SECTIONS: readonly ResearchSection[] = ['facts', 'sources', 'perspectives', 'activity'];

function telemetryTotal(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) : null;
}

function freshnessStatus(status: EvidenceSearchStatus): WatchlistFreshnessStatus {
  if (status === 'complete') return 'fresh';
  if (status === 'partial') return 'partial';
  return 'unavailable';
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

export function WatchlistResearchPanel({ ticker, overview, research, onOpenAlerts }: {
  ticker: string;
  overview?: WatchlistOverviewRow;
  research: WatchlistResearchBundleModel;
  onOpenAlerts?: () => void;
}) {
  const t = useTranslations('market.table.drawer.research');
  const providerT = useTranslations('market.table.providers');
  const [section, setSection] = useState<ResearchSection>('facts');
  const [perspectiveFilter, setPerspectiveFilter] = useState<PerspectiveFilter>('all');
  const [analysisMode, setAnalysisMode] = useState<PerspectiveAnalysisRequestMode>('auto');
  useEffect(() => {
    setSection('facts');
  }, [ticker]);
  const metas = [research.news?.meta, research.reports?.meta].filter((value) => !!value);
  const status: EvidenceSearchStatus = metas.some((meta) => meta?.status === 'error' || meta?.status === 'unavailable')
    ? (metas.some((meta) => meta?.status === 'complete' || meta?.status === 'partial') ? 'partial' : 'unavailable')
    : metas.some((meta) => meta?.status === 'partial') ? 'partial' : 'complete';
  const providers = [...new Set(metas.flatMap((meta) => meta?.providers ?? []))];
  const providerLabels = providers.map((provider) => watchlistProviderLabel(provider, providerT));
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
  const decisionBrief = useMemo(
    () => buildWatchlistResearchDecisionBrief(research.perspectives),
    [research.perspectives],
  );
  const visiblePerspectives = perspectiveFilter === 'all'
    ? research.perspectives
    : research.perspectives.filter((item) => item.stance === perspectiveFilter);
  const selectSection = (next: ResearchSection, focus = false) => {
    setSection(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`watchlist-research-section-${ticker}-${next}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      if (focus) document.getElementById(`watchlist-research-nav-${ticker}-${next}`)?.focus();
    });
  };
  const moveSection = (current: ResearchSection, key: string) => {
    const next = nextRovingTab(RESEARCH_SECTIONS, current, key);
    if (!next) return false;
    selectSection(next, true);
    return true;
  };
  return (
    <section aria-label={t('title')}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text">{t('title')}</h3>
            {!research.loading && metas.length > 0 && <WatchlistFreshnessBadge compact status={freshnessStatus(status)} statusLabel={t(`status.${status}`)} source={providerLabels.join(', ')} asOf={fetchedAt} />}
            {(research.activity?.unseenCount ?? 0) > 0 && <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">{t('unseen', { count: research.activity!.unseenCount })}</span>}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">{t('summary', { news: overview?.research.value?.recentNewsCount ?? news.length, reports: reports.length })}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {(research.activity?.unseenCount ?? 0) > 0 && <button type="button" onClick={() => void research.markActivitySeen()} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('markSeen')} title={t('markSeen')}><CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /></button>}
          <button type="button" onClick={() => void research.refresh()} disabled={research.loading || research.refreshing} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('refresh')} title={t('refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${research.refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          {research.refreshing && research.researchJob && <button type="button" onClick={() => void research.cancelResearchRefresh()} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('cancelRefresh')} title={t('cancelRefresh')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
        </div>
      </header>

      {research.refreshing && research.researchJob && <div className="mb-3 border-b border-border/70 pb-3" role="status" aria-live="polite"><div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]"><span className="font-medium text-text-dim">{t(`refreshJobStages.${research.researchJob.stage}`)}</span><span className="font-mono tabular-nums text-text-muted">{research.researchJob.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${research.researchJob.progress}%` }} /></div></div>}

      {research.changes?.hasChanges && (
        <div className="mb-3 flex items-start gap-2 border-l-2 border-status-info bg-status-info/5 px-3 py-2 text-[11px] text-text-dim" role="status">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-info" aria-hidden="true" />
          <span>{t('changes', { news: research.changes.newNews, reports: research.changes.newReports, ratings: research.changes.ratingChanges.length })}{research.changes.perspectivesChanged ? ` · ${t('perspectivesChanged')}` : ''}</span>
        </div>
      )}

      {!research.loading && <WatchlistResearchBrief brief={decisionBrief} />}

      {!research.loading && (
        <div className="mb-4 grid grid-cols-2 overflow-hidden border-y border-border/70 sm:grid-cols-4" aria-label={t('decisionSummary')}>
          <InsightMetric label={t('averageSentiment')} value={averageSentiment == null ? '--' : `${averageSentiment > 0 ? '+' : ''}${(averageSentiment * 100).toFixed(0)}%`} detail={t('sentimentSample', { count: overview?.research.value?.sentimentSampleSize ?? sentimentValues.length, coverage: Math.round(sentimentCoverage * 100) })} tone={averageSentiment == null ? 'text-text-muted' : averageSentiment > 0.1 ? 'text-up' : averageSentiment < -0.1 ? 'text-down' : 'text-text'} />
          <InsightMetric label={t('targetUpside')} value={targetUpside == null ? '--' : `${targetUpside > 0 ? '+' : ''}${targetUpside.toFixed(1)}%`} detail={consensus ? t('targetMedianValue', { value: consensus.targetMedian.toFixed(2), count: consensus.count }) : undefined} tone={targetUpside == null ? 'text-text-muted' : targetUpside >= 0 ? 'text-up' : 'text-down'} />
          <InsightMetric label={t('committeeStance')} value={research.perspectives.length > 0 ? t(`perspectiveFilters.${decisionBrief.stance}`) : '--'} detail={research.perspectives.length > 0 ? t('stanceSplit', decisionBrief.stanceCounts) : undefined} tone={decisionBrief.stance === 'bullish' ? 'text-up' : decisionBrief.stance === 'bearish' ? 'text-down' : 'text-warn'} />
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

      <nav className="sticky top-0 z-10 mb-4 grid grid-cols-4 rounded-md border border-border bg-bg-elevated/95 p-0.5 backdrop-blur" aria-label={t('sections.label')}>
        {([
          ['facts', ListChecks, research.facts.length],
          ['sources', LibraryBig, research.sources.length],
          ['perspectives', Sparkles, research.perspectives.length],
          ['activity', Activity, research.timeline.length],
        ] as const).map(([value, Icon, count]) => (
          <button
            key={value}
            id={`watchlist-research-nav-${ticker}-${value}`}
            type="button"
            aria-pressed={section === value}
            aria-controls={`watchlist-research-section-${ticker}-${value}`}
            onClick={() => selectSection(value)}
            onKeyDown={(event) => {
              if (moveSection(value, event.key)) event.preventDefault();
            }}
            className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded border px-1 text-xs font-medium transition ${section === value ? 'border-accent/30 bg-accent-wash text-accent' : 'border-transparent text-text-muted hover:text-text'}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t(`sections.${value}`)}</span>
            <span className="tabular-nums text-text-muted">{count}</span>
          </button>
        ))}
      </nav>

      <section id={`watchlist-research-section-${ticker}-facts`} className="scroll-mt-12 border-b border-border/70 pb-5" aria-labelledby={`watchlist-research-heading-${ticker}-facts`}>
        <h4 id={`watchlist-research-heading-${ticker}-facts`} className="mb-3 flex items-center gap-2 text-xs font-semibold text-text"><ListChecks className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{t('sections.facts')}<span className="font-mono text-[10px] font-normal text-text-muted">{research.facts.length}</span></h4>
        {research.loading ? <div className="space-y-2" role="status" aria-label={t('loading')}>{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse bg-bg-elevated" />)}</div>
          : research.error ? <div className="border-y border-border py-8 text-center text-xs text-text-muted"><p>{t('unavailable')}</p><button type="button" onClick={() => void research.refresh()} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded border border-border px-3 text-text-dim hover:text-text"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{t('retry')}</button></div>
            : <WatchlistResearchFacts facts={research.facts} sources={research.sources} />}
      </section>

      <section id={`watchlist-research-section-${ticker}-sources`} className="scroll-mt-12 border-b border-border/70 py-5" aria-labelledby={`watchlist-research-heading-${ticker}-sources`}>
        <h4 id={`watchlist-research-heading-${ticker}-sources`} className="mb-3 flex items-center gap-2 text-xs font-semibold text-text"><LibraryBig className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{t('sections.sources')}<span className="font-mono text-[10px] font-normal text-text-muted">{research.sources.length}</span></h4>
        {!research.loading && !research.error && <WatchlistResearchSources sources={research.sources} quality={research.quality} />}
      </section>

      <section id={`watchlist-research-section-${ticker}-perspectives`} className="scroll-mt-12 border-b border-border/70 py-5" aria-labelledby={`watchlist-research-heading-${ticker}-perspectives`}>
        <h4 id={`watchlist-research-heading-${ticker}-perspectives`} className="mb-3 flex items-center gap-2 text-xs font-semibold text-text"><Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{t('sections.perspectives')}<span className="font-mono text-[10px] font-normal text-text-muted">{research.perspectives.length}</span></h4>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
          <div className="text-[11px] text-text-muted">
            {research.perspectivesGeneratedAt ? <>{t('perspectivesGeneratedAt', { value: new Date(research.perspectivesGeneratedAt).toLocaleString() })}{research.perspectiveSource && <span className="ml-2">{t('perspectivesSource', { value: research.perspectiveSource })}</span>}{decisionBrief.averageConfidence != null && <span className="ml-2">{t('averageConfidence')}: {decisionBrief.averageConfidence.toFixed(1)}/10</span>}{research.perspectiveProvenance && <><span className="mt-1 block">{t('perspectivesProvenance', { model: research.perspectiveProvenance.modelVersion ?? '--', prompt: research.perspectiveProvenance.promptVersion ?? '--', evidence: research.perspectiveProvenance.evidenceResultCount, coverage: Math.round(research.perspectiveProvenance.evidenceCoverageRatio * 100) })}</span><span className="mt-1 block">{t('analysisModeResult', { value: t(`analysisModes.${research.perspectiveProvenance.resolvedAnalysisMode}`) })}</span>{research.perspectiveProvenance.resolvedAnalysisMode === 'structured_only' && <span className="mt-1 block text-warn">{t('evidenceUnavailable')}</span>}</>}</> : t('perspectivesNotGenerated')}
          </div>
          <div className="flex items-center gap-1.5"><label className="sr-only" htmlFor={`perspective-analysis-mode-${ticker}`}>{t('analysisModeLabel')}</label><select id={`perspective-analysis-mode-${ticker}`} value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value as PerspectiveAnalysisRequestMode)} disabled={research.generating} className="h-8 max-w-36 text-xs"><option value="auto">{t('analysisModes.auto')}</option><option value="evidence_required">{t('analysisModes.evidence_required')}</option><option value="structured_only">{t('analysisModes.structured_only')}</option></select><button type="button" onClick={() => void research.generatePerspectives(analysisMode)} disabled={research.generating} className="inline-flex h-8 items-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${research.generating ? 'animate-spin' : ''}`} aria-hidden="true" />{research.generating ? t('generatingPerspectives') : t('generatePerspectives')}</button>{research.generating && research.perspectiveJob && <button type="button" onClick={() => void research.cancelPerspectiveGeneration()} className="icon-button !h-8 !w-8 !basis-8" title={t('cancelGeneration')} aria-label={t('cancelGeneration')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}</div>
        </div>
        {research.generating && research.perspectiveJob && <div className="border-b border-border/70 py-3" role="status" aria-live="polite"><div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]"><span className="font-medium text-text-dim">{t(`jobStages.${research.perspectiveJob.stage}`)}</span><span className="font-mono tabular-nums text-text-muted">{research.perspectiveJob.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${research.perspectiveJob.progress}%` }} /></div></div>}
        {research.perspectives.length > 0 && <div className="my-3 flex max-w-full gap-1 overflow-x-auto" role="group" aria-label={t('perspectiveFilter')}>{(['all', 'bullish', 'neutral', 'bearish'] as PerspectiveFilter[]).map((value) => <button key={value} type="button" aria-pressed={perspectiveFilter === value} onClick={() => setPerspectiveFilter(value)} className={`h-7 shrink-0 rounded border px-2.5 text-[11px] ${perspectiveFilter === value ? 'border-accent/40 bg-accent/10 font-semibold text-accent' : 'border-border text-text-dim hover:text-text'}`}>{t(`perspectiveFilters.${value}`)} <span className="tabular-nums">{value === 'all' ? research.perspectives.length : decisionBrief.stanceCounts[value]}</span></button>)}</div>}
        {research.quota && <QuotaNotice {...research.quota} />}
        {research.feedbackError && <p className="mb-2 text-[11px] text-status-bad" role="alert">{t('feedback.error')}</p>}
        {(research.loading || research.generating) && research.perspectives.length === 0 ? <div className="space-y-2 border-y border-border/70 py-3" role="status" aria-label={research.generating ? t('generatingPerspectives') : t('loading')}>{[0, 1].map((item) => <div key={item} className="border-l-2 border-border bg-bg-elevated/60 px-3 py-3"><div className="h-3 w-28 animate-pulse rounded-sm bg-border" /><div className="mt-3 h-2.5 w-full animate-pulse rounded-sm bg-border/70" /><div className="mt-2 h-2.5 w-3/4 animate-pulse rounded-sm bg-border/50" /></div>)}</div>
          : research.perspectiveError && research.perspectives.length === 0 ? <div className="py-8 text-center text-xs text-warn" role="alert">{t(`perspectiveErrors.${perspectiveErrorKey(research.perspectiveErrorCode)}`)}</div>
            : research.perspectives.length === 0 ? <div className="border-y border-border/70 py-8 text-center"><Sparkles className="mx-auto h-5 w-5 text-text-muted" aria-hidden="true" /><p className="mt-2 text-xs text-text-muted">{t('emptyPerspectives')}</p></div>
              : <div className="mt-3">{visiblePerspectives.map((item) => <PerspectiveCard key={item.id ?? item.persona} {...item} renderClaimFooter={(claim) => <><PerspectiveClaimAlertDraftButton itemId={overview?.item.id} perspectiveId={item.id} claim={claim} onOpenAlerts={onOpenAlerts} /><PerspectiveClaimFeedbackControls perspectiveId={item.id} claim={claim} feedback={claim.id ? item.claimFeedback?.[claim.id] : undefined} saving={research.claimFeedbackSavingKey === `${item.id}:${claim.id}`} onSave={research.saveClaimFeedback} onClear={research.clearClaimFeedback} /></>} footer={<PerspectiveFeedbackControls perspective={item} saving={research.feedbackSavingId === item.id} onSave={research.saveFeedback} onClear={research.clearFeedback} />} />)}</div>}
      </section>

      <section id={`watchlist-research-section-${ticker}-activity`} className="scroll-mt-12 pt-5">
        <WatchlistResearchActivity timeline={research.timeline} lastSeenAt={research.activity?.lastSeenAt ?? null} />
      </section>
    </section>
  );
}
