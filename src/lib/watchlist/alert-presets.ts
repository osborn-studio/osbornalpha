import type { WatchlistAlert } from '@/lib/supabase/database.types';

import { WATCHLIST_METRIC_ALERT_DEFINITIONS, type WatchlistMetricAlertKey } from './alert-metrics';

export type WatchlistAlertPresetKey = 'priceAbove' | 'priceBelow' | 'largeMove' | 'unusualVolume' | 'rsiOversold' | 'volatilityHigh' | 'ratingBuy';

export interface WatchlistAlertPreset {
  key: WatchlistAlertPresetKey;
  type: WatchlistAlert['alert_type'];
  operator: NonNullable<WatchlistAlert['operator']>;
  threshold: string;
  discreteValue: string;
  metric: WatchlistMetricAlertKey | null;
}

export const WATCHLIST_ALERT_PRESETS: WatchlistAlertPreset[] = [
  { key: 'priceAbove', type: 'price', operator: 'crosses_above', threshold: '', discreteValue: '', metric: null },
  { key: 'priceBelow', type: 'price', operator: 'crosses_below', threshold: '', discreteValue: '', metric: null },
  { key: 'largeMove', type: 'change_pct', operator: 'gte', threshold: '5', discreteValue: '', metric: null },
  { key: 'unusualVolume', type: 'volume_ratio', operator: 'gte', threshold: '2', discreteValue: '', metric: null },
  { key: 'rsiOversold', type: 'metric', operator: 'lte', threshold: '30', discreteValue: '', metric: 'rsi14' },
  { key: 'volatilityHigh', type: 'metric', operator: 'gte', threshold: '40', discreteValue: '', metric: 'annualized_volatility_pct' },
  { key: 'ratingBuy', type: 'rating', operator: 'gte', threshold: '', discreteValue: 'buy', metric: null },
];

export function alertThresholdUnit(type: WatchlistAlert['alert_type'], metric?: WatchlistMetricAlertKey): string | null {
  if (type === 'change_pct') return '%';
  if (type === 'volume_ratio') return 'x';
  if (type === 'metric') return WATCHLIST_METRIC_ALERT_DEFINITIONS.find((item) => item.key === metric)?.unit ?? null;
  return null;
}
