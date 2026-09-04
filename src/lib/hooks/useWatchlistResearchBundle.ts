'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuotaNoticeProps } from '@/components/QuotaNotice';
import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import type { PerspectiveProvenance, StockNewsResponse, StockReportsResponse } from '@/lib/stocks/research-types';
import { createRequestSlot, type RequestSlot } from './request-slot';

interface WatchlistResearchBundleState {
  news: StockNewsResponse | null;
  reports: StockReportsResponse | null;
  perspectives: PerspectiveRow[];
  perspectiveSource: string | null;
  perspectivesGeneratedAt: string | null;
  perspectiveProvenance: PerspectiveProvenance | null;
  loading: boolean;
  refreshing: boolean;
  generating: boolean;
  error: string | null;
  perspectiveError: string | null;
  quota: QuotaNoticeProps | null;
}

const EMPTY: WatchlistResearchBundleState = {
  news: null,
  reports: null,
  perspectives: [],
  perspectiveSource: null,
  perspectivesGeneratedAt: null,
  perspectiveProvenance: null,
  loading: true,
  refreshing: false,
  generating: false,
  error: null,
  perspectiveError: null,
  quota: null,
};

function bundlePatch(body: Record<string, unknown>) {
  return {
    news: body.news as StockNewsResponse,
    reports: body.reports as StockReportsResponse,
    perspectives: Array.isArray(body.perspectives) ? body.perspectives as PerspectiveRow[] : [],
    perspectiveSource: typeof body.source === 'string' ? body.source : null,
    perspectivesGeneratedAt: typeof body.generatedAt === 'string' ? body.generatedAt : null,
    perspectiveProvenance: isPerspectiveProvenance(body.provenance) ? body.provenance : null,
  };
}

function isPerspectiveProvenance(value: unknown): value is PerspectiveProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (item.modelVersion === null || typeof item.modelVersion === 'string')
    && (item.promptVersion === null || typeof item.promptVersion === 'string')
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

  const load = useCallback(async () => {
    cancelAll();
    const lease = loadSlot.current!.begin();
    const requestGeneration = generation.current;
    setState((current) => ({ ...current, loading: true, refreshing: false, generating: false, error: null }));
    try {
      const response = await fetch(`/api/watchlist/research/${encodeURIComponent(ticker)}`, {
        signal: lease.signal,
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !validBundle(body)) throw new Error(body?.error || 'research_unavailable');
      if (loadSlot.current!.isCurrent(lease) && requestGeneration === generation.current) {
        setState((current) => ({ ...current, ...bundlePatch(body), loading: false }));
      }
    } catch (error) {
      if (loadSlot.current!.isCurrent(lease) && requestGeneration === generation.current) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : 'research_unavailable',
        }));
      }
    }
  }, [cancelAll, ticker]);

  useEffect(() => {
    generation.current += 1;
    setState(EMPTY);
    void load();
    return cancelAll;
  }, [cancelAll, load]);

  const refresh = useCallback(async () => {
    cancelAll();
    const lease = refreshSlot.current!.begin();
    const requestGeneration = generation.current;
    setState((current) => ({ ...current, loading: false, refreshing: true, generating: false, error: null }));
    try {
      const response = await fetch(`/api/watchlist/research/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        signal: lease.signal,
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !validBundle(body)) throw new Error(body?.error || 'research_refresh_failed');
      if (refreshSlot.current!.isCurrent(lease) && requestGeneration === generation.current) {
        setState((current) => ({ ...current, ...bundlePatch(body), refreshing: false }));
      }
    } catch (error) {
      if (refreshSlot.current!.isCurrent(lease) && requestGeneration === generation.current) {
        setState((current) => ({
          ...current,
          refreshing: false,
          error: error instanceof Error ? error.message : 'research_refresh_failed',
        }));
      }
    }
  }, [cancelAll, ticker]);

  const generatePerspectives = useCallback(async () => {
    cancelAll();
    const lease = perspectiveSlot.current!.begin();
    const requestGeneration = generation.current;
    setState((current) => ({ ...current, loading: false, refreshing: false, generating: true, perspectiveError: null, quota: null }));
    try {
      const response = await fetch(`/api/perspectives/${encodeURIComponent(ticker)}`, { signal: lease.signal, cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.error) {
        const error = new Error(body?.error || 'perspectives_unavailable') as Error & { quota?: QuotaNoticeProps };
        error.quota = body?.quota;
        throw error;
      }
      if (perspectiveSlot.current!.isCurrent(lease) && requestGeneration === generation.current) {
        setState((current) => ({
          ...current,
          perspectives: Array.isArray(body?.perspectives) ? body.perspectives : [],
          perspectiveSource: typeof body?.source === 'string' ? body.source : null,
          perspectivesGeneratedAt: typeof body?.meta?.generated_at === 'string' ? body.meta.generated_at : null,
          perspectiveProvenance: isPerspectiveProvenance(body?.meta?.provenance) ? body.meta.provenance : null,
          generating: false,
        }));
      }
    } catch (error) {
      if (!perspectiveSlot.current!.isCurrent(lease) || requestGeneration !== generation.current) return;
      const value = error as Error & { quota?: QuotaNoticeProps };
      setState((current) => ({
        ...current,
        generating: false,
        perspectiveError: value.message || 'perspectives_unavailable',
        quota: value.quota ?? null,
      }));
    }
  }, [cancelAll, ticker]);

  return { ...state, refetch: () => load(), refresh, generatePerspectives };
}
