import { describe, expect, it, vi } from 'vitest';
import type { QuoteShape } from './resolve-quote';
import { readQuoteCache, writeQuoteCache } from './resolve-quote';

const quote: QuoteShape = {
  source: 'test', ticker: 'AAPL.O', name: 'Apple', market: 'US', currency: '$',
  price: 200, change: 1, change_pct: 0.5, open: 199, high: 201, low: 198,
  prev_close: 199, volume: 100, amount: 20_000, amplitude: 1.5,
  market_cap: 3_000_000, market_cap_label: '$3T', pe_ttm: 30, pb: 8,
  turnover: 1, volume_ratio: 1.2, updated_at: '2026-09-04T12:00:00Z', delayed: false,
};

describe('shared quote cache', () => {
  it('normalizes ticker case and expires by caller TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'));
    writeQuoteCache('aapl.o', quote);
    expect(readQuoteCache('AAPL.O', 60_000)).toEqual(quote);
    vi.advanceTimersByTime(60_001);
    expect(readQuoteCache('AAPL.O', 60_000)).toBeNull();
    vi.useRealTimers();
  });
});
