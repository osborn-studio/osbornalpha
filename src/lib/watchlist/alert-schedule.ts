import type { Market, WatchlistAlert } from '@/lib/supabase/database.types';
import { builtInMarketCalendar, type MarketCalendarProvider } from '@/lib/market/calendar';
import { marketPhase } from '@/lib/today/clock';
import { classifyMarket } from '@/lib/utils';

export type WatchlistAlertScope = 'all' | 'quote' | 'metric' | 'research';

export const WATCHLIST_QUOTE_ALERT_TYPES: WatchlistAlert['alert_type'][] = [
  'price', 'change_pct', 'volume_ratio', 'valuation',
];
export const WATCHLIST_RESEARCH_ALERT_TYPES: WatchlistAlert['alert_type'][] = [
  'event', 'rating', 'perspective',
];
export const WATCHLIST_METRIC_ALERT_TYPES: WatchlistAlert['alert_type'][] = ['metric'];

export function watchlistAlertTypesForScope(scope: WatchlistAlertScope): WatchlistAlert['alert_type'][] | null {
  if (scope === 'quote') return WATCHLIST_QUOTE_ALERT_TYPES;
  if (scope === 'metric') return WATCHLIST_METRIC_ALERT_TYPES;
  if (scope === 'research') return WATCHLIST_RESEARCH_ALERT_TYPES;
  return null;
}

export function shouldEvaluateWatchlistAlert(
  alert: Pick<WatchlistAlert, 'alert_type'>,
  ticker: string,
  scope: WatchlistAlertScope,
  now: Date,
  calendar: MarketCalendarProvider = builtInMarketCalendar,
): boolean {
  const types = watchlistAlertTypesForScope(scope);
  if (types && !types.includes(alert.alert_type)) return false;
  if (!WATCHLIST_QUOTE_ALERT_TYPES.includes(alert.alert_type)) return true;
  const market: Market = classifyMarket(ticker);
  return marketPhase(market, now, calendar).phase === 'open';
}
