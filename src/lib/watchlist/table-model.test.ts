import { describe, expect, it } from 'vitest';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import type { WatchlistMarketRow } from './market-row';
import {
  moveWatchlistSavedView,
  renameWatchlistSavedView,
  resetWatchlistTableFilters,
  setDefaultWatchlistSavedView,
  watchlistDayPosition,
  watchlistIntradayRangePct,
  watchlistNumericInput,
  watchlistTableActiveFilterCount,
  watchlistTableQuerySnapshotValue,
  watchlistTableMetricValue,
} from './table-model';
import { DEFAULT_WATCHLIST_TABLE_PREFERENCES } from './ui-preferences';

const quote: LiveQuote = {
  source: 'test', ticker: 'AAPL', name: 'Apple', market: 'US', currency: '$',
  price: 105, change: 5, change_pct: 5, open: 101, high: 110, low: 90,
  prev_close: 100, volume: 10, amount: 1_050, amplitude: 20,
  market_cap: 1_000, market_cap_label: '1K', pe_ttm: 20, pb: 5,
  turnover: 1, volume_ratio: 1.2, updated_at: '2026-09-04T12:00:00Z', delayed: false,
};
const row: WatchlistMarketRow = {
  ticker: 'AAPL', name: 'Apple', market: 'US', currency: '$', groupId: 'core',
  group: 'Core', quote, status: 'live',
};

describe('watchlist table model', () => {
  it('normalizes numeric filter inputs', () => {
    expect(watchlistNumericInput('  ')).toBeNull();
    expect(watchlistNumericInput('12.5')).toBe(12.5);
    expect(watchlistNumericInput('invalid')).toBeNull();
  });

  it('resets every filter while preserving table layout preferences', () => {
    const current = {
      ...DEFAULT_WATCHLIST_TABLE_PREFERENCES,
      query: 'apple',
      groupFilter: 'core',
      marketFilter: 'US' as const,
      statusFilter: 'stale' as const,
      decisionFilter: 'researching' as const,
      tagFilter: 'quality',
      historyRange: '5y' as const,
      metricFilter: 'pe' as const,
      metricMin: 10,
      metricMax: 30,
      density: 'comfortable' as const,
      columnWidths: { ticker: 180 },
    };
    const reset = resetWatchlistTableFilters(current);

    expect(watchlistTableActiveFilterCount(current)).toBe(6);
    expect(watchlistTableActiveFilterCount(reset)).toBe(0);
    expect(reset).toMatchObject({
      query: '', groupFilter: 'all', marketFilter: 'all', statusFilter: 'all',
      decisionFilter: 'all', tagFilter: '', historyRange: '1y',
      metricFilter: 'none', metricMin: null, metricMax: null,
      density: 'comfortable', columnWidths: { ticker: 180 },
    });
  });

  it('renames, orders and assigns one default saved view', () => {
    const views = [
      { id: 'one', name: 'One', preferences: DEFAULT_WATCHLIST_TABLE_PREFERENCES },
      { id: 'two', name: 'Two', preferences: DEFAULT_WATCHLIST_TABLE_PREFERENCES },
    ];
    expect(renameWatchlistSavedView(views, 'one', ' Review ' )[0].name).toBe('Review');
    expect(renameWatchlistSavedView(views, 'one', 'Two')).toBe(views);
    expect(moveWatchlistSavedView(views, 'two', -1).map((view) => view.id)).toEqual(['two', 'one']);
    const defaulted = setDefaultWatchlistSavedView(views, 'two');
    expect(defaulted.map((view) => view.isDefault)).toEqual([undefined, true]);
    expect(setDefaultWatchlistSavedView(defaulted, 'two').every((view) => !view.isDefault)).toBe(true);
  });

  it('computes normalized intraday positions and ranges', () => {
    expect(watchlistDayPosition(quote)).toBe(75);
    expect(watchlistIntradayRangePct(quote)).toBe(20);
    expect(watchlistDayPosition({ ...quote, high: 100, low: 100 })).toBeNull();
  });

  it('maps table columns to stable primitive sort values', () => {
    expect(watchlistTableMetricValue(row, 'ticker')).toBe('AAPL');
    expect(watchlistTableMetricValue(row, 'dayRange')).toBe(20);
    expect(watchlistTableMetricValue(row, 'price')).toBe(105);
    expect(watchlistTableMetricValue(row, 'group')).toBe('Core');
  });

  it('uses the persisted server value that established query order', () => {
    const overview = {
      querySnapshot: {
        sortKey: 'price', sortNumber: 101, sortText: null,
        sortAsOf: '2026-09-04T11:59:00Z', metricKey: 'pe', metricNumber: 19,
        metricAsOf: '2026-09-04T11:59:00Z', currency: 'USD',
      },
    } as never;
    expect(watchlistTableQuerySnapshotValue(overview, 'price')).toMatchObject({
      value: 101, role: 'sort', currency: 'USD',
    });
    expect(watchlistTableQuerySnapshotValue(overview, 'pe')).toMatchObject({
      value: 19, role: 'filter',
    });
    expect(watchlistTableQuerySnapshotValue(overview, 'pb')).toBeNull();
  });
});
