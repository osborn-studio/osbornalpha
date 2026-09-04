'use client';

import { useEffect, useState } from 'react';
import type { StockNewsResponse, StockReportsResponse } from '@/lib/stocks/research-types';

interface StockResearchState {
  news: StockNewsResponse | null;
  reports: StockReportsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useStockResearch(ticker: string): StockResearchState {
  const [state, setState] = useState<StockResearchState>({ news: null, reports: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ news: null, reports: null, loading: true, error: null });
    const load = async () => {
      try {
        const encoded = encodeURIComponent(ticker);
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
          error: newsResponse.ok || reportsResponse.ok ? null : 'research_unavailable',
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ news: null, reports: null, loading: false, error: error instanceof Error ? error.message : 'research_unavailable' });
      }
    };
    void load();
    return () => controller.abort();
  }, [ticker]);

  return state;
}
