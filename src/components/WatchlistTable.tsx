'use client';

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import {
  buildWatchlistMarketRows,
  type WatchlistMarketGroup,
  type WatchlistSecurityIdentity,
} from '@/lib/watchlist/market-row';
import { WatchlistMobileList } from '@/components/watchlist/WatchlistMobileList';
import { WatchlistMarketSummary } from '@/components/watchlist/WatchlistMarketSummary';
import type { WatchlistOverviewRow as WatchlistOverviewClientRow } from '@/lib/watchlist/overview-contract';
import { summarizeWatchlistMarketRows } from '@/lib/watchlist/summary';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import {
  DEFAULT_WATCHLIST_TABLE_PREFERENCES,
  isWatchlistSavedViews,
  isWatchlistTablePreferences,
  type WatchlistSavedTableView as SavedTableView,
  type WatchlistTablePreferences as TablePreferences,
} from '@/lib/watchlist/ui-preferences';
import { watchlistColumnRequiresSingleMarket, watchlistOverviewServerSort } from '@/lib/watchlist/overview-query';
import { WatchlistCompositionStrip } from '@/components/watchlist/WatchlistCompositionStrip';
import type { WatchlistComposition } from '@/lib/watchlist/composition';
import type { DataEnvelope } from '@/lib/watchlist/overview-contract';
import {
  resetWatchlistTableFilters,
  watchlistTableMetricValue,
} from '@/lib/watchlist/table-model';
import { watchlistMetricRequiresSingleMarket } from '@/lib/watchlist/metric-registry';
import type { WatchlistQuickViewTab } from '@/lib/watchlist/quick-view';
import { WatchlistTableControls } from '@/components/watchlist/WatchlistTableControls';
import { WatchlistTableBulkActions } from '@/components/watchlist/WatchlistTableBulkActions';
import { WatchlistDesktopTable } from '@/components/watchlist/WatchlistDesktopTable';
import { WatchlistComparisonPanel } from '@/components/watchlist/WatchlistComparisonPanel';
import { normalizeWatchlistComparisonTickers } from '@/lib/watchlist/comparison';
import type { WatchlistBulkWorkflowResult } from '@/lib/watchlist/bulk-workflow';

const WatchlistBulkWorkflowDialog = dynamic(
  () => import('@/components/watchlist/WatchlistBulkWorkflowDialog').then((module) => module.WatchlistBulkWorkflowDialog),
  { ssr: false },
);

