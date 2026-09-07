import type { WatchlistMetricSnapshot } from '@/lib/supabase/database.types';
import type { DataEnvelope } from './overview-contract';
import type { WatchlistPeerMetrics } from './peer-metrics';

export const WATCHLIST_SNAPSHOT_ALERT_KEYS = [
  'annualized_volatility_pct',
  'downside_volatility_pct',
  'sharpe_ratio',
  'max_drawdown_pct',
  'rsi14',
  'ma20_distance_pct',
  'ma50_distance_pct',
  'macd_histogram',
  'bollinger_position_pct',
  'atr14_pct',
  'average_traded_amount_20',
] as const satisfies readonly (keyof WatchlistMetricSnapshot)[];

export const WATCHLIST_PEER_ALERT_KEYS = [
  'market_relative_strength_percentile',
  'industry_pe_percentile',
  'industry_pb_percentile',
  'market_liquidity_percentile',
] as const;

export const WATCHLIST_METRIC_ALERT_KEYS = [...WATCHLIST_SNAPSHOT_ALERT_KEYS, ...WATCHLIST_PEER_ALERT_KEYS] as const;
export type WatchlistSnapshotAlertKey = typeof WATCHLIST_SNAPSHOT_ALERT_KEYS[number];
export type WatchlistPeerAlertKey = typeof WATCHLIST_PEER_ALERT_KEYS[number];
export type WatchlistMetricAlertKey = typeof WATCHLIST_METRIC_ALERT_KEYS[number];

export interface WatchlistMetricAlertDefinition {
  key: WatchlistMetricAlertKey;
  unit: '%' | 'currency' | null;
  minimum: number | null;
  maximum: number | null;
}

export const WATCHLIST_METRIC_ALERT_DEFINITIONS: readonly WatchlistMetricAlertDefinition[] = [
  { key: 'annualized_volatility_pct', unit: '%', minimum: 0, maximum: null },
  { key: 'downside_volatility_pct', unit: '%', minimum: 0, maximum: null },
  { key: 'sharpe_ratio', unit: null, minimum: null, maximum: null },
  { key: 'max_drawdown_pct', unit: '%', minimum: 0, maximum: 100 },
  { key: 'rsi14', unit: null, minimum: 0, maximum: 100 },
  { key: 'ma20_distance_pct', unit: '%', minimum: null, maximum: null },
  { key: 'ma50_distance_pct', unit: '%', minimum: null, maximum: null },
  { key: 'macd_histogram', unit: null, minimum: null, maximum: null },
  { key: 'bollinger_position_pct', unit: '%', minimum: 0, maximum: 100 },
  { key: 'atr14_pct', unit: '%', minimum: 0, maximum: null },
  { key: 'average_traded_amount_20', unit: 'currency', minimum: 0, maximum: null },
  { key: 'market_relative_strength_percentile', unit: '%', minimum: 0, maximum: 100 },
  { key: 'industry_pe_percentile', unit: '%', minimum: 0, maximum: 100 },
  { key: 'industry_pb_percentile', unit: '%', minimum: 0, maximum: 100 },
  { key: 'market_liquidity_percentile', unit: '%', minimum: 0, maximum: 100 },
] as const;

const DEFINITION_BY_KEY = new Map(
  WATCHLIST_METRIC_ALERT_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function isWatchlistMetricAlertKey(value: unknown): value is WatchlistMetricAlertKey {
  return typeof value === 'string' && DEFINITION_BY_KEY.has(value as WatchlistMetricAlertKey);
}

export function watchlistMetricAlertDefinition(
  key: unknown,
): WatchlistMetricAlertDefinition | null {
  return isWatchlistMetricAlertKey(key) ? DEFINITION_BY_KEY.get(key) ?? null : null;
}

export function watchlistMetricAlertThresholdIsValid(key: unknown, value: unknown): value is number {
  const definition = watchlistMetricAlertDefinition(key);
  if (!definition || typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000_000) {
    return false;
  }
  return (definition.minimum === null || value >= definition.minimum)
    && (definition.maximum === null || value <= definition.maximum);
}

export function watchlistMetricAlertValue(
  snapshot: WatchlistMetricSnapshot | null | undefined,
  key: unknown,
): number | null {
  if (!snapshot || !isWatchlistMetricAlertKey(key)) return null;
  if (!(WATCHLIST_SNAPSHOT_ALERT_KEYS as readonly string[]).includes(key)) return null;
  const value = snapshot[key as WatchlistSnapshotAlertKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isWatchlistPeerAlertKey(value: unknown): value is WatchlistPeerAlertKey {
  return typeof value === 'string' && (WATCHLIST_PEER_ALERT_KEYS as readonly string[]).includes(value);
}

export function watchlistPeerMetricAlertValue(
  envelope: DataEnvelope<WatchlistPeerMetrics> | null | undefined,
  key: unknown,
): number | null {
  if (!envelope?.value || !isWatchlistPeerAlertKey(key)) return null;
  const value = key === 'market_relative_strength_percentile' ? envelope.value.marketRelativeStrengthPercentile
    : key === 'industry_pe_percentile' ? envelope.value.industryPePercentile
      : key === 'industry_pb_percentile' ? envelope.value.industryPbPercentile
        : envelope.value.marketLiquidityPercentile;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function watchlistMetricSnapshotStatus(
  snapshot: WatchlistMetricSnapshot | null | undefined,
  now = new Date(),
): 'fresh' | 'stale' | 'unavailable' {
  if (!snapshot) return 'unavailable';
  const validUntil = new Date(snapshot.valid_until).getTime();
  if (!Number.isFinite(validUntil)) return 'unavailable';
  return validUntil > now.getTime() ? 'fresh' : 'stale';
}
