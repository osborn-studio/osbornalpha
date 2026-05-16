'use client';

import { useEffect, useState, useRef } from 'react';
import type { Market } from '@/lib/supabase/database.types';

export interface LiveQuote {
  source: string;
  ticker: string;
  name: string;
  market: Market;
  currency: string;
  price: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume: number;
  amount: number;
  amplitude: number;
  market_cap: number | null;
  market_cap_label: string;
  pe_ttm: number | null;
  pb: number | null;
  roe?: number | null;
  dividend_yield?: number | null;
  gross_margin?: number | null;
  turnover: number | null;
  volume_ratio: number | null;
  updated_at: string;
  delayed: boolean;
  supplemented?: string[];
}

interface State {
  data: LiveQuote | null;
  loading: boolean;
  error: string | null;
}

// In-flight cache to dedupe concurrent requests for the same ticker
const inflight = new Map<string, Promise<LiveQuote | null>>();
// Result cache (TTL 30s)
const cache = new Map<string, { data: LiveQuote; ts: number }>();
const TTL = 30_000;

async function fetchQuote(ticker: string): Promise<LiveQuote | null> {
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  if (inflight.has(ticker)) return inflight.get(ticker)!;

  const promise = (async () => {
    const resp = await fetch(`/api/quote/${encodeURIComponent(ticker)}`);
    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw new Error(`HTTP ${resp.status}`);
    }
    const data: LiveQuote = await resp.json();
    cache.set(ticker, { data, ts: Date.now() });
    return data;
  })();

  inflight.set(ticker, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(ticker);
  }
}

export function useQuote(ticker: string | null, opts?: { refreshIntervalMs?: number }): State {
  const [state, setState] = useState<State>({ data: null, loading: !!ticker, error: null });
  const abortRef = useRef<boolean>(false);
  const refreshMs = opts?.refreshIntervalMs ?? 0;

  useEffect(() => {
    if (!ticker) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    abortRef.current = false;
    setState((prev) => ({ ...prev, loading: !prev.data, error: null }));

    const run = async (forceBypass = false) => {
      if (forceBypass) cache.delete(ticker);
      try {
        const data = await fetchQuote(ticker);
        if (abortRef.current) return;
        setState({ data, loading: false, error: data ? null : '未找到该标的的报价' });
      } catch (err: any) {
        if (abortRef.current) return;
        setState((prev) => ({ data: prev.data, loading: false, error: err?.message || '获取失败' }));
      }
    };
    run();

    let timer: ReturnType<typeof setInterval> | null = null;
    if (refreshMs > 0) {
      timer = setInterval(() => run(true), refreshMs);
    }

    return () => {
      abortRef.current = true;
      if (timer) clearInterval(timer);
    };
  }, [ticker, refreshMs]);

  return state;
}

// ─── Batch ───
interface BatchState { quotes: Record<string, LiveQuote | null>; loading: boolean }

