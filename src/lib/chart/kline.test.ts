import { describe, expect, it } from 'vitest';
import {
  adjustmentSelectable,
  inferKlinePricePrecision,
  isWithinMarketSession,
  KLINE_RANGE_CONFIG,
  klineBarLimit,
  klineRangeAvailability,
  marketSessionMinutes,
  marketTimezone,
  parseKlineAdjustment,
  parseKlineRange,
  periodKeyOf,
  toChartTimestamp,
} from './kline';

describe('kline range contract', () => {
  it('only accepts the public chart ranges', () => {
    expect(parseKlineRange('1d')).toBe('1d');
    expect(parseKlineRange('5d')).toBe('5d');
    expect(parseKlineRange('6m')).toBe('6m');
    expect(parseKlineRange('ytd')).toBe('ytd');
    expect(parseKlineRange('5y')).toBe('5y');
    expect(parseKlineRange('all')).toBe('all');
    expect(parseKlineRange('max')).toBe('all');
    expect(parseKlineRange('D')).toBeNull();
    expect(parseKlineRange('2y')).toBeNull();
  });

  it('parses user-selected adjustment modes only', () => {
    expect(parseKlineAdjustment('qfq')).toBe('qfq');
    expect(parseKlineAdjustment('hfq')).toBe('hfq');
    expect(parseKlineAdjustment('none')).toBe('none');
    expect(parseKlineAdjustment('bfq')).toBeNull();
    expect(parseKlineAdjustment('intraday')).toBeNull();
    expect(parseKlineAdjustment(null)).toBeNull();
    expect(adjustmentSelectable('A')).toBe(true);
    expect(adjustmentSelectable('HK')).toBe(true);
    expect(adjustmentSelectable('US')).toBe(false);
    expect(adjustmentSelectable('JP')).toBe(false);
  });

  it('declares only true provider capability gaps as unavailable', () => {
    expect(klineRangeAvailability('2330.TW', '1d')).toBe('intraday_unsupported');
    expect(klineRangeAvailability('2330.TW', '5d')).toBe('intraday_unsupported');
    expect(klineRangeAvailability('2330.TW', '1y')).toBeNull();
    expect(klineRangeAvailability('2330.TW', 'all')).toBeNull();
    expect(klineRangeAvailability('5483.TWO', '1m')).toBeNull();
    expect(klineRangeAvailability('5483.TWO', '1y')).toBeNull();
    expect(klineRangeAvailability('7203.T', '1d')).toBe('market_unsupported');
    expect(klineRangeAvailability('7203.T', '5d')).toBe('market_unsupported');
    expect(klineRangeAvailability('7203.T', '5y')).toBeNull();
    expect(klineRangeAvailability('7203.T', '1m')).toBeNull();
    expect(klineRangeAvailability('NVDA', '1y')).toBeNull();
    expect(klineRangeAvailability('NVDA', 'all')).toBeNull();
  });

  it('maps intraday ranges to full regular sessions for each supported market', () => {
    expect(marketSessionMinutes('A')).toBe(240);
    expect(marketSessionMinutes('HK')).toBe(330);
    expect(marketSessionMinutes('US')).toBe(390);
    expect(klineBarLimit('600519.SH', '1d')).toBe(240);
    expect(klineBarLimit('00700.HK', '1d')).toBe(330);
    expect(klineBarLimit('NVDA', '1d')).toBe(390);
    // 5D renders 5-minute bars: five sessions of 48/66/78 bars.
    expect(klineBarLimit('600519.SH', '5d')).toBe(240);
    expect(klineBarLimit('00700.HK', '5d')).toBe(330);
    expect(klineBarLimit('NVDA', '5d')).toBe(390);
  });

  it('declares calendar windows with adaptive granularity per range', () => {
    expect(KLINE_RANGE_CONFIG['1m']).toMatchObject({ interval: 'day', granularity: '1d', providerPeriod: 'D', calendarDays: 31, limit: 32 });
    expect(KLINE_RANGE_CONFIG['6m']).toMatchObject({ interval: 'day', granularity: '1d', providerPeriod: 'D', calendarDays: 184, limit: 140 });
    expect(KLINE_RANGE_CONFIG.ytd).toMatchObject({ interval: 'day', granularity: '1d', providerPeriod: 'D', calendarDays: 'ytd', limit: 260 });
    expect(KLINE_RANGE_CONFIG['1y']).toMatchObject({ interval: 'day', granularity: '1d', providerPeriod: 'D', calendarDays: 366, limit: 260 });
    expect(KLINE_RANGE_CONFIG['5y']).toMatchObject({ interval: 'week', granularity: '1w', providerPeriod: 'W', calendarDays: 1_826, limit: 275 });
    expect(KLINE_RANGE_CONFIG.all).toMatchObject({ interval: 'month', granularity: '1mo', providerPeriod: 'M', calendarDays: null, limit: 600 });
    expect(KLINE_RANGE_CONFIG['5d']).toMatchObject({ interval: 'minute', granularity: '5m', providerPeriod: '5', sessions: 5 });
    expect(KLINE_RANGE_CONFIG['1d']).toMatchObject({ interval: 'minute', granularity: '1m', providerPeriod: '1', sessions: 1 });
  });

  it('sizes YTD coverage from the exchange-local calendar year', () => {
    const janSecond = new Date('2026-01-02T15:00:00.000Z');
    const sepFirst = new Date('2026-09-01T15:00:00.000Z');
    expect(klineBarLimit('NVDA', 'ytd', janSecond)).toBe(2);
    expect(klineBarLimit('NVDA', 'ytd', sepFirst)).toBeGreaterThan(170);
  });

  it('keeps regular-session minutes and drops auction or off-hours bars', () => {
    expect(isWithinMarketSession('2026-08-11 09:30:00', 'US')).toBe(true);
    expect(isWithinMarketSession('2026-08-11 16:00:00', 'US')).toBe(true);
    expect(isWithinMarketSession('2026-08-11 16:08:00', 'US')).toBe(false);
    expect(isWithinMarketSession('2026-08-11 09:20:00', 'US')).toBe(false);
    expect(isWithinMarketSession('2026-08-11 11:30:00', 'A')).toBe(true);
    expect(isWithinMarketSession('2026-08-11 11:31:00', 'A')).toBe(false);
    expect(isWithinMarketSession('2026-08-11 12:30:00', 'A')).toBe(false);
    expect(isWithinMarketSession('2026-08-11 13:00:00', 'A')).toBe(true);
    expect(isWithinMarketSession('2026-08-11 12:30:00', 'HK')).toBe(false);
    expect(isWithinMarketSession('2026-08-11 13:00:00', 'HK')).toBe(true);
    expect(isWithinMarketSession('2026-08-11 16:01:00', 'HK')).toBe(false);
  });

  it('derives stable period keys for forming-bar detection', () => {
    expect(periodKeyOf('day', '2026-08-12')).toBe('2026-08-12');
    // 2026-08-12 is a Wednesday; its week bucket is anchored on Monday.
    expect(periodKeyOf('week', '2026-08-12')).toBe('2026-08-10');
    expect(periodKeyOf('week', '2026-08-10')).toBe('2026-08-10');
    expect(periodKeyOf('month', '2026-08-12')).toBe('2026-08');
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
