import type { KlineRange } from '@/lib/chart/kline';
import type { Market } from '@/lib/supabase/database.types';
import type { QuoteDisplayStatus } from './market-row';

export const WATCHLIST_UI_PREFERENCES_SCHEMA_VERSION = 1;
export const WATCHLIST_UI_PREFERENCES_STORAGE_KEY = 'stock-monitor:watchlist:ui-preferences-v1';
export const WATCHLIST_UI_PREFERENCES_MAX_BYTES = 64 * 1024;
export const WATCHLIST_UI_PREFERENCES_MAX_TICKERS = 100;
export const WATCHLIST_UI_PREFERENCES_MAX_SAVED_VIEWS = 12;

export type WatchlistViewMode = 'kanban' | 'table';
export type WatchlistColumnKey =
  | 'ticker' | 'name' | 'price' | 'change' | 'open' | 'prevClose' | 'dayRange' | 'volume' | 'amount'
  | 'marketCap' | 'pe' | 'pb' | 'turnover' | 'volumeRatio' | 'amplitude'
  | 'dayPosition' | 'oneYearReturn' | 'volatility' | 'maxDrawdown' | 'rangePosition'
  | 'rsi14' | 'macdHistogram' | 'bollingerPosition' | 'atr14'
  | 'research' | 'decision' | 'quality' | 'updated' | 'group';
export type WatchlistTablePreset = 'market' | 'valuation' | 'risk';
export type WatchlistTableDensity = 'compact' | 'comfortable';

export interface WatchlistTablePreferences {
  sortKey: WatchlistColumnKey;
  asc: boolean;
  preset: WatchlistTablePreset;
  visibleColumns: WatchlistColumnKey[];
  query: string;
  groupFilter: string;
  marketFilter: 'all' | Market;
  statusFilter: 'all' | QuoteDisplayStatus;
  density: WatchlistTableDensity;
}

export interface WatchlistSavedTableView {
  id: string;
  name: string;
  preferences: WatchlistTablePreferences;
}

export const WATCHLIST_CHART_TYPES = ['line', 'candle', 'baseline', 'area', 'bar'] as const;
export type WatchlistChartType = typeof WATCHLIST_CHART_TYPES[number];

export interface WatchlistChartPreferences {
  range: KlineRange;
  chartType: WatchlistChartType;
  showTooltip: boolean;
  showVolume: boolean;
  showIndicators: boolean;
  showPreviousClose: boolean;
}

export interface WatchlistUiPreferences {
  schemaVersion: typeof WATCHLIST_UI_PREFERENCES_SCHEMA_VERSION;
  viewMode: WatchlistViewMode;
  table: WatchlistTablePreferences;
  savedViews: WatchlistSavedTableView[];
  benchmarks: Record<string, string>;
  charts: Record<string, WatchlistChartPreferences>;
}

export interface WatchlistUiPreferencesCommand {
  expectedVersion: number;
  preferences: WatchlistUiPreferences;
}

export const WATCHLIST_ALL_COLUMNS: WatchlistColumnKey[] = [
  'ticker', 'name', 'price', 'change', 'open', 'prevClose', 'dayRange', 'volume', 'amount', 'marketCap',
  'pe', 'pb', 'turnover', 'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated', 'group',
  'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram',
  'bollingerPosition', 'atr14', 'research', 'decision',
];

export const WATCHLIST_PRESET_COLUMNS: Record<WatchlistTablePreset, WatchlistColumnKey[]> = {
  market: ['ticker', 'name', 'price', 'change', 'open', 'dayRange', 'volume', 'amount', 'volumeRatio', 'updated', 'group'],
  valuation: ['ticker', 'name', 'price', 'change', 'marketCap', 'pe', 'pb', 'turnover', 'updated', 'group'],
  risk: ['ticker', 'name', 'price', 'change', 'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'research', 'decision', 'updated', 'group'],
};

export const DEFAULT_WATCHLIST_TABLE_PREFERENCES: WatchlistTablePreferences = {
  sortKey: 'change',
  asc: false,
  preset: 'market',
  visibleColumns: [...WATCHLIST_PRESET_COLUMNS.market],
  query: '',
  groupFilter: 'all',
  marketFilter: 'all',
  statusFilter: 'all',
  density: 'comfortable',
};

export const DEFAULT_WATCHLIST_CHART_PREFERENCES: WatchlistChartPreferences = {
  range: '1d',
  chartType: 'candle',
  showTooltip: true,
  showVolume: true,
  showIndicators: true,
  showPreviousClose: true,
};

export const DEFAULT_WATCHLIST_UI_PREFERENCES: WatchlistUiPreferences = {
  schemaVersion: WATCHLIST_UI_PREFERENCES_SCHEMA_VERSION,
  viewMode: 'table',
  table: DEFAULT_WATCHLIST_TABLE_PREFERENCES,
  savedViews: [],
  benchmarks: {},
  charts: {},
};

const KLINE_RANGES = new Set<KlineRange>(['1d', '5d', '1m', '6m', 'ytd', '1y', '5y', 'all']);
const MARKETS = new Set<Market>(['A', 'HK', 'US', 'JP', 'KR', 'TW']);
const QUOTE_STATUSES = new Set<QuoteDisplayStatus>(['loading', 'live', 'delayed', 'stale', 'unavailable']);
const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,19}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function jsonSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function uniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

