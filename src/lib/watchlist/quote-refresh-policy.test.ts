import { describe, expect, it } from 'vitest';
import { watchlistQuoteRefreshInterval } from './quote-refresh-policy';

describe('Watchlist quote refresh policy', () => {
  it('polls actively while any watched market is open', () => {
    expect(watchlistQuoteRefreshInterval(['AAPL', '600519.SH'], {
      now: new Date('2026-09-04T15:00:00.000Z'),
      consecutiveFailures: 0,
    })).toBe(30_000);
  });

  it('slows down outside regular sessions', () => {
    expect(watchlistQuoteRefreshInterval(['AAPL'], {
      now: new Date('2026-09-05T15:00:00.000Z'),
      consecutiveFailures: 0,
    })).toBe(15 * 60_000);
  });

  it('backs off repeated failures without exceeding the idle ceiling', () => {
    expect(watchlistQuoteRefreshInterval(['AAPL'], {
      now: new Date('2026-09-04T15:00:00.000Z'),
      consecutiveFailures: 3,
    })).toBe(4 * 60_000);
    expect(watchlistQuoteRefreshInterval(['AAPL'], {
      now: new Date('2026-09-04T15:00:00.000Z'),
      consecutiveFailures: 99,
    })).toBe(15 * 60_000);
  });
});
