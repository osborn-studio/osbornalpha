import type { KlineRange } from '@/lib/chart/kline';
import type { Market, WatchlistItem } from '@/lib/supabase/database.types';
import type { QuoteDisplayStatus } from './market-row';
import {
  WATCHLIST_OVERVIEW_METRICS,
  type WatchlistOverviewMetric,
} from './overview-fields';

export const WATCHLIST_UI_PREFERENCES_SCHEMA_VERSION = 2;
export const WATCHLIST_UI_PREFERENCES_STORAGE_KEY = 'stock-monitor:watchlist:ui-preferences-v2';
export const WATCHLIST_UI_PREFERENCES_MAX_BYTES = 64 * 1024;
export const WATCHLIST_UI_PREFERENCES_MAX_TICKERS = 100;
export const WATCHLIST_UI_PREFERENCES_MAX_SAVED_VIEWS = 12;

export type WatchlistViewMode = 'kanban' | 'table';
export type WatchlistColumnKey =
  | 'ticker' | 'name' | 'price' | 'change' | 'open' | 'prevClose' | 'dayRange' | 'volume' | 'amount'
  | 'marketCap' | 'pe' | 'pb' | 'turnover' | 'volumeRatio' | 'amplitude'
  | 'dayPosition' | 'oneYearReturn' | 'volatility' | 'maxDrawdown' | 'rangePosition'
  | 'rsi14' | 'macdHistogram' | 'bollingerPosition' | 'atr14'
  | 'excessReturn' | 'beta' | 'volumeZScore20'
  | 'research' | 'decision' | 'quality' | 'updated' | 'group';
export type WatchlistTablePreset = 'market' | 'valuation' | 'risk';
export type WatchlistTableDensity = 'compact' | 'comfortable';
export type WatchlistMetricFilterKey = WatchlistOverviewMetric;

export interface WatchlistTablePreferences {
  sortKey: WatchlistColumnKey;
  asc: boolean;
  preset: WatchlistTablePreset;
  visibleColumns: WatchlistColumnKey[];
  query: string;
  groupFilter: string;
  marketFilter: 'all' | Market;
  statusFilter: 'all' | QuoteDisplayStatus;
  decisionFilter: 'all' | WatchlistItem['status'];
  tagFilter: string;
  historyRange: Extract<KlineRange, '1m' | '6m' | 'ytd' | '1y' | '5y' | 'all'>;
  metricFilter: 'none' | WatchlistMetricFilterKey;
  metricMin: number | null;
  metricMax: number | null;
  density: WatchlistTableDensity;
  columnWidths: Partial<Record<WatchlistColumnKey, number>>;
  pinnedColumns: WatchlistColumnKey[];
}

export interface WatchlistSavedTableView {
  id: string;
  name: string;
  preferences: WatchlistTablePreferences;
}

export const WATCHLIST_CHART_TYPES = ['line', 'candle', 'baseline', 'area', 'bar'] as const;
export type WatchlistChartType = typeof WATCHLIST_CHART_TYPES[number];
export const WATCHLIST_CHART_INDICATORS = ['ma5', 'ma20', 'vwap'] as const;
export type WatchlistChartIndicator = typeof WATCHLIST_CHART_INDICATORS[number];

export interface WatchlistChartPreferences {
  range: KlineRange;
  chartType: WatchlistChartType;
  showTooltip: boolean;
  showVolume: boolean;
  showIndicators: boolean;
  indicators?: WatchlistChartIndicator[];
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
  'bollingerPosition', 'atr14', 'excessReturn', 'beta', 'volumeZScore20', 'research', 'decision',
];

