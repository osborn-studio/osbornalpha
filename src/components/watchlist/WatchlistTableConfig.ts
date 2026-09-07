import {
  WATCHLIST_ALL_COLUMNS,
  WATCHLIST_PRESET_COLUMNS,
  type WatchlistColumnKey,
  type WatchlistTablePreset,
} from '@/lib/watchlist/ui-preferences';

export type WatchlistColumnGroupKey = 'identity' | 'market' | 'valuation' | 'technical' | 'research';

export const WATCHLIST_TABLE_COLUMNS = WATCHLIST_ALL_COLUMNS;
export const WATCHLIST_TABLE_PRESETS = WATCHLIST_PRESET_COLUMNS;

export const WATCHLIST_COLUMN_GROUPS: Array<{ key: WatchlistColumnGroupKey; columns: WatchlistColumnKey[] }> = [
  { key: 'identity', columns: ['ticker', 'name', 'group'] },
  { key: 'market', columns: ['price', 'change', 'open', 'prevClose', 'dayRange', 'volume', 'amount', 'turnover', 'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated'] },
  { key: 'valuation', columns: ['marketCap', 'pe', 'pb', 'pePercentile', 'pbPercentile', 'marketCapShare'] },
  { key: 'technical', columns: ['periodReturn', 'excessReturn', 'relativeStrengthRank', 'volatility', 'beta', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'volumeZScore20', 'averageTradedAmount20', 'liquidityPercentile'] },
  { key: 'research', columns: ['research', 'alerts', 'decision'] },
];

export const WATCHLIST_NUMERIC_COLUMNS = new Set<WatchlistColumnKey>([
  'price', 'change', 'open', 'prevClose', 'volume', 'amount', 'marketCap', 'pe', 'pb', 'turnover',
  'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated',
  'periodReturn', 'excessReturn', 'volatility', 'beta', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'volumeZScore20', 'alerts',
  'relativeStrengthRank', 'pePercentile', 'pbPercentile', 'liquidityPercentile', 'averageTradedAmount20', 'marketCapShare',
]);

export const WATCHLIST_ANALYTICS_COLUMNS = new Set<WatchlistColumnKey>([
  'periodReturn', 'excessReturn', 'volatility', 'beta', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'volumeZScore20', 'research', 'alerts', 'decision',
  'relativeStrengthRank', 'pePercentile', 'pbPercentile', 'liquidityPercentile', 'averageTradedAmount20', 'marketCapShare',
]);

export const WATCHLIST_DEFAULT_COLUMN_WIDTHS: Partial<Record<WatchlistColumnKey, number>> = {
  ticker: 132, name: 190, price: 112, change: 104, periodReturn: 168,
  excessReturn: 132, volatility: 118, beta: 92, volumeZScore20: 124,
  relativeStrengthRank: 132, pePercentile: 124, pbPercentile: 124,
  liquidityPercentile: 132, averageTradedAmount20: 136, marketCapShare: 124,
  maxDrawdown: 112, research: 128, alerts: 112, decision: 124, updated: 132,
};

export const WATCHLIST_TABLE_PRESET_KEYS: WatchlistTablePreset[] = [
  'market', 'relative', 'valuation', 'risk',
];
