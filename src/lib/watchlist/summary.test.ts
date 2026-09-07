import { describe, expect, it } from 'vitest';
import type { WatchlistMarketRow } from './market-row';
import { summarizeWatchlistMarketRows } from './summary';

function row(overrides: Partial<WatchlistMarketRow>): WatchlistMarketRow {
  return {
    ticker: 'AAPL',
    name: 'Apple',
    market: 'US',
    currency: 'USD',
    groupId: 'core',
    group: 'Core',
    quote: null,
    status: 'unavailable',
    ...overrides,
  };
}

describe('summarizeWatchlistMarketRows', () => {
  it('keeps quote availability separate from price movement', () => {
    const summary = summarizeWatchlistMarketRows([
      row({ ticker: 'AAPL', status: 'live', quote: { price: 101, change_pct: 2 } as never }),
      row({ ticker: 'MSFT', status: 'delayed', quote: { price: 99, change_pct: -1 } as never }),
      row({ ticker: 'TSLA', status: 'unavailable' }),
      row({ ticker: 'NVDA', status: 'live', quote: { price: 100, change_pct: 0 } as never }),
    ]);

    expect(summary).toMatchObject({
      tracked: 4,
      quoted: 3,
      movementSample: 3,
      loading: 0,
      live: 2,
      delayed: 1,
      stale: 0,
      unavailable: 1,
      gainers: 1,
      decliners: 1,
      unchanged: 1,
      averageChangePct: 1 / 3,
      medianChangePct: 0,
      breadthPct: 0,
    });
  });

  it('returns null metrics for an empty quote set', () => {
    expect(summarizeWatchlistMarketRows([row({})])).toMatchObject({
      tracked: 1,
      quoted: 0,
      movementSample: 0,
      averageChangePct: null,
      medianChangePct: null,
      breadthPct: null,
    });
  });

  it('keeps stale quotes visible without including them in movement statistics', () => {
    const summary = summarizeWatchlistMarketRows([
      row({ ticker: 'AAPL', status: 'stale', quote: { price: 101, change_pct: 20, stale: true } as never }),
      row({ ticker: 'MSFT', status: 'delayed', quote: { price: 99, change_pct: -2, delayed: true } as never }),
      row({ ticker: 'NVDA', status: 'live', quote: { price: 100, change_pct: 1 } as never }),
    ]);

    expect(summary).toMatchObject({
      quoted: 3,
      movementSample: 2,
      stale: 1,
      gainers: 1,
      decliners: 1,
      averageChangePct: -0.5,
      medianChangePct: -0.5,
      breadthPct: 0,
    });
  });

  it('does not present stale-only movement as current market breadth', () => {
    expect(summarizeWatchlistMarketRows([
      row({ status: 'stale', quote: { price: 101, change_pct: 5, stale: true } as never }),
    ])).toMatchObject({
      quoted: 1,
      movementSample: 0,
      averageChangePct: null,
      medianChangePct: null,
      breadthPct: null,
    });
  });
});
