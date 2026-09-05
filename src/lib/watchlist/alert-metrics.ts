import type { WatchlistMetricSnapshot } from '@/lib/supabase/database.types';

export const WATCHLIST_METRIC_ALERT_KEYS = [
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
] as const satisfies readonly (keyof WatchlistMetricSnapshot)[];

export type WatchlistMetricAlertKey = typeof WATCHLIST_METRIC_ALERT_KEYS[number];

export interface WatchlistMetricAlertDefinition {
  key: WatchlistMetricAlertKey;
  unit: '%' | null;
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
  const value = snapshot[key];
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
