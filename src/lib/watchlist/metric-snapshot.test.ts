import { describe, expect, it } from 'vitest';
import { calculateHistoricalWatchlistMetrics } from './analytics';
import {
  metricSnapshotEnvelope,
  metricSnapshotInsert,
  nextWatchlistMetricRefresh,
  watchlistMetricValidUntil,
} from './metric-snapshot';

function metrics() {
  return calculateHistoricalWatchlistMetrics(Array.from({ length: 30 }, (_, index) => ({
    time: Date.UTC(2026, 0, index + 1) / 1_000,
    close: 100 + index,
    high: 101 + index,
    low: 99 + index,
  })), { market: 'US', benchmarkTicker: 'SPY' });
}

describe('Watchlist metric snapshots', () => {
  it('uses an explicit per-market refresh policy and bounded failure backoff', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    expect(watchlistMetricValidUntil('US', now)).toBe('2026-09-04T20:00:00.000Z');
    expect(watchlistMetricValidUntil('JP', now)).toBe('2026-09-07T06:30:00.000Z');
    expect(nextWatchlistMetricRefresh('US', now, 'failed', 1)).toBe('2026-09-04T12:30:00.000Z');
    expect(nextWatchlistMetricRefresh('US', now, 'failed', 10)).toBe('2026-09-04T18:00:00.000Z');
  });

  it('stores lineage and sortable metric projections with the canonical payload', () => {
    const generatedAt = new Date('2026-09-04T12:00:00.000Z');
    const value = metrics();
    const snapshot = metricSnapshotInsert('AAPL', 'US', '1y', 'SPY', {
      value,
      asOf: generatedAt.toISOString(),
      source: 'test-kline+yahoo-chart',
      status: 'fresh',
      warnings: ['total_return_adjusted_close'],
    }, generatedAt);

    expect(snapshot).toMatchObject({
      ticker: 'AAPL', market: 'US', history_range: '1y', benchmark_ticker: 'SPY',
      source: 'test-kline+yahoo-chart', calculator_version: 'watchlist-analytics-v4',
      period_return_pct: value.periodReturnPct,
      average_traded_amount_20: value.averageTradedAmount20,
      coverage_ratio: value.coverageRatio,
    });
    expect(snapshot.source_bundle).toMatchObject({ benchmarkTicker: 'SPY', historyRange: '1y' });
  });

  it('keeps an expired last-known-good snapshot visible and marks it stale', () => {
    const generatedAt = new Date('2026-09-04T00:00:00.000Z');
    const snapshot = metricSnapshotInsert('AAPL', 'US', '1y', 'SPY', {
      value: metrics(), asOf: generatedAt.toISOString(), source: 'test', status: 'fresh', warnings: [],
    }, generatedAt);
    const envelope = metricSnapshotEnvelope(snapshot, new Date('2026-09-05T12:00:00.000Z'));
    expect(envelope.status).toBe('stale');
    expect(envelope.value).not.toBeNull();
    expect(envelope.warnings).toContain('metric_snapshot_stale');
  });

  it('reports a pending snapshot without inventing metric values', () => {
    expect(metricSnapshotEnvelope(null)).toEqual({
      value: null, asOf: null, source: null, status: 'unavailable', warnings: ['metric_snapshot_pending'],
    });
  });
});
