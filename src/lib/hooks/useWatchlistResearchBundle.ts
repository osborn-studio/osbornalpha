'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuotaNoticeProps } from '@/components/QuotaNotice';
import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import type { PerspectiveProvenance, StockNewsResponse, StockReportsResponse } from '@/lib/stocks/research-types';
import { createRequestSlot, type RequestLease, type RequestSlot } from './request-slot';
import type { WatchlistResearchChanges, WatchlistResearchTimelineItem } from '@/lib/watchlist/research-timeline';
import type { PerspectiveAnalysisRequestMode } from '@/lib/stocks/perspective-analysis';
import type { PerspectiveGenerationJobView } from '@/lib/stocks/perspective-job-contract';
import {
  fetchActivePerspectiveJob,
  isPerspectiveGenerationJob,
  waitForPerspectiveJob,
} from '@/lib/stocks/perspective-job-client';
import {
  WatchlistRequestError,
  watchlistJsonRequest,
  watchlistRequestErrorCode,
} from '@/lib/watchlist/api-client';
import type { PerspectiveClaimVerdict } from '@/lib/watchlist/perspective-claim-feedback';
import type { WatchlistResearchJobView } from '@/lib/watchlist/research-job-contract';
import type {
  WatchlistResearchFact,
  WatchlistResearchQualitySummary,
  WatchlistResearchSource,
} from '@/lib/watchlist/research-evidence';
import type { WatchlistWorkflowSummary } from '@/lib/watchlist/workflow-summary';
import {
  fetchActiveWatchlistResearchJob,
  isWatchlistResearchJob,
  waitForWatchlistResearchJob,
} from '@/lib/watchlist/research-job-client';

interface WatchlistResearchBundleState {
  news: StockNewsResponse | null;
  reports: StockReportsResponse | null;
  perspectives: PerspectiveRow[];
  perspectiveSource: string | null;
  perspectivesGeneratedAt: string | null;
  perspectiveProvenance: PerspectiveProvenance | null;
  facts: WatchlistResearchFact[];
  sources: WatchlistResearchSource[];
  quality: WatchlistResearchQualitySummary;
  timeline: WatchlistResearchTimelineItem[];
  changes: WatchlistResearchChanges | null;
  activity: {
    generatedAt: string;
    lastSeenAt: string | null;
    unseenCount: number;
    warnings: string[];
  } | null;
  workflow: WatchlistWorkflowSummary | null;
  loading: boolean;
  refreshing: boolean;
  researchJob: WatchlistResearchJobView | null;
  generating: boolean;
  perspectiveJob: PerspectiveGenerationJobView | null;
  error: string | null;
  perspectiveError: string | null;
  perspectiveErrorCode: string | null;
  quota: QuotaNoticeProps | null;
  feedbackSavingId: string | null;
  claimFeedbackSavingKey: string | null;
  feedbackError: string | null;
}

interface PerspectiveFeedbackResponse {
  feedback: {
    verdict: 'helpful' | 'incorrect' | 'outdated';
    reason: string | null;
    corrected_stance: PerspectiveRow['stance'] | null;
  };
}

interface PerspectiveClaimFeedbackResponse {
  feedback: {
    claim_id: string;
    verdict: PerspectiveClaimVerdict;
    reason: string | null;
  };
}

const EMPTY: WatchlistResearchBundleState = {
  news: null,
  reports: null,
  perspectives: [],
  perspectiveSource: null,
  perspectivesGeneratedAt: null,
  perspectiveProvenance: null,
  facts: [],
  sources: [],
  quality: {
    totalSources: 0,
    eligibleSources: 0,
    datedSources: 0,
    corroboratedSources: 0,
    conflictedFacts: 0,
    averageQualityScore: null,
    warnings: [],
  },
  timeline: [],
  changes: null,
  activity: null,
  workflow: null,
  loading: true,
  refreshing: false,
  researchJob: null,
  generating: false,
  perspectiveJob: null,
  error: null,
  perspectiveError: null,
  perspectiveErrorCode: null,
  quota: null,
  feedbackSavingId: null,
  claimFeedbackSavingKey: null,
  feedbackError: null,
};

