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
import { WatchlistPageOverlays } from '@/components/watchlist/WatchlistPageOverlays';
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
import { selectWatchlistDisplayQuote } from '@/lib/watchlist/quote-authority';
import { watchlistBenchmarkTicker } from '@/lib/watchlist/analytics';
import { classifyMarket } from '@/lib/utils';
import { watchlistQuoteRefreshInterval } from '@/lib/watchlist/quote-refresh-policy';
import { useWatchlistOverviewQuery } from '@/lib/hooks/useWatchlistOverviewQuery';
import { useAppSession } from '@/components/AppSessionProvider';
import { useWatchlistReviews } from '@/lib/hooks/useWatchlistReviews';
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
import { WatchlistAttentionStrip } from '@/components/watchlist/WatchlistAttentionStrip';
import type { WatchlistQuickViewTab } from '@/lib/watchlist/quick-view';

type Group = WatchlistGroup;

const WatchlistBoard = dynamic(
  () => import('@/components/watchlist/WatchlistBoard').then((module) => module.WatchlistBoard),
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

  // Batch import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [lastAdded, setLastAdded] = useState<WatchlistSecurityResult | null>(null);
  const [quickViewTicker, setQuickViewTicker] = useState<string | null>(null);
  const [quickViewTab, setQuickViewTab] = useState<WatchlistQuickViewTab>('chart');
  const [pendingAction, setPendingAction] = useState<WatchlistPendingAction | null>(null);
  const [addedSecurityIdentities, setAddedSecurityIdentities] = useState<Record<string, WatchlistSecurityResult>>({});
  const watchlistViewTracked = useRef(false);
  const postAddTracked = useRef<string | null>(null);
  const quickViewHistoryRequest = useRef<string | null>(null);

  const persist = useCallback((next: Group[]) => {
    setGroups(next);
  }, [setGroups]);

  const openQuickView = useCallback((ticker: string, tab: WatchlistQuickViewTab = 'chart') => {
    setQuickViewTicker(ticker);
    setQuickViewTab(tab);
  }, []);

  // ─── Live quotes (batch) ───
  const allTickers = useMemo(() => uniqueWatchlistTickers(groups), [groups]);
  const quoteRefreshInterval = useCallback(
    (context: { now: Date; consecutiveFailures: number }) => watchlistQuoteRefreshInterval(allTickers, context),
    [allTickers],
  );

  const { quotes, loading: quotesLoading, loadedAt, refetch } = useBatchQuotes(allTickers, {
    refreshIntervalMs: quoteRefreshInterval,
  });
  const overviewQuery = useWatchlistOverviewQuery(
    !!user,
    groups,
    uiPreferences.preferences.table,
  );
  const overview = useWatchlistOverview(!!user && allTickers.length > 0, overviewQuery.query);
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
    setAddDialogOpen(true);
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
  function addColumn(name: string) {
    const id = `custom_${Date.now()}`;
    persist([...groups, { id, name, tickers: [] }]);
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
        <WatchlistAttentionStrip
          reviews={reviews.summary}
          reviewLoading={reviews.loading}
          warnings={overview.warnings}
          capabilities={overview.capabilities}
          overviewByTicker={overview.rows}
          generatedAt={overview.generatedAt}
          onOpenReviews={() => setReviewOpen(true)}
          onOpenAlerts={(ticker) => openQuickView(ticker, 'alerts')}
          onRetryData={() => void overview.refetch()}
        />
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
          composition={overview.composition}
          loadedAt={loadedAt}
          loading={quotesLoading}
          onSelectTicker={openQuickView}
          onMoveTickers={moveTickers}
          onRemoveTickers={(tickers) => setPendingAction({ kind: 'bulk-remove', tickers })}
          onTagTickers={updateTickerTags}
          overviewHasMore={overview.partial}
          overviewLoading={overview.loading}
          overviewLoadingMore={overview.loadingMore}
          overviewQueryPending={overviewQuery.pending}
          overviewQueryActive={overview.serverQueryActive}
          onLoadMoreOverview={overview.loadMore}
          tablePreferences={uiPreferences.preferences.table}
          savedTableViews={uiPreferences.preferences.savedViews}
          onTablePreferencesChange={uiPreferences.setTable}
          onSavedTableViewsChange={uiPreferences.setSavedViews}
          onAddSecurity={() => setAddDialogOpen(true)}
          bulkWorkflowEnabled={!!user}
          onBulkWorkflowCompleted={() => overview.refetch()}
        />
      )}

      {hydrated && viewMode === 'kanban' && (
        <WatchlistBoard
          groups={groups}
          quotes={quotes}
          identities={securityIdentities}
          overviewByTicker={overview.rows}
          loadedAt={loadedAt}
          onChange={persist}
          onTickerMoved={(ticker, groupName) => show(t('movedTo', { ticker, group: groupName }))}
          onGroupReordered={(name) => show(t('reordered', { name }))}
          onRetryTicker={refetch}
          onCardRemove={removeTicker}
          onQuickView={(ticker) => openQuickView(ticker)}
          onRenameGroup={renameColumn}
          onDeleteGroup={deleteColumn}
          onTickerAdded={addSecurityToGroup}
          onGroupAdded={addColumn}
        />
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

      <WatchlistPageOverlays
        quickView={quickViewTicker ? {
          ticker: quickViewTicker,
          tab: quickViewTab,
          quote: selectWatchlistDisplayQuote(quotes[quickViewTicker]),
          overview: overview.rows[quickViewTicker],
          onDecisionSaved: overview.updateItem,
          onBenchmarkChange: user ? loadQuickViewBenchmark : undefined,
          benchmarkPreference: uiPreferences.preferences.benchmarks[quickViewTicker] ?? '',
          onBenchmarkPreferenceChange: uiPreferences.setBenchmark,
          chartPreferences: uiPreferences.preferences.charts[quickViewTicker] ?? DEFAULT_WATCHLIST_CHART_PREFERENCES,
          onChartPreferencesChange: (next) => uiPreferences.setChart(quickViewTicker, next),
          onClose: () => setQuickViewTicker(null),
        } : null}
        add={addDialogOpen ? {
          groups,
          onAdd: addSecurityToGroup,
          onClose: () => setAddDialogOpen(false),
        } : null}
        review={reviewOpen && user ? {
          model: reviews,
          onOpenTicker: (ticker) => { setReviewOpen(false); openQuickView(ticker, 'decision'); },
          onClose: () => setReviewOpen(false),
        } : null}
        importDialog={importOpen ? {
          existingTickerCount: allTickers.length,
          existingTickers: new Set(allTickers.map((ticker) => ticker.toUpperCase())),
          portableEnabled: !!user,
          onCancel: () => setImportOpen(false),
          onConfirm: importBatch,
          onPortableImported: (snapshot) => {
            const applied = applyServerSnapshot(snapshot);
            if (applied) {
              void overview.refetch();
              show(t('importPortableDone'));
            }
            return applied;
          },
        } : null}
        action={pendingAction ? {
          action: pendingAction,
          onCancel: () => setPendingAction(null),
          onConfirm: confirmPendingAction,
        } : null}
        trash={trashOpen && user ? {
          entries: trash.entries,
          loading: trash.loading,
          saving: trash.saving,
          error: trash.error,
          onClose: () => setTrashOpen(false),
          onDelete: trash.remove,
          onRestore: async (entry) => {
            const snapshot = await trash.restore(entry, serverVersion);
            if (snapshot) {
              applyServerSnapshot(snapshot);
              await overview.refetch();
            }
            return snapshot;
          },
        } : null}
      />
    </div>
  );
}