export const WATCHLIST_PRESET_COLUMNS: Record<WatchlistTablePreset, WatchlistColumnKey[]> = {
  market: ['ticker', 'name', 'price', 'change', 'oneYearReturn', 'research', 'decision', 'updated'],
  valuation: ['ticker', 'name', 'price', 'change', 'marketCap', 'pe', 'pb', 'turnover', 'updated', 'group'],
  risk: ['ticker', 'name', 'price', 'change', 'oneYearReturn', 'excessReturn', 'volatility', 'beta', 'maxDrawdown', 'rangePosition', 'rsi14', 'volumeZScore20', 'research', 'decision', 'updated', 'group'],
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
  decisionFilter: 'all',
  tagFilter: '',
  historyRange: '1y',
  metricFilter: 'none',
  metricMin: null,
  metricMax: null,
  density: 'compact',
  columnWidths: {},
  pinnedColumns: ['ticker', 'name'],
};

export const DEFAULT_WATCHLIST_CHART_PREFERENCES: WatchlistChartPreferences = {
  range: '1d',
  chartType: 'candle',
  showTooltip: true,
  showVolume: true,
  showIndicators: true,
  indicators: [...WATCHLIST_CHART_INDICATORS],
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
const DECISION_STATUSES = new Set<WatchlistItem['status']>(['inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated']);
const HISTORY_RANGES = new Set(['1m', '6m', 'ytd', '1y', '5y', 'all']);
export const WATCHLIST_METRIC_FILTERS: readonly WatchlistMetricFilterKey[] = WATCHLIST_OVERVIEW_METRICS;
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
    && (input.decisionFilter === 'all' || DECISION_STATUSES.has(input.decisionFilter as WatchlistItem['status']))
    && typeof input.tagFilter === 'string' && input.tagFilter.length <= 32
    && typeof input.historyRange === 'string' && HISTORY_RANGES.has(input.historyRange)
    && (input.metricFilter === 'none' || WATCHLIST_METRIC_FILTERS.includes(input.metricFilter as WatchlistMetricFilterKey))
    && (input.metricMin === null || (typeof input.metricMin === 'number' && Number.isFinite(input.metricMin)))
    && (input.metricMax === null || (typeof input.metricMax === 'number' && Number.isFinite(input.metricMax)))
    && (input.metricMin === null || input.metricMax === null || input.metricMin <= input.metricMax)
    && (input.density === 'compact' || input.density === 'comfortable')
    && isColumnWidths(input.columnWidths)
    && Array.isArray(input.pinnedColumns) && input.pinnedColumns.length <= 3
    && input.pinnedColumns.every((column) => typeof column === 'string' && input.visibleColumns!.includes(column as WatchlistColumnKey))
    && uniqueStrings(input.pinnedColumns as string[]);
}

function isColumnWidths(value: unknown): value is Partial<Record<WatchlistColumnKey, number>> {
  const input = record(value);
  return !!input && Object.entries(input).every(([column, width]) =>
    WATCHLIST_ALL_COLUMNS.includes(column as WatchlistColumnKey)
    && typeof width === 'number' && Number.isFinite(width) && width >= 72 && width <= 480);
}

