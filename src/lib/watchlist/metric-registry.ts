export const WATCHLIST_METRIC_DEFINITION_VERSION = 'watchlist-metrics-2026-09-04.v2';

export type WatchlistMetricSource = 'quote' | 'history' | 'research';
export type WatchlistMetricUnit = 'currency' | 'percent' | 'ratio' | 'count';
export type WatchlistMetricDirection = 'higher' | 'lower' | 'contextual';
export type WatchlistMetricWindow = 'snapshot' | 'selected_history' | '14d';

export interface WatchlistMetricDefinition {
  source: WatchlistMetricSource;
  unit: WatchlistMetricUnit;
  direction: WatchlistMetricDirection;
  window: WatchlistMetricWindow;
  precision: number;
  minimumObservations?: number;
}

export const WATCHLIST_METRIC_REGISTRY = {
  price: { source: 'quote', unit: 'currency', direction: 'contextual', window: 'snapshot', precision: 2 },
  change: { source: 'quote', unit: 'percent', direction: 'contextual', window: 'snapshot', precision: 2 },
  marketCap: { source: 'quote', unit: 'currency', direction: 'contextual', window: 'snapshot', precision: 0 },
  pe: { source: 'quote', unit: 'ratio', direction: 'contextual', window: 'snapshot', precision: 2 },
  pb: { source: 'quote', unit: 'ratio', direction: 'contextual', window: 'snapshot', precision: 2 },
  turnover: { source: 'quote', unit: 'percent', direction: 'contextual', window: 'snapshot', precision: 2 },
  volumeRatio: { source: 'quote', unit: 'ratio', direction: 'contextual', window: 'snapshot', precision: 2 },
  amplitude: { source: 'quote', unit: 'percent', direction: 'lower', window: 'snapshot', precision: 2 },
  oneYearReturn: { source: 'history', unit: 'percent', direction: 'higher', window: 'selected_history', precision: 2, minimumObservations: 2 },
  volatility: { source: 'history', unit: 'percent', direction: 'lower', window: 'selected_history', precision: 2, minimumObservations: 20 },
  maxDrawdown: { source: 'history', unit: 'percent', direction: 'higher', window: 'selected_history', precision: 2, minimumObservations: 2 },
  rangePosition: { source: 'history', unit: 'percent', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 2 },
  rsi14: { source: 'history', unit: 'ratio', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 15 },
  macdHistogram: { source: 'history', unit: 'currency', direction: 'contextual', window: 'selected_history', precision: 4, minimumObservations: 34 },
  bollingerPosition: { source: 'history', unit: 'percent', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 20 },
  atr14: { source: 'history', unit: 'percent', direction: 'lower', window: 'selected_history', precision: 2, minimumObservations: 15 },
  excessReturn: { source: 'history', unit: 'percent', direction: 'higher', window: 'selected_history', precision: 2, minimumObservations: 2 },
  beta: { source: 'history', unit: 'ratio', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 20 },
  volumeZScore20: { source: 'history', unit: 'ratio', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 21 },
  research: { source: 'research', unit: 'count', direction: 'contextual', window: '14d', precision: 0 },
} as const satisfies Record<string, WatchlistMetricDefinition>;

export type WatchlistMetricKey = keyof typeof WATCHLIST_METRIC_REGISTRY;

export const WATCHLIST_METRIC_KEYS = Object.freeze(
  Object.keys(WATCHLIST_METRIC_REGISTRY) as WatchlistMetricKey[],
);

export function watchlistMetricDefinition(key: WatchlistMetricKey): WatchlistMetricDefinition {
  return WATCHLIST_METRIC_REGISTRY[key];
}
