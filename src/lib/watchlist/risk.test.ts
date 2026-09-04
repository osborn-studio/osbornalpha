import { describe, expect, it } from 'vitest';
import { watchlistRiskFreeRatePct } from './risk';

describe('watchlistRiskFreeRatePct', () => {
  it('prefers a market-specific configured rate', () => {
    expect(watchlistRiskFreeRatePct('US', {
      WATCHLIST_RISK_FREE_RATE_PCT: '2.5',
      WATCHLIST_RISK_FREE_RATE_US_PCT: '4.2',
    })).toBe(4.2);
  });

  it('fails closed for missing or unsafe configuration', () => {
    expect(watchlistRiskFreeRatePct('A', {})).toBe(0);
    expect(watchlistRiskFreeRatePct('A', { WATCHLIST_RISK_FREE_RATE_PCT: 'nan' })).toBe(0);
    expect(watchlistRiskFreeRatePct('A', { WATCHLIST_RISK_FREE_RATE_PCT: '-100' })).toBe(0);
    expect(watchlistRiskFreeRatePct('A', { WATCHLIST_RISK_FREE_RATE_PCT: '101' })).toBe(0);
  });
});