function bundlePatch(body: Record<string, unknown>) {
  const quality = body.quality && typeof body.quality === 'object' && !Array.isArray(body.quality)
    ? { ...EMPTY.quality, ...body.quality as WatchlistResearchQualitySummary }
    : EMPTY.quality;
  return {
    news: body.news as StockNewsResponse,
    reports: body.reports as StockReportsResponse,
    perspectives: Array.isArray(body.perspectives) ? body.perspectives as PerspectiveRow[] : [],
    perspectiveSource: typeof body.perspectiveSource === 'string' ? body.perspectiveSource
      : typeof body.source === 'string' ? body.source : null,
    perspectivesGeneratedAt: typeof body.perspectivesGeneratedAt === 'string' ? body.perspectivesGeneratedAt
      : typeof body.generatedAt === 'string' ? body.generatedAt : null,
    perspectiveProvenance: isPerspectiveProvenance(body.perspectiveProvenance) ? body.perspectiveProvenance
      : isPerspectiveProvenance(body.provenance) ? body.provenance : null,
    facts: Array.isArray(body.facts) ? body.facts as WatchlistResearchFact[] : [],
    sources: Array.isArray(body.sources) ? body.sources as WatchlistResearchSource[] : [],
    quality,
    timeline: Array.isArray(body.timeline) ? body.timeline as WatchlistResearchTimelineItem[] : [],
    changes: body.changes && typeof body.changes === 'object' ? body.changes as WatchlistResearchChanges : null,
    activity: body.activity && typeof body.activity === 'object' ? body.activity as WatchlistResearchBundleState['activity'] : null,
    workflow: body.workflow && typeof body.workflow === 'object'
      ? body.workflow as WatchlistWorkflowSummary
      : null,
  };
}

async function fetchActivityBundle(ticker: string, signal: AbortSignal) {
  const body = await watchlistJsonRequest<Record<string, unknown>>(`/api/watchlist/activity/${encodeURIComponent(ticker)}`, {
    signal,
    cache: 'no-store',
  }, 'research_unavailable');
  if (!validBundle(body)) throw new Error('research_unavailable');
  return body;
}

function isPerspectiveProvenance(value: unknown): value is PerspectiveProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (item.modelVersion === null || typeof item.modelVersion === 'string')
    && (item.promptVersion === null || typeof item.promptVersion === 'string')
    && ['auto', 'evidence_required', 'structured_only'].includes(String(item.requestedAnalysisMode))
    && ['evidence_backed', 'structured_only'].includes(String(item.resolvedAnalysisMode))
    && ['complete', 'partial', 'unavailable', 'error'].includes(String(item.evidenceStatus))
    && (item.evidenceRequestId === null || typeof item.evidenceRequestId === 'string')
    && (item.evidenceFetchedAt === null || typeof item.evidenceFetchedAt === 'string')
    && typeof item.evidenceResultCount === 'number' && Number.isSafeInteger(item.evidenceResultCount) && item.evidenceResultCount >= 0
    && typeof item.evidenceCoverageRatio === 'number' && Number.isFinite(item.evidenceCoverageRatio)
    && item.evidenceCoverageRatio >= 0 && item.evidenceCoverageRatio <= 1;
}

function isResearchMeta(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const meta = value as Record<string, unknown>;
  const optionalCount = (key: string) => meta[key] === undefined || meta[key] === null
    || (typeof meta[key] === 'number' && Number.isFinite(meta[key]) && Number(meta[key]) >= 0);
  return ['complete', 'partial', 'unavailable', 'error'].includes(String(meta.status))
    && Array.isArray(meta.providers) && meta.providers.every((provider) => typeof provider === 'string')
    && typeof meta.fetchedAt === 'string'
    && Array.isArray(meta.warnings) && meta.warnings.every((warning) => typeof warning === 'string')
    && optionalCount('queryCount')
    && optionalCount('resultCount')
    && optionalCount('durationMs')
    && optionalCount('estimatedCostMicrousd');
}

