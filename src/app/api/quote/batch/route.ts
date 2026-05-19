import { NextResponse } from 'next/server';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';
import { fetchSinaQuote } from '@/lib/data/sources/sina';
import { fetchTencentQuote } from '@/lib/data/sources/tencent';
import {
  isTushareConfigured,
  fetchTushareDaily,
  fetchTushareDailyBasic,
} from '@/lib/data/sources/tushare-cached';
import { MOCK_UNIVERSE } from '@/lib/data/mock';
import type { Market } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

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
 * Transient = throws OR returns null. Retry after 200ms.
 */
async function withRetry<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    const first = await fn();
    if (first) return first;
  } catch { /* fall through */ }
  await new Promise((r) => setTimeout(r, 200));
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Resolve a quote via the cascading chain. Each layer is a separate
 * network call — we stop at the first one that returns a usable quote.
 *
 *   Eastmoney (push2delay)   ← fastest when reachable; blocked from Vercel for A-share
 *   Sina (hq.sinajs.cn)      ← free, no auth, GBK; AKShare's underlying A/HK/US source
 *   Tencent (qt.gtimg.cn)    ← free, no auth, GBK; second free fallback
 *   Tushare daily            ← costs 积分; only fires if all three free sources fail
 *
 * Each individual call has a 1-retry wrapper for transient hiccups.
 */
async function resolveQuote(ticker: string): Promise<QuoteShape | null> {
  // Layer 1: Eastmoney
  const em = await withRetry(() => fetchEastmoneyQuote(ticker));
  if (em) return em as unknown as QuoteShape;

  // Layer 2: Sina
  const sina = await withRetry(() => fetchSinaQuote(ticker));
  if (sina) return sina as unknown as QuoteShape;

  // Layer 3: Tencent
  const tencent = await withRetry(() => fetchTencentQuote(ticker));
  if (tencent) return tencent as unknown as QuoteShape;

  // Layer 4: Tushare (A-share only, costs 积分)
  if (/\.(SH|SZ|BJ)$/i.test(ticker)) {
    return tushareFallback(ticker);
  }

  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tickersParam = url.searchParams.get('tickers') || '';
  const tickers = tickersParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);  // cap

  if (tickers.length === 0) {
    return NextResponse.json({ quotes: {} });
  }

  const results = await Promise.allSettled(tickers.map(resolveQuote));

  const quotes: Record<string, QuoteShape | null> = {};
  results.forEach((r, i) => {
    quotes[tickers[i]] = r.status === 'fulfilled' && r.value ? r.value : null;
  });

  return NextResponse.json({ quotes });
}
