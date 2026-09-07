import { describe, expect, it } from 'vitest';
import { peerMetricEnvelope } from './peer-metrics';

function row(overrides: Record<string, unknown> = {}) {
  return {
    ticker: 'AAPL', market: 'US' as const, currency: 'USD', industry: 'Technology',
    market_relative_strength_percentile: '82.5', market_relative_strength_sample_size: 120,
    industry_pe_percentile: '61.25', industry_pe_sample_size: 24,
    industry_pb_percentile: '70', industry_pb_sample_size: 20,
    market_liquidity_percentile: '97.5', market_liquidity_sample_size: 110,
    average_traded_amount_20: '1234567', watchlist_market_cap_share_pct: '44.5',
    watchlist_market_cap_sample_size: 3, as_of: new Date().toISOString(),
    ...overrides,
  };
}

describe('peerMetricEnvelope', () => {
  it('normalizes database numerics and preserves comparison samples', () => {
    expect(peerMetricEnvelope(row())).toMatchObject({
      source: 'shared-peer-snapshots', status: 'fresh',
      value: {
        marketRelativeStrengthPercentile: 82.5,
        marketRelativeStrengthSampleSize: 120,
        industryPePercentile: 61.25,
        marketLiquidityPercentile: 97.5,
        averageTradedAmount20: 1_234_567,
        watchlistMarketCapSharePct: 44.5,
      },
    });
  });

  it('suppresses misleading percentiles when fewer than five peers exist', () => {
    const envelope = peerMetricEnvelope(row({
      industry_pe_percentile: 100,
      industry_pe_sample_size: 4,
      market_liquidity_percentile: 50,
      market_liquidity_sample_size: 0,
    }));
    expect(envelope.value?.industryPePercentile).toBeNull();
    expect(envelope.value?.marketLiquidityPercentile).toBeNull();
    expect(envelope.warnings).toContain('peer_pe_sample_too_small');
    expect(envelope.warnings).toContain('peer_liquidity_sample_too_small');
  });
});
