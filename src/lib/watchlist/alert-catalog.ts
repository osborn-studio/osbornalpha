import type { CalendarEventKind } from '@/lib/brief/calendar';
import type { WatchlistAlert } from '@/lib/supabase/database.types';

export const WATCHLIST_ALERT_TYPES = [
  'price', 'change_pct', 'volume_ratio', 'valuation', 'event', 'rating', 'perspective',
] as const satisfies readonly WatchlistAlert['alert_type'][];

export const WATCHLIST_NUMERIC_ALERT_TYPES = [
  'price', 'change_pct', 'volume_ratio', 'valuation',
] as const satisfies readonly WatchlistAlert['alert_type'][];

export const WATCHLIST_ALERT_OPERATORS = [
  'gt', 'gte', 'lt', 'lte', 'crosses_above', 'crosses_below',
] as const satisfies readonly NonNullable<WatchlistAlert['operator']>[];

export const WATCHLIST_EVENT_KINDS = [
  'earnings_announce', 'earnings_guidance', 'dividend_ex_date', 'dividend_record', 'share_unlock',
] as const satisfies readonly CalendarEventKind[];

export const WATCHLIST_RATING_VALUES = ['buy', 'hold', 'sell'] as const;
export const WATCHLIST_PERSPECTIVE_VALUES = ['bullish', 'neutral', 'bearish'] as const;
export const WATCHLIST_VALUATION_METRICS = ['pe_ttm', 'pb'] as const;

export type WatchlistRatingValue = typeof WATCHLIST_RATING_VALUES[number];

const BUY_RATINGS = [
  'strong buy', 'buy', 'outperform', 'overweight', 'accumulate', 'add',
  '买入', '强烈推荐', '推荐', '增持', '跑赢行业', '优于大市',
];
const HOLD_RATINGS = [
  'hold', 'neutral', 'market perform', 'equal-weight', 'sector perform',
  '持有', '中性', '与大市同步', '行业同步',
];
const SELL_RATINGS = [
  'strong sell', 'sell', 'underperform', 'underweight', 'reduce',
  '卖出', '减持', '跑输行业', '弱于大市',
];

function includesRating(dictionary: readonly string[], value: string): boolean {
  return dictionary.some((candidate) => value === candidate || value.includes(candidate));
}

export function normalizeWatchlistRating(value: string | null | undefined): WatchlistRatingValue | null {
  const normalized = value?.trim().toLocaleLowerCase();
  if (!normalized) return null;
  if (includesRating(BUY_RATINGS, normalized)) return 'buy';
  if (includesRating(HOLD_RATINGS, normalized)) return 'hold';
  if (includesRating(SELL_RATINGS, normalized)) return 'sell';
  return null;
}

export const WATCHLIST_ALERT_CATALOG = {
  types: WATCHLIST_ALERT_TYPES,
  numericTypes: WATCHLIST_NUMERIC_ALERT_TYPES,
  operators: WATCHLIST_ALERT_OPERATORS,
  valuationMetrics: WATCHLIST_VALUATION_METRICS,
  values: {
    event: WATCHLIST_EVENT_KINDS,
    rating: WATCHLIST_RATING_VALUES,
    perspective: WATCHLIST_PERSPECTIVE_VALUES,
  },
  cooldownMinutes: [15, 60, 240, 1440, 10080],
} as const;
