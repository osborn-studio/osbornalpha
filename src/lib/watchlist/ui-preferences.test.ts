import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WATCHLIST_CHART_PREFERENCES,
  DEFAULT_WATCHLIST_UI_PREFERENCES,
  WATCHLIST_UI_PREFERENCES_MAX_SAVED_VIEWS,
  cloneWatchlistUiPreferences,
  isWatchlistUiPreferences,
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
    expect(isWatchlistUiPreferences({ ...valid, schemaVersion: 2 })).toBe(false);
    expect(isWatchlistUiPreferences({
      ...valid,
      savedViews: Array.from({ length: WATCHLIST_UI_PREFERENCES_MAX_SAVED_VIEWS + 1 }, (_, index) => ({
        id: String(index), name: String(index), preferences: valid.table,
      })),
    })).toBe(false);
    expect(isWatchlistUiPreferences({ ...valid, benchmarks: { '../secret': 'AAPL' } })).toBe(false);
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