export function isWatchlistTablePreferences(value: unknown): value is WatchlistTablePreferences {
  const input = record(value) as Partial<WatchlistTablePreferences> | null;
  if (!input) return false;
  return typeof input.sortKey === 'string' && WATCHLIST_ALL_COLUMNS.includes(input.sortKey as WatchlistColumnKey)
    && typeof input.asc === 'boolean'
    && typeof input.preset === 'string' && input.preset in WATCHLIST_PRESET_COLUMNS
    && Array.isArray(input.visibleColumns) && input.visibleColumns.length > 0
    && input.visibleColumns.length <= WATCHLIST_ALL_COLUMNS.length
    && input.visibleColumns.every((column) => typeof column === 'string' && WATCHLIST_ALL_COLUMNS.includes(column as WatchlistColumnKey))
    && uniqueStrings(input.visibleColumns)
    && typeof input.query === 'string' && input.query.length <= 120
    && typeof input.groupFilter === 'string' && input.groupFilter.length <= 100
    && (input.marketFilter === 'all' || MARKETS.has(input.marketFilter as Market))
    && (input.statusFilter === 'all' || QUOTE_STATUSES.has(input.statusFilter as QuoteDisplayStatus))
    && (input.density === 'compact' || input.density === 'comfortable');
}

export function isWatchlistSavedViews(value: unknown): value is WatchlistSavedTableView[] {
  if (!Array.isArray(value) || value.length > WATCHLIST_UI_PREFERENCES_MAX_SAVED_VIEWS) return false;
  const ids: string[] = [];
  const names: string[] = [];
  for (const candidate of value) {
    const item = record(candidate) as unknown as WatchlistSavedTableView | null;
    if (!item || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 100
      || typeof item.name !== 'string' || item.name.trim().length === 0 || item.name.length > 40
      || !isWatchlistTablePreferences(item.preferences)) return false;
    ids.push(item.id);
    names.push(item.name.trim().toLocaleLowerCase());
  }
  return uniqueStrings(ids) && uniqueStrings(names);
}

export function isWatchlistChartPreferences(value: unknown): value is WatchlistChartPreferences {
  const input = record(value) as Partial<WatchlistChartPreferences> | null;
  return !!input
    && typeof input.range === 'string' && KLINE_RANGES.has(input.range as KlineRange)
    && typeof input.chartType === 'string' && (WATCHLIST_CHART_TYPES as readonly string[]).includes(input.chartType)
    && typeof input.showTooltip === 'boolean'
    && typeof input.showVolume === 'boolean'
    && typeof input.showIndicators === 'boolean'
    && typeof input.showPreviousClose === 'boolean';
}

function isTickerMap<T>(value: unknown, validate: (candidate: unknown) => candidate is T): value is Record<string, T> {
  const input = record(value);
  if (!input) return false;
  const entries = Object.entries(input);
  return entries.length <= WATCHLIST_UI_PREFERENCES_MAX_TICKERS
    && entries.every(([ticker, candidate]) => TICKER.test(ticker) && validate(candidate));
}

function isBenchmark(value: unknown): value is string {
  return typeof value === 'string' && TICKER.test(value);
}

export function isWatchlistUiPreferences(value: unknown): value is WatchlistUiPreferences {
  const input = record(value) as Partial<WatchlistUiPreferences> | null;
  return !!input
    && jsonSize(value) <= WATCHLIST_UI_PREFERENCES_MAX_BYTES
    && input.schemaVersion === WATCHLIST_UI_PREFERENCES_SCHEMA_VERSION
    && (input.viewMode === 'table' || input.viewMode === 'kanban')
    && isWatchlistTablePreferences(input.table)
    && isWatchlistSavedViews(input.savedViews)
    && isTickerMap(input.benchmarks, isBenchmark)
    && isTickerMap(input.charts, isWatchlistChartPreferences);
}

export function cloneWatchlistUiPreferences(value: WatchlistUiPreferences): WatchlistUiPreferences {
  return {
    ...value,
    table: { ...value.table, visibleColumns: [...value.table.visibleColumns] },
    savedViews: value.savedViews.map((view) => ({
      ...view,
      preferences: { ...view.preferences, visibleColumns: [...view.preferences.visibleColumns] },
    })),
    benchmarks: { ...value.benchmarks },
    charts: Object.fromEntries(Object.entries(value.charts).map(([ticker, preferences]) => [ticker, { ...preferences }])),
  };
}

