'use client';

import { useEffect, useState, useRef } from 'react';
import type { QuotaNoticeProps } from '@/components/QuotaNotice';
import type { Market } from '@/lib/supabase/database.types';
import { klineBarLimit, type KlineBar, type KlineMeta, type KlineRange } from '@/lib/chart/kline';
import { trackEvent } from '@/lib/analytics/client';
import {
  classifyQuoteBatchOutcome,
  chunkQuoteTickers,
  mergeQuoteBatchResults,
  shouldRetryQuoteBatchError,
  shouldReportQuoteBatch,
  type QuoteBatchPayload,
} from '@/lib/quotes/batch-client';

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
  notFound: boolean;
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
  const [state, setState] = useState<State>({
    data: null,
    loading: !!ticker,
    error: null,
    notFound: false,
  });
  const refreshMs = opts?.refreshIntervalMs ?? 0;

  useEffect(() => {
    if (!ticker) {
      setState({ data: null, loading: false, error: null, notFound: false });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null, notFound: false });

    const run = async (forceBypass = false) => {
      if (forceBypass) cache.delete(ticker);
      try {
        const data = await fetchQuote(ticker);
        if (cancelled) return;
        setState({
          data,
          loading: false,
          error: data ? null : 'quote_not_found',
          notFound: !data,
        });
      } catch (err: any) {
        if (cancelled) return;
        setState((prev) => ({
          data: prev.data,
          loading: false,
          error: err?.message || 'quote_fetch_failed',
          notFound: false,
        }));
      }
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
  }, [ticker, refreshMs]);

  return state;
}

// ─── Batch ───
interface BatchState { quotes: Record<string, LiveQuote | null>; loading: boolean; loadedAt: number | null }

const BATCH_REQUEST_TIMEOUT_MS = 25_000;
const BATCH_RESULT_TTL_MS = 5_000;
const batchInflight = new Map<string, Promise<QuoteBatchPayload<LiveQuote>>>();
const batchResultCache = new Map<string, { payload: QuoteBatchPayload<LiveQuote>; ts: number }>();

