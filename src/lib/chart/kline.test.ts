import { describe, expect, it } from 'vitest';
import { klineRangeAvailability, parseKlineRange, toChartTimestamp } from './kline';

describe('kline range contract', () => {
  it('only accepts the public chart ranges', () => {
    expect(parseKlineRange('1d')).toBe('1d');
    expect(parseKlineRange('D')).toBeNull();
    expect(parseKlineRange('5y')).toBeNull();
  });

  it('declares unavailable Taiwan and unsupported-market ranges', () => {
    expect(klineRangeAvailability('2330.TW', '1d')).toBe('intraday_unsupported');
    expect(klineRangeAvailability('2330.TW', '1y')).toBe('history_unsupported');
    expect(klineRangeAvailability('5483.TWO', '1m')).toBe('market_unsupported');
    expect(klineRangeAvailability('7203.T', '1m')).toBe('market_unsupported');
    expect(klineRangeAvailability('NVDA', '1y')).toBeNull();
  });

  it('normalizes provider calendar strings without browser timezone parsing', () => {
    expect(toChartTimestamp('2026-08-10 09:30:00')).toBe(Date.UTC(2026, 7, 10, 9, 30, 0) / 1000);
    expect(toChartTimestamp('2026-08-10')).toBe(Date.UTC(2026, 7, 10) / 1000);
  });
});