export function normalizeWatchlistUiPreferences(value: unknown): WatchlistUiPreferences {
  return isWatchlistUiPreferences(value)
    ? cloneWatchlistUiPreferences(value)
    : cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
}

export function parseWatchlistUiPreferencesCommand(body: unknown): WatchlistUiPreferencesCommand | null {
  const input = record(body);
  if (!input || !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0
    || !isWatchlistUiPreferences(input.preferences)) return null;
  return { expectedVersion: Number(input.expectedVersion), preferences: cloneWatchlistUiPreferences(input.preferences) };
}

function boundedTickerMap<T>(current: Record<string, T>, ticker: string, value: T | null): Record<string, T> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!TICKER.test(normalizedTicker)) return current;
  const next = { ...current };
  delete next[normalizedTicker];
  if (value !== null) next[normalizedTicker] = value;
  const entries = Object.entries(next);
  return entries.length <= WATCHLIST_UI_PREFERENCES_MAX_TICKERS
    ? next
    : Object.fromEntries(entries.slice(entries.length - WATCHLIST_UI_PREFERENCES_MAX_TICKERS));
}

export function withWatchlistViewMode(current: WatchlistUiPreferences, viewMode: WatchlistViewMode): WatchlistUiPreferences {
  return { ...current, viewMode };
}

export function withWatchlistTablePreferences(
  current: WatchlistUiPreferences,
  table: WatchlistTablePreferences,
): WatchlistUiPreferences {
  return isWatchlistTablePreferences(table)
    ? { ...current, table: { ...table, visibleColumns: [...table.visibleColumns] } }
    : current;
}

export function withWatchlistSavedViews(
  current: WatchlistUiPreferences,
  savedViews: WatchlistSavedTableView[],
): WatchlistUiPreferences {
  return isWatchlistSavedViews(savedViews)
    ? { ...current, savedViews: cloneWatchlistUiPreferences({ ...current, savedViews }).savedViews }
    : current;
}

export function withWatchlistBenchmark(
  current: WatchlistUiPreferences,
  ticker: string,
  benchmark: string | null,
): WatchlistUiPreferences {
  const normalized = benchmark?.trim().toUpperCase() || null;
  if (normalized !== null && !TICKER.test(normalized)) return current;
  return { ...current, benchmarks: boundedTickerMap(current.benchmarks, ticker, normalized) };
}

export function withWatchlistChartPreferences(
  current: WatchlistUiPreferences,
  ticker: string,
  chart: WatchlistChartPreferences,
): WatchlistUiPreferences {
  if (!isWatchlistChartPreferences(chart)) return current;
  return { ...current, charts: boundedTickerMap(current.charts, ticker, { ...chart }) };
}

interface StorageReader {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
}

function readJson(storage: StorageReader, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readWatchlistUiPreferencesFromStorage(storage: StorageReader): WatchlistUiPreferences {
  try {
    const stored = readJson(storage, WATCHLIST_UI_PREFERENCES_STORAGE_KEY);
    if (isWatchlistUiPreferences(stored)) return cloneWatchlistUiPreferences(stored);

    let preferences = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    const viewMode = storage.getItem('stock-monitor:watchlist:view');
    if (viewMode === 'table' || viewMode === 'kanban') preferences.viewMode = viewMode;
    const table = readJson(storage, 'stock-monitor:watchlist:table-preferences-v1');
    if (isWatchlistTablePreferences(table)) preferences.table = { ...table, visibleColumns: [...table.visibleColumns] };
    const savedViews = readJson(storage, 'stock-monitor:watchlist:table-views-v1');
    if (isWatchlistSavedViews(savedViews)) preferences.savedViews = savedViews;

    const benchmarkPrefix = 'stock-monitor:watchlist:benchmark-v1:';
    const chartPrefix = 'stock-monitor:chart-preferences-v1:';
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      if (key.startsWith(benchmarkPrefix)) {
        const benchmark = readJson(storage, key);
        if (isBenchmark(benchmark)) preferences = withWatchlistBenchmark(preferences, key.slice(benchmarkPrefix.length), benchmark);
      } else if (key.startsWith(chartPrefix)) {
        const chart = readJson(storage, key);
        if (isWatchlistChartPreferences(chart)) preferences = withWatchlistChartPreferences(preferences, key.slice(chartPrefix.length), chart);
      }
    }
    return preferences;
  } catch {
    return cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
  }
}

export function watchlistUiPreferencesEqual(left: WatchlistUiPreferences, right: WatchlistUiPreferences): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