function validBundle(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  const news = value.news;
  const reports = value.reports;
  return !!news && typeof news === 'object' && !Array.isArray(news)
    && typeof (news as Record<string, unknown>).ticker === 'string'
    && Array.isArray((news as Record<string, unknown>).items)
    && isResearchMeta((news as Record<string, unknown>).meta)
    && !!reports && typeof reports === 'object' && !Array.isArray(reports)
    && typeof (reports as Record<string, unknown>).ticker === 'string'
    && Array.isArray((reports as Record<string, unknown>).items)
    && isResearchMeta((reports as Record<string, unknown>).meta)
    && Array.isArray(value.perspectives);
}

export function useWatchlistResearchBundle(ticker: string) {
  const [state, setState] = useState<WatchlistResearchBundleState>(EMPTY);
  const loadSlot = useRef<RequestSlot | null>(null);
  const refreshSlot = useRef<RequestSlot | null>(null);
  const perspectiveSlot = useRef<RequestSlot | null>(null);
  const generation = useRef(0);
  if (!loadSlot.current) loadSlot.current = createRequestSlot();
  if (!refreshSlot.current) refreshSlot.current = createRequestSlot();
  if (!perspectiveSlot.current) perspectiveSlot.current = createRequestSlot();

  const cancelAll = useCallback(() => {
    loadSlot.current!.cancel();
    refreshSlot.current!.cancel();
    perspectiveSlot.current!.cancel();
    generation.current += 1;
  }, []);

  const monitorPerspectiveJob = useCallback(async (
    initial: PerspectiveGenerationJobView,
    slot: RequestSlot,
    lease: RequestLease,
    requestGeneration: number,
  ) => {
    const current = () => slot.isCurrent(lease) && requestGeneration === generation.current;
    if (current()) {
      setState((value) => ({
        ...value,
        generating: initial.status === 'queued' || initial.status === 'running',
        perspectiveJob: initial,
        perspectiveError: null,
        perspectiveErrorCode: null,
        quota: null,
      }));
    }
    try {
      const job = await waitForPerspectiveJob(initial, lease.signal, (next) => {
        if (current()) setState((value) => ({ ...value, perspectiveJob: next }));
      });
      if (!current()) return;
      if (job.status === 'failed') {
        throw new WatchlistRequestError(job.errorCode ?? 'perspectives_unavailable', 500, {
          errorCode: job.errorCode ?? 'perspectives_unavailable',
        });
      }
      if (job.status === 'cancelled') {
        setState((value) => ({ ...value, generating: false, perspectiveJob: job }));
        return;
      }
      const activityBody = await fetchActivityBundle(ticker, lease.signal);
      if (current()) {
        setState((value) => ({
          ...value,
          ...bundlePatch(activityBody),
          generating: false,
          perspectiveJob: job,
        }));
      }
    } catch (error) {
      if (!current()) return;
      const errorBody = error instanceof WatchlistRequestError ? error.body : null;
      setState((value) => ({
        ...value,
        generating: false,
        perspectiveError: error instanceof Error ? error.message : 'perspectives_unavailable',
        perspectiveErrorCode: watchlistRequestErrorCode(error, 'perspectives_unavailable'),
        quota: (errorBody?.quota as QuotaNoticeProps | undefined) ?? null,
      }));
    }
  }, [ticker]);

  const monitorResearchJob = useCallback(async (
    initial: WatchlistResearchJobView,
    slot: RequestSlot,
    lease: RequestLease,
    requestGeneration: number,
  ) => {
    const current = () => slot.isCurrent(lease) && requestGeneration === generation.current;
    if (current()) setState((value) => ({ ...value, refreshing: true, researchJob: initial, error: null }));
    try {
      const job = await waitForWatchlistResearchJob(initial, lease.signal, (next) => {
        if (current()) setState((value) => ({ ...value, researchJob: next }));
      });
      if (!current()) return;
      if (job.status === 'failed') throw new Error(job.errorCode ?? 'research_refresh_failed');
      if (job.status === 'cancelled') {
        setState((value) => ({ ...value, refreshing: false, researchJob: job }));
        return;
      }
      const activityBody = await fetchActivityBundle(ticker, lease.signal);
      if (current()) setState((value) => ({
        ...value,
        ...bundlePatch(activityBody),
        changes: job.result?.changes ?? null,
        refreshing: false,
        researchJob: job,
      }));
    } catch (error) {
      if (current()) setState((value) => ({
        ...value,
        refreshing: false,
        error: error instanceof Error ? error.message : 'research_refresh_failed',
      }));
    }
  }, [ticker]);

  const load = useCallback(async () => {
    cancelAll();
    const lease = loadSlot.current!.begin();
    const requestGeneration = generation.current;
    setState((current) => ({ ...current, loading: true, refreshing: false, generating: false, error: null }));
    try {
      const [body, activeJob, activeResearchJob] = await Promise.all([
        fetchActivityBundle(ticker, lease.signal),
        fetchActivePerspectiveJob(ticker, lease.signal).catch(() => null),
        fetchActiveWatchlistResearchJob(ticker, lease.signal).catch(() => null),
      ]);
      if (loadSlot.current!.isCurrent(lease) && requestGeneration === generation.current) {
        setState((current) => ({ ...current, ...bundlePatch(body), loading: false }));
      }
      await Promise.all([
        activeJob ? monitorPerspectiveJob(activeJob, loadSlot.current!, lease, requestGeneration) : Promise.resolve(),
        activeResearchJob ? monitorResearchJob(activeResearchJob, loadSlot.current!, lease, requestGeneration) : Promise.resolve(),
      ]);
    } catch (error) {
      if (loadSlot.current!.isCurrent(lease) && requestGeneration === generation.current) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : 'research_unavailable',
        }));
      }
    }
  }, [cancelAll, monitorPerspectiveJob, monitorResearchJob, ticker]);

  useEffect(() => {
    generation.current += 1;
    setState(EMPTY);
    void load();
    return cancelAll;
  }, [cancelAll, load]);

  const refresh = useCallback(async () => {
    const lease = refreshSlot.current!.begin();
    const requestGeneration = generation.current;
    setState((current) => ({ ...current, loading: false, refreshing: true, error: null }));
    try {
      const body = await watchlistJsonRequest<{ job?: unknown }>(`/api/watchlist/research/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        signal: lease.signal,
        cache: 'no-store',
      }, 'research_refresh_failed');
      if (!isWatchlistResearchJob(body.job)) throw new Error('watchlist_research_job_unavailable');
      await monitorResearchJob(body.job, refreshSlot.current!, lease, requestGeneration);
    } catch (error) {
      if (refreshSlot.current!.isCurrent(lease) && requestGeneration === generation.current) {
        setState((current) => ({
          ...current,
          refreshing: false,
          error: error instanceof Error ? error.message : 'research_refresh_failed',
        }));
      }
    }
  }, [monitorResearchJob, ticker]);

  const cancelResearchRefresh = useCallback(async () => {
    const id = state.researchJob?.id;
    if (!id || !state.refreshing) return false;
    try {
      const body = await watchlistJsonRequest<{ job?: unknown }>(`/api/watchlist/research/jobs/${encodeURIComponent(id)}`, {
        method: 'DELETE', cache: 'no-store',
      }, 'watchlist_research_job_cancel_failed');
      if (!isWatchlistResearchJob(body.job)) return false;
      refreshSlot.current!.cancel();
      const cancelledJob = body.job;
      setState((current) => ({
        ...current,
        researchJob: cancelledJob,
        refreshing: cancelledJob.status === 'queued' || cancelledJob.status === 'running',
      }));
      return true;
    } catch {
      return false;
    }
  }, [state.refreshing, state.researchJob?.id]);

  const generatePerspectives = useCallback(async (analysisMode: PerspectiveAnalysisRequestMode = 'auto') => {
    const lease = perspectiveSlot.current!.begin();
    const requestGeneration = generation.current;
    setState((current) => ({ ...current, loading: false, refreshing: false, generating: true, perspectiveJob: null, perspectiveError: null, perspectiveErrorCode: null, quota: null }));
    try {
      const body = await watchlistJsonRequest<Record<string, unknown>>(`/api/perspectives/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'respond-async' },
        body: JSON.stringify({ analysisMode }),
        signal: lease.signal,
        cache: 'no-store',
      }, 'perspectives_unavailable');
      if (body.error) throw new WatchlistRequestError('perspectives_unavailable', 500, body);
      if (!isPerspectiveGenerationJob(body.job)) throw new Error('perspective_job_unavailable');
      await monitorPerspectiveJob(body.job, perspectiveSlot.current!, lease, requestGeneration);
    } catch (error) {
      if (!perspectiveSlot.current!.isCurrent(lease) || requestGeneration !== generation.current) return;
      const value = error as Error;
      const errorBody = error instanceof WatchlistRequestError ? error.body : null;
      setState((current) => ({
        ...current,
        generating: false,
        perspectiveError: value.message || 'perspectives_unavailable',
        perspectiveErrorCode: watchlistRequestErrorCode(error, 'perspectives_unavailable'),
        quota: (errorBody?.quota as QuotaNoticeProps | undefined) ?? null,
      }));
    }
  }, [monitorPerspectiveJob, ticker]);

  const cancelPerspectiveGeneration = useCallback(async () => {
    const id = state.perspectiveJob?.id;
    if (!id || !state.generating) return false;
    try {
      const body = await watchlistJsonRequest<{ job?: unknown }>(`/api/perspectives/jobs/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        cache: 'no-store',
      }, 'perspective_job_cancel_failed');
      if (!isPerspectiveGenerationJob(body.job)) return false;
      const cancelledJob = body.job;
      setState((current) => ({
        ...current,
        perspectiveJob: cancelledJob,
        generating: cancelledJob.status === 'queued' || cancelledJob.status === 'running',
      }));
      return true;
    } catch {
      return false;
    }
  }, [state.generating, state.perspectiveJob?.id]);

  const saveFeedback = useCallback(async (
    perspectiveId: string,
    input: { verdict: 'helpful' | 'incorrect' | 'outdated'; reason?: string | null; correctedStance?: PerspectiveRow['stance'] | null },
  ) => {
    setState((current) => ({ ...current, feedbackSavingId: perspectiveId, feedbackError: null }));
    try {
      const body = await watchlistJsonRequest<PerspectiveFeedbackResponse>('/api/watchlist/perspective-feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ perspectiveId, ...input }),
      }, 'perspective_feedback_unavailable');
      if (!body.feedback) throw new Error('perspective_feedback_unavailable');
      setState((current) => ({
        ...current,
        feedbackSavingId: null,
        perspectives: current.perspectives.map((item) => item.id === perspectiveId ? {
          ...item,
          feedback: {
            verdict: body.feedback.verdict,
            reason: body.feedback.reason ?? null,
            correctedStance: body.feedback.corrected_stance ?? null,
          },
        } : item),
      }));
      return true;
    } catch (error) {
      setState((current) => ({
        ...current,
        feedbackSavingId: null,
        feedbackError: error instanceof Error ? error.message : 'perspective_feedback_unavailable',
      }));
      return false;
    }
  }, []);

  const clearFeedback = useCallback(async (perspectiveId: string) => {
    setState((current) => ({ ...current, feedbackSavingId: perspectiveId, feedbackError: null }));
    try {
      await watchlistJsonRequest<Record<string, unknown>>(`/api/watchlist/perspective-feedback?perspectiveId=${encodeURIComponent(perspectiveId)}`, {
        method: 'DELETE',
      }, 'perspective_feedback_unavailable');
      setState((current) => ({
        ...current,
        feedbackSavingId: null,
        perspectives: current.perspectives.map((item) => item.id === perspectiveId ? { ...item, feedback: null } : item),
      }));
      return true;
    } catch (error) {
      setState((current) => ({
        ...current,
        feedbackSavingId: null,
        feedbackError: error instanceof Error ? error.message : 'perspective_feedback_unavailable',
      }));
      return false;
    }
  }, []);

  const saveClaimFeedback = useCallback(async (
    perspectiveId: string,
    claimId: string,
    input: { verdict: PerspectiveClaimVerdict; reason?: string | null },
  ) => {
    const key = `${perspectiveId}:${claimId}`;
    setState((current) => ({ ...current, claimFeedbackSavingKey: key, feedbackError: null }));
    try {
      const body = await watchlistJsonRequest<PerspectiveClaimFeedbackResponse>('/api/watchlist/perspective-claim-feedback', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ perspectiveId, claimId, ...input }),
      }, 'perspective_claim_feedback_unavailable');
      if (!body.feedback) throw new Error('perspective_claim_feedback_unavailable');
      setState((current) => ({
        ...current,
        claimFeedbackSavingKey: null,
        perspectives: current.perspectives.map((item) => item.id === perspectiveId ? {
          ...item,
          claimFeedback: {
            ...(item.claimFeedback ?? {}),
            [claimId]: { verdict: body.feedback.verdict, reason: body.feedback.reason ?? null },
          },
        } : item),
      }));
      return true;
    } catch (error) {
      setState((current) => ({
        ...current, claimFeedbackSavingKey: null,
        feedbackError: error instanceof Error ? error.message : 'perspective_claim_feedback_unavailable',
      }));
      return false;
    }
  }, []);

  const clearClaimFeedback = useCallback(async (perspectiveId: string, claimId: string) => {
    const key = `${perspectiveId}:${claimId}`;
    setState((current) => ({ ...current, claimFeedbackSavingKey: key, feedbackError: null }));
    try {
      await watchlistJsonRequest<Record<string, unknown>>(`/api/watchlist/perspective-claim-feedback?perspectiveId=${encodeURIComponent(perspectiveId)}&claimId=${encodeURIComponent(claimId)}`, {
        method: 'DELETE',
      }, 'perspective_claim_feedback_unavailable');
      setState((current) => ({
        ...current,
        claimFeedbackSavingKey: null,
        perspectives: current.perspectives.map((item) => {
          if (item.id !== perspectiveId) return item;
          const claimFeedback = { ...(item.claimFeedback ?? {}) };
          delete claimFeedback[claimId];
          return { ...item, claimFeedback };
        }),
      }));
      return true;
    } catch (error) {
      setState((current) => ({
        ...current, claimFeedbackSavingKey: null,
        feedbackError: error instanceof Error ? error.message : 'perspective_claim_feedback_unavailable',
      }));
      return false;
    }
  }, []);

  const markActivitySeen = useCallback(async () => {
    try {
      const body = await watchlistJsonRequest<{ lastSeenAt?: string }>(`/api/watchlist/activity/${encodeURIComponent(ticker)}`, {
        method: 'POST',
      }, 'watchlist_activity_unavailable');
      if (typeof body.lastSeenAt !== 'string') return false;
      const lastSeenAt = body.lastSeenAt;
      setState((current) => ({
        ...current,
        activity: current.activity ? { ...current.activity, lastSeenAt, unseenCount: 0 } : null,
      }));
      return true;
    } catch {
      return false;
    }
  }, [ticker]);

  return {
    ...state,
    refetch: () => load(),
    refresh,
    cancelResearchRefresh,
    generatePerspectives,
    cancelPerspectiveGeneration,
    saveFeedback,
    clearFeedback,
    saveClaimFeedback,
    clearClaimFeedback,
    markActivitySeen,
  };
}

export type WatchlistResearchBundleModel = ReturnType<typeof useWatchlistResearchBundle>;
