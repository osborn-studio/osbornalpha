import type { WatchlistColumnKey } from './ui-preferences';
import type { WatchlistMarketRow } from './market-row';
import type { WatchlistOverviewRow } from './overview-contract';

export type WatchlistComparisonGroup = 'market' | 'valuation' | 'performance' | 'risk' | 'workflow';

export interface WatchlistComparisonMetric {
  key: WatchlistColumnKey;
  group: WatchlistComparisonGroup;
  format: 'price' | 'percent' | 'compact' | 'decimal' | 'percentile' | 'count';
}

export type WatchlistComparisonIssue =
  | 'mixedCurrency'
  | 'mixedMarket'
  | 'mixedIndustry'
  | 'differentBenchmarks'
  | 'staleData';

export interface WatchlistComparisonContext {
  issues: WatchlistComparisonIssue[];
  currencies: string[];
  markets: string[];
  industries: string[];
  benchmarks: string[];
}

export type WatchlistComparisonValueRole = 'best' | 'worst' | 'neutral';

export const WATCHLIST_COMPARISON_METRICS: WatchlistComparisonMetric[] = [
  { key: 'price', group: 'market', format: 'price' },
  { key: 'change', group: 'market', format: 'percent' },
  { key: 'marketCap', group: 'valuation', format: 'compact' },
  { key: 'pe', group: 'valuation', format: 'decimal' },
  { key: 'pb', group: 'valuation', format: 'decimal' },
  { key: 'periodReturn', group: 'performance', format: 'percent' },
  { key: 'excessReturn', group: 'performance', format: 'percent' },
  { key: 'relativeStrengthRank', group: 'performance', format: 'percentile' },
  { key: 'volatility', group: 'risk', format: 'percent' },
  { key: 'maxDrawdown', group: 'risk', format: 'percent' },
  { key: 'beta', group: 'risk', format: 'decimal' },
  { key: 'rsi14', group: 'risk', format: 'decimal' },
  { key: 'research', group: 'workflow', format: 'count' },
  { key: 'alerts', group: 'workflow', format: 'count' },
];

export function normalizeWatchlistComparisonTickers(tickers: readonly string[], limit = 5): string[] {
  return [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))].slice(0, limit);
}

function distinct(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))];
}

export function buildWatchlistComparisonContext(
  rows: readonly WatchlistMarketRow[],
  overviewByTicker: Record<string, WatchlistOverviewRow | undefined>,
): WatchlistComparisonContext {
  const currencies = distinct(rows.map((row) => row.currency));
  const markets = distinct(rows.map((row) => row.market));
  const industries = distinct(rows.map((row) => overviewByTicker[row.ticker]?.identity?.industry));
  const benchmarks = distinct(rows.map((row) => overviewByTicker[row.ticker]?.history?.value?.benchmarkTicker));
  const issues: WatchlistComparisonIssue[] = [
    ...(currencies.length > 1 ? ['mixedCurrency' as const] : []),
    ...(markets.length > 1 ? ['mixedMarket' as const] : []),
    ...(industries.length > 1 ? ['mixedIndustry' as const] : []),
    ...(benchmarks.length > 1 ? ['differentBenchmarks' as const] : []),
    ...(rows.some((row) => row.status === 'stale' || row.status === 'unavailable') ? ['staleData' as const] : []),
  ];
  return { issues, currencies, markets, industries, benchmarks };
}

const METRIC_ISSUE: Partial<Record<WatchlistColumnKey, WatchlistComparisonIssue>> = {
  price: 'mixedCurrency',
  marketCap: 'mixedCurrency',
  pe: 'mixedIndustry',
  pb: 'mixedIndustry',
  relativeStrengthRank: 'mixedMarket',
  excessReturn: 'differentBenchmarks',
  beta: 'differentBenchmarks',
};

export function watchlistComparisonMetricIssue(
  metric: WatchlistComparisonMetric,
  context: WatchlistComparisonContext,
): WatchlistComparisonIssue | null {
  const issue = METRIC_ISSUE[metric.key];
  return issue && context.issues.includes(issue) ? issue : null;
}

const METRIC_DIRECTION: Partial<Record<WatchlistColumnKey, 'higher' | 'lower'>> = {
  change: 'higher',
  periodReturn: 'higher',
  excessReturn: 'higher',
  relativeStrengthRank: 'higher',
  volatility: 'lower',
  maxDrawdown: 'higher',
};

export function watchlistComparisonValueRoles(
  metric: WatchlistComparisonMetric,
  values: Array<number | null>,
): WatchlistComparisonValueRole[] {
  const direction = METRIC_DIRECTION[metric.key];
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const unique = [...new Set(finite)];
  if (!direction || unique.length < 2) return values.map(() => 'neutral');
  const high = Math.max(...finite);
  const low = Math.min(...finite);
  const best = direction === 'higher' ? high : low;
  const worst = direction === 'higher' ? low : high;
  return values.map((value) => value === best ? 'best' : value === worst ? 'worst' : 'neutral');
}
