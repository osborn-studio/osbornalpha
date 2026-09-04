import { describe, expect, it } from 'vitest';
import { watchlistMarketFreshness, watchlistTimestampFreshness } from './freshness';

const now = new Date('2026-09-04T12:00:00.000Z');

describe('watchlist timestamp freshness', () => {
  it('uses one fresh, stale, and expired policy for research surfaces', () => {
    expect(watchlistTimestampFreshness('2026-09-04T01:00:00.000Z', now)).toBe('fresh');
    expect(watchlistTimestampFreshness('2026-09-03T12:00:00.000Z', now)).toBe('stale');
    expect(watchlistTimestampFreshness('2026-08-20T12:00:00.000Z', now)).toBe('unavailable');
  });

  it('rejects missing, malformed, and materially future timestamps', () => {
    expect(watchlistTimestampFreshness(null, now)).toBe('unavailable');
    expect(watchlistTimestampFreshness('not-a-date', now)).toBe('unavailable');
    expect(watchlistTimestampFreshness('2026-09-04T12:06:00.000Z', now)).toBe('unavailable');
  });

  it('allows a normal weekend market close but expires old market data', () => {
    expect(watchlistMarketFreshness('2026-09-03T12:00:00.000Z', now)).toBe('fresh');
    expect(watchlistMarketFreshness('2026-09-02T00:00:00.000Z', now)).toBe('stale');
    expect(watchlistMarketFreshness('2026-08-01T00:00:00.000Z', now)).toBe('unavailable');
  });

  it('grants a bounded holiday grace period with market context', () => {
    const beforeAfterHoliday = new Date('2026-09-08T12:00:00.000Z');
    expect(watchlistMarketFreshness('2026-09-04T20:00:00.000Z', beforeAfterHoliday, 'US')).toBe('fresh');
    const duringOpen = new Date('2026-09-08T15:00:00.000Z');
    expect(watchlistMarketFreshness('2026-09-04T20:00:00.000Z', duringOpen, 'US')).toBe('stale');
  });
});
