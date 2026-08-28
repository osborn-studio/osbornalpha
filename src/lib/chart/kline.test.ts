import { describe, expect, it } from 'vitest';
import { inferKlinePricePrecision, KLINE_RANGE_CONFIG, klineBarLimit, klineRangeAvailability, marketTimezone, parseKlineRange, toChartTimestamp } from './kline';

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
    expect(klineRangeAvailability('7203.T', '1d')).toBe('market_unsupported');
    expect(klineRangeAvailability('7203.T', '1m')).toBeNull();
    expect(klineRangeAvailability('NVDA', '1y')).toBeNull();
  });

  it('maps 1D to a full regular session for each supported market', () => {
    expect(klineBarLimit('600519.SH', '1d')).toBe(240);
    expect(klineBarLimit('00700.HK', '1d')).toBe(330);
    expect(klineBarLimit('NVDA', '1d')).toBe(390);
    expect(klineBarLimit('NVDA', '1y')).toBe(12);
  });

  it('declares long ranges as daily trading-bar windows', () => {
    expect(KLINE_RANGE_CONFIG['1m']).toMatchObject({ interval: 'day', granularity: '1d', providerPeriod: 'D', limit: 22 });
    expect(KLINE_RANGE_CONFIG['3m']).toMatchObject({ interval: 'day', granularity: '1d', providerPeriod: 'D', limit: 66 });
    expect(KLINE_RANGE_CONFIG['1y']).toMatchObject({ interval: 'day', granularity: '1d', providerPeriod: 'D', limit: 260 });
  });

  it('normalizes provider calendar strings without browser timezone parsing', () => {
    expect(toChartTimestamp('2026-08-10 09:30:00')).toBe(Date.UTC(2026, 7, 10, 9, 30, 0) / 1000);
    expect(toChartTimestamp('2026-08-10')).toBe(Date.UTC(2026, 7, 10) / 1000);
  });

  it('reports each supported market timezone accurately', () => {
    expect(marketTimezone('A')).toBe('Asia/Shanghai');
    expect(marketTimezone('HK')).toBe('Asia/Hong_Kong');
    expect(marketTimezone('TW')).toBe('Asia/Taipei');
    expect(marketTimezone('US')).toBe('America/New_York');
  });

  it('declares provider price precision without rounding source values', () => {
    expect(inferKlinePricePrecision([{ open: 10, high: 10.125, low: 9.5, close: 10.12 }])).toBe(3);
    expect(inferKlinePricePrecision([{ open: 10, high: 11, low: 9, close: 10 }])).toBe(2);
  });
});
