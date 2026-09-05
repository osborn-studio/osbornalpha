'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Disclaimer } from '@/components/Disclaimer';
import { useToast } from '@/components/Toast';
import { useBatchQuotes } from '@/lib/hooks/useQuote';
import { WatchlistTable } from '@/components/WatchlistTable';
import { WatchlistOnboarding } from '@/components/WatchlistOnboarding';
import { WatchlistToolbar } from '@/components/watchlist/WatchlistToolbar';
import { WatchlistSyncConflict } from '@/components/watchlist/WatchlistSyncConflict';
import type { WatchlistPendingAction } from '@/components/watchlist/WatchlistActionDialog';
import { WatchlistReviewSummary } from '@/components/watchlist/WatchlistReviewSummary';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { useWatchlistOverview } from '@/lib/hooks/useWatchlistOverview';
import { uniqueWatchlistTickers, type WatchlistGroup } from '@/lib/watchlist/store';
import { formatDateLocale, type AppLocale } from '@/lib/i18n/locale';
import { trackEvent } from '@/lib/analytics/client';
import {
  SAMPLE_TICKERS,
  createPrimaryBoard,
  installSampleBoard,
} from '@/lib/watchlist/onboarding';
import { serializeWatchlistYaml, watchlistCsv } from '@/lib/watchlist/export';
import { useWatchlistTrash } from '@/lib/hooks/useWatchlistTrash';
import { useWatchlistUiPreferences } from '@/lib/hooks/useWatchlistUiPreferences';
import { DEFAULT_WATCHLIST_CHART_PREFERENCES } from '@/lib/watchlist/ui-preferences';
import { watchlistHistoryRangeForChart } from '@/lib/market-returns/range';
import { watchlistBenchmarkTicker } from '@/lib/watchlist/analytics';
import { classifyMarket } from '@/lib/utils';
import { watchlistOverviewServerSort } from '@/lib/watchlist/overview-query';
import { watchlistQuoteRefreshInterval } from '@/lib/watchlist/quote-refresh-policy';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useAppSession } from '@/components/AppSessionProvider';
import { useWatchlistReviews } from '@/lib/hooks/useWatchlistReviews';
import { useWatchlistBoardDnd } from '@/lib/hooks/useWatchlistBoardDnd';
import {
  watchlistSecurityIdentity,
  type WatchlistSecurityIdentity as WatchlistSecurityResult,
} from '@/lib/watchlist/security-identity';
import type { WatchlistOverviewItemRow } from '@/lib/watchlist/overview-contract';
import {
  WatchlistRequestError,
  watchlistJsonRequest,
  watchlistResponseRequest,
} from '@/lib/watchlist/api-client';

type Group = WatchlistGroup;

const WatchlistQuickView = dynamic(
  () => import('@/components/WatchlistQuickView').then((module) => module.WatchlistQuickView),
  { ssr: false },
);
const WatchlistKanbanColumn = dynamic(
  () => import('@/components/watchlist/WatchlistKanbanColumn').then((module) => module.WatchlistKanbanColumn),
  { ssr: false },
);
const WatchlistAddDialog = dynamic(
  () => import('@/components/watchlist/WatchlistAddDialog').then((module) => module.WatchlistAddDialog),
  { ssr: false },
);
const WatchlistReviewPanel = dynamic(
  () => import('@/components/watchlist/WatchlistReviewPanel').then((module) => module.WatchlistReviewPanel),
  { ssr: false },
);
const WatchlistImportDialog = dynamic(
  () => import('@/components/watchlist/WatchlistImportDialog').then((module) => module.WatchlistImportDialog),
  { ssr: false },
);
const WatchlistActionDialog = dynamic(
  () => import('@/components/watchlist/WatchlistActionDialog').then((module) => module.WatchlistActionDialog),
  { ssr: false },
);
const WatchlistTrashDialog = dynamic(
  () => import('@/components/watchlist/WatchlistTrashDialog').then((module) => module.WatchlistTrashDialog),
  { ssr: false },
);
const PostAddInsight = dynamic(
  () => import('@/components/PostAddInsight').then((module) => module.PostAddInsight),
  { ssr: false },
);