export function useBatchQuotes(tickers: string[], opts?: { refreshIntervalMs?: number }): BatchState {
  const [state, setState] = useState<BatchState>({ quotes: {}, loading: tickers.length > 0 });
  const key = tickers.slice().sort().join(',');
  const refreshMs = opts?.refreshIntervalMs ?? 0;

  useEffect(() => {
    if (tickers.length === 0) {
      setState({ quotes: {}, loading: false });
      return;
    }
    let cancelled = false;

    const run = (isRefresh = false) => {
      if (!isRefresh) setState((prev) => ({ ...prev, loading: !prev.quotes || Object.keys(prev.quotes).length === 0 }));
      fetch(`/api/quote/batch?tickers=${encodeURIComponent(tickers.join(','))}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const quotes = data.quotes || {};
          for (const t in quotes) {
            if (quotes[t]) cache.set(t, { data: quotes[t], ts: Date.now() });
          }
          setState({ quotes, loading: false });
        })
        .catch(() => {
          if (cancelled) return;
          setState((prev) => ({ ...prev, loading: false }));
        });
    };
    run();

    let timer: ReturnType<typeof setInterval> | null = null;
    if (refreshMs > 0) {
      timer = setInterval(() => run(true), refreshMs);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshMs]);

  return state;
}

// ─── Financials ───
export interface YearlyFinancial {
  year: number;
  revenue_yi: number | null;
  total_revenue_yi: number | null;
  net_income_yi: number | null;
  eps_basic: number | null;
  total_assets_yi: number | null;
  total_liab_yi: number | null;
  equity_yi: number | null;
  op_cashflow_yi: number | null;
  free_cashflow_yi: number | null;
}
export interface FinancialState {
  yearly: YearlyFinancial[];
  latest_indicator: any;
  source: string | null;
  loading: boolean;
  error: string | null;
}

export function useFinancials(ticker: string | null): FinancialState {
  const [state, setState] = useState<FinancialState>({
    yearly: [], latest_indicator: null, source: null,
    loading: !!ticker, error: null,
  });

  useEffect(() => {
    if (!ticker) { setState({ yearly: [], latest_indicator: null, source: null, loading: false, error: null }); return; }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetch(`/api/financials/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setState({
          yearly: data.yearly || [],
          latest_indicator: data.latest_indicator || null,
          source: data.source,
          loading: false,
          error: data.error || null,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setState({ yearly: [], latest_indicator: null, source: null, loading: false, error: err?.message || '获取失败' });
      });
    return () => { cancelled = true; };
  }, [ticker]);

  return state;
}

// ─── Holders ───
export interface HolderRow {
  ts_code: string;
  ann_date: string;
  end_date: string;
  holder_name: string;
  hold_amount: number;
  hold_ratio: number;
}
export interface HoldersState {
  top10: HolderRow[];
  floats: HolderRow[];
  reporting_period: string | null;
  source: string | null;
  loading: boolean;
  error: string | null;
}

export function useHolders(ticker: string | null): HoldersState {
  const [state, setState] = useState<HoldersState>({
    top10: [], floats: [], reporting_period: null, source: null, loading: !!ticker, error: null,
  });

  useEffect(() => {
    if (!ticker) { setState({ top10: [], floats: [], reporting_period: null, source: null, loading: false, error: null }); return; }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetch(`/api/holders/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setState({
          top10: data.top10_holders || [],
          floats: data.top10_floatholders || [],
          reporting_period: data.reporting_period,
          source: data.source,
          loading: false,
          error: data.error || null,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setState({ top10: [], floats: [], reporting_period: null, source: null, loading: false, error: err?.message });
      });
    return () => { cancelled = true; };
  }, [ticker]);

  return state;
}

// ─── Perspectives ───
export interface PerspectiveRow {
  persona: string;
  name: string;
  stance: 'bullish' | 'neutral' | 'bearish';
  confidence: number;
  summary: string;
  cites: string[];
}
export interface PerspectivesState {
  perspectives: PerspectiveRow[];
  source: string | null;
  meta: any;
  loading: boolean;
  error: string | null;
}

export function usePerspectives(ticker: string | null, autoLoad = false): PerspectivesState & { refetch: () => void } {
  const [state, setState] = useState<PerspectivesState>({
    perspectives: [], source: null, meta: null, loading: false, error: null,
  });

  const fetcher = (t: string) => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetch(`/api/perspectives/${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setState({
          perspectives: data.perspectives || [],
          source: data.source,
          meta: data.meta,
          loading: false,
          error: data.error || null,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setState({ perspectives: [], source: null, meta: null, loading: false, error: err?.message });
      });
    return () => { cancelled = true; };
  };

  useEffect(() => {
    if (!ticker || !autoLoad) {
      setState({ perspectives: [], source: null, meta: null, loading: false, error: null });
      return;
    }
    return fetcher(ticker);
  }, [ticker, autoLoad]);

  return {
    ...state,
    refetch: () => { if (ticker) fetcher(ticker); },
  };
}

// ─── K-line ───
export interface KlineState {
  bars: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>;
  loading: boolean;
  error: string | null;
  source: string | null;
}

const klineCache = new Map<string, { state: KlineState; ts: number }>();
const KLINE_TTL = 300_000; // 5 min

export function useKline(ticker: string | null, period: 'D' | 'W' | 'M' = 'D', limit = 120): KlineState {
  const [state, setState] = useState<KlineState>({ bars: [], loading: !!ticker, error: null, source: null });

  useEffect(() => {
    if (!ticker) {
      setState({ bars: [], loading: false, error: null, source: null });
      return;
    }
    const key = `${ticker}|${period}|${limit}`;
    const cached = klineCache.get(key);
    if (cached && Date.now() - cached.ts < KLINE_TTL) {
      setState(cached.state);
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetch(`/api/kline/${encodeURIComponent(ticker)}?period=${period}&limit=${limit}`)
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 404) return { bars: [], source: 'none' };
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const next: KlineState = { bars: data.bars || [], loading: false, error: null, source: data.source || null };
        klineCache.set(key, { state: next, ts: Date.now() });
        setState(next);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setState({ bars: [], loading: false, error: err?.message || '获取失败', source: null });
      });

    return () => { cancelled = true; };
  }, [ticker, period, limit]);

  return state;
}
