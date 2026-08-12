import { describe, expect, it } from 'vitest';
import { klineBarLimit, klineRangeAvailability, marketTimezone, parseKlineRange, toChartTimestamp } from './kline';

describe('kline range contract', () => {
  it('only accepts the public chart ranges', () => {
    expect(parseKlineRange('1d')).toBe('1d');
    expect(parseKlineRange('D')).toBeNull();
    expect(parseKlineRange('5y')).toBeNull();
  });

  it('declares only true provider capability gaps as unavailable', () => {
    expect(klineRangeAvailability('2330.TW', '1d')).toBe('intraday_unsupported');
    expect(klineRangeAvailability('2330.TW', '1y')).toBeNull();
    expect(klineRangeAvailability('5483.TWO', '1m')).toBeNull();
    expect(klineRangeAvailability('5483.TWO', '1y')).toBeNull();
    expect(klineRangeAvailability('7203.T', '1m')).toBe('market_unsupported');
    expect(klineRangeAvailability('NVDA', '1y')).toBeNull();
  });

  it('uses each market timezone in metadata', () => {
    expect(marketTimezone('HK')).toBe('Asia/Hong_Kong');
    expect(marketTimezone('TW')).toBe('Asia/Taipei');
    expect(marketTimezone('US')).toBe('America/New_York');
  });

  it('maps 1D to a full regular session for each supported market', () => {
    expect(klineBarLimit('600519.SH', '1d')).toBe(240);
    expect(klineBarLimit('00700.HK', '1d')).toBe(330);
    expect(klineBarLimit('NVDA', '1d')).toBe(390);
    expect(klineBarLimit('NVDA', '1y')).toBe(260);
  });

  it('normalizes provider calendar strings without browser timezone parsing', () => {
    expect(toChartTimestamp('2026-08-10 09:30:00')).toBe(Date.UTC(2026, 7, 10, 9, 30, 0) / 1000);
    expect(toChartTimestamp('2026-08-10')).toBe(Date.UTC(2026, 7, 10) / 1000);
  });
});
