import { describe, expect, it } from 'vitest';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { buildWatchlistMarketRows, quoteDisplayStatus } from './market-row';

const quote: LiveQuote = {
  source: 'datagateway-wind', ticker: '600519.SH', name: '贵州茅台', market: 'A', currency: '¥',
  price: 1500, change: 12, change_pct: 0.81, open: 1490, high: 1505, low: 1480, prev_close: 1488,
  volume: 100, amount: 150000, amplitude: 1.7, market_cap: null, market_cap_label: '—', pe_ttm: null,
  pb: null, turnover: null, volume_ratio: null, updated_at: '2026-08-29T02:00:00Z', delayed: false,
};

describe('watchlist market rows', () => {
  it('uses a real quote and preserves its market identity', () => {
    const [row] = buildWatchlistMarketRows(
      [{ id: 'core', name: 'Core', tickers: ['600519.SH'] }],
      { '600519.SH': quote },
      {},
      Date.now(),
    );

    expect(row).toMatchObject({ name: '贵州茅台', currency: '¥', groupId: 'core', status: 'live', quote });
  });

  it('does not fabricate a price when a quote is unavailable', () => {
    const [row] = buildWatchlistMarketRows(
      [{ id: 'core', name: 'Core', tickers: ['AAPL'] }],
      { AAPL: null },
      { AAPL: { t: 'AAPL', n: 'Apple', m: 'US' } },
      Date.now(),
    );

    expect(row).toMatchObject({ name: 'Apple', currency: '$', quote: null, status: 'unavailable' });
    expect(quoteDisplayStatus(null, null)).toBe('loading');
  });

  it('prefers the locale-selected security-master name over a provider label', () => {
    const [row] = buildWatchlistMarketRows(
      [{ id: 'core', name: 'Core', tickers: ['600519.SH'] }],
      { '600519.SH': quote },
      { '600519.SH': { t: '600519.SH', n: 'Kweichow Moutai', m: 'A' } },
      Date.now(),
    );

    expect(row.name).toBe('Kweichow Moutai');
  });

  it('marks explicitly delayed provider quotes as delayed', () => {
    expect(quoteDisplayStatus({ ...quote, delayed: true }, Date.now())).toBe('delayed');
  });

  it('keeps a stale cache fallback distinct from provider-delayed data', () => {
    expect(quoteDisplayStatus({ ...quote, delayed: true, stale: true }, Date.now())).toBe('stale');
  });
});
