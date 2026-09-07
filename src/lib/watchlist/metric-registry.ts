export const WATCHLIST_METRIC_DEFINITION_VERSION = 'watchlist-metrics-2026-09-05.v4';

export type WatchlistMetricSource = 'quote' | 'history' | 'peer' | 'research';
export type WatchlistMetricUnit = 'currency' | 'percent' | 'ratio' | 'count';
export type WatchlistMetricDirection = 'higher' | 'lower' | 'contextual';
export type WatchlistMetricWindow = 'snapshot' | 'selected_history' | '14d';
export type WatchlistMetricComparisonScope =
  | 'global'
  | 'single_market'
  | 'market_peer'
  | 'industry_peer'
  | 'watchlist_market';

export interface WatchlistMetricDefinition {
  source: WatchlistMetricSource;
  unit: WatchlistMetricUnit;
  direction: WatchlistMetricDirection;
  window: WatchlistMetricWindow;
  precision: number;
  minimumObservations?: number;
  comparisonScope: WatchlistMetricComparisonScope;
}

export const WATCHLIST_METRIC_REGISTRY = {
  price: { source: 'quote', unit: 'currency', direction: 'contextual', window: 'snapshot', precision: 2, comparisonScope: 'single_market' },
  change: { source: 'quote', unit: 'percent', direction: 'contextual', window: 'snapshot', precision: 2, comparisonScope: 'global' },
  marketCap: { source: 'quote', unit: 'currency', direction: 'contextual', window: 'snapshot', precision: 0, comparisonScope: 'single_market' },
  pe: { source: 'quote', unit: 'ratio', direction: 'contextual', window: 'snapshot', precision: 2, comparisonScope: 'global' },
  pb: { source: 'quote', unit: 'ratio', direction: 'contextual', window: 'snapshot', precision: 2, comparisonScope: 'global' },
  turnover: { source: 'quote', unit: 'percent', direction: 'contextual', window: 'snapshot', precision: 2, comparisonScope: 'global' },
  volumeRatio: { source: 'quote', unit: 'ratio', direction: 'contextual', window: 'snapshot', precision: 2, comparisonScope: 'global' },
  amplitude: { source: 'quote', unit: 'percent', direction: 'lower', window: 'snapshot', precision: 2, comparisonScope: 'global' },
  periodReturn: { source: 'history', unit: 'percent', direction: 'higher', window: 'selected_history', precision: 2, minimumObservations: 2, comparisonScope: 'global' },
  volatility: { source: 'history', unit: 'percent', direction: 'lower', window: 'selected_history', precision: 2, minimumObservations: 20, comparisonScope: 'global' },
  maxDrawdown: { source: 'history', unit: 'percent', direction: 'higher', window: 'selected_history', precision: 2, minimumObservations: 2, comparisonScope: 'global' },
  rangePosition: { source: 'history', unit: 'percent', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 2, comparisonScope: 'global' },
  rsi14: { source: 'history', unit: 'ratio', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 15, comparisonScope: 'global' },
  macdHistogram: { source: 'history', unit: 'currency', direction: 'contextual', window: 'selected_history', precision: 4, minimumObservations: 34, comparisonScope: 'single_market' },
  bollingerPosition: { source: 'history', unit: 'percent', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 20, comparisonScope: 'global' },
  atr14: { source: 'history', unit: 'percent', direction: 'lower', window: 'selected_history', precision: 2, minimumObservations: 15, comparisonScope: 'global' },
  excessReturn: { source: 'history', unit: 'percent', direction: 'higher', window: 'selected_history', precision: 2, minimumObservations: 2, comparisonScope: 'global' },
  beta: { source: 'history', unit: 'ratio', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 20, comparisonScope: 'global' },
  volumeZScore20: { source: 'history', unit: 'ratio', direction: 'contextual', window: 'selected_history', precision: 2, minimumObservations: 21, comparisonScope: 'global' },
  relativeStrengthRank: { source: 'peer', unit: 'percent', direction: 'higher', window: 'selected_history', precision: 0, minimumObservations: 5, comparisonScope: 'market_peer' },
  pePercentile: { source: 'peer', unit: 'percent', direction: 'lower', window: 'snapshot', precision: 0, minimumObservations: 5, comparisonScope: 'industry_peer' },
  pbPercentile: { source: 'peer', unit: 'percent', direction: 'lower', window: 'snapshot', precision: 0, minimumObservations: 5, comparisonScope: 'industry_peer' },
  liquidityPercentile: { source: 'peer', unit: 'percent', direction: 'higher', window: 'selected_history', precision: 0, minimumObservations: 5, comparisonScope: 'market_peer' },
  averageTradedAmount20: { source: 'peer', unit: 'currency', direction: 'higher', window: 'selected_history', precision: 0, minimumObservations: 20, comparisonScope: 'single_market' },
  marketCapShare: { source: 'peer', unit: 'percent', direction: 'contextual', window: 'snapshot', precision: 2, minimumObservations: 1, comparisonScope: 'watchlist_market' },
  research: { source: 'research', unit: 'count', direction: 'contextual', window: '14d', precision: 0, comparisonScope: 'global' },
} as const satisfies Record<string, WatchlistMetricDefinition>;

export type WatchlistMetricKey = keyof typeof WATCHLIST_METRIC_REGISTRY;

export const WATCHLIST_METRIC_KEYS = Object.freeze(
  Object.keys(WATCHLIST_METRIC_REGISTRY) as WatchlistMetricKey[],
);

export function watchlistMetricDefinition(key: WatchlistMetricKey): WatchlistMetricDefinition {
  return WATCHLIST_METRIC_REGISTRY[key];
}

export function watchlistMetricRequiresSingleMarket(key: WatchlistMetricKey): boolean {
  return WATCHLIST_METRIC_REGISTRY[key].comparisonScope === 'single_market';
}
