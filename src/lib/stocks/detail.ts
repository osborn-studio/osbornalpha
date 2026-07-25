import type { MockStock } from '@/lib/data/mock';
import type { LiveQuote } from '@/lib/hooks/useQuote';

function emptyDetailFromQuote(ticker: string, quote: LiveQuote): MockStock {
  return {
    ticker: quote.ticker || ticker,
    name: quote.name || quote.ticker || ticker,
    market: quote.market,
    currency: quote.currency,
    price: 0,
    change: 0,
    change_pct: 0,
    open: 0,
    high: 0,
    low: 0,
    prev_close: 0,
    volume_value: 0,
    amplitude: 0,
    market_cap: '—',
    pe_ttm: 0,
    pb: 0,
    roe: 0,
    dividend_yield: 0,
    high_52w: 0,
    low_52w: 0,
    next_earnings: '—',
    sentinel_score: 0,
    triggers: [],
    perspectives: [],
    news: [],
    broker_reports: [],
    financials: { years: [], revenue: [], net_income: [], roe: [] },
  };
}

export function mergeStockDetail(
  ticker: string,
  fallback: MockStock | null,
  live: LiveQuote | null,
): MockStock | null {
  if (!live) return fallback;

  const base = fallback ?? emptyDetailFromQuote(ticker, live);
  return {
    ...base,
    ticker: live.ticker || ticker,
    name: live.name || base.name,
    market: live.market,
    currency: live.currency || base.currency,
    price: live.price,
    change: live.change,
    change_pct: live.change_pct,
    open: live.open,
    high: live.high,
    low: live.low,
    prev_close: live.prev_close,
    volume_value: live.amount,
    amplitude: live.amplitude,
    market_cap: live.market_cap != null && live.market_cap_label
      ? live.market_cap_label
      : base.market_cap,
    pe_ttm: live.pe_ttm ?? base.pe_ttm,
    pb: live.pb ?? base.pb,
    roe: live.roe ?? base.roe,
    dividend_yield: live.dividend_yield ?? base.dividend_yield,
  };
}
