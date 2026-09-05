'use client';

import { useCallback, useEffect, useState } from 'react';
import type { QuotaNoticeProps } from '@/components/QuotaNotice';
import type { PerspectiveRow } from '@/lib/hooks/useQuote';
import { WatchlistRequestError, watchlistJsonRequest } from '@/lib/watchlist/api-client';

interface State {
  perspectives: PerspectiveRow[];
  source: string | null;
  generatedAt: string | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  quota: QuotaNoticeProps | null;
}

interface PerspectiveListResponse {
  perspectives?: PerspectiveRow[];
  source?: string | null;
  generatedAt?: string | null;
  meta?: { generated_at?: string | null };
}

const INITIAL: State = {
  perspectives: [], source: null, generatedAt: null, loading: true,
  generating: false, error: null, quota: null,
};

export function useWatchlistPerspectives(ticker: string) {
  const [state, setState] = useState<State>(INITIAL);

  const load = useCallback(async (signal?: AbortSignal) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const body = await watchlistJsonRequest<PerspectiveListResponse>(`/api/watchlist/research/${encodeURIComponent(ticker)}`, {
        signal,
        cache: 'no-store',
      }, 'perspectives_unavailable');
      setState((current) => ({
        ...current,
        perspectives: Array.isArray(body.perspectives) ? body.perspectives : [],
        source: typeof body.source === 'string' ? body.source : null,
        generatedAt: typeof body.generatedAt === 'string' ? body.generatedAt : null,
        loading: false,
      }));
    } catch (error) {
      if (!signal?.aborted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'perspectives_unavailable' }));
    }
  }, [ticker]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const generate = useCallback(async () => {
    setState((current) => ({ ...current, generating: true, error: null, quota: null }));
    try {
      const body = await watchlistJsonRequest<PerspectiveListResponse>(`/api/perspectives/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        cache: 'no-store',
      }, 'perspectives_unavailable');
      setState((current) => ({
        ...current,
        perspectives: Array.isArray(body.perspectives) ? body.perspectives : [],
        source: typeof body.source === 'string' ? body.source : null,
        generatedAt: typeof body.meta?.generated_at === 'string' ? body.meta.generated_at : null,
        generating: false,
      }));
    } catch (error) {
      const withQuota = error instanceof WatchlistRequestError
        ? error.body?.quota as QuotaNoticeProps | undefined
        : undefined;
      setState((current) => ({
        ...current,
        generating: false,
        error: error instanceof Error ? error.message : 'perspectives_unavailable',
        quota: withQuota ?? null,
      }));
    }
  }, [ticker]);

  return { ...state, refetch: () => load(), generate };
}
