import type { Market, WatchlistItem } from '@/lib/supabase/database.types';
import type { WatchlistColumnKey } from './ui-preferences';
import {
  WATCHLIST_OVERVIEW_METRICS,
  WATCHLIST_OVERVIEW_QUERY_SORTS,
  WATCHLIST_OVERVIEW_QUOTE_STATUSES,
  type WatchlistOverviewMetric,
  type WatchlistOverviewQuerySort,
  type WatchlistOverviewQuoteStatus,
} from './overview-fields';
export type { WatchlistOverviewMetric, WatchlistOverviewQuerySort, WatchlistOverviewQuoteStatus } from './overview-fields';
export type WatchlistOverviewQueryDirection = 'asc' | 'desc';

const COLUMN_SORTS: Partial<Record<WatchlistColumnKey, WatchlistOverviewQuerySort>> = {
  ticker: 'ticker',
  name: 'name',
  group: 'group',
  price: 'price',
  change: 'change',
  open: 'open',
  prevClose: 'prevClose',
  dayRange: 'dayRange',
  volume: 'volume',
  amount: 'amount',
  marketCap: 'marketCap',
  pe: 'pe',
  pb: 'pb',
  turnover: 'turnover',
  volumeRatio: 'volumeRatio',
  amplitude: 'amplitude',
  dayPosition: 'dayPosition',
  oneYearReturn: 'oneYearReturn',
  volatility: 'volatility',
  maxDrawdown: 'maxDrawdown',
  rangePosition: 'rangePosition',
  rsi14: 'rsi14',
  macdHistogram: 'macdHistogram',
  bollingerPosition: 'bollingerPosition',
  atr14: 'atr14',
  excessReturn: 'excessReturn',
  beta: 'beta',
  volumeZScore20: 'volumeZScore20',
  research: 'research',
  decision: 'decision',
  updated: 'freshness',
};

export function watchlistOverviewServerSort(column: WatchlistColumnKey): WatchlistOverviewQuerySort | null {
  return COLUMN_SORTS[column] ?? null;
}

export interface WatchlistOverviewQueryCursor {
  mode: 'query';
  fingerprint: string;
  nullRank: 0 | 1;
  sortNumber: number | null;
  sortText: string | null;
  itemId: string;
}