async function fetchQuoteBatchChunk(url: string): Promise<QuoteBatchPayload<LiveQuote>> {
  const cached = batchResultCache.get(url);
  if (cached && Date.now() - cached.ts < BATCH_RESULT_TTL_MS) return cached.payload;
  const existing = batchInflight.get(url);
  if (existing) return existing;

  const request = (async () => {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), BATCH_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`quote batch HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload || typeof payload !== 'object') throw new Error('invalid quote batch response');
        const typedPayload = payload as QuoteBatchPayload<LiveQuote>;
        batchResultCache.set(url, { payload: typedPayload, ts: Date.now() });
        return typedPayload;
      } catch (error) {
        if (!shouldRetryQuoteBatchError(error, attempt)) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      } finally {
        window.clearTimeout(timeout);
      }
    }
  })();
  batchInflight.set(url, request);
  try {
    return await request;
  } finally {
    if (batchInflight.get(url) === request) batchInflight.delete(url);
  }
}

export function useBatchQuotes(
  tickers: string[],
  opts?: { refreshIntervalMs?: number }
): BatchState & { refetch: () => void } {
  const [state, setState] = useState<BatchState>({ quotes: {}, loading: tickers.length > 0, loadedAt: null });
  // `bump` lets callers trigger a manual refetch without changing tickers
  const [bump, setBump] = useState(0);
  const key = tickers.slice().sort().join(',');
  const refreshMs = opts?.refreshIntervalMs ?? 0;
  const quotesRef = useRef<Record<string, LiveQuote | null>>({});
  const lastReportedAtRef = useRef(0);
  const lastHandledBumpRef = useRef(0);

  useEffect(() => {
    if (tickers.length === 0) {
      quotesRef.current = {};
      setState({ quotes: {}, loading: false, loadedAt: null });
      return;
    }
    let cancelled = false;
    let inFlight = false;

    const fetchChunk = async (chunk: string[], manual: boolean): Promise<QuoteBatchPayload<LiveQuote>> => {
      const url = `/api/quote/batch?tickers=${encodeURIComponent(chunk.join(','))}${manual ? `&_=${bump}` : ''}`;
      return fetchQuoteBatchChunk(url);
    };

    const run = async (manual = false) => {
      if (inFlight || cancelled) return;
      inFlight = true;
      if (!manual) {
        setState((prev) => ({ ...prev, loading: Object.keys(prev.quotes).length === 0 }));
      }

      const startedAt = Date.now();
      const chunks = chunkQuoteTickers(tickers);
      try {
        const settled = await Promise.allSettled(chunks.map((chunk) => fetchChunk(chunk, manual)));
        if (cancelled) return;
        const merged = mergeQuoteBatchResults({
          tickers,
          previousQuotes: quotesRef.current,
          chunks,
          settled,
        });
        merged.meta.duration_ms = Date.now() - startedAt;
        quotesRef.current = merged.quotes;

        for (const [ticker, quote] of Object.entries(merged.quotes)) {
          if (quote) cache.set(ticker, { data: quote, ts: Date.now() });
        }

        const allChunksFailed = chunks.length > 0 && merged.meta.failed_chunks === chunks.length;
        const allTickersUnavailable = tickers.length > 0 && merged.meta.failed >= tickers.length;
        const outcome = classifyQuoteBatchOutcome({
          allChunksFailed,
          allTickersUnavailable,
          failed: merged.meta.failed,
          durationMs: merged.meta.duration_ms,
        });
        const eventMetadata = {
          count: tickers.length,
          failed: merged.meta.failed,
          stale: merged.meta.stale,
          duration_ms: merged.meta.duration_ms,
          failed_chunks: merged.meta.failed_chunks,
          sources: merged.meta.sources,
          failed_tickers: merged.meta.failed_tickers,
          error_codes: merged.meta.error_codes,
          selected_sources: merged.meta.selected_sources,
        };
        const shouldReport = shouldReportQuoteBatch({
          now: Date.now(),
          lastReportedAt: lastReportedAtRef.current,
          manual,
          failed: merged.meta.failed,
          stale: merged.meta.stale,
          durationMs: merged.meta.duration_ms,
        });

        if (outcome === 'suspended') trackEvent('quote_batch_suspended', eventMetadata);
        else if (outcome === 'failed') trackEvent('quote_batch_failed', eventMetadata);
        else if (outcome === 'degraded') trackEvent('quote_batch_degraded', eventMetadata);
        else if (shouldReport) trackEvent('quote_batch_loaded', eventMetadata);
        if (shouldReport) lastReportedAtRef.current = Date.now();

        setState((prev) => ({
          quotes: merged.quotes,
          loading: false,
          loadedAt: outcome === 'failed' || outcome === 'suspended' ? prev.loadedAt : Date.now(),
        }));
      } catch {
        if (!cancelled) {
          trackEvent('quote_batch_failed', { count: tickers.length, error_code: 'client_processing_error' });
          setState((prev) => ({ ...prev, loading: false }));
        }
      } finally {
        inFlight = false;
      }
    };

    const initialIsManual = bump > lastHandledBumpRef.current;
    if (initialIsManual) lastHandledBumpRef.current = bump;
    void run(initialIsManual);

    let timer: ReturnType<typeof setInterval> | null = null;
    if (refreshMs > 0) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void run(false);
      }, refreshMs);
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void run(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshMs, bump]);

  return { ...state, refetch: () => setBump((b) => b + 1) };
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
  /** Present for count or platform-cost exhaustion — render <QuotaNotice {...quota} />. */
  quota: QuotaNoticeProps | null;
}

export function usePerspectives(ticker: string | null, autoLoad = false): PerspectivesState & { refetch: () => void } {
  const [state, setState] = useState<PerspectivesState>({
    perspectives: [], source: null, meta: null, loading: false, error: null, quota: null,
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
          quota: data.quota || null,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setState({ perspectives: [], source: null, meta: null, loading: false, error: err?.message, quota: null });
      });
    return () => { cancelled = true; };
  };

  useEffect(() => {
    if (!ticker || !autoLoad) {
      setState({ perspectives: [], source: null, meta: null, loading: false, error: null, quota: null });
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
  bars: KlineBar[];
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  source: KlineMeta['source'] | null;
  meta: KlineMeta | null;
}

const klineCache = new Map<string, { state: KlineState; ts: number }>();

export interface KlinePayload {
  bars: KlineBar[];
  source: KlineMeta['source'];
  meta: KlineMeta;
}

function isValidKlinePayload(value: unknown): value is KlinePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<KlinePayload>;
  if (!Array.isArray(payload.bars) || !payload.meta || typeof payload.meta !== 'object') return false;
  if (typeof payload.source !== 'string' || payload.source !== payload.meta.source) return false;
  if (typeof payload.meta.cacheTtlSeconds !== 'number' || payload.meta.cacheTtlSeconds <= 0) return false;
  if ((payload.meta.range === '1d' && (payload.meta.interval !== 'minute' || payload.meta.granularity !== '1m'))
    || (payload.meta.range !== '1d' && (payload.meta.interval !== 'day' || payload.meta.granularity !== '1d'))) return false;
  if (payload.meta.volumeUnit !== 'shares'
    || typeof payload.meta.currencyCode !== 'string'
    || !Number.isInteger(payload.meta.pricePrecision)
    || payload.meta.pricePrecision < 0
    || payload.meta.pricePrecision > 4
    || !Number.isFinite(payload.meta.minMove)
    || payload.meta.minMove <= 0
    || !Number.isInteger(payload.meta.requestedBars)
    || payload.meta.requestedBars <= 0
    || payload.meta.returnedBars !== payload.bars.length
    || payload.meta.missingBars !== Math.max(0, payload.meta.requestedBars - payload.bars.length)) return false;
  let previousTime = 0;
  for (let index = 0; index < payload.bars.length; index += 1) {
    const bar = payload.bars[index];
    if (!bar || typeof bar !== 'object') return false;
    const candidate = bar as KlineBar;
    const prices = [candidate.open, candidate.high, candidate.low, candidate.close];
    if (!Number.isFinite(candidate.time) || candidate.time <= previousTime) return false;
    if (prices.some((price) => !Number.isFinite(price) || price <= 0)) return false;
    if (!Number.isFinite(candidate.volume) || candidate.volume < 0) return false;
    if (candidate.high < Math.max(candidate.open, candidate.close)
      || candidate.low > Math.min(candidate.open, candidate.close)
      || candidate.high < candidate.low) return false;
    if (candidate.previousClose === null) {
      if (candidate.change !== null || candidate.changePct !== null) return false;
    } else {
      if (!Number.isFinite(candidate.previousClose) || candidate.previousClose <= 0
        || !Number.isFinite(candidate.change) || !Number.isFinite(candidate.changePct)) return false;
      const expectedChange = candidate.close - candidate.previousClose;
      const expectedChangePct = (expectedChange / candidate.previousClose) * 100;
      if (candidate.change === null || candidate.changePct === null
        || Math.abs(candidate.change - expectedChange) > 1e-8
        || Math.abs(candidate.changePct - expectedChangePct) > 1e-8) return false;
    }
    if (index > 0 && candidate.previousClose !== payload.bars[index - 1].close) return false;
    previousTime = candidate.time;
  }
  return true;
}

export async function fetchKlinePayload(
  ticker: string,
  range: KlineRange,
  signal?: AbortSignal,
): Promise<KlinePayload> {
  const response = await fetch(`/api/kline/${encodeURIComponent(ticker)}?range=${range}`, { signal });
  const data = await response.json() as Partial<KlinePayload> & { error?: string; message?: string };
  if (!response.ok) {
    const error = new Error(data.message || data.error || `HTTP ${response.status}`) as Error & { code?: string };
    error.code = data.error;
    throw error;
  }
  if (!isValidKlinePayload(data)
    || data.meta.range !== range
    || data.meta.requestedBars !== klineBarLimit(ticker, range)) {
    const error = new Error('Invalid chart response') as Error & { code?: string };
    error.code = 'invalid_data';
    throw error;
  }
  return data;
}

export function useKline(ticker: string | null, range: KlineRange = '3m'): KlineState & { refetch: () => void } {
  const [state, setState] = useState<KlineState>({ bars: [], loading: !!ticker, error: null, errorCode: null, source: null, meta: null });
  const [refreshToken, setRefreshToken] = useState(0);
  const handledRefreshToken = useRef(0);

  useEffect(() => {
    if (!ticker) {
      setState({ bars: [], loading: false, error: null, errorCode: null, source: null, meta: null });
      return;
    }
    const key = `${ticker}|${range}`;
    const manual = refreshToken !== handledRefreshToken.current;
    if (manual) handledRefreshToken.current = refreshToken;
    const cached = klineCache.get(key);
    if (!manual && cached?.state.meta && Date.now() - cached.ts < cached.state.meta.cacheTtlSeconds * 1000) {
      setState(cached.state);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    // Do not show bars from the previous range while this range is loading.
    setState({ bars: [], loading: true, error: null, errorCode: null, source: null, meta: null });

    fetchKlinePayload(ticker, range, controller.signal)
      .then((data) => {
        if (cancelled) return;
        const next: KlineState = { bars: data.bars || [], loading: false, error: null, errorCode: null, source: data.source || null, meta: data.meta || null };
        klineCache.set(key, { state: next, ts: Date.now() });
        // Operational telemetry deliberately excludes ticker and upstream URL;
        // it is enough to monitor source availability, fallbacks, and caches.
        trackEvent('kline_loaded', {
          range,
          market: data.meta.market,
          source: data.meta.source,
          freshness: data.meta.freshness,
          cache_status: data.meta.cacheStatus,
          fallback_used: data.meta.fallbackUsed,
          partial: data.meta.partial,
        });
        setState(next);
      })
      .catch((err: Error & { code?: string }) => {
        if (cancelled || err.name === 'AbortError') return;
        trackEvent('kline_failed', { range, error_code: err.code || 'request_failed' });
        setState({ bars: [], loading: false, error: err.message || 'Failed to load chart data', errorCode: err.code || null, source: null, meta: null });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ticker, range, refreshToken]);

  return { ...state, refetch: () => setRefreshToken((token) => token + 1) };
}
