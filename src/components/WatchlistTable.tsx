'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Bookmark, BookmarkPlus, Columns3, Filter, LoaderCircle, Minus, MoveRight, PanelRightOpen, Pin, PinOff, Plus, RotateCcw, Rows3, Search, Tag, Trash2, X } from 'lucide-react';
import { formatChange, formatPct, formatPrice, formatVolume, changeClass } from '@/lib/utils';
import type { Market } from '@/lib/supabase/database.types';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { MarketLabel } from '@/components/MarketLabel';
import {
  buildWatchlistMarketRows,
  type QuoteDisplayStatus,
  type WatchlistMarketGroup,
  type WatchlistSecurityIdentity,
  type WatchlistMarketRow,
} from '@/lib/watchlist/market-row';
import { WatchlistMobileList } from '@/components/watchlist/WatchlistMobileList';
import { WatchlistSparkline } from '@/components/watchlist/WatchlistSparkline';
import { WatchlistMarketSummary } from '@/components/watchlist/WatchlistMarketSummary';
import type { WatchlistOverviewRow as WatchlistOverviewClientRow } from '@/lib/watchlist/overview-contract';
import { summarizeWatchlistMarketRows } from '@/lib/watchlist/summary';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { useDismissableLayer } from '@/lib/hooks/useDismissableLayer';
import { calculateWatchlistDataQuality } from '@/lib/watchlist/data-quality';
import { useVirtualRows } from '@/lib/hooks/useVirtualRows';
import {
  DEFAULT_WATCHLIST_TABLE_PREFERENCES,
  WATCHLIST_ALL_COLUMNS,
  WATCHLIST_METRIC_FILTERS,
  WATCHLIST_PRESET_COLUMNS,
  isWatchlistSavedViews,
  isWatchlistTablePreferences,
  type WatchlistColumnKey as ColumnKey,
  type WatchlistMetricFilterKey,
  type WatchlistSavedTableView as SavedTableView,
  type WatchlistTablePreferences as TablePreferences,
  type WatchlistTablePreset as PresetKey,
} from '@/lib/watchlist/ui-preferences';
import { watchlistOverviewServerSort } from '@/lib/watchlist/overview-query';
import { marketPhase } from '@/lib/today/clock';

type ColumnGroupKey = 'identity' | 'market' | 'valuation' | 'technical' | 'research';
const ALL_COLUMNS = WATCHLIST_ALL_COLUMNS;

const COLUMN_GROUPS: Array<{ key: ColumnGroupKey; columns: ColumnKey[] }> = [
  { key: 'identity', columns: ['ticker', 'name', 'group'] },
  { key: 'market', columns: ['price', 'change', 'open', 'prevClose', 'dayRange', 'volume', 'amount', 'turnover', 'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated'] },
  { key: 'valuation', columns: ['marketCap', 'pe', 'pb'] },
  { key: 'technical', columns: ['oneYearReturn', 'excessReturn', 'volatility', 'beta', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'volumeZScore20'] },
  { key: 'research', columns: ['research', 'decision'] },
];

const PRESET_COLUMNS = WATCHLIST_PRESET_COLUMNS;

const NUMERIC_COLUMNS = new Set<ColumnKey>([
  'price', 'change', 'open', 'prevClose', 'volume', 'amount', 'marketCap', 'pe', 'pb', 'turnover',
  'volumeRatio', 'amplitude', 'dayPosition', 'quality', 'updated',
  'oneYearReturn', 'excessReturn', 'volatility', 'beta', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'volumeZScore20',
]);

const ANALYTICS_COLUMNS = new Set<ColumnKey>([
  'oneYearReturn', 'excessReturn', 'volatility', 'beta', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'volumeZScore20', 'research', 'decision',
]);

const DEFAULT_COLUMN_WIDTHS: Partial<Record<ColumnKey, number>> = {
  ticker: 132, name: 190, price: 112, change: 104, oneYearReturn: 168,
  excessReturn: 132, volatility: 118, beta: 92, volumeZScore20: 124,
  maxDrawdown: 112, research: 128, decision: 124, updated: 132,
};

function numericInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalNumber(value: number | null | undefined, suffix = '') {
  return value == null || !Number.isFinite(value)
    ? <span className="text-text-muted">--</span>
    : <span className="tabular-nums">{value.toFixed(2)}{suffix}</span>;
}

function dayPosition(quote: LiveQuote | null): number | null {
  if (!quote || quote.high <= quote.low || quote.price <= 0) return null;
  return Math.min(100, Math.max(0, ((quote.price - quote.low) / (quote.high - quote.low)) * 100));
}

function intradayRangePct(quote: LiveQuote | null): number | null {
  if (!quote || !Number.isFinite(quote.high) || !Number.isFinite(quote.low) || quote.high < quote.low) return null;
  const baseline = Number.isFinite(quote.prev_close) && quote.prev_close > 0 ? quote.prev_close : quote.price;
  return baseline > 0 ? ((quote.high - quote.low) / baseline) * 100 : null;
}

function QuoteStatus({ row }: { row: WatchlistMarketRow }) {
  const t = useTranslations('market.table');
  const quote = row.quote;
  if (row.status === 'loading') return <span className="text-text-muted">{t('status.loading')}</span>;
  if (row.status === 'unavailable') return <span className="text-status-bad">{t('status.unavailable')}</span>;

  const source = quote?.source || t('status.unknownSource');
  const updated = quote?.updated_at ? new Date(quote.updated_at).toLocaleString() : t('status.unknownTime');
  const delayed = row.status === 'delayed';
  const stale = row.status === 'stale';
  const phase = marketPhase(row.market, new Date());
  const lastClose = delayed && (phase.phase === 'closed' || phase.phase === 'weekend' || phase.phase === 'pre');
  const statusTone = stale || (delayed && !lastClose)
    ? 'border-warn/25 bg-warn/10 text-warn'
    : lastClose ? 'border-status-info/25 bg-status-info/10 text-status-info'
      : 'border-status-good/25 bg-status-good/10 text-status-good';
  const dotTone = stale || (delayed && !lastClose) ? 'bg-warn' : lastClose ? 'bg-status-info' : 'bg-status-good';
  return (
    <div title={`${source} · ${updated}`}>
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
        {stale ? t('status.stale') : lastClose ? t('status.lastClose') : delayed ? t('status.delayed') : t('status.live')}
      </div>
      <div className="mt-1 max-w-[118px] truncate text-[11px] text-text-muted">{source}</div>
    </div>
  );
}

