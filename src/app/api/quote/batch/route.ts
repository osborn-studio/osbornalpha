import { NextResponse } from 'next/server';
import { KlineProviderError } from '@/lib/data/kline/types';
import { quoteSourcesFor } from '@/lib/data/sources/registry';
import { fetchTwseQuotesBatch, twseQuoteRetentionStart } from '@/lib/data/sources/twse';
import { classifyMarket } from '@/lib/utils';
import {
  isTushareConfigured,
  fetchTushareDaily,
  fetchTushareDailyBasic,
} from '@/lib/data/sources/tushare-cached';
import { MOCK_UNIVERSE } from '@/lib/data/mock';
import type { Market } from '@/lib/supabase/database.types';
import {
  aggregateSourceAttempts,
  classifySourceFailure,
  type SourceAttempt,
  type SourceOutcome,
} from '@/lib/quotes/diagnostics';
import { withQuoteRequestBudget, waitQuoteRetry } from '@/lib/quotes/request-budget';
import { withQuoteSourceTimeout } from '@/lib/quotes/source-timeout';
import { fetchDatagatewayRealtimeQuotes, isDatagatewayConfigured } from '@/lib/data/sources/datagateway-quote';

export const dynamic = 'force-dynamic';
export const revalidate = 30;
export const maxDuration = 30;

const FRESH_TTL_MS = 60_000;
const STALE_TTL_MS = 15 * 60_000;
const SOURCE_ATTEMPT_TIMEOUT_MS = 2_500;

interface QuoteShape {
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
  turnover: number | null;
  volume_ratio: number | null;
  updated_at: string;
  delayed: boolean;
}

const quoteCache = new Map<string, { quote: QuoteShape; ts: number; generation: number }>();
let quoteRequestGeneration = 0;

function lookupName(ticker: string): string {
  const hit = MOCK_UNIVERSE.find((u) => u.t === ticker);
  return hit?.n || ticker;
}

function formatMarketCap(yuan: number | null): string {
  if (yuan === null || yuan === 0) return '—';
  if (yuan >= 1e12) return `¥${(yuan / 1e12).toFixed(2)}万亿`;
  if (yuan >= 1e8) return `¥${(yuan / 1e8).toFixed(0)}亿`;
  if (yuan >= 1e4) return `¥${(yuan / 1e4).toFixed(0)}万`;
  return `¥${yuan.toFixed(0)}`;
}

/**
 * Tushare-only synthesis for A-shares — the final fallback that costs 积分.
 * Eastmoney's `push2delay` host is blocked from Vercel for A-share secid
 * prefixes (0/1). Sina + Tencent are tried first; this only fires if both
 * also fail (e.g. their CDNs are flaky on a given request).
 */
async function tushareFallback(ticker: string): Promise<QuoteShape | null> {
  if (!isTushareConfigured()) return null;
  const [daily, basic] = await Promise.all([
    fetchTushareDaily(ticker, 1).catch(() => []),
    fetchTushareDailyBasic(ticker).catch(() => null),
  ]);
  const last = daily[0];
  if (!last && !basic) return null;

  const close = last?.close ?? basic?.close ?? 0;
  const prev_close = last?.pre_close ?? 0;
  const change = last?.change ?? (prev_close ? close - prev_close : 0);
  const change_pct = last?.pct_chg ?? (prev_close ? ((close - prev_close) / prev_close) * 100 : 0);
  const market_cap = basic?.total_mv != null ? basic.total_mv * 10000 : null;

  return {
    source: 'tushare-daily',
    ticker,
    name: lookupName(ticker),
    market: 'A',
    currency: '¥',
    price: close,
    change,
    change_pct,
    open: last?.open ?? close,
    high: last?.high ?? close,
    low: last?.low ?? close,
    prev_close,
    volume: last?.vol ?? 0,
    amount: last?.amount ?? 0,
    amplitude: prev_close > 0 ? (((last?.high ?? close) - (last?.low ?? close)) / prev_close) * 100 : 0,
    market_cap,
    market_cap_label: formatMarketCap(market_cap),
    pe_ttm: basic?.pe_ttm ?? null,
    pb: basic?.pb ?? null,
    turnover: basic?.turnover_rate ?? null,
    volume_ratio: null,
    updated_at: last?.trade_date
      ? `${last.trade_date.slice(0, 4)}-${last.trade_date.slice(4, 6)}-${last.trade_date.slice(6, 8)}T15:00:00+08:00`
      : new Date().toISOString(),
    delayed: true,
  };
}

