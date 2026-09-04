'use client';

import { useCallback, useEffect, useState } from 'react';
import type { QuotaNoticeProps } from '@/components/QuotaNotice';
import type { PerspectiveRow } from '@/lib/hooks/useQuote';

interface State {
  perspectives: PerspectiveRow[];
  source: string | null;
  generatedAt: string | null;
  loading: boolean;
  generating: boolean;
  error: string | null;
  quota: QuotaNoticeProps | null;
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
      const response = await fetch(`/api/watchlist/research/${encodeURIComponent(ticker)}`, { signal, cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'perspectives_unavailable');
      setState((current) => ({
        ...current,
        perspectives: Array.isArray(body.perspectives) ? body.perspectives : [],
        source: body.source ?? null,
        generatedAt: body.generatedAt ?? null,
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
      const response = await fetch(`/api/perspectives/${encodeURIComponent(ticker)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.error) throw Object.assign(new Error(body?.error || 'perspectives_unavailable'), { quota: body?.quota });
      setState((current) => ({
        ...current,
        perspectives: Array.isArray(body.perspectives) ? body.perspectives : [],
        source: body.source ?? null,
        generatedAt: body.meta?.generated_at ?? null,
        generating: false,
      }));
    } catch (error) {
      const withQuota = error as Error & { quota?: QuotaNoticeProps };
      setState((current) => ({ ...current, generating: false, error: withQuota.message, quota: withQuota.quota ?? null }));
    }
  }, [ticker]);

  return { ...state, refetch: () => load(), generate };
}