function normalizeTablePreferences(value: unknown): WatchlistTablePreferences {
  const input = record(value);
  const defaults = DEFAULT_WATCHLIST_TABLE_PREFERENCES;
  if (!input) return { ...defaults, visibleColumns: [...defaults.visibleColumns], columnWidths: {}, pinnedColumns: [...defaults.pinnedColumns] };

  const preset = typeof input.preset === 'string' && input.preset in WATCHLIST_PRESET_COLUMNS
    ? input.preset as WatchlistTablePreset
    : defaults.preset;
  const candidateColumns = Array.isArray(input.visibleColumns)
    ? input.visibleColumns.filter((column): column is WatchlistColumnKey => typeof column === 'string' && WATCHLIST_ALL_COLUMNS.includes(column as WatchlistColumnKey))
    : [];
  const visibleColumns = [...new Set(candidateColumns)];
  const resolvedColumns = visibleColumns.length > 0 ? visibleColumns : [...WATCHLIST_PRESET_COLUMNS[preset]];
  const metricFilter = typeof input.metricFilter === 'string' && (input.metricFilter === 'none' || WATCHLIST_METRIC_FILTERS.includes(input.metricFilter as WatchlistMetricFilterKey))
    ? input.metricFilter as WatchlistTablePreferences['metricFilter']
    : 'none';
  let metricMin = typeof input.metricMin === 'number' && Number.isFinite(input.metricMin) ? input.metricMin : null;
  let metricMax = typeof input.metricMax === 'number' && Number.isFinite(input.metricMax) ? input.metricMax : null;
  if (metricFilter === 'none' || (metricMin !== null && metricMax !== null && metricMin > metricMax)) {
    metricMin = null;
    metricMax = null;
  }
  const widths = record(input.columnWidths);
  const columnWidths = Object.fromEntries(Object.entries(widths ?? {}).filter(([column, width]) =>
    resolvedColumns.includes(column as WatchlistColumnKey)
    && WATCHLIST_ALL_COLUMNS.includes(column as WatchlistColumnKey)
    && typeof width === 'number' && Number.isFinite(width) && width >= 72 && width <= 480,
  )) as Partial<Record<WatchlistColumnKey, number>>;
  const candidatePinned = Array.isArray(input.pinnedColumns)
    ? input.pinnedColumns.filter((column): column is WatchlistColumnKey => typeof column === 'string' && resolvedColumns.includes(column as WatchlistColumnKey))
    : defaults.pinnedColumns.filter((column) => resolvedColumns.includes(column));
  const pinnedColumns = [...new Set(candidatePinned)].slice(0, 3);

  return {
    sortKey: typeof input.sortKey === 'string' && WATCHLIST_ALL_COLUMNS.includes(input.sortKey as WatchlistColumnKey)
      ? input.sortKey as WatchlistColumnKey : defaults.sortKey,
    asc: typeof input.asc === 'boolean' ? input.asc : defaults.asc,
    preset,
    visibleColumns: resolvedColumns,
    query: typeof input.query === 'string' && input.query.length <= 120 ? input.query : '',
    groupFilter: typeof input.groupFilter === 'string' && input.groupFilter.length <= 100 ? input.groupFilter : 'all',
    marketFilter: input.marketFilter === 'all' || MARKETS.has(input.marketFilter as Market)
      ? input.marketFilter as WatchlistTablePreferences['marketFilter'] : 'all',
    statusFilter: input.statusFilter === 'all' || QUOTE_STATUSES.has(input.statusFilter as QuoteDisplayStatus)
      ? input.statusFilter as WatchlistTablePreferences['statusFilter'] : 'all',
    decisionFilter: input.decisionFilter === 'all' || DECISION_STATUSES.has(input.decisionFilter as WatchlistItem['status'])
      ? input.decisionFilter as WatchlistTablePreferences['decisionFilter'] : 'all',
    tagFilter: typeof input.tagFilter === 'string' && input.tagFilter.length <= 32 ? input.tagFilter : '',
    historyRange: typeof input.historyRange === 'string' && HISTORY_RANGES.has(input.historyRange)
      ? input.historyRange as WatchlistTablePreferences['historyRange'] : '1y',
    metricFilter,
    metricMin,
    metricMax,
    density: input.density === 'compact' || input.density === 'comfortable' ? input.density : defaults.density,
    columnWidths,
    pinnedColumns,
  };
}

