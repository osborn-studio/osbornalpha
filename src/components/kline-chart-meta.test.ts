import { describe, expect, it } from 'vitest';
import type { KlineMeta } from '@/lib/chart/kline';
import { chartStatusKeys, sourceTranslationKey } from './kline-chart-meta';

const meta: KlineMeta = {
  market: 'A',
  range: '1m',
  interval: 'day',
  granularity: '1d',
  source: 'tencent',
  adjustment: 'qfq',
  coverageStart: '2026-07-01',
  coverageEnd: '2026-08-01',
  asOf: '2026-08-01',
  timezone: 'Asia/Shanghai',
  fetchedAt: '2026-08-01T08:00:00.000Z',
  delayed: false,
  currency: '¥',
  currencyCode: 'CNY',
  pricePrecision: 2,
  minMove: 0.01,
  volumeUnit: 'shares',
  rangeBasis: 'calendar-window',
  requestedBars: 22,
  returnedBars: 20,
  availableBars: 32,
  missingBars: 0,
  cacheTtlSeconds: 300,
  freshness: 'fresh',
  fallbackUsed: true,
  cacheStatus: 'shared-swr',
  completeness: 'partial',
  partial: true,
  warnings: ['fallback_used', 'partial_coverage', 'partial_bar'],
};

describe('chart metadata presentation', () => {
  it('maps every declared provider to an i18n source key', () => {
    expect(sourceTranslationKey(meta)).toBe('sources.tencent');
    expect(sourceTranslationKey({ ...meta, source: 'datagateway' })).toBe('sources.datagateway');
    expect(sourceTranslationKey({ ...meta, source: 'sina' })).toBe('sources.sina');
    expect(sourceTranslationKey({ ...meta, source: 'tpex' })).toBe('sources.tpex');
  });

  it('makes fallback, cache, incomplete coverage, and partial bars visible', () => {
    expect(chartStatusKeys(meta)).toEqual([
      'freshness.fresh',
      'fallbackUsed',
      'cache.shared-swr',
      'coveragePartial',
      'partialBar',
    ]);
  });

  it('marks last-known-good data as stale instance cache data', () => {
    expect(chartStatusKeys({ ...meta, freshness: 'stale', cacheStatus: 'memory-lkg', fallbackUsed: false, completeness: 'complete', partial: false }))
      .toEqual(['freshness.stale', 'cache.memory-lkg']);
  });
});
