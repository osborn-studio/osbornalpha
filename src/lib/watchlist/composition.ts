import type { DataEnvelope } from './overview-contract';
import { watchlistTimestampFreshness } from './freshness';

export interface WatchlistCompositionBucket {
  key: string;
  count: number;
  sharePct: number;
}

export interface WatchlistCorrelationPair {
  leftTicker: string;
  rightTicker: string;
  correlation: number;
  observations: number;
}

export interface WatchlistComposition {
  totalSecurities: number;
  markets: WatchlistCompositionBucket[];
  industries: WatchlistCompositionBucket[];
  currencies: WatchlistCompositionBucket[];
  correlations: WatchlistCorrelationPair[];
  highCorrelationCount: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function buckets(value: unknown): WatchlistCompositionBucket[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const item = record(candidate);
    const key = typeof item?.key === 'string' ? item.key.trim() : '';
    const itemCount = count(item?.count);
    const share = Number(item?.sharePct);
    return key && Number.isFinite(share)
      ? [{ key, count: itemCount, sharePct: Math.max(0, Math.min(100, share)) }]
      : [];
  });
}

function correlations(value: unknown): WatchlistCorrelationPair[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const item = record(candidate);
    const leftTicker = typeof item?.leftTicker === 'string' ? item.leftTicker : '';
    const rightTicker = typeof item?.rightTicker === 'string' ? item.rightTicker : '';
    const coefficient = Number(item?.correlation);
    const observations = count(item?.observations);
    return leftTicker && rightTicker && Number.isFinite(coefficient) && observations >= 20
      ? [{ leftTicker, rightTicker, correlation: Math.max(-1, Math.min(1, coefficient)), observations }]
      : [];
  });
}

export function compositionEnvelope(value: unknown): DataEnvelope<WatchlistComposition> {
  const input = record(value);
  const asOf = typeof input?.asOf === 'string' ? input.asOf : null;
  const pairs = correlations(input?.correlations);
  const status = watchlistTimestampFreshness(asOf);
  return {
    value: {
      totalSecurities: count(input?.totalSecurities),
      markets: buckets(input?.markets),
      industries: buckets(input?.industries),
      currencies: buckets(input?.currencies),
      correlations: pairs,
      highCorrelationCount: pairs.filter((pair) => Math.abs(pair.correlation) >= 0.8).length,
    },
    asOf,
    source: 'watchlist-composition-snapshots',
    status,
    warnings: [
      ...(pairs.length === 0 ? ['watchlist_correlation_unavailable'] : []),
      ...(status === 'stale' ? ['watchlist_composition_stale'] : []),
      ...(status === 'unavailable' ? ['watchlist_composition_timestamp_unavailable'] : []),
    ],
  };
}
