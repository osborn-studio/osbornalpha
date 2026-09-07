import type { WatchlistAlert } from '@/lib/supabase/database.types';
import {
  WATCHLIST_METRIC_ALERT_TYPES,
  WATCHLIST_QUOTE_ALERT_TYPES,
} from './alert-schedule';

export type WatchlistAlertCadence = 'market_15m' | 'hourly' | 'daily';

export function watchlistAlertCadence(
  alert: Pick<WatchlistAlert, 'alert_type'>,
): WatchlistAlertCadence {
  if (WATCHLIST_QUOTE_ALERT_TYPES.includes(alert.alert_type)) return 'market_15m';
  if (WATCHLIST_METRIC_ALERT_TYPES.includes(alert.alert_type)) return 'hourly';
  return 'daily';
}

export function watchlistAlertUsesDiscreteCrossing(
  alert: Pick<WatchlistAlert, 'operator'>,
): boolean {
  return alert.operator === 'crosses_above' || alert.operator === 'crosses_below';
}