/**
 * Run a single fetcher with one transient-failure retry.
 * Fast errors/empty responses retry after 200ms; exhausted source deadlines
 * move to the next provider so hanging free sources cannot starve paid fallback.
 */
async function withRetry<T>(
  ticker: string,
  source: string,
  fn: (signal: AbortSignal) => Promise<T | null>,
  parent: AbortSignal,
): Promise<{ value: T | null; attempt: SourceAttempt }> {
  const startedAt = Date.now();
  let attempts = 0;
  let failureOutcome: Exclude<SourceOutcome, 'success' | 'empty'> | null = null;

  const maxAttempts = source === 'tushare' ? 1 : 2; // Uncancellable cached paid work must not overlap a retry.
  for (let index = 0; index < maxAttempts; index += 1) {
    parent.throwIfAborted();
    attempts += 1;
    try {
      const value = await withQuoteSourceTimeout(fn, SOURCE_ATTEMPT_TIMEOUT_MS, parent);
      if (value) {
        return {
          value,
          attempt: { ticker, source, outcome: 'success', attempts, duration_ms: Date.now() - startedAt },
        };
      }
    } catch (error) {
      parent.throwIfAborted();
      failureOutcome = classifySourceFailure(error);
      if (failureOutcome === 'timeout') break;
    }
    if (index + 1 < maxAttempts) await waitQuoteRetry(parent);
  }

  return {
    value: null,
    attempt: {
      ticker,
      source,
      outcome: failureOutcome ?? 'empty',
      attempts,
      duration_ms: Date.now() - startedAt,
    },
  };
}

/**
 * Resolve a quote via the market-routed registry cascade. Each layer is a
 * separate network call — we stop at the first one that returns a usable
 * quote. For A/HK/US the order is unchanged:
 *
 *   Datagateway/Wind          ← preferred batched realtime snapshot
 *   Eastmoney (push2delay)   ← public fallback; blocked from Vercel for A-share
 *   Sina (hq.sinajs.cn)      ← free, no auth, GBK; AKShare's underlying A/HK/US source
 *   Tencent (qt.gtimg.cn)    ← free, no auth, GBK; second free fallback
 *   Tushare daily            ← costs 积分; only fires if all three free sources fail
 *
 * The batch route resolves Datagateway once before reaching this fallback.
 * Each remaining individual call has a 1-retry wrapper for transient hiccups.
 * (TW tickers are handled by fetchTwseQuotesBatch in GET — one native
 * multi-symbol mis request — and never reach this function.)
 */
interface QuoteResolution {
  quote: QuoteShape | null;
  attempts: SourceAttempt[];
  selectedSource: string | null;
}

async function resolveQuote(ticker: string, skipDatagateway: boolean, signal: AbortSignal): Promise<QuoteResolution> {
  const attempts: SourceAttempt[] = [];
  for (const s of quoteSourcesFor(classifyMarket(ticker))) {
    if (skipDatagateway && s.name === 'datagateway-wind') continue;
    const result = await withRetry(ticker, s.name, (signal) => s.fetch(ticker, signal), signal);
    attempts.push(result.attempt);
    if (result.value) {
      return { quote: result.value as unknown as QuoteShape, attempts, selectedSource: s.name };
    }
  }

  // Final layer: Tushare (A-share only, costs 积分)
  if (/\.(SH|SZ|BJ)$/i.test(ticker)) {
    const result = await withRetry(ticker, 'tushare', () => tushareFallback(ticker), signal);
    attempts.push(result.attempt);
    if (result.value) return { quote: result.value, attempts, selectedSource: 'tushare' };
  }

  return { quote: null, attempts, selectedSource: null };
}