export default function WatchlistPage() {
  const router = useRouter();
  const { show } = useToast();
  const t = useTranslations('market.watchlist');
  const locale = useLocale() as AppLocale;
  const { user } = useAppSession();
  const {
    groups,
    hydrated,
    setGroups,
    syncStatus,
    conflictSnapshot,
    resolveSyncConflict,
    applyServerSnapshot,
    serverVersion,
  } = useWatchlist();
  const trash = useWatchlistTrash(!!user);
  const [trashOpen, setTrashOpen] = useState(false);
  const uiPreferences = useWatchlistUiPreferences(!!user);
  const viewMode = uiPreferences.preferences.viewMode;
  const setView = uiPreferences.setViewMode;

  // Per-column add UI: which column has the add panel open
  const [addingInGroup, setAddingInGroup] = useState<string | null>(null);

  // New column UI
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Batch import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Mobile move menu (per-card kebab) — which ticker's menu is open
  const [openMenuTicker, setOpenMenuTicker] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<WatchlistSecurityResult | null>(null);
  const [quickViewTicker, setQuickViewTicker] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<WatchlistPendingAction | null>(null);
  const [addedSecurityIdentities, setAddedSecurityIdentities] = useState<Record<string, WatchlistSecurityResult>>({});
  const watchlistViewTracked = useRef(false);
  const postAddTracked = useRef<string | null>(null);
  const quickViewHistoryRequest = useRef<string | null>(null);

  const persist = useCallback((next: Group[]) => {
    setGroups(next);
  }, [setGroups]);

  const boardDnd = useWatchlistBoardDnd({
    groups,
    onChange: persist,
    onTickerMoved: (ticker, group) => show(t('movedTo', { ticker, group })),
    onGroupReordered: (name) => show(t('reordered', { name })),
  });

  // ─── Live quotes (batch) ───
  const allTickers = useMemo(() => uniqueWatchlistTickers(groups), [groups]);
  const quoteRefreshInterval = useCallback(
    (context: { now: Date; consecutiveFailures: number }) => watchlistQuoteRefreshInterval(allTickers, context),
    [allTickers],
  );

  const { quotes, loading: quotesLoading, loadedAt, refetch } = useBatchQuotes(allTickers, {
    refreshIntervalMs: quoteRefreshInterval,
  });
  const overviewQuery = useDebouncedValue(uiPreferences.preferences.table.query.trim(), 250);
  const overviewQueryPending = uiPreferences.preferences.table.query.trim() !== overviewQuery;
  const overviewServerQuery = useMemo(() => {
    if (!user) return null;
    const table = uiPreferences.preferences.table;
    const serverSort = watchlistOverviewServerSort(table.sortKey);
    const groupId = table.groupFilter === 'all'
      ? null
      : groups.find((group) => group.id === table.groupFilter || group.name === table.groupFilter)?.id ?? null;
    const market = table.marketFilter === 'all' ? null : table.marketFilter;
    const quoteStatus = table.statusFilter === 'all' || table.statusFilter === 'loading' ? null : table.statusFilter;
    const query = overviewQuery || null;
    const decisionStatus = table.decisionFilter === 'all' ? null : table.decisionFilter;
    const tag = table.tagFilter.trim() || null;
    return serverSort || groupId || market || quoteStatus || query || decisionStatus || tag || table.metricFilter !== 'none'
      ? {
        sort: serverSort ?? 'position', direction: table.asc ? 'asc' as const : 'desc' as const,
        groupId, market, quoteStatus, query, decisionStatus, tag, historyRange: table.historyRange,
        metric: table.metricFilter === 'none' ? null : table.metricFilter,
        metricMin: table.metricFilter === 'none' ? null : table.metricMin,
        metricMax: table.metricFilter === 'none' ? null : table.metricMax,
      }
      : null;
  }, [groups, overviewQuery, uiPreferences.preferences.table, user]);
  const overview = useWatchlistOverview(!!user && allTickers.length > 0, overviewServerQuery);
  const reviews = useWatchlistReviews(!!user && hydrated && allTickers.length > 0, overview.updateItem);
  const securityIdentities = useMemo(() => {
    const overviewIdentities = Object.values(overview.rows).flatMap((row) => {
      if (!row.identity) return [];
      const identity = watchlistSecurityIdentity(row.identity, locale);
      return [[identity.t, identity] as const];
    });
    return {
      ...addedSecurityIdentities,
      ...Object.fromEntries(overviewIdentities),
    };
  }, [addedSecurityIdentities, locale, overview.rows]);
  const { ensureTicker, rows: overviewRows } = overview;
  const historyRangeForTicker = useCallback((ticker: string) => watchlistHistoryRangeForChart(
    uiPreferences.preferences.charts[ticker]?.range ?? DEFAULT_WATCHLIST_CHART_PREFERENCES.range,
  ), [uiPreferences.preferences.charts]);
  const loadQuickViewBenchmark = useCallback(async (ticker: string, benchmark: string | null) => {
    const row = await ensureTicker(ticker, {
      benchmark,
      range: historyRangeForTicker(ticker),
      force: true,
    });
    if (!row || benchmark === null) return row !== null;
    return row.history?.value?.benchmarkTicker === benchmark
      && row.history.value.benchmarkStatus !== 'unavailable';
  }, [ensureTicker, historyRangeForTicker]);

  useEffect(() => {
    if (!quickViewTicker || !user) {
      quickViewHistoryRequest.current = null;
      return;
    }
    const expectedRange = historyRangeForTicker(quickViewTicker);
    const row = overviewRows[quickViewTicker];
    const benchmark = uiPreferences.preferences.benchmarks[quickViewTicker] || null;
    const expectedBenchmark = benchmark ?? watchlistBenchmarkTicker(classifyMarket(quickViewTicker));
    if (row?.market
      && row.history?.value?.methodology.historyRange === expectedRange
      && row.history.value.benchmarkTicker === expectedBenchmark) return;
    const requestKey = `${quickViewTicker}:${expectedBenchmark}:${expectedRange}`;
    if (quickViewHistoryRequest.current === requestKey) return;
    quickViewHistoryRequest.current = requestKey;
    void ensureTicker(quickViewTicker, { benchmark, range: expectedRange, force: true });
  }, [ensureTicker, historyRangeForTicker, overviewRows, quickViewTicker, uiPreferences.preferences.benchmarks, user]);

  async function updateTickerTags(tickers: string[], tag: string, mode: 'add' | 'remove') {
    const items = tickers.flatMap((ticker) => {
      const item = overview.rows[ticker]?.item;
      return item ? [{ id: item.id, expectedVersion: item.decision_version }] : [];
    });
    if (items.length !== tickers.length) {
      await overview.refetch();
      show(t('bulkTagsUnavailable'));
      return false;
    }
    try {
      const body = await watchlistJsonRequest<{ items: WatchlistOverviewItemRow[] }>('/api/watchlist/items/bulk', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items, tag, mode }),
      }, 'bulk_tags_failed');
      if (!Array.isArray(body.items)) throw new Error('bulk_tags_failed');
      body.items.forEach(overview.updateItem);
      show(t(mode === 'add' ? 'bulkTagsAdded' : 'bulkTagsRemoved', { count: tickers.length, tag }));
      return true;
    } catch (error) {
      if (error instanceof WatchlistRequestError && error.status === 409) {
        await overview.refetch();
        show(t('bulkTagsConflict'));
        return false;
      }
      show(t('bulkTagsFailed'));
      return false;
    }
  }

  const failedTickers = useMemo(() => {
    if (!loadedAt) return [];  // still loading first batch
    return allTickers.filter((t) => !quotes[t] || (quotes[t] as any)?.price === 0);
  }, [allTickers, quotes, loadedAt]);

  useEffect(() => {
    if (!hydrated || watchlistViewTracked.current) return;
    watchlistViewTracked.current = true;
    trackEvent('watchlist_viewed', { groups: groups.length, tickers: allTickers.length });
  }, [hydrated, groups.length, allTickers.length]);

  useEffect(() => {
    if (!lastAdded || postAddTracked.current === lastAdded.t) return;
    postAddTracked.current = lastAdded.t;
    trackEvent('post_add_insight_viewed', {
      ticker: lastAdded.t,
      market: lastAdded.m,
      asset_type: lastAdded.asset_type,
    });
  }, [lastAdded]);

  function openPrimaryAdd() {
    const next = createPrimaryBoard(groups, t('onboarding.defaultBoard'));
    if (next !== groups) persist(next);
    setView('kanban');
    setAddingInGroup(next[0].id);
    trackEvent('watchlist_empty_action_selected', { action: 'search' });
  }

  function addSecurityToGroup(info: WatchlistSecurityResult, groupId: string) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    const exists = groups.some((item) => item.tickers.includes(info.t));
    if (exists) {
      trackEvent('watchlist_add_duplicate', { ticker: info.t });
      show(t('alreadyInWatchlist', { ticker: info.t }));
      return;
    }
    trackEvent('watchlist_stock_added', { ticker: info.t, group: group.name, market: info.m });
    setLastAdded(info);
    setAddedSecurityIdentities((current) => ({ ...current, [info.t]: info }));
    persist(groups.map((item) => item.id === groupId ? { ...item, tickers: [...item.tickers, info.t] } : item));
    show(t('addedTo', { group: group.name, name: info.n, ticker: info.t }));
  }

  function openImportFromEmpty() {
    setImportOpen(true);
    trackEvent('watchlist_empty_action_selected', { action: 'import' });
  }

  function installSample() {
    const next = installSampleBoard(groups, t('onboarding.sampleBoard'));
    if (next === groups) return;
    persist(next);
    trackEvent('watchlist_empty_action_selected', { action: 'sample' });
    trackEvent('watchlist_sample_installed', { tickers: SAMPLE_TICKERS });
    show(t('onboarding.installed'));
  }

  // Manually refresh all quotes (e.g. after a transient API failure)
  function refreshQuotes() {
    trackEvent('watchlist_refresh_clicked', { tickers: allTickers.length });
    refetch();
    show(t('refreshing'));
  }

  // ─── Card actions ───
  function removeTicker(ticker: string) {
    setPendingAction({ kind: 'remove', ticker });
  }

  function removeTickerConfirmed(ticker: string) {
    const next = groups.map((g) => ({ ...g, tickers: g.tickers.filter((t) => t !== ticker) }));
    persist(next);
    show(t('removed', { ticker }));
  }

  function moveTickers(tickers: string[], toGroupId: string) {
    const selected = new Set(tickers);
    const next = groups.map((group) => {
      const remaining = group.tickers.filter((ticker) => !selected.has(ticker));
      return group.id === toGroupId ? { ...group, tickers: [...remaining, ...tickers.filter((ticker) => !remaining.includes(ticker))] } : { ...group, tickers: remaining };
    });
    persist(next);
    show(t('batchMoved', { count: tickers.length, group: groups.find((group) => group.id === toGroupId)?.name ?? toGroupId }));
  }

  // ─── Column management ───
  function addColumn() {
    const name = newColumnName.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    persist([...groups, { id, name, tickers: [] }]);
    setNewColumnName('');
    setNewColumnOpen(false);
    show(t('columnAdded', { name }));
  }

  function renameColumn(id: string) {
    const cur = groups.find((g) => g.id === id);
    if (!cur) return;
    setPendingAction({ kind: 'rename', id, name: cur.name });
  }

  function deleteColumn(id: string) {
    const cur = groups.find((g) => g.id === id);
    if (!cur) return;
    setPendingAction({ kind: 'delete', id, name: cur.name, count: cur.tickers.length });
  }

  function confirmPendingAction(value?: string) {
    if (!pendingAction) return;
    if (pendingAction.kind === 'remove') removeTickerConfirmed(pendingAction.ticker);
    if (pendingAction.kind === 'bulk-remove') {
      const selected = new Set(pendingAction.tickers);
      persist(groups.map((group) => ({ ...group, tickers: group.tickers.filter((ticker) => !selected.has(ticker)) })));
      show(t('batchRemoved', { count: selected.size }));
    }
    if (pendingAction.kind === 'delete') persist(groups.filter((group) => group.id !== pendingAction.id));
    if (pendingAction.kind === 'rename' && value && value !== pendingAction.name) {
      persist(groups.map((group) => group.id === pendingAction.id ? { ...group, name: value } : group));
    }
    setPendingAction(null);
  }

  // ─── Batch import ───
  function importBatch(tickers: string[], boardName: string, rejected: string[] = []) {
    if (tickers.length === 0) return;
    trackEvent('watchlist_import_submitted', { input_count: tickers.length, board_name_set: !!boardName.trim() });
    const existing = new Set<string>();
    for (const g of groups) for (const t of g.tickers) existing.add(t.toUpperCase());

    const seen = new Set<string>();
    const fresh: string[] = [];
    const skipped: string[] = [];
    for (const raw of tickers) {
      const t = raw.toUpperCase();
      if (existing.has(t) || seen.has(t)) {
        skipped.push(t);
      } else {
        seen.add(t);
        fresh.push(t);
      }
    }

    if (fresh.length === 0) {
      show(t('importNoNew', { skipped: skipped.length }));
      return;
    }

    const id = `import_${Date.now()}`;
    const finalName = boardName.trim() || t('importDefaultName', { date: formatDateLocale(new Date().toISOString(), locale) });
    persist([...groups, { id, name: finalName, tickers: fresh }]);
    setImportOpen(false);
    if (rejected.length > 0) {
      show(t('importDoneValidated', { fresh: fresh.length, name: finalName, rejected: rejected.length }));
    } else {
      show(
        skipped.length > 0
          ? t('importDoneDedup', { fresh: fresh.length, name: finalName, skipped: skipped.length })
          : t('importDone', { fresh: fresh.length, name: finalName })
      );
    }
  }

  // ─── Export ───
  function exportFile(content: string, extension: 'yml' | 'csv', type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watchlist-${new Date().toISOString().slice(0, 10)}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    show(t(extension === 'csv' ? 'exportCsvDone' : 'exportYamlDone'));
  }

  async function exportPortableFile(format: 'yaml' | 'csv') {
    if (!user) {
      exportFile(
        format === 'csv' ? `\uFEFF${watchlistCsv(groups)}` : serializeWatchlistYaml(groups),
        format === 'csv' ? 'csv' : 'yml',
        format === 'csv' ? 'text/csv;charset=utf-8' : 'text/yaml',
      );
      return;
    }
    try {
      const response = await watchlistResponseRequest(
        `/api/watchlist/export?format=${format}`,
        { cache: 'no-store' },
        'watchlist_export_failed',
      );
      exportFile(
        await response.text(),
        format === 'csv' ? 'csv' : 'yml',
        response.headers.get('content-type') || 'application/octet-stream',
      );
    } catch {
      show(t('exportFailed'));
    }
  }

  return (
    <div className="watchlist-workbench">
      <WatchlistToolbar
        count={hydrated ? allTickers.length : 0}
        view={viewMode}
        syncStatus={syncStatus}
        quotesLoading={quotesLoading && allTickers.length > 0}
        failedQuotes={failedTickers.length}
        overviewPartial={overview.partial}
        overviewTotal={overview.total}
        overviewError={!!overview.error}
        onViewChange={setView}
        onRefresh={refreshQuotes}
        onImport={() => setImportOpen(true)}
        onExportYaml={() => void exportPortableFile('yaml')}
        onExportCsv={() => void exportPortableFile('csv')}
        onOpenTrash={user ? () => setTrashOpen(true) : undefined}
        trashCount={trash.entries.length}
        preferencesSyncStatus={uiPreferences.status}
        onRetryPreferencesSync={uiPreferences.retry}
      />

      {conflictSnapshot && (
        <WatchlistSyncConflict
          onUseServer={() => resolveSyncConflict('server')}
          onKeepLocal={() => resolveSyncConflict('local')}
          onMerge={() => resolveSyncConflict('merge')}
        />
      )}

      {user && hydrated && allTickers.length > 0 && (
        <WatchlistReviewSummary summary={reviews.summary} loading={reviews.loading} onOpen={() => setReviewOpen(true)} />
      )}

      {lastAdded && (
        <PostAddInsight
          asset={lastAdded}
          quote={quotes[lastAdded.t]}
          onDismiss={() => setLastAdded(null)}
          onAnalyze={() => {
            trackEvent('post_add_ai_clicked', {
              ticker: lastAdded.t,
              market: lastAdded.m,
              asset_type: lastAdded.asset_type,
            });
            router.push(`/copilot?ticker=${encodeURIComponent(lastAdded.t)}`);
          }}
        />
      )}

      {/* ─── Table view: real quote fields only ─── */}
      {hydrated && allTickers.length > 0 && viewMode === 'table' && (
        <WatchlistTable
          groups={groups}
          quotes={quotes}
          identities={securityIdentities}
          overviewByTicker={overview.rows}
          loadedAt={loadedAt}
          loading={quotesLoading}
          onSelectTicker={setQuickViewTicker}
          onMoveTickers={moveTickers}
          onRemoveTickers={(tickers) => setPendingAction({ kind: 'bulk-remove', tickers })}
          onTagTickers={updateTickerTags}
          overviewHasMore={overview.partial}
          overviewLoading={overview.loading}
          overviewLoadingMore={overview.loadingMore}
          overviewQueryPending={overviewQueryPending}
          overviewQueryActive={overview.serverQueryActive}
          onLoadMoreOverview={overview.loadMore}
          tablePreferences={uiPreferences.preferences.table}
          savedTableViews={uiPreferences.preferences.savedViews}
          onTablePreferencesChange={uiPreferences.setTable}
          onSavedTableViewsChange={uiPreferences.setSavedViews}
          onAddSecurity={() => setAddDialogOpen(true)}
        />
      )}

      {/* ─── Kanban Board ─── */}
      {hydrated && viewMode === 'kanban' && (
      <div
        className="flex gap-3 overflow-x-auto pb-3"
        style={{ scrollSnapType: 'x mandatory' }}
        onClick={() => setOpenMenuTicker(null)}
      >
        {groups.map((g) => (
          <WatchlistKanbanColumn
            key={g.id}
            group={g}
            allGroups={groups}
            quotes={quotes}
            securityIdentities={securityIdentities}
            overviewByTicker={overview.rows}
            loadedAt={loadedAt}
            isDropTarget={boardDnd.dropTargetGroup === g.id && boardDnd.dragKind === 'card'}
            isColumnDropTarget={boardDnd.dropTargetColumnId === g.id && boardDnd.dragKind === 'column'}
            isBeingDragged={boardDnd.dragColumnId === g.id && boardDnd.dragKind === 'column'}
            dragTicker={boardDnd.dragTicker}
            isAdding={addingInGroup === g.id}
            openMenuTicker={openMenuTicker}
            onDragOver={(e) => boardDnd.onColumnDragOver(e, g.id)}
            onDragEnter={() => boardDnd.onColumnDragEnter(g.id)}
            onDragLeave={() => boardDnd.onColumnDragLeave(g.id)}
            onDrop={(e) => boardDnd.onColumnDrop(e, g.id)}
            onColumnDragStart={(e) => boardDnd.onColumnDragStart(e, g.id)}
            onCardDragStart={(e, ticker) => boardDnd.onCardDragStart(e, ticker, g.id)}
            onCardDragEnd={boardDnd.onDragEnd}
            onRetryTicker={refetch}
            onAddOpen={() => setAddingInGroup(g.id)}
            onAddClose={() => setAddingInGroup(null)}
            onCardMove={(ticker, toGroupId) => boardDnd.moveTicker(ticker, g.id, toGroupId)}
            onCardRemove={removeTicker}
            onOpenMenu={(ticker) => setOpenMenuTicker((cur) => (cur === ticker ? null : ticker))}
            onQuickView={setQuickViewTicker}
            onRename={() => renameColumn(g.id)}
            onDelete={() => deleteColumn(g.id)}
            onTickerAdded={(info) => addSecurityToGroup(info, g.id)}
            onCardKeyboardMove={(ticker, direction) => boardDnd.moveCardByKeyboard(ticker, g.id, direction)}
            onColumnKeyboardMove={(direction) => {
              const index = groups.findIndex((group) => group.id === g.id);
              const target = groups[index + (direction === 'right' ? 1 : -1)];
              if (target) boardDnd.reorderColumn(g.id, target.id);
            }}
          />
        ))}

        {/* + 新增看板 */}
        <div
          className="shrink-0"
          style={{ scrollSnapAlign: 'start', width: 'min(85vw, 300px)' }}
        >
          {newColumnOpen ? (
            <div className="card-base bg-bg-card p-3">
              <input
                autoFocus
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addColumn();
                  if (e.key === 'Escape') { setNewColumnOpen(false); setNewColumnName(''); }
                }}
                placeholder={t('newColumnPlaceholder')}
                className="w-full text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={addColumn}
                  disabled={!newColumnName.trim()}
                  className="flex-1 rounded bg-accent-dim px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {t('addColumnCta')}
                </button>
                <button
                  onClick={() => { setNewColumnOpen(false); setNewColumnName(''); }}
                  className="rounded border border-border px-3 py-1.5 text-xs text-text-dim"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNewColumnOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-transparent py-3 text-sm text-text-dim hover:border-accent-dim hover:text-accent"
            >
              <span>＋</span><span>{t('addColumnLabel')}</span>
            </button>
          )}
        </div>
      </div>
      )}

      {!hydrated && (
        <div className="card-base bg-bg-card py-8 text-center text-sm text-text-dim">
          {t('loadingWatchlist')}
        </div>
      )}

      {hydrated && allTickers.length === 0 && (
        <WatchlistOnboarding
          onSearch={openPrimaryAdd}
          onImport={openImportFromEmpty}
          onSample={installSample}
        />
      )}

      <Disclaimer />

      {quickViewTicker && (
        <WatchlistQuickView
          ticker={quickViewTicker}
          quote={quotes[quickViewTicker] ?? null}
          overview={overview.rows[quickViewTicker]}
          onDecisionSaved={overview.updateItem}
          onBenchmarkChange={user ? loadQuickViewBenchmark : undefined}
          benchmarkPreference={uiPreferences.preferences.benchmarks[quickViewTicker] ?? ''}
          onBenchmarkPreferenceChange={uiPreferences.setBenchmark}
          chartPreferences={uiPreferences.preferences.charts[quickViewTicker] ?? DEFAULT_WATCHLIST_CHART_PREFERENCES}
          onChartPreferencesChange={(next) => uiPreferences.setChart(quickViewTicker, next)}
          onClose={() => setQuickViewTicker(null)}
        />
      )}

      {addDialogOpen && <WatchlistAddDialog groups={groups} onAdd={addSecurityToGroup} onClose={() => setAddDialogOpen(false)} />}

      {reviewOpen && user && <WatchlistReviewPanel
        model={reviews}
        onOpenTicker={(ticker) => { setReviewOpen(false); setQuickViewTicker(ticker); }}
        onClose={() => setReviewOpen(false)}
      />}

      {importOpen && (
        <WatchlistImportDialog
          existingTickerCount={allTickers.length}
          existingTickers={new Set(allTickers.map((t) => t.toUpperCase()))}
          portableEnabled={!!user}
          onCancel={() => setImportOpen(false)}
          onConfirm={importBatch}
          onPortableImported={(snapshot) => {
            const applied = applyServerSnapshot(snapshot);
            if (applied) {
              void overview.refetch();
              show(t('importPortableDone'));
            }
            return applied;
          }}
        />
      )}

      {pendingAction && (
        <WatchlistActionDialog
          action={pendingAction}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
        />
      )}
      {trashOpen && user && <WatchlistTrashDialog
        entries={trash.entries} loading={trash.loading} saving={trash.saving} error={trash.error}
        onClose={() => setTrashOpen(false)} onDelete={(entry) => trash.remove(entry)}
        onRestore={async (entry) => {
          const snapshot = await trash.restore(entry, serverVersion);
          if (snapshot) { applyServerSnapshot(snapshot); await overview.refetch(); }
          return snapshot;
        }}
      />}
    </div>
  );
}
