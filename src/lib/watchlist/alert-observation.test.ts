import { describe, expect, it } from 'vitest';
import type { RadarPayload } from '@/lib/brief/radar';
import { observationFromPeerMetrics, observationFromRadar } from './alert-observation';

function radar(updatedAt: string): RadarPayload {
  return {
    ticker: 'AAPL', market: 'US', as_of: '2026-09-04T15:00:00Z',
    sections: {
      price: { value: 200, change_pct: 1, currency: '$', pe_ttm: 25, pb: 4, market_cap_label: '--', source: 'test', updated_at: updatedAt },
      calendar: { upcoming: [] },
    },
  } as unknown as RadarPayload;
}

describe('alert market observation freshness', () => {
  it('accepts a recent quote while the US market is open', () => {
    const result = observationFromRadar(radar('2026-09-04T14:55:00Z'), [], [], new Date('2026-09-04T15:00:00Z'));
    expect(result.marketDataStatus).toBe('fresh');
    expect(result.observedAt).toBe('2026-09-04T14:55:00Z');
  });

  it('marks an old quote stale while the US market is open', () => {
    const result = observationFromRadar(radar('2026-09-04T13:00:00Z'), [], [], new Date('2026-09-04T15:00:00Z'));
    expect(result.marketDataStatus).toBe('stale');
  });

  it('maps fresh peer envelopes without exposing unrelated metric values', () => {
    const result = observationFromPeerMetrics({
      value: {
        marketRelativeStrengthPercentile: 84,
        industryPePercentile: 65,
        industryPbPercentile: null,
        marketLiquidityPercentile: 72,
      },
      asOf: '2026-09-04T14:55:00Z',
      source: 'shared-peer-snapshots',
      status: 'fresh',
      warnings: [],
    } as never, new Date('2026-09-04T15:00:00Z'));

    expect(result.metricDataStatus).toBe('fresh');
    expect(result.observedAt).toBe('2026-09-04T14:55:00Z');
    expect(result.metrics).toMatchObject({
      market_relative_strength_percentile: 84,
      industry_pe_percentile: 65,
      industry_pb_percentile: null,
      market_liquidity_percentile: 72,
    });
    expect(result.metrics).not.toHaveProperty('rsi14');
  });

  it('does not evaluate stale peer envelopes as fresh data', () => {
    const result = observationFromPeerMetrics({
      value: { marketRelativeStrengthPercentile: 84 },
      asOf: '2026-09-01T14:55:00Z',
      source: 'shared-peer-snapshots',
      status: 'stale',
      warnings: ['peer_metrics_stale'],
    } as never);
    expect(result.metricDataStatus).toBe('stale');
  });
});