export interface WatchlistOverviewQueryRequest {
  active: boolean;
  limit: number;
  sort: WatchlistOverviewQuerySort;
  direction: WatchlistOverviewQueryDirection;
  query: string | null;
  groupId: string | null;
  market: Market | null;
  quoteStatus: WatchlistOverviewQuoteStatus | null;
  decisionStatus: WatchlistItem['status'] | null;
  tag: string | null;
  historyRange: '1m' | '6m' | 'ytd' | '1y' | '5y' | 'all';
  metric: WatchlistOverviewMetric | null;
  metricMin: number | null;
  metricMax: number | null;
  fingerprint: string;
  cursor: WatchlistOverviewQueryCursor | null;
  invalid: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MARKETS = new Set<Market>(['A', 'HK', 'US', 'JP', 'KR', 'TW']);
const DECISION_STATUSES = new Set<WatchlistItem['status']>([
  'inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated',
]);
const HISTORY_RANGES = new Set(['1m', '6m', 'ytd', '1y', '5y', 'all']);
const NUMERIC_SORTS = new Set<WatchlistOverviewQuerySort>([
  'position', 'price', 'change', 'open', 'prevClose', 'dayRange', 'volume',
  'amount', 'marketCap', 'pe', 'pb', 'turnover', 'volumeRatio', 'amplitude',
  'dayPosition', 'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition',
  'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'excessReturn', 'beta',
  'volumeZScore20', 'research', 'freshness',
]);

function normalizedOptional(value: string | null, maxLength: number): string | null | undefined {
  if (value === null || value.trim() === '') return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : undefined;
}

function optionalFinite(value: string | null): number | null | undefined {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Stable non-cryptographic hash binding an opaque cursor to typed arguments. */
export function watchlistOverviewQueryFingerprint(value: Omit<WatchlistOverviewQueryRequest, 'active' | 'cursor' | 'invalid' | 'fingerprint'>): string {
  const input = JSON.stringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

export function parseWatchlistOverviewQuery(url: URL): WatchlistOverviewQueryRequest {
  const params = url.searchParams;
  const sortValue = params.get('sort') ?? 'position';
  const directionValue = params.get('direction') ?? 'asc';
  const limitValue = Number(params.get('limit') ?? 50);
  const query = normalizedOptional(params.get('q'), 120);
  const groupId = normalizedOptional(params.get('groupId'), 36);
  const tag = normalizedOptional(params.get('tag'), 32);
  const marketValue = params.get('market');
  const quoteStatusValue = params.get('quoteStatus');
  const decisionValue = params.get('decisionStatus');
  const historyRangeValue = params.get('historyRange') ?? '1y';
  const metricValue = params.get('metric');
  const metricMin = optionalFinite(params.get('metricMin'));
  const metricMax = optionalFinite(params.get('metricMax'));
  const invalidArguments = !WATCHLIST_OVERVIEW_QUERY_SORTS.includes(sortValue as WatchlistOverviewQuerySort)
    || (directionValue !== 'asc' && directionValue !== 'desc')
    || !Number.isSafeInteger(limitValue) || limitValue < 1
    || query === undefined || groupId === undefined || tag === undefined
    || (!!groupId && !UUID_RE.test(groupId))
    || (!!marketValue && !MARKETS.has(marketValue as Market))
    || (!!quoteStatusValue && !WATCHLIST_OVERVIEW_QUOTE_STATUSES.includes(quoteStatusValue as WatchlistOverviewQuoteStatus))
    || (!!decisionValue && !DECISION_STATUSES.has(decisionValue as WatchlistItem['status']))
    || !HISTORY_RANGES.has(historyRangeValue)
    || (!!metricValue && !WATCHLIST_OVERVIEW_METRICS.includes(metricValue as WatchlistOverviewMetric))
    || metricMin === undefined || metricMax === undefined
    || ((metricMin !== null || metricMax !== null) && !metricValue)
    || (metricMin !== null && metricMax !== null && metricMin > metricMax);
  const base = {
    limit: Math.min(Math.max(Number.isSafeInteger(limitValue) ? limitValue : 50, 1), 50),
    sort: sortValue as WatchlistOverviewQuerySort,
    direction: directionValue as WatchlistOverviewQueryDirection,
    query: query ?? null,
    groupId: groupId ?? null,
    market: (marketValue || null) as Market | null,
    quoteStatus: (quoteStatusValue || null) as WatchlistOverviewQuoteStatus | null,
    decisionStatus: (decisionValue || null) as WatchlistItem['status'] | null,
    tag: tag ?? null,
    historyRange: historyRangeValue as WatchlistOverviewQueryRequest['historyRange'],
    metric: (metricValue || null) as WatchlistOverviewMetric | null,
    metricMin: metricMin ?? null,
    metricMax: metricMax ?? null,
  };
  const fingerprint = watchlistOverviewQueryFingerprint(base);
  const rawCursor = params.get('cursor');
  let cursor: WatchlistOverviewQueryCursor | null = null;
  let invalidCursor = false;
  let cursorClaimsQuery = false;
  if (rawCursor) {
    try {
      const parsed = JSON.parse(decodeURIComponent(rawCursor)) as Record<string, unknown>;
      cursorClaimsQuery = parsed.mode === 'query';
      const numericSort = NUMERIC_SORTS.has(base.sort);
      const validValue = Number(parsed.nullRank) === 1
        || (numericSort ? Number.isFinite(parsed.sortNumber) : typeof parsed.sortText === 'string');
      if (parsed.mode === 'query' && parsed.fingerprint === fingerprint
        && (parsed.nullRank === 0 || parsed.nullRank === 1)
        && typeof parsed.itemId === 'string' && UUID_RE.test(parsed.itemId)
        && validValue) {
        cursor = {
          mode: 'query', fingerprint, nullRank: parsed.nullRank,
          sortNumber: Number.isFinite(parsed.sortNumber) ? Number(parsed.sortNumber) : null,
          sortText: typeof parsed.sortText === 'string' ? parsed.sortText : null,
          itemId: parsed.itemId,
        };
      } else invalidCursor = true;
    } catch {
      invalidCursor = true;
    }
  }
  const queryKeys = [
    'sort', 'direction', 'q', 'groupId', 'market', 'quoteStatus', 'decisionStatus', 'tag',
    'historyRange', 'metric', 'metricMin', 'metricMax',
  ];
  return {
    active: queryKeys.some((key) => params.has(key)) || cursorClaimsQuery,
    ...base,
    fingerprint,
    cursor,
    invalid: invalidArguments || invalidCursor,
  };
}

export function encodeWatchlistOverviewQueryCursor(cursor: WatchlistOverviewQueryCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}
