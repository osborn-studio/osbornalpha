import { describe, expect, it } from 'vitest';
import type { WatchlistMetricSnapshot } from '@/lib/supabase/database.types';
import {
  isWatchlistMetricAlertKey,
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
  });

  it('rejects missing and expired snapshots', () => {
    expect(watchlistMetricSnapshotStatus(snapshot, new Date('2026-09-04T00:00:00.000Z'))).toBe('fresh');
    expect(watchlistMetricSnapshotStatus(snapshot, new Date('2026-09-06T00:00:00.000Z'))).toBe('stale');
    expect(watchlistMetricSnapshotStatus(null)).toBe('unavailable');
  });
});
