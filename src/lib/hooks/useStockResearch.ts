'use client';

import { useEffect, useState } from 'react';
import type { StockNewsResponse, StockReportsResponse } from '@/lib/stocks/research-types';

interface StockResearchState {
  news: StockNewsResponse | null;
  reports: StockReportsResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStockResearch(ticker: string, options: { storedFirst?: boolean } = {}): StockResearchState {
  const storedFirst = options.storedFirst === true;
  const [state, setState] = useState<Omit<StockResearchState, 'refresh'>>({
    news: null, reports: null, loading: true, refreshing: false, error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState({ news: null, reports: null, loading: true, refreshing: false, error: null });
    const load = async () => {
      try {
        const encoded = encodeURIComponent(ticker);
        if (storedFirst) {
          const response = await fetch(`/api/watchlist/research/${encoded}`, { signal: controller.signal, cache: 'no-store' });
          const body = await response.json().catch(() => null);
          if (!response.ok || !body?.news || !body?.reports) throw new Error(body?.error || 'research_unavailable');
          if (!controller.signal.aborted) setState({ news: body.news, reports: body.reports, loading: false, refreshing: false, error: null });
          return;
        }
        const [newsResponse, reportsResponse] = await Promise.all([
          fetch(`/api/news/${encoded}`, { signal: controller.signal, cache: 'no-store' }),
          fetch(`/api/reports/${encoded}`, { signal: controller.signal, cache: 'no-store' }),
        ]);
        const [news, reports] = await Promise.all([newsResponse.json(), reportsResponse.json()]);
        if (controller.signal.aborted) return;
        setState({
          news: newsResponse.ok ? news : null,
          reports: reportsResponse.ok ? reports : null,
          loading: false,
          refreshing: false,
          error: newsResponse.ok || reportsResponse.ok ? null : 'research_unavailable',
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ news: null, reports: null, loading: false, refreshing: false, error: error instanceof Error ? error.message : 'research_unavailable' });
      }
    };
    void load();
    return () => controller.abort();
  }, [storedFirst, ticker]);

  const refresh = async () => {
    setState((current) => ({ ...current, refreshing: true, error: null }));
    try {
      const encoded = encodeURIComponent(ticker);
      if (storedFirst) {
        const response = await fetch(`/api/watchlist/research/${encoded}`, { method: 'POST', cache: 'no-store' });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.news || !body?.reports) throw new Error(body?.error || 'research_refresh_failed');
        setState({ news: body.news, reports: body.reports, loading: false, refreshing: false, error: null });
        return;
      }
      const [newsResponse, reportsResponse] = await Promise.all([
        fetch(`/api/news/${encoded}`, { cache: 'no-store' }),
        fetch(`/api/reports/${encoded}`, { cache: 'no-store' }),
      ]);
      const [news, reports] = await Promise.all([newsResponse.json(), reportsResponse.json()]);
      if (!newsResponse.ok && !reportsResponse.ok) throw new Error('research_refresh_failed');
      setState({
        news: newsResponse.ok ? news : null,
        reports: reportsResponse.ok ? reports : null,
        loading: false,
        refreshing: false,
        error: null,
      });
    } catch (error) {
      setState((current) => ({ ...current, refreshing: false, error: error instanceof Error ? error.message : 'research_refresh_failed' }));
    }
  };

  return { ...state, refresh };
}