export function WatchlistTable({
  groups,
  quotes,
  identities,
  overviewByTicker = {},
  composition,
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
  bulkWorkflowEnabled = false,
  onBulkWorkflowCompleted,
}: {
  groups: WatchlistMarketGroup[];
  quotes: Record<string, LiveQuote | null>;
  identities: Record<string, WatchlistSecurityIdentity>;
  overviewByTicker?: Record<string, WatchlistOverviewClientRow>;
  composition?: DataEnvelope<WatchlistComposition> | null;
  loadedAt: number | null;
  loading?: boolean;
  onSelectTicker?: (ticker: string, tab?: WatchlistQuickViewTab) => void;
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
  bulkWorkflowEnabled?: boolean;
  onBulkWorkflowCompleted?: (result: WatchlistBulkWorkflowResult) => void | Promise<void>;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mobileSelectionMode, setMobileSelectionMode] = useState(false);
  const [comparisonTickers, setComparisonTickers] = useState<string[] | null>(null);
  const [workflowTickers, setWorkflowTickers] = useState<string[] | null>(null);
  const { sortKey, asc, query, groupFilter, marketFilter, statusFilter, decisionFilter, tagFilter, metricFilter, metricMin, metricMax } = preferences;

  const rows = useMemo(
    () => buildWatchlistMarketRows(groups, quotes, identities, loadedAt),
    [groups, quotes, identities, loadedAt],
  );

  useEffect(() => {
    const available = new Set(rows.map((row) => row.ticker));
    setSelected((current) => new Set([...current].filter((ticker) => available.has(ticker))));
  }, [rows]);

  useEffect(() => {
    if (preferences.groupFilter === 'all' || groups.some((group) => group.id === preferences.groupFilter)) return;
    const legacyMatches = groups.filter((group) => group.name === preferences.groupFilter);
    setPreferences((current) => ({
      ...current,
      groupFilter: legacyMatches.length === 1 ? legacyMatches[0].id : 'all',
    }));
  }, [groups, preferences.groupFilter, setPreferences]);

  useEffect(() => {
    if (preferences.marketFilter !== 'all') return;
    const invalidSort = watchlistColumnRequiresSingleMarket(preferences.sortKey);
    const invalidMetric = preferences.metricFilter !== 'none'
      && watchlistMetricRequiresSingleMarket(preferences.metricFilter);
    if (!invalidSort && !invalidMetric) return;
    setPreferences((current) => ({
      ...current,
      ...(invalidSort ? { sortKey: 'ticker' as const, asc: true } : {}),
      ...(invalidMetric ? { metricFilter: 'none' as const, metricMin: null, metricMax: null } : {}),
    }));
  }, [preferences.marketFilter, preferences.metricFilter, preferences.sortKey, setPreferences]);

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
        const metric = watchlistTableMetricValue(row, metricFilter, overview);
        if (typeof metric !== 'number' || (metricMin != null && metric < metricMin) || (metricMax != null && metric > metricMax)) return false;
      }
      return true;
    });
  }, [decisionFilter, groupFilter, marketFilter, metricFilter, metricMax, metricMin, overviewByTicker, overviewQueryActive, query, queryRows, statusFilter, tagFilter]);

  const sorted = useMemo(() => overviewQueryActive ? filtered : [...filtered].sort((left, right) => {
    const a = watchlistTableMetricValue(left, sortKey, overviewByTicker[left.ticker]);
    const b = watchlistTableMetricValue(right, sortKey, overviewByTicker[right.ticker]);
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
  const querySnapshotAsOf = overviewQueryActive
    ? Object.values(overviewByTicker)
      .map((row) => row.querySnapshot?.sortAsOf)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null
    : null;
  const toggleSelection = (ticker: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
    return next;
  });
  const clearSelection = () => setSelected(new Set());
  const changeMobileSelectionMode = (active: boolean) => {
    setMobileSelectionMode(active);
    if (!active) clearSelection();
  };

  if (rows.length === 0) return <div className="card-base text-center text-sm text-text-dim">{t('empty')}</div>;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-card shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_10px_30px_rgba(0,0,0,0.18)]" data-density="data">
      <WatchlistMarketSummary summary={summary} />
      <WatchlistCompositionStrip envelope={composition} />

      <WatchlistTableControls
        groups={groups}
        rows={rows}
        preferences={preferences}
        savedViews={savedViews}
        setPreferences={setPreferences}
        setSavedViews={setSavedViews}
        onAddSecurity={onAddSecurity}
        mobileSelectionMode={mobileSelectionMode}
        onMobileSelectionModeChange={changeMobileSelectionMode}
      />

      {loading && <div className="border-b border-border px-3 py-1.5 text-[11px] text-text-dim" role="status">{t('loadingQuotes')}</div>}
      {querySnapshotAsOf && <div className="border-b border-border px-3 py-1.5 text-[11px] text-text-muted" role="status">{t('overview.snapshotSort', { value: new Date(querySnapshotAsOf).toLocaleString() })}</div>}
      {overviewHasMore && !overviewQueryActive && <div className="border-b border-warn/20 bg-warn/5 px-3 py-1.5 text-[11px] text-warn" role="status">{t('overview.sortBlocked')}</div>}
      <WatchlistTableBulkActions
        selected={selected}
        groups={groups}
        onMoveTickers={onMoveTickers}
        onRemoveTickers={onRemoveTickers}
        onTagTickers={onTagTickers}
        onCompare={(tickers) => setComparisonTickers(normalizeWatchlistComparisonTickers(tickers))}
        onWorkflow={bulkWorkflowEnabled ? setWorkflowTickers : undefined}
        onClear={clearSelection}
      />
      {overviewQueryActive && (overviewQueryPending || (overviewLoading && Object.keys(overviewByTicker).length === 0)) ? (
        <div className="space-y-px bg-border/60" role="status" aria-label={t('overview.loading')}>
          {[0, 1, 2, 3, 4].map((row) => <div key={row} className="h-14 animate-pulse bg-bg-card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-10 text-center"><p className="text-sm text-text-dim">{t('filters.noResults')}</p><button type="button" onClick={() => setPreferences(resetWatchlistTableFilters)} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded border border-border px-3 text-xs text-text-dim hover:text-text"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{t('filters.reset')}</button></div>
      ) : (
        <>
        <WatchlistMobileList rows={sorted} overviewByTicker={overviewByTicker} onSelect={onSelectTicker} selectionMode={mobileSelectionMode} selected={selected} onToggle={toggleSelection} />
        <WatchlistDesktopTable
          rows={sorted}
          overviewByTicker={overviewByTicker}
          preferences={preferences}
          setPreferences={setPreferences}
          selected={selected}
          setSelected={setSelected}
          overviewHasMore={overviewHasMore}
          overviewLoadingMore={overviewLoadingMore}
          overviewQueryActive={overviewQueryActive}
          onLoadMoreOverview={onLoadMoreOverview}
          onSelectTicker={onSelectTicker}
        />
        </>
      )}
      {overviewHasMore && (
        <div className="flex justify-center border-t border-border bg-bg-elevated/50 px-3 py-2">
          <button type="button" disabled={overviewLoadingMore} onClick={() => void onLoadMoreOverview?.()} className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-bg-card px-3 text-xs text-text-dim disabled:opacity-50">
            {overviewLoadingMore && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{t(overviewLoadingMore ? 'overview.loadingMore' : 'overview.loadMore')}
          </button>
        </div>
      )}
      {comparisonTickers && (
        <WatchlistComparisonPanel
          rows={comparisonTickers.flatMap((ticker) => rows.find((row) => row.ticker === ticker) ?? [])}
          overviewByTicker={overviewByTicker}
          historyRange={preferences.historyRange}
          onOpenTicker={onSelectTicker ? (ticker) => { setComparisonTickers(null); onSelectTicker(ticker); } : undefined}
          onClose={() => setComparisonTickers(null)}
        />
      )}
      {workflowTickers && (
        <WatchlistBulkWorkflowDialog
          targets={workflowTickers.map((ticker) => ({
            ticker,
            itemId: overviewByTicker[ticker]?.item.id ?? null,
            expectedVersion: overviewByTicker[ticker]?.item.decision_version ?? null,
          }))}
          onCompleted={onBulkWorkflowCompleted}
          onClose={() => setWorkflowTickers(null)}
        />
      )}
    </div>
  );
}
