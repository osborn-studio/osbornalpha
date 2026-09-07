import type { Market } from '@/lib/supabase/database.types';
import type { DataEnvelope, DataStatus } from './overview-contract';
import { watchlistTimestampFreshness } from './freshness';

export const WATCHLIST_PEER_MIN_SAMPLE_SIZE = 5;

export interface WatchlistPeerMetrics {
  market: Market;
  currency: string | null;
  industry: string | null;
  marketRelativeStrengthPercentile: number | null;
  marketRelativeStrengthSampleSize: number;
  industryPePercentile: number | null;
  industryPeSampleSize: number;
  industryPbPercentile: number | null;
  industryPbSampleSize: number;
  marketLiquidityPercentile: number | null;
  marketLiquiditySampleSize: number;
  averageTradedAmount20: number | null;
  /** Share of comparable Watchlist market cap, not an investment position weight. */
  watchlistMarketCapSharePct: number | null;
  watchlistMarketCapSampleSize: number;
}

export interface WatchlistPeerMetricRow {
  ticker: string;
  market: Market;
  currency: string | null;
  industry: string | null;
  market_relative_strength_percentile: unknown;
  market_relative_strength_sample_size: unknown;
  industry_pe_percentile: unknown;
  industry_pe_sample_size: unknown;
  industry_pb_percentile: unknown;
  industry_pb_sample_size: unknown;
  market_liquidity_percentile: unknown;
  market_liquidity_sample_size: unknown;
  average_traded_amount_20: unknown;
  watchlist_market_cap_share_pct: unknown;
  watchlist_market_cap_sample_size: unknown;
  as_of: string | null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function percentile(value: unknown, sampleSize: number): number | null {
  if (sampleSize < WATCHLIST_PEER_MIN_SAMPLE_SIZE) return null;
  const parsed = optionalNumber(value);
  return parsed == null ? null : Math.max(0, Math.min(100, parsed));
}

function peerWarnings(value: WatchlistPeerMetrics, status: DataStatus): string[] {
  const warnings: string[] = [];
  if (value.marketRelativeStrengthSampleSize < WATCHLIST_PEER_MIN_SAMPLE_SIZE) warnings.push('peer_relative_strength_sample_too_small');
  if (!value.industry) warnings.push('peer_industry_unavailable');
  if (value.industryPeSampleSize < WATCHLIST_PEER_MIN_SAMPLE_SIZE) warnings.push('peer_pe_sample_too_small');
  if (value.industryPbSampleSize < WATCHLIST_PEER_MIN_SAMPLE_SIZE) warnings.push('peer_pb_sample_too_small');
  if (value.marketLiquiditySampleSize < WATCHLIST_PEER_MIN_SAMPLE_SIZE) warnings.push('peer_liquidity_sample_too_small');
  if (!value.currency) warnings.push('peer_currency_unavailable');
  if (value.watchlistMarketCapSampleSize === 0) warnings.push('watchlist_market_cap_composition_unavailable');
  if (status === 'stale') warnings.push('peer_metrics_stale');
  if (status === 'unavailable') warnings.push('peer_metrics_unavailable');
  return warnings;
}

export function peerMetricEnvelope(row: WatchlistPeerMetricRow): DataEnvelope<WatchlistPeerMetrics> {
  const relativeSample = count(row.market_relative_strength_sample_size);
  const peSample = count(row.industry_pe_sample_size);
  const pbSample = count(row.industry_pb_sample_size);
  const liquiditySample = count(row.market_liquidity_sample_size);
  const marketCapSample = count(row.watchlist_market_cap_sample_size);
  const value: WatchlistPeerMetrics = {
    market: row.market,
    currency: row.currency || null,
    industry: row.industry || null,
    marketRelativeStrengthPercentile: percentile(row.market_relative_strength_percentile, relativeSample),
    marketRelativeStrengthSampleSize: relativeSample,
    industryPePercentile: percentile(row.industry_pe_percentile, peSample),
    industryPeSampleSize: peSample,
    industryPbPercentile: percentile(row.industry_pb_percentile, pbSample),
    industryPbSampleSize: pbSample,
    marketLiquidityPercentile: percentile(row.market_liquidity_percentile, liquiditySample),
    marketLiquiditySampleSize: liquiditySample,
    averageTradedAmount20: optionalNumber(row.average_traded_amount_20),
    watchlistMarketCapSharePct: optionalNumber(row.watchlist_market_cap_share_pct),
    watchlistMarketCapSampleSize: marketCapSample,
  };
  const status = watchlistTimestampFreshness(row.as_of);
  return {
    value,
    asOf: row.as_of,
    source: 'shared-peer-snapshots',
    status,
    warnings: peerWarnings(value, status),
  };
}
