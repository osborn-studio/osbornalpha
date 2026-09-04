import { MOCK_UNIVERSE } from '@/lib/data/mock';
import { quoteSourcesFor } from '@/lib/data/sources/registry';
import { fetchTushareDaily, fetchTushareDailyBasic, isTushareConfigured } from '@/lib/data/sources/tushare-cached';
import type { Market } from '@/lib/supabase/database.types';
import { classifyMarket } from '@/lib/utils';
import { classifySourceFailure, type SourceAttempt, type SourceOutcome } from './diagnostics';
import { withQuoteSourceTimeout } from './source-timeout';

const SOURCE_ATTEMPT_TIMEOUT_MS = 2_500;
const quoteCache = new Map<string, { quote: QuoteShape; cachedAt: number }>();

export interface QuoteShape {
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

export interface QuoteResolution {
  quote: QuoteShape | null;
  attempts: SourceAttempt[];
  selectedSource: string | null;
}

export function readQuoteCache(ticker: string, maxAgeMs: number): QuoteShape | null {
  const cached = quoteCache.get(ticker.toUpperCase());
  if (!cached || Date.now() - cached.cachedAt >= maxAgeMs) return null;
  return cached.quote;
}

export function writeQuoteCache(ticker: string, quote: QuoteShape): void {
  quoteCache.set(ticker.toUpperCase(), { quote, cachedAt: Date.now() });
}

function lookupName(ticker: string): string {
  return MOCK_UNIVERSE.find((item) => item.t === ticker)?.n || ticker;
}

function formatMarketCap(yuan: number | null): string {
  if (yuan === null || yuan === 0) return '—';
  if (yuan >= 1e12) return `¥${(yuan / 1e12).toFixed(2)}万亿`;
  if (yuan >= 1e8) return `¥${(yuan / 1e8).toFixed(0)}亿`;
  if (yuan >= 1e4) return `¥${(yuan / 1e4).toFixed(0)}万`;
  return `¥${yuan.toFixed(0)}`;
}

async function tushareFallback(ticker: string): Promise<QuoteShape | null> {
  if (!isTushareConfigured()) return null;
  const [daily, basic] = await Promise.all([
    fetchTushareDaily(ticker, 1).catch(() => []),
    fetchTushareDailyBasic(ticker).catch(() => null),
  ]);
  const last = daily[0];
  if (!last && !basic) return null;

  const close = last?.close ?? basic?.close ?? 0;
  const previousClose = last?.pre_close ?? 0;
  const change = last?.change ?? (previousClose ? close - previousClose : 0);
  const changePct = last?.pct_chg ?? (previousClose ? ((close - previousClose) / previousClose) * 100 : 0);
  const marketCap = basic?.total_mv != null ? basic.total_mv * 10_000 : null;
  return {
    source: 'tushare-daily', ticker, name: lookupName(ticker), market: 'A', currency: '¥',
    price: close, change, change_pct: changePct, open: last?.open ?? close,
    high: last?.high ?? close, low: last?.low ?? close, prev_close: previousClose,
    volume: last?.vol ?? 0, amount: last?.amount ?? 0,
    amplitude: previousClose > 0 ? (((last?.high ?? close) - (last?.low ?? close)) / previousClose) * 100 : 0,
    market_cap: marketCap, market_cap_label: formatMarketCap(marketCap),
    pe_ttm: basic?.pe_ttm ?? null, pb: basic?.pb ?? null, turnover: basic?.turnover_rate ?? null,
    volume_ratio: null,
    updated_at: last?.trade_date
      ? `${last.trade_date.slice(0, 4)}-${last.trade_date.slice(4, 6)}-${last.trade_date.slice(6, 8)}T15:00:00+08:00`
      : new Date().toISOString(),
    delayed: true,
  };
}

async function withRetry<T>(
  ticker: string,
  source: string,
  fetcher: (signal: AbortSignal) => Promise<T | null>,
): Promise<{ value: T | null; attempt: SourceAttempt }> {
  const startedAt = Date.now();
  let attempts = 0;
  let failureOutcome: Exclude<SourceOutcome, 'success' | 'empty'> | null = null;
  for (let index = 0; index < 2; index += 1) {
    attempts += 1;
    try {
      const value = await withQuoteSourceTimeout(fetcher, SOURCE_ATTEMPT_TIMEOUT_MS);
      if (value) return { value, attempt: { ticker, source, outcome: 'success', attempts, duration_ms: Date.now() - startedAt } };
    } catch (error) {
      failureOutcome = classifySourceFailure(error);
    }
    if (index === 0) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return {
    value: null,
    attempt: { ticker, source, outcome: failureOutcome ?? 'empty', attempts, duration_ms: Date.now() - startedAt },
  };
}

export async function resolveQuote(ticker: string, options: { skipDatagateway?: boolean; force?: boolean; cacheTtlMs?: number } = {}): Promise<QuoteResolution> {
  const cached = !options.force ? readQuoteCache(ticker, options.cacheTtlMs ?? 60_000) : null;
  if (cached) return { quote: cached, attempts: [], selectedSource: 'cache' };
  const attempts: SourceAttempt[] = [];
  for (const source of quoteSourcesFor(classifyMarket(ticker))) {
    if (options.skipDatagateway && source.name === 'datagateway-wind') continue;
    const result = await withRetry(ticker, source.name, (signal) => source.fetch(ticker, signal));
    attempts.push(result.attempt);
    if (result.value) {
      const quote = result.value as unknown as QuoteShape;
      writeQuoteCache(ticker, quote);
      return { quote, attempts, selectedSource: source.name };
    }
  }
  if (/\.(SH|SZ|BJ)$/i.test(ticker)) {
    const result = await withRetry(ticker, 'tushare', () => tushareFallback(ticker));
    attempts.push(result.attempt);
    if (result.value) {
      writeQuoteCache(ticker, result.value);
      return { quote: result.value, attempts, selectedSource: 'tushare' };
    }
  }
  return { quote: null, attempts, selectedSource: null };
}
