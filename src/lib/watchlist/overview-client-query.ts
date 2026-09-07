import type { WatchlistGroup } from './store';
import type { WatchlistTablePreferences } from './ui-preferences';
import {
  watchlistColumnRequiresSingleMarket,
  watchlistOverviewServerSort,
  type WatchlistOverviewClientQuery,
} from './overview-query';
import { watchlistMetricRequiresSingleMarket } from './metric-registry';

export function buildWatchlistOverviewClientQuery(
  enabled: boolean,
  groups: WatchlistGroup[],
  table: WatchlistTablePreferences,
  debouncedQuery: string,
): WatchlistOverviewClientQuery | null {
  if (!enabled) return null;

  const requestedServerSort = watchlistOverviewServerSort(table.sortKey);
  const groupId = table.groupFilter === 'all'
    ? null
    : groups.find((group) => group.id === table.groupFilter || group.name === table.groupFilter)?.id ?? null;
  const market = table.marketFilter === 'all' ? null : table.marketFilter;
  const serverSort = requestedServerSort && (!watchlistColumnRequiresSingleMarket(table.sortKey) || market)
    ? requestedServerSort
    : null;
  const quoteStatus = table.statusFilter === 'all' || table.statusFilter === 'loading'
    ? null
    : table.statusFilter;
  const decisionStatus = table.decisionFilter === 'all' ? null : table.decisionFilter;
  const tag = table.tagFilter.trim() || null;
  const query = debouncedQuery.trim() || null;
  const metric = table.metricFilter !== 'none'
    && (!watchlistMetricRequiresSingleMarket(table.metricFilter) || market)
    ? table.metricFilter
    : null;
  const active = serverSort || groupId || market || quoteStatus || query || decisionStatus || tag || metric;

  if (!active) return null;
  return {
    sort: serverSort ?? 'position',
    direction: table.asc ? 'asc' : 'desc',
    groupId,
    market,
    quoteStatus,
    query,
    decisionStatus,
    tag,
    historyRange: table.historyRange,
    metric,
    metricMin: metric ? table.metricMin : null,
    metricMax: metric ? table.metricMax : null,
  };
}