function normalizeSavedViews(value: unknown): WatchlistSavedTableView[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const normalized: WatchlistSavedTableView[] = [];
  for (const candidate of value) {
    const saved = record(candidate);
    const id = typeof saved?.id === 'string' ? saved.id : '';
    const name = typeof saved?.name === 'string' ? saved.name.trim() : '';
    const normalizedName = name.toLocaleLowerCase();
    if (!id || id.length > 100 || !name || name.length > 40 || ids.has(id) || names.has(normalizedName)) continue;
    ids.add(id);
    names.add(normalizedName);
    normalized.push({ id, name, preferences: normalizeTablePreferences(saved?.preferences) });
    if (normalized.length >= WATCHLIST_UI_PREFERENCES_MAX_SAVED_VIEWS) break;
  }
  return normalized;
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
    && (input.indicators === undefined || (
      Array.isArray(input.indicators)
      && new Set(input.indicators).size === input.indicators.length
      && input.indicators.every((indicator) => (WATCHLIST_CHART_INDICATORS as readonly unknown[]).includes(indicator))
    ))
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

function normalizeTickerMap<T>(value: unknown, validate: (candidate: unknown) => candidate is T): Record<string, T> {
  const input = record(value);
  if (!input) return {};
  const entries: Array<[string, T]> = [];
  for (const [ticker, candidate] of Object.entries(input)) {
    if (TICKER.test(ticker) && validate(candidate)) entries.push([ticker, candidate]);
  }
  return Object.fromEntries(entries.slice(-WATCHLIST_UI_PREFERENCES_MAX_TICKERS));
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
    table: { ...value.table, visibleColumns: [...value.table.visibleColumns], columnWidths: { ...value.table.columnWidths }, pinnedColumns: [...value.table.pinnedColumns] },
    savedViews: value.savedViews.map((view) => ({
      ...view,
      preferences: { ...view.preferences, visibleColumns: [...view.preferences.visibleColumns], columnWidths: { ...view.preferences.columnWidths }, pinnedColumns: [...view.preferences.pinnedColumns] },
    })),
    benchmarks: { ...value.benchmarks },
    charts: Object.fromEntries(Object.entries(value.charts).map(([ticker, preferences]) => [ticker, {
      ...preferences,
      ...(preferences.indicators ? { indicators: [...preferences.indicators] } : {}),
    }])),
  };
}

export function normalizeWatchlistUiPreferences(value: unknown): WatchlistUiPreferences {
  if (isWatchlistUiPreferences(value)) return cloneWatchlistUiPreferences(value);
  const input = record(value);
  if (!input || (input.schemaVersion !== 1 && input.schemaVersion !== WATCHLIST_UI_PREFERENCES_SCHEMA_VERSION)) {
    return cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
  }
  const migrated: WatchlistUiPreferences = {
    schemaVersion: WATCHLIST_UI_PREFERENCES_SCHEMA_VERSION,
    viewMode: input.viewMode === 'kanban' ? 'kanban' : 'table',
    table: normalizeTablePreferences(input.table),
    savedViews: normalizeSavedViews(input.savedViews),
    benchmarks: normalizeTickerMap(input.benchmarks, isBenchmark),
    charts: normalizeTickerMap(input.charts, isWatchlistChartPreferences),
  };
  return isWatchlistUiPreferences(migrated) ? cloneWatchlistUiPreferences(migrated) : cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
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
    ? { ...current, table: { ...table, visibleColumns: [...table.visibleColumns], columnWidths: { ...table.columnWidths }, pinnedColumns: [...table.pinnedColumns] } }
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
  return { ...current, charts: boundedTickerMap(current.charts, ticker, {
    ...chart,
    ...(chart.indicators ? { indicators: [...chart.indicators] } : {}),
  }) };
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
    const current = readJson(storage, WATCHLIST_UI_PREFERENCES_STORAGE_KEY);
    const currentRecord = record(current);
    if (currentRecord && currentRecord.schemaVersion === WATCHLIST_UI_PREFERENCES_SCHEMA_VERSION) {
      return normalizeWatchlistUiPreferences(current);
    }
    const unifiedV1 = readJson(storage, 'stock-monitor:watchlist:ui-preferences-v1');
    const unifiedV1Record = record(unifiedV1);
    if (unifiedV1Record && unifiedV1Record.schemaVersion === 1) return normalizeWatchlistUiPreferences(unifiedV1);

    let preferences = cloneWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES);
    const viewMode = storage.getItem('stock-monitor:watchlist:view');
    if (viewMode === 'table' || viewMode === 'kanban') preferences.viewMode = viewMode;
    const table = readJson(storage, 'stock-monitor:watchlist:table-preferences-v1');
    if (table) preferences.table = normalizeTablePreferences(table);
    const savedViews = readJson(storage, 'stock-monitor:watchlist:table-views-v1');
    preferences.savedViews = normalizeSavedViews(savedViews);

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
