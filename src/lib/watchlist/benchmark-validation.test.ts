import { describe, expect, it } from 'vitest';
import { validateWatchlistBenchmark } from './benchmark-validation';

describe('validateWatchlistBenchmark', () => {
  it('accepts a different security from the same market', () => {
    expect(validateWatchlistBenchmark('AAPL', 'QQQ')).toMatchObject({
      valid: true,
      issue: null,
      assetMarket: 'US',
      benchmarkMarket: 'US',
      assetCurrency: 'USD',
      currencyCompatible: true,
      calendarCompatible: true,
    });
  });

  it('rejects the security itself as a benchmark', () => {
    expect(validateWatchlistBenchmark('aapl', 'AAPL')).toMatchObject({
      valid: false,
      issue: 'same_security',
    });
  });

  it('rejects a benchmark with incompatible currency and market calendar', () => {
    expect(validateWatchlistBenchmark('AAPL', '510300.SH')).toMatchObject({
      valid: false,
      issue: 'incompatible_market',
      assetCurrency: 'USD',
      benchmarkCurrency: 'CNY',
      currencyCompatible: false,
      calendarCompatible: false,
    });
  });
});
