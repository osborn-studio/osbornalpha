'use client';

import { useEffect, useState } from 'react';
import type { BatchBacktestResult } from '@/lib/signals/batchBacktest';

export interface BatchBacktestState {
  data: BatchBacktestResult | null;
  loading: boolean;
  error: string | null;
}

export function useBatchBacktest(tickers: string[] | null, days = 60): BatchBacktestState & { refetch: () => void } {
  const [state, setState] = useState<BatchBacktestState>({
    data: null, loading: !!tickers, error: null,
  });
  const key = tickers ? tickers.slice().sort().join(',') : '';

  const fetcher = () => {
    if (!tickers || tickers.length === 0) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    let cancelled = false;
    const query = new URLSearchParams();
    query.set('tickers', tickers.join(','));
    query.set('days', String(days));

    fetch(`/api/backtest?${query.toString()}`)
      .then((r) => r.json())
      .then((data: BatchBacktestResult & { error?: string }) => {
        if (cancelled) return;
        if (data.error) {
          setState({ data: null, loading: false, error: data.error });
          return;
        }
        setState({ data, loading: false, error: null });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setState({ data: null, loading: false, error: err?.message || '获取失败' });
      });

    return () => { cancelled = true; };
  };

  useEffect(() => {
    if (!tickers || tickers.length === 0) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    return fetcher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, days]);

  return { ...state, refetch: () => fetcher() };
}
