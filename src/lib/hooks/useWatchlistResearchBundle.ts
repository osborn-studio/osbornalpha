'use client';

import { useCallback, useEffect, useState } from 'react';
import type { QuotaNoticeProps } from '@/components/QuotaNotice';
import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import type { StockNewsResponse, StockReportsResponse } from '@/lib/stocks/research-types';

interface WatchlistResearchBundleState {
  news: StockNewsResponse | null;
  reports: StockReportsResponse | null;
  perspectives: PerspectiveRow[];
  perspectiveSource: string | null;
  perspectivesGeneratedAt: string | null;
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
  };
}

function validBundle(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  return !!value.news && typeof value.news === 'object'
    && !!value.reports && typeof value.reports === 'object'
    && Array.isArray(value.perspectives);
}

export function useWatchlistResearchBundle(ticker: string) {
  const [state, setState] = useState<WatchlistResearchBundleState>(EMPTY);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetch(`/api/watchlist/research/${encodeURIComponent(ticker)}`, {
        signal,
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !validBundle(body)) throw new Error(body?.error || 'research_unavailable');
      if (!signal?.aborted) setState((current) => ({ ...current, ...bundlePatch(body), loading: false }));
    } catch (error) {
      if (!signal?.aborted) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : 'research_unavailable',
        }));
      }
    }
  }, [ticker]);

  useEffect(() => {
    const controller = new AbortController();
    setState(EMPTY);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, refreshing: true, error: null }));
    try {
      const response = await fetch(`/api/watchlist/research/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !validBundle(body)) throw new Error(body?.error || 'research_refresh_failed');
      setState((current) => ({ ...current, ...bundlePatch(body), refreshing: false }));
    } catch (error) {
      setState((current) => ({
        ...current,
        refreshing: false,
        error: error instanceof Error ? error.message : 'research_refresh_failed',
      }));
    }
  }, [ticker]);

  const generatePerspectives = useCallback(async () => {
    setState((current) => ({ ...current, generating: true, perspectiveError: null, quota: null }));
    try {
      const response = await fetch(`/api/perspectives/${encodeURIComponent(ticker)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.error) {
        const error = new Error(body?.error || 'perspectives_unavailable') as Error & { quota?: QuotaNoticeProps };
        error.quota = body?.quota;
        throw error;
      }
      setState((current) => ({
        ...current,
        perspectives: Array.isArray(body?.perspectives) ? body.perspectives : [],
        perspectiveSource: typeof body?.source === 'string' ? body.source : null,
        perspectivesGeneratedAt: typeof body?.meta?.generated_at === 'string' ? body.meta.generated_at : null,
        generating: false,
      }));
    } catch (error) {
      const value = error as Error & { quota?: QuotaNoticeProps };
      setState((current) => ({
        ...current,
        generating: false,
        perspectiveError: value.message || 'perspectives_unavailable',
        quota: value.quota ?? null,
      }));
    }
  }, [ticker]);

  return { ...state, refetch: () => load(), refresh, generatePerspectives };
}
