import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WATCHLIST_CHART_PREFERENCES,
  DEFAULT_WATCHLIST_UI_PREFERENCES,
  WATCHLIST_UI_PREFERENCES_MAX_SAVED_VIEWS,
  cloneWatchlistUiPreferences,
  isWatchlistChartPreferences,
  isWatchlistSavedViews,
  isWatchlistUiPreferences,
  normalizeWatchlistUiPreferences,
  parseWatchlistUiPreferencesCommand,
  readWatchlistUiPreferencesFromStorage,
  withWatchlistBenchmark,
  withWatchlistChartPreferences,
} from './ui-preferences';

function storage(values: Record<string, string>) {
  const keys = Object.keys(values);
  return {
    length: keys.length,
    getItem: (key: string) => values[key] ?? null,
    key: (index: number) => keys[index] ?? null,
  };
}

describe('watchlist UI preferences', () => {
  it('validates the complete bounded schema', () => {
    const valid = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    expect(isWatchlistUiPreferences(valid)).toBe(true);
    expect(isWatchlistUiPreferences({ ...valid, schemaVersion: 1 })).toBe(false);
    expect(isWatchlistUiPreferences({
      ...valid,
      savedViews: Array.from({ length: WATCHLIST_UI_PREFERENCES_MAX_SAVED_VIEWS + 1 }, (_, index) => ({
        id: String(index), name: String(index), preferences: valid.table,
      })),
    })).toBe(false);
    expect(isWatchlistUiPreferences({ ...valid, benchmarks: { '../secret': 'AAPL' } })).toBe(false);
  });

  it('accepts at most one default saved table view', () => {
    const view = { id: 'one', name: 'One', preferences: DEFAULT_WATCHLIST_UI_PREFERENCES.table, isDefault: true };
    expect(isWatchlistSavedViews([view])).toBe(true);
    expect(isWatchlistSavedViews([view, { ...view, id: 'two', name: 'Two' }])).toBe(false);
  });

  it('validates chart indicator selections without accepting duplicates or unknown values', () => {
    expect(isWatchlistChartPreferences({
      ...DEFAULT_WATCHLIST_CHART_PREFERENCES,
      indicators: ['ma5', 'ma20', 'vwap'],
    })).toBe(true);
    expect(isWatchlistChartPreferences({
      ...DEFAULT_WATCHLIST_CHART_PREFERENCES,
      indicators: ['ma5', 'ma5'],
    })).toBe(false);
    expect(isWatchlistChartPreferences({
      ...DEFAULT_WATCHLIST_CHART_PREFERENCES,
      indicators: ['rsi'],
    })).toBe(false);
  });

  it('clones chart indicator arrays instead of sharing mutable preferences', () => {
    const original = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    original.charts.AAPL = { ...DEFAULT_WATCHLIST_CHART_PREFERENCES, indicators: ['ma5', 'vwap'] };
    const cloned = cloneWatchlistUiPreferences(original);
    expect(cloned.charts.AAPL.indicators).toEqual(['ma5', 'vwap']);
    expect(cloned.charts.AAPL.indicators).not.toBe(original.charts.AAPL.indicators);
  });

  it('requires an optimistic concurrency version on write commands', () => {
    const preferences = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    expect(parseWatchlistUiPreferencesCommand({ expectedVersion: 3, preferences })).toEqual({ expectedVersion: 3, preferences });
    expect(parseWatchlistUiPreferencesCommand({ expectedVersion: -1, preferences })).toBeNull();
    expect(parseWatchlistUiPreferencesCommand({ preferences })).toBeNull();
  });

  it('migrates the legacy local keys into one snapshot', () => {
    const legacyTable = { ...DEFAULT_WATCHLIST_UI_PREFERENCES.table, density: 'compact' as const };
    const migrated = readWatchlistUiPreferencesFromStorage(storage({
      'stock-monitor:watchlist:view': 'kanban',
      'stock-monitor:watchlist:table-preferences-v1': JSON.stringify(legacyTable),
      'stock-monitor:watchlist:benchmark-v1:AAPL': JSON.stringify('QQQ'),
      'stock-monitor:chart-preferences-v1:AAPL': JSON.stringify({
        ...DEFAULT_WATCHLIST_CHART_PREFERENCES, chartType: 'line',
      }),
    }));
    expect(migrated.viewMode).toBe('kanban');
    expect(migrated.table.density).toBe('compact');
    expect(migrated.benchmarks.AAPL).toBe('QQQ');
    expect(migrated.charts.AAPL.chartType).toBe('line');
  });

  it('upgrades a v1 unified snapshot without losing table choices', () => {
    const current = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    const legacyTable = Object.fromEntries(Object.entries(current.table).filter(([key]) => ![
      'decisionFilter', 'tagFilter', 'historyRange', 'metricFilter', 'metricMin', 'metricMax', 'columnWidths', 'pinnedColumns',
    ].includes(key)));
    const migrated = readWatchlistUiPreferencesFromStorage(storage({
      'stock-monitor:watchlist:ui-preferences-v1': JSON.stringify({
        ...current,
        schemaVersion: 1,
        viewMode: 'kanban',
        table: { ...legacyTable, density: 'compact' },
        savedViews: [],
      }),
    }));
    expect(migrated).toMatchObject({
      schemaVersion: 4,
      viewMode: 'kanban',
      table: { density: 'compact', decisionFilter: 'all', metricFilter: 'none', pinnedColumns: ['ticker', 'name'] },
    });
  });

  it('migrates the misleading one-year column name in current and saved views', () => {
    const current = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    const migrated = normalizeWatchlistUiPreferences({
      ...current,
      schemaVersion: 3,
      table: {
        ...current.table,
        sortKey: 'oneYearReturn',
        visibleColumns: ['ticker', 'name', 'oneYearReturn'],
        pinnedColumns: ['ticker'],
        columnWidths: { oneYearReturn: 176 },
      },
      savedViews: [{
        id: 'legacy',
        name: 'Legacy return',
        preferences: {
          ...current.table,
          sortKey: 'oneYearReturn',
          visibleColumns: ['ticker', 'name', 'oneYearReturn'],
          pinnedColumns: ['ticker'],
          columnWidths: {},
        },
      }],
    });
    expect(migrated.table).toMatchObject({
      sortKey: 'periodReturn',
      visibleColumns: ['ticker', 'name', 'periodReturn'],
      columnWidths: { periodReturn: 176 },
    });
    expect(migrated.savedViews[0].preferences.sortKey).toBe('periodReturn');
  });

  it('salvages valid fields when one v2 preference field is corrupt', () => {
    const current = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    const normalized = normalizeWatchlistUiPreferences({
      ...current,
      table: {
        ...current.table,
        density: 'compact',
        query: 'AAPL',
        columnWidths: { ticker: 180, name: 9999 },
        pinnedColumns: ['ticker', 'ticker', 'missing'],
      },
      benchmarks: { AAPL: 'QQQ', '../bad': 'SPY' },
      charts: { AAPL: DEFAULT_WATCHLIST_CHART_PREFERENCES, BAD: { chartType: 'unknown' } },
    });
    expect(normalized.table).toMatchObject({ density: 'compact', query: 'AAPL', columnWidths: { ticker: 180 }, pinnedColumns: ['ticker'] });
    expect(normalized.benchmarks).toEqual({ AAPL: 'QQQ' });
    expect(normalized.charts).toEqual({ AAPL: DEFAULT_WATCHLIST_CHART_PREFERENCES });
  });

  it('migrates legacy saved views individually and drops only invalid duplicates', () => {
    const current = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    const legacyTable = Object.fromEntries(Object.entries(current.table).filter(([key]) => ![
      'decisionFilter', 'tagFilter', 'historyRange', 'metricFilter', 'metricMin', 'metricMax', 'columnWidths', 'pinnedColumns',
    ].includes(key)));
    const migrated = normalizeWatchlistUiPreferences({
      ...current,
      schemaVersion: 1,
      savedViews: [
        { id: 'one', name: ' Review ', preferences: { ...legacyTable, density: 'compact' } },
        { id: 'two', name: 'review', preferences: legacyTable },
        { id: '', name: 'Broken', preferences: legacyTable },
      ],
    });
    expect(migrated.savedViews).toHaveLength(1);
    expect(migrated.savedViews[0]).toMatchObject({ id: 'one', name: 'Review', preferences: { density: 'compact', metricFilter: 'none' } });
  });

  it('falls back to a valid v1 snapshot when the v2 storage entry is unusable', () => {
    const current = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    const migrated = readWatchlistUiPreferencesFromStorage(storage({
      'stock-monitor:watchlist:ui-preferences-v2': JSON.stringify({ schemaVersion: 99 }),
      'stock-monitor:watchlist:ui-preferences-v1': JSON.stringify({ ...current, schemaVersion: 1, viewMode: 'kanban' }),
    }));
    expect(migrated.viewMode).toBe('kanban');
  });

  it('normalizes ticker keys and removes default benchmarks', () => {
    let preferences = withWatchlistBenchmark(DEFAULT_WATCHLIST_UI_PREFERENCES, ' aapl ', ' qqq ');
    preferences = withWatchlistChartPreferences(preferences, ' aapl ', DEFAULT_WATCHLIST_CHART_PREFERENCES);
    expect(preferences.benchmarks).toEqual({ AAPL: 'QQQ' });
    expect(preferences.charts.AAPL).toEqual(DEFAULT_WATCHLIST_CHART_PREFERENCES);
    expect(withWatchlistBenchmark(preferences, 'AAPL', null).benchmarks).toEqual({});
  });

  it('falls back when browser storage is unavailable', () => {
    expect(readWatchlistUiPreferencesFromStorage({
      get length(): number { throw new Error('blocked'); },
      getItem() { throw new Error('blocked'); },
      key() { throw new Error('blocked'); },
    })).toEqual(DEFAULT_WATCHLIST_UI_PREFERENCES);
  });
});
