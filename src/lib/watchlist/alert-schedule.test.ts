import { describe, expect, it } from 'vitest';
import {
  shouldEvaluateWatchlistAlert,
  watchlistAlertTypesForScope,
} from './alert-schedule';

describe('Watchlist alert scheduling', () => {
  it('keeps quote and research workloads disjoint', () => {
    expect(watchlistAlertTypesForScope('quote')).toEqual(['price', 'change_pct', 'volume_ratio', 'valuation']);
    expect(watchlistAlertTypesForScope('metric')).toEqual(['metric']);
    expect(watchlistAlertTypesForScope('research')).toEqual(['event', 'rating', 'perspective']);
    expect(watchlistAlertTypesForScope('all')).toBeNull();
  });

  it('evaluates quote rules only during the security exchange session', () => {
    const price = { alert_type: 'price' as const };
    expect(shouldEvaluateWatchlistAlert(price, 'AAPL', 'quote', new Date('2026-09-04T15:00:00.000Z'))).toBe(true);
    expect(shouldEvaluateWatchlistAlert(price, 'AAPL', 'quote', new Date('2026-09-05T15:00:00.000Z'))).toBe(false);
    expect(shouldEvaluateWatchlistAlert(price, '600519.SH', 'quote', new Date('2026-09-04T04:00:00.000Z'))).toBe(false);
  });

  it('allows research rules independently of market hours', () => {
    expect(shouldEvaluateWatchlistAlert(
      { alert_type: 'rating' }, 'AAPL', 'research', new Date('2026-09-05T15:00:00.000Z'),
    )).toBe(true);
    expect(shouldEvaluateWatchlistAlert(
      { alert_type: 'price' }, 'AAPL', 'research', new Date('2026-09-04T15:00:00.000Z'),
    )).toBe(false);
  });

  it('runs snapshot metric rules independently of exchange hours', () => {
    expect(shouldEvaluateWatchlistAlert(
      { alert_type: 'metric' }, 'AAPL', 'metric', new Date('2026-09-05T15:00:00.000Z'),
    )).toBe(true);
    expect(shouldEvaluateWatchlistAlert(
      { alert_type: 'metric' }, 'AAPL', 'quote', new Date('2026-09-04T15:00:00.000Z'),
    )).toBe(false);
  });
});
