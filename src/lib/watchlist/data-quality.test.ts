import { describe, expect, it } from 'vitest';
import { calculateWatchlistDataQuality } from './data-quality';

const completeQuote = {
  price: 10, prev_close: 9, volume: 0, amount: 0, market_cap: 100,
  pe_ttm: 20, pb: 2, turnover: 0, volume_ratio: 1,
};

describe('watchlist data quality', () => {
  it('counts valid zero observations as complete', () => {
    expect(calculateWatchlistDataQuality(completeQuote, 'live')).toEqual({
      score: 100, completenessPct: 100, freshnessPct: 100, analyticsPct: null,
    });
  });

  it('penalizes stale quotes and weak analytical coverage', () => {
    const quality = calculateWatchlistDataQuality(completeQuote, 'stale', {
      status: 'stale',
      value: { coverageRatio: 0.5, sampleSize: 20, benchmarkStatus: 'limited' },
    });
    expect(quality.completenessPct).toBe(100);
    expect(quality.freshnessPct).toBe(30);
    expect(quality.analyticsPct).toBeLessThan(50);
    expect(quality.score).toBeLessThan(75);
  });

  it('does not treat missing data as zero-valued observations', () => {
    expect(calculateWatchlistDataQuality(null, 'unavailable').score).toBe(0);
    expect(calculateWatchlistDataQuality({ price: 10 }, 'live').completenessPct).toBe(11);
  });
});
