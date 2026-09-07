import type { LiveQuote } from '@/lib/hooks/useQuote';
import type { WatchlistOverviewRow } from './overview-contract';
import type { WatchlistMarketRow } from './market-row';
import type { WatchlistColumnKey, WatchlistSavedTableView, WatchlistTablePreferences } from './ui-preferences';
import { calculateWatchlistDataQuality } from './data-quality';

export function watchlistNumericInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resetWatchlistTableFilters(
  preferences: WatchlistTablePreferences,
): WatchlistTablePreferences {
  return {
    ...preferences,
    query: '',
    groupFilter: 'all',
    marketFilter: 'all',
    statusFilter: 'all',
    decisionFilter: 'all',
    tagFilter: '',
    historyRange: '1y',
    metricFilter: 'none',
    metricMin: null,
    metricMax: null,
  };
}

export function watchlistTableActiveFilterCount(
  preferences: WatchlistTablePreferences,
): number {
  return [
    preferences.groupFilter !== 'all',
    preferences.marketFilter !== 'all',
    preferences.statusFilter !== 'all',
    preferences.decisionFilter !== 'all',
    !!preferences.tagFilter.trim(),
    preferences.metricFilter !== 'none',
  ].filter(Boolean).length;
}

export function renameWatchlistSavedView(
  views: WatchlistSavedTableView[],
  id: string,
  name: string,
): WatchlistSavedTableView[] {
  const normalizedName = name.trim().slice(0, 40);
  if (!normalizedName) return views;
  const duplicate = views.some((view) => view.id !== id && view.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase());
  if (duplicate) return views;
  return views.map((view) => view.id === id ? { ...view, name: normalizedName } : view);
}

export function moveWatchlistSavedView(
  views: WatchlistSavedTableView[],
  id: string,
  offset: -1 | 1,
): WatchlistSavedTableView[] {
  const index = views.findIndex((view) => view.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= views.length) return views;
  const next = [...views];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function setDefaultWatchlistSavedView(
  views: WatchlistSavedTableView[],
  id: string,
): WatchlistSavedTableView[] {
  if (!views.some((view) => view.id === id)) return views;
  const clear = views.find((view) => view.id === id)?.isDefault === true;
  return views.map((view) => ({
    ...view,
    ...(view.id === id && !clear ? { isDefault: true } : {}),
    ...(view.id !== id || clear ? { isDefault: undefined } : {}),
  }));
}

export function watchlistDayPosition(quote: LiveQuote | null): number | null {
  if (!quote || quote.high <= quote.low || quote.price <= 0) return null;
  return Math.min(100, Math.max(0, ((quote.price - quote.low) / (quote.high - quote.low)) * 100));
}

export function watchlistIntradayRangePct(quote: LiveQuote | null): number | null {
  if (!quote || !Number.isFinite(quote.high) || !Number.isFinite(quote.low) || quote.high < quote.low) return null;
  const baseline = Number.isFinite(quote.prev_close) && quote.prev_close > 0 ? quote.prev_close : quote.price;
  return baseline > 0 ? ((quote.high - quote.low) / baseline) * 100 : null;
}

export function watchlistTableMetricValue(
  row: WatchlistMarketRow,
  key: WatchlistColumnKey,
  overview?: WatchlistOverviewRow,
): string | number | null {
  const quote = row.quote;
  switch (key) {
    case 'ticker': return row.ticker;
    case 'name': return row.name;
    case 'group': return row.group;
    case 'price': return quote?.price ?? null;
    case 'change': return quote?.change_pct ?? null;
    case 'open': return quote?.open ?? null;
    case 'prevClose': return quote?.prev_close ?? null;
    case 'dayRange': return watchlistIntradayRangePct(quote);
    case 'volume': return quote?.volume ?? null;
    case 'amount': return quote?.amount ?? null;
    case 'marketCap': return quote?.market_cap ?? null;
    case 'pe': return quote?.pe_ttm ?? null;
    case 'pb': return quote?.pb ?? null;
    case 'turnover': return quote?.turnover ?? null;
    case 'volumeRatio': return quote?.volume_ratio ?? null;
    case 'amplitude': return quote?.amplitude ?? null;
    case 'dayPosition': return watchlistDayPosition(quote);
    case 'periodReturn': return overview?.history?.value?.periodReturnPct ?? null;
    case 'volatility': return overview?.history?.value?.annualizedVolatilityPct ?? null;
    case 'maxDrawdown': return overview?.history?.value?.maxDrawdownPct ?? null;
    case 'rangePosition': return overview?.history?.value?.rangePositionPct ?? null;
    case 'rsi14': return overview?.history?.value?.rsi14 ?? null;
    case 'macdHistogram': return overview?.history?.value?.macdHistogram ?? null;
    case 'bollingerPosition': return overview?.history?.value?.bollingerPositionPct ?? null;
    case 'atr14': return overview?.history?.value?.atr14Pct ?? null;
    case 'excessReturn': return overview?.history?.value?.excessReturnPct ?? null;
    case 'beta': return overview?.history?.value?.beta ?? null;
    case 'volumeZScore20': return overview?.history?.value?.volumeZScore20 ?? null;
    case 'relativeStrengthRank': return overview?.peer?.value?.marketRelativeStrengthPercentile ?? null;
    case 'pePercentile': return overview?.peer?.value?.industryPePercentile ?? null;
    case 'pbPercentile': return overview?.peer?.value?.industryPbPercentile ?? null;
    case 'liquidityPercentile': return overview?.peer?.value?.marketLiquidityPercentile ?? null;
    case 'averageTradedAmount20': return overview?.peer?.value?.averageTradedAmount20 ?? null;
    case 'marketCapShare': return overview?.peer?.value?.watchlistMarketCapSharePct ?? null;
    case 'research': return overview?.research.value?.recentNewsCount ?? null;
    case 'alerts': return overview?.alerts.value?.unreadCount ?? 0;
    case 'decision': return overview?.item.status ?? '';
    case 'quality': return calculateWatchlistDataQuality(quote, row.status, overview?.history).score;
    case 'updated': return quote?.updated_at ? Date.parse(quote.updated_at) : null;
  }
}

export interface WatchlistTableQuerySnapshotValue {
  value: string | number | null;
  asOf: string | null;
  currency: string | null;
  role: 'sort' | 'filter';
}

export function watchlistTableQuerySnapshotValue(
  overview: WatchlistOverviewRow | undefined,
  key: WatchlistColumnKey,
): WatchlistTableQuerySnapshotValue | null {
  const snapshot = overview?.querySnapshot;
  if (!snapshot) return null;
  const sortKey = key === 'updated' ? 'freshness' : key;
  if (snapshot.sortKey === sortKey) {
    return {
      value: snapshot.sortNumber ?? snapshot.sortText,
      asOf: snapshot.sortAsOf,
      currency: snapshot.currency,
      role: 'sort',
    };
  }
  if (snapshot.metricKey === key) {
    return {
      value: snapshot.metricNumber,
      asOf: snapshot.metricAsOf,
      currency: snapshot.currency,
      role: 'filter',
    };
  }
  return null;
}