function metricValue(row: WatchlistMarketRow, key: ColumnKey, overview?: WatchlistOverviewClientRow): string | number | null {
  const quote = row.quote;
  switch (key) {
    case 'ticker': return row.ticker;
    case 'name': return row.name;
    case 'price': return quote?.price ?? null;
    case 'change': return quote?.change_pct ?? null;
    case 'open': return quote?.open ?? null;
    case 'prevClose': return quote?.prev_close ?? null;
    // The cell renders a high/low pair. Sort by the normalized range width so
    // the order remains meaningful across different price levels.
    case 'dayRange': return intradayRangePct(quote);
    case 'volume': return quote?.volume ?? null;
    case 'amount': return quote?.amount ?? null;
    case 'marketCap': return quote?.market_cap ?? null;
    case 'pe': return quote?.pe_ttm ?? null;
    case 'pb': return quote?.pb ?? null;
    case 'turnover': return quote?.turnover ?? null;
    case 'volumeRatio': return quote?.volume_ratio ?? null;
    case 'amplitude': return quote?.amplitude ?? null;
    case 'dayPosition': return dayPosition(quote);
    case 'oneYearReturn': return overview?.history?.value?.periodReturnPct ?? null;
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
    case 'research': return overview?.research.value?.recentNewsCount ?? null;
    case 'decision': return overview?.item.status ?? '';
    case 'quality': return calculateWatchlistDataQuality(quote, row.status, overview?.history).score;
    case 'updated': return quote?.updated_at ? Date.parse(quote.updated_at) : null;
    case 'group': return row.group;
  }
}

