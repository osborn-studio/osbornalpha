import { describe, expect, it } from 'vitest';
import type { WatchlistMetricSnapshot } from '@/lib/supabase/database.types';
import {
  isWatchlistPeerAlertKey,
  isWatchlistMetricAlertKey,
  watchlistPeerMetricAlertValue,
  watchlistMetricAlertThresholdIsValid,
  watchlistMetricAlertValue,
  watchlistMetricSnapshotStatus,
} from './alert-metrics';

const snapshot = {
  rsi14: 28,
  ma20_distance_pct: -4,
  valid_until: '2026-09-05T00:00:00.000Z',
} as WatchlistMetricSnapshot;

describe('Watchlist metric alert registry', () => {
  it('keeps metric identity, value extraction, and threshold bounds centralized', () => {
    expect(isWatchlistMetricAlertKey('rsi14')).toBe(true);
    expect(isWatchlistMetricAlertKey('unknown')).toBe(false);
    expect(watchlistMetricAlertValue(snapshot, 'rsi14')).toBe(28);
    expect(watchlistMetricAlertValue(snapshot, 'ma20_distance_pct')).toBe(-4);
    expect(watchlistMetricAlertThresholdIsValid('rsi14', 30)).toBe(true);
    expect(watchlistMetricAlertThresholdIsValid('rsi14', -1)).toBe(false);
    expect(watchlistMetricAlertThresholdIsValid('ma20_distance_pct', -5)).toBe(true);
    expect(watchlistMetricAlertThresholdIsValid('market_relative_strength_percentile', 100)).toBe(true);
    expect(watchlistMetricAlertThresholdIsValid('industry_pe_percentile', 101)).toBe(false);
  });

  it('keeps peer metric extraction separate from snapshot extraction', () => {
    const envelope = {
      value: {
        marketRelativeStrengthPercentile: 84,
        industryPePercentile: 65,
        industryPbPercentile: null,
        marketLiquidityPercentile: 72,
      },
    } as never;
    expect(isWatchlistPeerAlertKey('market_liquidity_percentile')).toBe(true);
    expect(isWatchlistPeerAlertKey('rsi14')).toBe(false);
    expect(watchlistMetricAlertValue(snapshot, 'market_liquidity_percentile')).toBeNull();
    expect(watchlistPeerMetricAlertValue(envelope, 'market_liquidity_percentile')).toBe(72);
    expect(watchlistPeerMetricAlertValue(envelope, 'rsi14')).toBeNull();
  });

  it('rejects missing and expired snapshots', () => {
    expect(watchlistMetricSnapshotStatus(snapshot, new Date('2026-09-04T00:00:00.000Z'))).toBe('fresh');
    expect(watchlistMetricSnapshotStatus(snapshot, new Date('2026-09-06T00:00:00.000Z'))).toBe('stale');
    expect(watchlistMetricSnapshotStatus(null)).toBe('unavailable');
  });
});