export async function GET(req: Request) {
  try {
    return await withQuoteRequestBudget(req.signal, signal => quoteBatch(req, signal));
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'quote_request_timeout' }, { status: 503 });
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'quote_request_cancelled' }, { status: 503 });
    }
    throw error;
  }
}

async function quoteBatch(req: Request, signal: AbortSignal) {
  const startedAt = Date.now();
  const retentionStart = performance.now();
  const generation = ++quoteRequestGeneration;
  const retain = (ticker: string, quote: QuoteShape, providerStart?: number) => {
    if ((quoteCache.get(ticker)?.generation ?? 0) > generation) return;
    quoteCache.set(ticker, { quote, ts: Math.min(retentionStart, providerStart ?? retentionStart), generation });
  };
  const url = new URL(req.url);
  const tickersParam = url.searchParams.get('tickers') || '';
  const tickers = tickersParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);  // cap

  if (tickers.length === 0) {
    return NextResponse.json({
      quotes: {},
      meta: {
        attempted: 0,
        failed: 0,
        stale: 0,
        duration_ms: 0,
        sources: {},
        failed_tickers: [],
        selected_sources: {},
      },
    });
  }

  const force = url.searchParams.has('_');
  const now = performance.now();
  const freshQuotes: Record<string, QuoteShape> = {};
  const selectedSources: Record<string, string> = {};
  const toFetch: string[] = [];
  for (const ticker of tickers) {
    const cached = quoteCache.get(ticker);
    if (!force && cached && now - cached.ts < FRESH_TTL_MS) {
      freshQuotes[ticker] = cached.quote;
      selectedSources[ticker] = 'cache';
    } else {
      toFetch.push(ticker);
    }
  }

  // Wind/DataGateway is queried once for the whole uncached set. Only the
  // missing symbols continue to the existing per-source fallback cascade.
  let windMap = new Map<string, QuoteShape | null | undefined>();
  let windFailure: Exclude<SourceOutcome, 'success' | 'empty'> | null = null;
  let windAttempts = 0;
  let windFailureKind = 'unknown';
  let windHttpStatus: number | null = null;
  const windStartedAt = performance.now();
  if (isDatagatewayConfigured() && toFetch.length > 0) {
    windAttempts = 1;
    try {
      windMap = await withQuoteSourceTimeout(s => fetchDatagatewayRealtimeQuotes(toFetch, { signal: s }), 5_000, signal);
      windFailure = null;
    } catch (error) {
      signal.throwIfAborted();
      windFailure = classifySourceFailure(error);
      // Only typed, allowlisted metadata crosses the diagnostic boundary.
      // Never derive a reason/status from messages or serialize the error.
      if (error instanceof KlineProviderError) {
        const kinds = ['unsupported', 'empty', 'not_found', 'rate_limited', 'transient', 'protocol', 'invalid_data'];
        if (kinds.includes(error.kind)) windFailureKind = error.kind;
        const status = error.status;
        if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) windHttpStatus = status;
      } else if (error instanceof Error && error.name === 'TimeoutError') {
        windFailureKind = 'timeout';
      }
    }
  }
  // One stage duration, captured before fallback work. Public summaries still
  // sum this duration once per requested symbol, as they do for attempt counts.
  const windDurationMs = Math.max(0, Math.round(performance.now() - windStartedAt));
  const gatewayHit = (ticker: string): QuoteShape | null => windMap.get(ticker.toUpperCase()) ?? null;
  const fallbackTickers = toFetch.filter((ticker) => !gatewayHit(ticker));
  if (windAttempts > 0 && fallbackTickers.length > 0) {
    try {
      // One aggregate per configured miss, even when all fallbacks succeed.
      // Logger failures must not affect quote selection, caches or cancellation.
      void Promise.resolve(console.warn('quote datagateway miss', {
        requested_count: toFetch.length,
        usable_count: toFetch.length - fallbackTickers.length,
        missing_count: fallbackTickers.length,
        attempts: windAttempts,
        failure_kind: windFailure ? windFailureKind : fallbackTickers.length < toFetch.length ? 'partial' : 'empty',
        http_status: windHttpStatus,
        duration_ms: windDurationMs,
      })).catch(() => {});
    } catch { /* Diagnostics are best effort. */ }
  }
  // TW group: one native multi-symbol mis request (rate limit ~3 req / 5 s);
  // remaining markets go through the per-ticker registry cascade.
  const twTickers = fallbackTickers.filter((t) => classifyMarket(t) === 'TW');
  const otherTickers = fallbackTickers.filter((t) => classifyMarket(t) !== 'TW');

  const twStartedAt = Date.now();
  let twFailure: Exclude<SourceOutcome, 'success' | 'empty'> | null = null;
  const [twMap, results] = await Promise.all([
    twTickers.length > 0
      ? withQuoteSourceTimeout(child => fetchTwseQuotesBatch(twTickers, child), 5_000, signal).catch((error) => {
          twFailure = classifySourceFailure(error);
          return new Map<string, QuoteShape | null>();
        })
      : Promise.resolve(new Map<string, QuoteShape | null>()),
    Promise.allSettled(otherTickers.map((ticker) =>
      withQuoteSourceTimeout(child => resolveQuote(ticker, true, child), 14_000, signal))),
  ]);

  signal.throwIfAborted(); // Late provider completion must not update caches.
  const quotes: Record<string, QuoteShape | null> = { ...freshQuotes };
  const sourceAttempts: SourceAttempt[] = [];
  if (isDatagatewayConfigured()) {
    for (const ticker of toFetch) {
      const value = gatewayHit(ticker);
      sourceAttempts.push({
        ticker,
        source: 'datagateway-wind',
        outcome: value ? 'success' : windFailure ?? 'empty',
        attempts: windAttempts,
        duration_ms: windDurationMs,
      });
      if (value) {
        retain(ticker, value);
        quotes[ticker] = value;
        selectedSources[ticker] = 'datagateway-wind';
      }
    }
  }
  let stale = 0;
  results.forEach((r, i) => {
    const ticker = otherTickers[i];
    const resolution = r.status === 'fulfilled'
      ? r.value
      : {
          quote: null,
          attempts: [{
            ticker,
            source: 'resolver',
            outcome: classifySourceFailure(r.reason),
            attempts: 1,
            duration_ms: Date.now() - startedAt,
          }],
          selectedSource: null,
        } satisfies QuoteResolution;
    sourceAttempts.push(...resolution.attempts);
    const value = resolution.quote;
    if (value) {
      retain(ticker, value);
      quotes[ticker] = value;
      if (resolution.selectedSource) selectedSources[ticker] = resolution.selectedSource;
      return;
    }
    const cached = quoteCache.get(ticker);
    if (cached && performance.now() - cached.ts < STALE_TTL_MS) {
      stale += 1;
      quotes[ticker] = { ...cached.quote, delayed: true };
      selectedSources[ticker] = 'stale-cache';
    } else {
      quotes[ticker] = null;
    }
  });
  for (const t of twTickers) {
    const value = (twMap.get(t) as QuoteShape | undefined) ?? null;
    sourceAttempts.push({
      ticker: t,
      source: 'twse',
      outcome: value ? 'success' : twFailure ?? 'empty',
      attempts: 1,
      duration_ms: Date.now() - twStartedAt,
    });
    if (value) {
      retain(t, value, twseQuoteRetentionStart(value));
      quotes[t] = value;
      selectedSources[t] = 'twse';
      continue;
    }
    const cached = quoteCache.get(t);
    if (cached && performance.now() - cached.ts < STALE_TTL_MS) {
      stale += 1;
      quotes[t] = { ...cached.quote, delayed: true };
      selectedSources[t] = 'stale-cache';
    } else {
      quotes[t] = null;
    }
  }

  const failed = tickers.filter((t) => !quotes[t]).length;
  const failedTickers = tickers.filter((t) => !quotes[t]);
  const sources = aggregateSourceAttempts(sourceAttempts);
  if (failed > 0) {
    console.warn('quote batch degraded', { attempted: tickers.length, failed, stale, sources });
  }

  return NextResponse.json({
    quotes,
    meta: {
      attempted: tickers.length,
      failed,
      stale,
      duration_ms: Date.now() - startedAt,
      sources,
      failed_tickers: failedTickers,
      selected_sources: selectedSources,
    },
  });
}