export function WatchlistTable({
  groups,
  quotes,
  identities,
  overviewByTicker = {},
  loadedAt,
  loading = false,
  onSelectTicker,
  onMoveTickers,
  onRemoveTickers,
  onTagTickers,
  overviewHasMore = false,
  overviewLoading = false,
  overviewLoadingMore = false,
  overviewQueryPending = false,
  overviewQueryActive = false,
  onLoadMoreOverview,
  tablePreferences,
  savedTableViews,
  onTablePreferencesChange,
  onSavedTableViewsChange,
  onAddSecurity,
}: {
  groups: WatchlistMarketGroup[];
  quotes: Record<string, LiveQuote | null>;
  identities: Record<string, WatchlistSecurityIdentity>;
  overviewByTicker?: Record<string, WatchlistOverviewClientRow>;
  loadedAt: number | null;
  loading?: boolean;
  onSelectTicker?: (ticker: string) => void;
  onMoveTickers?: (tickers: string[], groupId: string) => void;
  onRemoveTickers?: (tickers: string[]) => void;
  onTagTickers?: (tickers: string[], tag: string, mode: 'add' | 'remove') => Promise<boolean>;
  overviewHasMore?: boolean;
  overviewLoading?: boolean;
  overviewLoadingMore?: boolean;
  overviewQueryPending?: boolean;
  overviewQueryActive?: boolean;
  onLoadMoreOverview?: () => Promise<void>;
  tablePreferences?: TablePreferences;
  savedTableViews?: SavedTableView[];
  onTablePreferencesChange?: Dispatch<SetStateAction<TablePreferences>>;
  onSavedTableViewsChange?: Dispatch<SetStateAction<SavedTableView[]>>;
  onAddSecurity?: () => void;
}) {
  const t = useTranslations('market.table');
  const [localPreferences, setLocalPreferences] = usePersistentState(
    'stock-monitor:watchlist:table-preferences-v1',
    DEFAULT_WATCHLIST_TABLE_PREFERENCES,
    isWatchlistTablePreferences,
  );
  const [localSavedViews, setLocalSavedViews] = usePersistentState<SavedTableView[]>(
    'stock-monitor:watchlist:table-views-v1',
    [],
    isWatchlistSavedViews,
  );
  const preferences = tablePreferences ?? localPreferences;
  const savedViews = savedTableViews ?? localSavedViews;
  const setPreferences = useCallback<Dispatch<SetStateAction<TablePreferences>>>((next) => {
    if (tablePreferences !== undefined && onTablePreferencesChange) onTablePreferencesChange(next);
    else setLocalPreferences(next);
  }, [onTablePreferencesChange, setLocalPreferences, tablePreferences]);
  const setSavedViews = useCallback<Dispatch<SetStateAction<SavedTableView[]>>>((next) => {
    if (savedTableViews !== undefined && onSavedTableViewsChange) onSavedTableViewsChange(next);
    else setLocalSavedViews(next);
  }, [onSavedTableViewsChange, savedTableViews, setLocalSavedViews]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchGroupId, setBatchGroupId] = useState(groups[0]?.id ?? '');
  const [batchTag, setBatchTag] = useState('');
  const [tagSaving, setTagSaving] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const viewsRef = useRef<HTMLDivElement>(null);
  useDismissableLayer(columnsRef, columnsOpen, () => setColumnsOpen(false), { focusOnOpen: true, restoreFocus: true });
  useDismissableLayer(filtersRef, filtersOpen, () => setFiltersOpen(false), { focusOnOpen: true, restoreFocus: true });
  useDismissableLayer(viewsRef, viewsOpen, () => setViewsOpen(false), { focusOnOpen: true, restoreFocus: true });
  const { sortKey, asc, preset, visibleColumns, query, groupFilter, marketFilter, statusFilter, decisionFilter, tagFilter, historyRange, metricFilter, metricMin, metricMax, density, pinnedColumns } = preferences;
  const [draftWidths, setDraftWidths] = useState<Partial<Record<ColumnKey, number>>>({});

  const rows = useMemo(
    () => buildWatchlistMarketRows(groups, quotes, identities, loadedAt),
    [groups, quotes, identities, loadedAt],
  );

  useEffect(() => {
    const available = new Set(rows.map((row) => row.ticker));
    setSelected((current) => new Set([...current].filter((ticker) => available.has(ticker))));
    if (!groups.some((group) => group.id === batchGroupId)) setBatchGroupId(groups[0]?.id ?? '');
  }, [batchGroupId, groups, rows]);

  useEffect(() => {
    if (preferences.groupFilter === 'all' || groups.some((group) => group.id === preferences.groupFilter)) return;
    const legacyMatches = groups.filter((group) => group.name === preferences.groupFilter);
    setPreferences((current) => ({
      ...current,
      groupFilter: legacyMatches.length === 1 ? legacyMatches[0].id : 'all',
    }));
  }, [groups, preferences.groupFilter, setPreferences]);

  useEffect(() => {
    if (!overviewQueryActive || watchlistOverviewServerSort(preferences.sortKey)) return;
    setPreferences((current) => ({ ...current, sortKey: 'ticker', asc: true }));
  }, [overviewQueryActive, preferences.sortKey, setPreferences]);

  const queryRows = useMemo(
    () => {
      if (!overviewQueryActive) return rows;
      const rowByTicker = new Map(rows.map((row) => [row.ticker, row]));
      return Object.keys(overviewByTicker).flatMap((ticker) => {
        const row = rowByTicker.get(ticker);
        return row ? [row] : [];
      });
    },
    [overviewByTicker, overviewQueryActive, rows],
  );

  const filtered = useMemo(() => {
    if (overviewQueryActive) return queryRows;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return queryRows.filter((row) => {
      if (normalizedQuery && !`${row.ticker} ${row.name}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      if (groupFilter !== 'all' && row.groupId !== groupFilter && row.group !== groupFilter) return false;
      if (marketFilter !== 'all' && row.market !== marketFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      const overview = overviewByTicker[row.ticker];
      if (decisionFilter !== 'all' && overview?.item.status !== decisionFilter) return false;
      if (tagFilter.trim() && !overview?.item.tags.some((tag) => tag.toLocaleLowerCase() === tagFilter.trim().toLocaleLowerCase())) return false;
      if (metricFilter !== 'none') {
        const metric = metricValue(row, metricFilter, overview);
        if (typeof metric !== 'number' || (metricMin != null && metric < metricMin) || (metricMax != null && metric > metricMax)) return false;
      }
      return true;
    });
  }, [decisionFilter, groupFilter, marketFilter, metricFilter, metricMax, metricMin, overviewByTicker, overviewQueryActive, query, queryRows, statusFilter, tagFilter]);

  const sorted = useMemo(() => overviewQueryActive ? filtered : [...filtered].sort((left, right) => {
    const a = metricValue(left, sortKey, overviewByTicker[left.ticker]);
    const b = metricValue(right, sortKey, overviewByTicker[right.ticker]);
    const aMissing = a == null || a === '';
    const bMissing = b == null || b === '';
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return 0;
      return aMissing ? 1 : -1;
    }
    const result = typeof a === 'string' && typeof b === 'string'
      ? a.localeCompare(b)
      : Number(a) - Number(b);
    return asc ? result : -result;
  }), [asc, filtered, overviewByTicker, overviewQueryActive, sortKey]);

  const summary = summarizeWatchlistMarketRows(filtered);
  const rowHeight = density === 'compact' ? 44 : 52;
  const virtualRows = useVirtualRows({
    count: sorted.length,
    rowHeight,
    enabled: sorted.length > 80,
    resetKey: `${sortKey}:${asc}:${query}:${groupFilter}:${marketFilter}:${statusFilter}:${decisionFilter}:${tagFilter}:${metricFilter}:${metricMin}:${metricMax}:${density}`,
  });
  const handleDesktopScroll = useCallback(() => {
    virtualRows.onScroll();
    const element = virtualRows.containerRef.current;
    if (!element || !overviewHasMore || overviewLoadingMore || !onLoadMoreOverview) return;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= rowHeight * 8) void onLoadMoreOverview();
  }, [onLoadMoreOverview, overviewHasMore, overviewLoadingMore, rowHeight, virtualRows]);
  const visibleDesktopRows = sorted.slice(virtualRows.start, virtualRows.end);
  const tableColumnCount = visibleColumns.length + 1 + (onSelectTicker ? 1 : 0);
  const allVisibleSelected = sorted.length > 0 && sorted.every((row) => selected.has(row.ticker));
  const toggleSelection = (ticker: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
    return next;
  });
  const clearSelection = () => setSelected(new Set());
  const updateTags = async (mode: 'add' | 'remove') => {
    const tag = batchTag.trim();
    if (!tag || !onTagTickers) return;
    setTagSaving(true);
    const updated = await onTagTickers([...selected], tag, mode);
    setTagSaving(false);
    if (updated) {
      setBatchTag('');
      clearSelection();
    }
  };

  const applyPreset = (next: PresetKey) => {
    setPreferences((current) => ({ ...current, preset: next, visibleColumns: PRESET_COLUMNS[next] }));
  };

  const saveCurrentView = () => {
    const name = viewName.trim().slice(0, 40);
    if (!name) return;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
    setSavedViews((current) => [{ id, name, preferences: { ...preferences, visibleColumns: [...preferences.visibleColumns] } }, ...current.filter((view) => view.name !== name)].slice(0, 12));
    setViewName('');
  };

  const loadSavedView = (view: SavedTableView) => {
    setPreferences({ ...view.preferences, visibleColumns: [...view.preferences.visibleColumns] });
    setViewsOpen(false);
  };

  const toggleColumn = (column: ColumnKey) => {
    if ((column === 'ticker' || column === 'name') && visibleColumns.includes(column)) return;
    const next = visibleColumns.includes(column)
      ? visibleColumns.filter((item) => item !== column)
      : ALL_COLUMNS.filter((item) => visibleColumns.includes(item) || item === column);
    setPreferences((current) => ({ ...current, visibleColumns: next, pinnedColumns: current.pinnedColumns.filter((item) => next.includes(item)) }));
  };

  const columnWidth = useCallback((column: ColumnKey) => draftWidths[column] ?? preferences.columnWidths[column] ?? DEFAULT_COLUMN_WIDTHS[column] ?? 104, [draftWidths, preferences.columnWidths]);
  const pinnedVisibleColumns = visibleColumns.filter((column) => pinnedColumns.includes(column));
  const stickyLeft = (column: ColumnKey) => {
    const index = pinnedVisibleColumns.indexOf(column);
    if (index < 0) return undefined;
    return 40 + pinnedVisibleColumns.slice(0, index).reduce((sum, item) => sum + columnWidth(item), 0);
  };
  const togglePinned = (column: ColumnKey) => {
    setPreferences((current) => {
      if (column === 'ticker') return current;
      const pinned: ColumnKey[] = current.pinnedColumns.includes(column)
        ? current.pinnedColumns.filter((item) => item !== column)
        : [...current.pinnedColumns, column].slice(-3);
      const nextPinned: ColumnKey[] = pinned.includes('ticker') ? pinned : (['ticker', ...pinned] as ColumnKey[]).slice(0, 3);
      return { ...current, pinnedColumns: nextPinned };
    });
  };
  const startResize = (column: ColumnKey, event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidth(column);
    let nextWidth = startWidth;
    const move = (moveEvent: PointerEvent) => {
      nextWidth = Math.min(480, Math.max(72, startWidth + moveEvent.clientX - startX));
      setDraftWidths((current) => ({ ...current, [column]: nextWidth }));
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      setPreferences((current) => ({ ...current, columnWidths: { ...current.columnWidths, [column]: Math.round(nextWidth) } }));
      setDraftWidths((current) => { const next = { ...current }; delete next[column]; return next; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  };
  const adjustColumnWidth = (column: ColumnKey, delta: number) => {
    setPreferences((current) => ({
      ...current,
      columnWidths: {
        ...current.columnWidths,
        [column]: Math.min(480, Math.max(72, columnWidth(column) + delta)),
      },
    }));
  };

  const activeFilterCount = [groupFilter !== 'all', marketFilter !== 'all', statusFilter !== 'all', decisionFilter !== 'all', !!tagFilter.trim(), metricFilter !== 'none'].filter(Boolean).length;
  const resetFilters = () => setPreferences((current) => ({
    ...current, query: '', groupFilter: 'all', marketFilter: 'all', statusFilter: 'all',
    decisionFilter: 'all', tagFilter: '', historyRange: '1y', metricFilter: 'none', metricMin: null, metricMax: null,
  }));

  const moveColumn = (column: ColumnKey, offset: -1 | 1) => {
    const index = visibleColumns.indexOf(column);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= visibleColumns.length) return;
    const next = [...visibleColumns];
    [next[index], next[target]] = [next[target], next[index]];
    setPreferences((current) => ({ ...current, visibleColumns: next }));
  };

  const sort = (key: ColumnKey) => {
    if (overviewHasMore && ANALYTICS_COLUMNS.has(key) && !overviewQueryActive) return;
    setPreferences((current) => sortKey === key
      ? { ...current, asc: !current.asc }
      : { ...current, sortKey: key, asc: key === 'ticker' || key === 'name' || key === 'group' });
  };

  const cell = (row: WatchlistMarketRow, key: ColumnKey) => {
    const quote = row.quote;
    const overview = overviewByTicker[row.ticker];
    const hasQuote = !!quote && quote.price > 0;
    switch (key) {
      case 'ticker': return <div className="flex items-center gap-2"><Link onClick={(event) => event.stopPropagation()} href={`/stock/${encodeURIComponent(row.ticker)}` as never} className="font-mono text-xs font-bold text-accent hover:no-underline">{row.ticker}</Link><span className="rounded border border-border bg-bg-elevated px-1 py-0.5 text-[11px] text-text-muted"><MarketLabel m={row.market} /></span></div>;
      case 'name': return <span className="block max-w-[190px] truncate font-medium text-text">{row.name}</span>;
      case 'price': return hasQuote ? <span className="font-semibold tabular-nums text-text">{formatPrice(quote.price, row.currency)}</span> : <span className="text-text-muted">--</span>;
      case 'change': return hasQuote ? <div className={`tabular-nums ${changeClass(quote.change_pct)}`}><div>{formatPct(quote.change_pct)}</div><div className="text-[11px] opacity-75">{formatChange(quote.change)}</div></div> : <span className="text-text-muted">--</span>;
      case 'open': return hasQuote ? <span className="tabular-nums">{formatPrice(quote.open, row.currency)}</span> : <span className="text-text-muted">--</span>;
      case 'prevClose': return hasQuote ? <span className="tabular-nums">{formatPrice(quote.prev_close, row.currency)}</span> : <span className="text-text-muted">--</span>;
      case 'dayRange': return hasQuote ? <><div className="tabular-nums">{formatPrice(quote.high, row.currency)}</div><div className="text-[11px] text-text-dim">{formatPrice(quote.low, row.currency)}</div></> : <span className="text-text-muted">--</span>;
      case 'volume': return hasQuote && Number.isFinite(quote.volume) ? formatVolume(quote.volume) : <span className="text-text-muted">--</span>;
      case 'amount': return hasQuote && Number.isFinite(quote.amount) ? formatVolume(quote.amount) : <span className="text-text-muted">--</span>;
      case 'marketCap': return quote?.market_cap_label && quote.market_cap_label !== '—' ? quote.market_cap_label : <span className="text-text-muted">--</span>;
      case 'pe': return optionalNumber(quote?.pe_ttm);
      case 'pb': return optionalNumber(quote?.pb);
      case 'turnover': return optionalNumber(quote?.turnover, '%');
      case 'volumeRatio': return optionalNumber(quote?.volume_ratio, 'x');
      case 'amplitude': return optionalNumber(quote?.amplitude, '%');
      case 'dayPosition': {
        const position = dayPosition(quote);
        return position == null ? <span className="text-text-muted">--</span> : (
          <div className="ml-auto w-24" title={t('dayPositionTitle', { value: position.toFixed(0) })}>
            <div className="h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${position}%` }} /></div>
            <div className="mt-1 text-[11px] text-text-dim">{position.toFixed(0)}%</div>
          </div>
        );
      }
      case 'oneYearReturn': {
        const value = overview?.history?.value?.periodReturnPct;
        const sparkline = overview?.history?.value?.sparkline;
        if (value == null && (!sparkline || sparkline.length < 2)) return <span className="text-text-muted">--</span>;
        return <div className="flex items-center justify-end gap-2"><WatchlistSparkline values={sparkline} label={t('mobile.sparkline', { ticker: row.ticker })} className="shrink-0 opacity-85" /><span className={value == null ? 'text-text-muted' : changeClass(value)}>{value == null ? '--' : `${value.toFixed(2)}%`}</span></div>;
      }
      case 'volatility': return optionalNumber(overview?.history?.value?.annualizedVolatilityPct, '%');
      case 'maxDrawdown': {
        const value = overview?.history?.value?.maxDrawdownPct;
        return value == null ? <span className="text-text-muted">--</span> : <span className="text-warn">{value.toFixed(2)}%</span>;
      }
      case 'rangePosition': {
        const value = overview?.history?.value?.rangePositionPct;
        return value == null ? <span className="text-text-muted">--</span> : (
          <div className="ml-auto w-24"><div className="h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${value}%` }} /></div><div className="mt-1 text-[11px] text-text-dim">{value.toFixed(0)}%</div></div>
        );
      }
      case 'rsi14': return optionalNumber(overview?.history?.value?.rsi14);
      case 'macdHistogram': {
        const value = overview?.history?.value?.macdHistogram;
        return value == null ? <span className="text-text-muted">--</span> : <span className={changeClass(value)}>{value.toFixed(2)}</span>;
      }
      case 'bollingerPosition': {
        const value = overview?.history?.value?.bollingerPositionPct;
        return value == null ? <span className="text-text-muted">--</span> : (
          <div className="ml-auto w-24"><div className="h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${value}%` }} /></div><div className="mt-1 text-[11px] text-text-dim">{value.toFixed(0)}%</div></div>
        );
      }
      case 'atr14': return optionalNumber(overview?.history?.value?.atr14Pct, '%');
      case 'excessReturn': {
        const value = overview?.history?.value?.excessReturnPct;
        return value == null ? <span className="text-text-muted">--</span> : <span className={changeClass(value)}>{value > 0 ? '+' : ''}{value.toFixed(2)}%</span>;
      }
      case 'beta': return optionalNumber(overview?.history?.value?.beta);
      case 'volumeZScore20': {
        const value = overview?.history?.value?.volumeZScore20;
        return value == null ? <span className="text-text-muted">--</span> : <span className={Math.abs(value) >= 2 ? 'font-semibold text-warn' : 'text-text'}>{value > 0 ? '+' : ''}{value.toFixed(2)}σ</span>;
      }
      case 'research': {
        const research = overview?.research.value;
        if (!research) return <span className="text-text-muted">--</span>;
        return <div className="flex items-center justify-end gap-1.5"><span className="font-mono text-xs">{research.recentNewsCount}</span>{research.perspectiveDivergence && <span className="rounded border border-warn/30 bg-warn/10 px-1 py-0.5 text-[11px] text-warn">{t('researchDivergence')}</span>}</div>;
      }
      case 'decision': return overview?.item.status
        ? <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-dim">{t(`decisionStatuses.${overview.item.status}`)}</span>
        : <span className="text-text-muted">--</span>;
      case 'quality': {
        const quality = calculateWatchlistDataQuality(quote, row.status, overview?.history);
        return <span title={t('qualityTitle', { completeness: quality.completenessPct, freshness: quality.freshnessPct, analytics: quality.analyticsPct ?? '--' })} className={quality.score >= 75 ? 'text-status-good' : quality.score >= 45 ? 'text-warn' : 'text-text-muted'}>{quality.score}%</span>;
      }
      case 'updated': return <QuoteStatus row={row} />;
      case 'group': return <span className="inline-flex max-w-[150px] truncate rounded-full border border-border bg-bg-elevated px-2 py-0.5 text-[11px] text-text-dim">{row.group}</span>;
    }
  };

  if (rows.length === 0) return <div className="card-base text-center text-sm text-text-dim">{t('empty')}</div>;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-card shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_10px_30px_rgba(0,0,0,0.18)]" data-density="data">
      <WatchlistMarketSummary summary={summary} />

      <div className="flex flex-col gap-2 border-b border-border bg-bg-elevated/70 px-3 py-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex w-fit shrink-0 overflow-hidden rounded-md border border-border bg-bg p-0.5 text-xs" role="group" aria-label={t('presetAriaLabel')}>
            {(['market', 'valuation', 'risk'] as PresetKey[]).map((item) => (
              <button key={item} type="button" onClick={() => applyPreset(item)} aria-pressed={preset === item}
                className={`rounded px-3 py-1.5 transition ${preset === item ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-dim hover:text-text'}`}>
                {t(`presets.${item}`)}
              </button>
            ))}
          </div>
          <div className="relative w-full min-w-0 sm:w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input value={query} onChange={(event) => setPreferences((current) => ({ ...current, query: event.target.value }))} placeholder={t('filters.search')} aria-label={t('filters.search')} className="w-full bg-bg py-1.5 pl-7 pr-2.5 text-xs" />
          </div>
          {onAddSecurity && <button type="button" onClick={onAddSecurity} className="inline-flex h-8 w-fit shrink-0 self-start items-center gap-1.5 rounded bg-accent-dim px-3 text-xs font-semibold text-white shadow-sm hover:brightness-110 sm:self-auto"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{t('addSecurity')}</button>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 pb-0.5 sm:flex-nowrap sm:overflow-x-auto xl:ml-auto xl:overflow-visible xl:pb-0">
          <select value={groupFilter} onChange={(event) => setPreferences((current) => ({ ...current, groupFilter: event.target.value }))} aria-label={t('filters.group')} className="hidden px-2 py-1.5 text-xs sm:block">
            <option value="all">{t('filters.allGroups')}</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <select value={marketFilter} onChange={(event) => setPreferences((current) => ({ ...current, marketFilter: event.target.value as 'all' | Market }))} aria-label={t('filters.market')} className="hidden px-2 py-1.5 text-xs sm:block">
            <option value="all">{t('filters.allMarkets')}</option>
            {Array.from(new Set(rows.map((row) => row.market))).map((market) => <option key={market} value={market}>{market}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setPreferences((current) => ({ ...current, statusFilter: event.target.value as 'all' | QuoteDisplayStatus }))} aria-label={t('filters.status')} className="hidden px-2 py-1.5 text-xs sm:block">
            <option value="all">{t('filters.allStatuses')}</option>
            {(['live', 'delayed', 'stale', 'unavailable'] as QuoteDisplayStatus[]).map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
          </select>
          <div ref={filtersRef} className="relative shrink-0">
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className={`inline-flex h-8 items-center gap-1.5 rounded border border-border bg-bg-card px-2 text-xs text-text-dim sm:w-8 sm:justify-center sm:px-0 ${activeFilterCount > 0 ? 'border-accent/40 text-accent' : ''}`} title={t('filters.advanced')} aria-label={t('filters.advanced')}>
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sm:hidden">{t('filters.advanced')}</span>
              {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent px-1 text-[11px] font-bold leading-4 text-white">{activeFilterCount}</span>}
            </button>
            {filtersOpen && <div data-dismissable-layer-content role="dialog" aria-label={t('filters.advanced')} className="fixed inset-x-3 bottom-[72px] z-50 max-h-[72vh] overflow-y-auto rounded-md border border-border bg-bg-elevated p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:z-30 sm:mt-1 sm:w-[min(92vw,360px)] sm:shadow-xl">
              <div className="mb-3 flex items-center justify-between gap-3"><div className="text-xs font-semibold text-text">{t('filters.advanced')}</div><div className="flex items-center gap-2"><button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text"><RotateCcw className="h-3 w-3" aria-hidden="true" />{t('filters.reset')}</button><button data-dismissable-layer-autofocus type="button" onClick={() => setFiltersOpen(false)} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" aria-label={t('filters.close')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:hidden"><span className="mb-1 block text-[11px] text-text-muted">{t('filters.group')}</span><select value={groupFilter} onChange={(event) => setPreferences((current) => ({ ...current, groupFilter: event.target.value }))} className="h-9 w-full text-xs"><option value="all">{t('filters.allGroups')}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                <label className="sm:hidden"><span className="mb-1 block text-[11px] text-text-muted">{t('filters.market')}</span><select value={marketFilter} onChange={(event) => setPreferences((current) => ({ ...current, marketFilter: event.target.value as 'all' | Market }))} className="h-9 w-full text-xs"><option value="all">{t('filters.allMarkets')}</option>{Array.from(new Set(rows.map((row) => row.market))).map((market) => <option key={market} value={market}>{market}</option>)}</select></label>
                <label className="sm:hidden"><span className="mb-1 block text-[11px] text-text-muted">{t('filters.status')}</span><select value={statusFilter} onChange={(event) => setPreferences((current) => ({ ...current, statusFilter: event.target.value as 'all' | QuoteDisplayStatus }))} className="h-9 w-full text-xs"><option value="all">{t('filters.allStatuses')}</option>{(['live', 'delayed', 'stale', 'unavailable'] as QuoteDisplayStatus[]).map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select></label>
                <label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.decision')}</span><select value={decisionFilter} onChange={(event) => setPreferences((current) => ({ ...current, decisionFilter: event.target.value as TablePreferences['decisionFilter'] }))} className="h-9 w-full text-xs"><option value="all">{t('filters.allDecisions')}</option>{(['inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated'] as const).map((status) => <option key={status} value={status}>{t(`decisionStatuses.${status}`)}</option>)}</select></label>
                <label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.tag')}</span><input value={tagFilter} maxLength={32} onChange={(event) => setPreferences((current) => ({ ...current, tagFilter: event.target.value }))} placeholder={t('filters.tagPlaceholder')} className="h-9 w-full text-xs" /></label>
                <label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.metric')}</span><select value={metricFilter} onChange={(event) => { const value = event.target.value as 'none' | WatchlistMetricFilterKey; setPreferences((current) => ({ ...current, metricFilter: value, metricMin: value === 'none' ? null : current.metricMin, metricMax: value === 'none' ? null : current.metricMax })); }} className="h-9 w-full text-xs"><option value="none">{t('filters.noMetric')}</option>{WATCHLIST_METRIC_FILTERS.map((metric) => <option key={metric} value={metric}>{t(`headers.${metric}`)}</option>)}</select></label>
                <label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.historyRange')}</span><select value={historyRange} onChange={(event) => setPreferences((current) => ({ ...current, historyRange: event.target.value as TablePreferences['historyRange'] }))} disabled={metricFilter === 'none'} className="h-9 w-full text-xs disabled:opacity-50">{(['1m', '6m', 'ytd', '1y', '5y', 'all'] as const).map((range) => <option key={range} value={range}>{t(`filters.ranges.${range}`)}</option>)}</select></label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3"><label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.minimum')}</span><input type="number" step="any" value={metricMin ?? ''} onChange={(event) => { const value = numericInput(event.target.value); setPreferences((current) => ({ ...current, metricMin: value, metricMax: value != null && current.metricMax != null && value > current.metricMax ? null : current.metricMax })); }} disabled={metricFilter === 'none'} className="h-9 w-full text-xs disabled:opacity-50" /></label><label><span className="mb-1 block text-[11px] text-text-muted">{t('filters.maximum')}</span><input type="number" step="any" value={metricMax ?? ''} onChange={(event) => { const value = numericInput(event.target.value); setPreferences((current) => ({ ...current, metricMax: value, metricMin: value != null && current.metricMin != null && value < current.metricMin ? null : current.metricMin })); }} disabled={metricFilter === 'none'} className="h-9 w-full text-xs disabled:opacity-50" /></label></div>
            </div>}
          </div>
          <div ref={viewsRef} className="relative shrink-0">
            <button type="button" onClick={() => setViewsOpen((open) => !open)} aria-expanded={viewsOpen} className="icon-button !h-8 !w-8 !basis-8" title={t('views.action')} aria-label={t('views.action')}>
              <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {viewsOpen && <div data-dismissable-layer-content role="dialog" aria-label={t('views.action')} className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-bg-elevated p-2 shadow-xl">
              <form className="flex items-center gap-1.5" onSubmit={(event) => { event.preventDefault(); saveCurrentView(); }}>
                <input data-dismissable-layer-autofocus value={viewName} maxLength={40} onChange={(event) => setViewName(event.target.value)} placeholder={t('views.namePlaceholder')} aria-label={t('views.namePlaceholder')} className="h-8 min-w-0 flex-1 px-2 text-xs" />
                <button type="submit" disabled={!viewName.trim()} className="icon-button !h-8 !w-8 !basis-8" title={t('views.save')} aria-label={t('views.save')}><BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </form>
              <div className="mt-2 border-t border-border pt-1">
                {savedViews.length === 0 ? <div className="px-1 py-2 text-[11px] text-text-muted">{t('views.empty')}</div> : savedViews.map((view) => <div key={view.id} className="flex items-center gap-1 rounded px-1 py-1 hover:bg-bg-card"><button type="button" onClick={() => loadSavedView(view)} className="min-w-0 flex-1 truncate text-left text-xs text-text-dim hover:text-text">{view.name}</button><button type="button" onClick={() => setSavedViews((current) => current.filter((item) => item.id !== view.id))} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" title={t('views.delete')} aria-label={t('views.delete')}><Trash2 className="h-3 w-3" aria-hidden="true" /></button></div>)}
              </div>
            </div>}
          </div>
          <button type="button" onClick={() => setPreferences((current) => ({ ...current, density: current.density === 'compact' ? 'comfortable' : 'compact' }))} className="icon-button !h-8 !w-8 !basis-8" title={t(`density.${density}`)} aria-label={t(`density.${density}`)}><Rows3 className="h-3.5 w-3.5" aria-hidden="true" /></button>
          <div ref={columnsRef} className="relative ml-auto shrink-0">
            <button type="button" onClick={() => setColumnsOpen((open) => !open)} aria-expanded={columnsOpen} className="icon-button !h-8 !w-8 !basis-8" title={t('columns.action')} aria-label={t('columns.action')}>
              <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {columnsOpen && (
              <div data-dismissable-layer-content role="dialog" aria-label={t('columns.action')} className="absolute right-0 top-full z-30 mt-1 max-h-[min(70vh,640px)] w-72 overflow-y-auto rounded-md border border-border bg-bg-elevated p-2 shadow-xl">
                {COLUMN_GROUPS.map((group, groupIndex) => (
                  <div key={group.key} className={groupIndex === 0 ? '' : 'mt-2 border-t border-border pt-2'}>
                    <div className="px-2 pb-1 text-[11px] font-semibold text-text-muted">{t(`columns.groups.${group.key}`)}</div>
                    {group.columns.map((column) => (
                      <div key={column} className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-bg-card">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-1"><input type="checkbox" checked={visibleColumns.includes(column)} disabled={(column === 'ticker' || column === 'name') && visibleColumns.includes(column)} onChange={() => toggleColumn(column)} /><span className="truncate">{t(`headers.${column}`)}</span></label>
                        {visibleColumns.includes(column) && <><button type="button" onClick={() => togglePinned(column)} disabled={column === 'ticker' || (!pinnedColumns.includes(column) && pinnedColumns.length >= 3)} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t(pinnedColumns.includes(column) ? 'columns.unpin' : 'columns.pin', { label: t(`headers.${column}`) })}>{pinnedColumns.includes(column) ? <PinOff className="h-3 w-3" aria-hidden="true" /> : <Pin className="h-3 w-3" aria-hidden="true" />}</button><button type="button" onClick={() => moveColumn(column, -1)} disabled={visibleColumns[0] === column} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t('columns.moveUp', { label: t(`headers.${column}`) })}><ArrowUp className="h-3 w-3" aria-hidden="true" /></button><button type="button" onClick={() => moveColumn(column, 1)} disabled={visibleColumns.at(-1) === column} className="icon-button !h-6 !w-6 !basis-6 border-transparent bg-transparent" aria-label={t('columns.moveDown', { label: t(`headers.${column}`) })}><ArrowDown className="h-3 w-3" aria-hidden="true" /></button></>}
                      </div>
                    ))}
                  </div>
                ))}
                <button type="button" onClick={() => setPreferences((current) => ({ ...current, columnWidths: {}, pinnedColumns: ['ticker', 'name'].filter((column) => current.visibleColumns.includes(column as ColumnKey)) as ColumnKey[] }))} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded border border-border text-[11px] text-text-muted hover:text-text"><RotateCcw className="h-3 w-3" aria-hidden="true" />{t('columns.resetLayout')}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="border-b border-border px-3 py-1.5 text-[11px] text-text-dim" role="status">{t('loadingQuotes')}</div>}
      {overviewHasMore && !overviewQueryActive && <div className="border-b border-warn/20 bg-warn/5 px-3 py-1.5 text-[11px] text-warn" role="status">{t('overview.sortBlocked')}</div>}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-accent/20 bg-accent/5 px-3 py-2">
          <span className="mr-auto text-xs font-semibold text-text">{t('selection.count', { count: selected.size })}</span>
          <div className="flex min-w-[190px] items-center gap-1">
            <Tag className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
            <input value={batchTag} maxLength={32} onChange={(event) => setBatchTag(event.target.value)} placeholder={t('selection.tagPlaceholder')} aria-label={t('selection.tagPlaceholder')} className="h-8 min-w-0 flex-1 py-1 text-xs" />
            <button type="button" disabled={!batchTag.trim() || tagSaving || !onTagTickers} onClick={() => void updateTags('add')} className="icon-button !h-8 !w-8 !basis-8" title={t('selection.addTag')} aria-label={t('selection.addTag')}><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
            <button type="button" disabled={!batchTag.trim() || tagSaving || !onTagTickers} onClick={() => void updateTags('remove')} className="icon-button !h-8 !w-8 !basis-8" title={t('selection.removeTag')} aria-label={t('selection.removeTag')}><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
          <select value={batchGroupId} onChange={(event) => setBatchGroupId(event.target.value)} aria-label={t('selection.targetGroup')} className="h-8 py-1 text-xs">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          <button type="button" disabled={!batchGroupId || !onMoveTickers} onClick={() => { onMoveTickers?.([...selected], batchGroupId); clearSelection(); }} className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-bg-elevated px-2.5 text-xs text-text disabled:opacity-50"><MoveRight className="h-3.5 w-3.5" aria-hidden="true" />{t('selection.move')}</button>
          <button type="button" disabled={!onRemoveTickers} onClick={() => { onRemoveTickers?.([...selected]); clearSelection(); }} className="inline-flex h-8 items-center gap-1.5 rounded border border-status-bad/30 px-2.5 text-xs text-status-bad disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{t('selection.remove')}</button>
          <button type="button" onClick={clearSelection} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={t('selection.clear')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </div>
      )}
      {overviewQueryActive && (overviewQueryPending || (overviewLoading && Object.keys(overviewByTicker).length === 0)) ? (
        <div className="space-y-px bg-border/60" role="status" aria-label={t('overview.loading')}>
          {[0, 1, 2, 3, 4].map((row) => <div key={row} className="h-14 animate-pulse bg-bg-card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-10 text-center"><p className="text-sm text-text-dim">{t('filters.noResults')}</p><button type="button" onClick={resetFilters} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded border border-border px-3 text-xs text-text-dim hover:text-text"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{t('filters.reset')}</button></div>
      ) : (
        <>
        <WatchlistMobileList rows={sorted} overviewByTicker={overviewByTicker} onSelect={onSelectTicker} selected={selected} onToggle={toggleSelection} />
        <div ref={virtualRows.containerRef} onScroll={handleDesktopScroll} className="hidden max-h-[calc(100dvh-18rem)] min-h-0 overflow-auto sm:block">
          <table aria-label={t('ariaLabel')} aria-rowcount={sorted.length + 1} className="w-full min-w-max text-sm">
            <caption className="sr-only">{t('caption')}</caption>
            <thead>
              <tr className="border-b border-border bg-bg-elevated/95 text-[11px] text-text-dim">
                <th className="sticky left-0 top-0 z-30 w-10 bg-bg-elevated px-2 py-2.5"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((current) => { const next = new Set(current); if (allVisibleSelected) sorted.forEach((row) => next.delete(row.ticker)); else sorted.forEach((row) => next.add(row.ticker)); return next; })} aria-label={t('selection.all')} /></th>
                {visibleColumns.map((column) => (
                  <th key={column} style={{ width: columnWidth(column), minWidth: columnWidth(column), ...(stickyLeft(column) != null ? { left: stickyLeft(column) } : {}) }} className={`group/header sticky top-0 whitespace-nowrap bg-bg-elevated px-3 py-2.5 font-semibold ${stickyLeft(column) != null ? 'z-20' : 'z-10'} ${NUMERIC_COLUMNS.has(column) ? 'text-right' : 'text-left'}`} aria-sort={sortKey === column ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => sort(column)} disabled={overviewHasMore && ANALYTICS_COLUMNS.has(column) && !overviewQueryActive} className="hover:text-text disabled:cursor-not-allowed disabled:opacity-50" aria-label={t('sortAriaLabel', { label: t(`headers.${column}`) })}>
                      {t(`headers.${column}`)}{sortKey === column ? (asc ? ' ▲' : ' ▼') : ''}
                    </button>
                    <span role="separator" tabIndex={0} aria-orientation="vertical" aria-valuemin={72} aria-valuemax={480} aria-valuenow={columnWidth(column)} aria-label={t('columns.resize', { label: t(`headers.${column}`) })} onPointerDown={(event) => startResize(column, event)} onKeyDown={(event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); adjustColumnWidth(column, (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 24 : 8)); }} className="absolute inset-y-1 right-0 w-1 cursor-col-resize touch-none rounded bg-transparent hover:bg-accent/60 focus-visible:w-1.5 focus-visible:bg-accent group-hover/header:bg-border-active" />
                  </th>
                ))}
                {onSelectTicker && <th className="sticky right-0 top-0 z-30 hidden w-16 bg-bg-elevated px-3 py-2.5 text-right font-semibold shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.9)] xl:table-cell">{t('quickView')}</th>}
              </tr>
            </thead>
            <tbody>
              {virtualRows.paddingTop > 0 && <tr aria-hidden="true"><td colSpan={tableColumnCount} style={{ height: virtualRows.paddingTop, padding: 0 }} /></tr>}
              {visibleDesktopRows.map((row, index) => (
                <tr key={row.ticker} data-watchlist-row aria-rowindex={virtualRows.start + index + 2} tabIndex={onSelectTicker ? 0 : undefined} style={{ height: rowHeight }} onClick={() => onSelectTicker?.(row.ticker)} onKeyDown={(event) => {
                  if (event.key === 'Enter') onSelectTicker?.(row.ticker);
                  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const siblings = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[data-watchlist-row]') ?? [])];
                  const current = siblings.indexOf(event.currentTarget);
                  const target = event.key === 'Home' ? 0 : event.key === 'End' ? siblings.length - 1 : current + (event.key === 'ArrowDown' ? 1 : -1);
                  siblings[Math.min(siblings.length - 1, Math.max(0, target))]?.focus();
                }}
                  className={`group border-b border-border/40 last:border-0 hover:bg-bg-hover hover:shadow-[inset_2px_0_0_var(--accent)] ${onSelectTicker ? 'cursor-pointer focus:bg-bg-hover focus:outline-none focus:shadow-[inset_2px_0_0_var(--accent)]' : ''}`}>
                  <td className="sticky left-0 z-10 w-10 bg-bg-card px-2 text-center group-hover:bg-bg-hover"><input type="checkbox" checked={selected.has(row.ticker)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelection(row.ticker)} aria-label={t('selection.toggle', { ticker: row.ticker })} /></td>
                  {visibleColumns.map((column) => (
                    <td key={column} style={{ width: columnWidth(column), minWidth: columnWidth(column), maxWidth: columnWidth(column), ...(stickyLeft(column) != null ? { left: stickyLeft(column) } : {}) }} className={`whitespace-nowrap overflow-hidden px-3 ${density === 'compact' ? 'py-1' : 'py-2'} transition-colors ${stickyLeft(column) != null ? 'sticky z-[5] bg-bg-card group-hover:bg-bg-hover' : ''} ${NUMERIC_COLUMNS.has(column) ? 'text-right tabular-nums' : ''}`}>{cell(row, column)}</td>
                  ))}
                  {onSelectTicker && <td className="sticky right-0 z-10 hidden bg-bg-card px-3 py-3 text-right shadow-[-8px_0_12px_-10px_rgba(0,0,0,0.9)] group-hover:bg-bg-hover xl:table-cell"><button type="button" onClick={(event) => { event.stopPropagation(); onSelectTicker(row.ticker); }} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent" title={t('quickViewAction')} aria-label={t('quickViewAction')}><PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" /></button></td>}
                </tr>
              ))}
              {virtualRows.paddingBottom > 0 && <tr aria-hidden="true"><td colSpan={tableColumnCount} style={{ height: virtualRows.paddingBottom, padding: 0 }} /></tr>}
            </tbody>
          </table>
        </div>
        </>
      )}
      {overviewHasMore && (
        <div className="flex justify-center border-t border-border bg-bg-elevated/50 px-3 py-2">
          <button type="button" disabled={overviewLoadingMore} onClick={() => void onLoadMoreOverview?.()} className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-bg-card px-3 text-xs text-text-dim disabled:opacity-50">
            {overviewLoadingMore && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{t(overviewLoadingMore ? 'overview.loadingMore' : 'overview.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
