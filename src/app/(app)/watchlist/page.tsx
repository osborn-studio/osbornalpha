'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Disclaimer } from '@/components/Disclaimer';
import { useToast } from '@/components/Toast';
import { useBatchQuotes } from '@/lib/hooks/useQuote';
import { WatchlistTable } from '@/components/WatchlistTable';
import { WatchlistQuickView } from '@/components/WatchlistQuickView';
import { WatchlistOnboarding } from '@/components/WatchlistOnboarding';
import { WatchlistToolbar } from '@/components/watchlist/WatchlistToolbar';
import { WatchlistSyncConflict } from '@/components/watchlist/WatchlistSyncConflict';
import { WatchlistImportDialog } from '@/components/watchlist/WatchlistImportDialog';
import { WatchlistActionDialog, type WatchlistPendingAction } from '@/components/watchlist/WatchlistActionDialog';
import { WatchlistKanbanColumn, type WatchlistSecurityResult } from '@/components/watchlist/WatchlistKanbanColumn';
import { PostAddInsight } from '@/components/PostAddInsight';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { AssetType, Market } from '@/lib/supabase/database.types';
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
import { WatchlistTrashDialog } from '@/components/watchlist/WatchlistTrashDialog';

const REFRESH_MS = 60_000;

type Group = WatchlistGroup;
interface SecurityIdentityRow {
  ticker: string;
  name: string;
  pinyin: string | null;
  market: Market;
  asset_type: AssetType;
  list_status: string;
}

export default function WatchlistPage() {
  const router = useRouter();
  const { show } = useToast();
  const t = useTranslations('market.watchlist');
  const locale = useLocale() as AppLocale;
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
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const trash = useWatchlistTrash(!!user);
  const [trashOpen, setTrashOpen] = useState(false);
  // Default to the live-market table; the user's last choice is remembered.
  const VIEW_KEY = 'stock-monitor:watchlist:view';
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('table');
  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === 'kanban' || v === 'table') setViewMode(v); } catch {}
  }, []);
  const setView = (v: 'kanban' | 'table') => {
    setViewMode(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  };

  // Drag state — single source of truth.
  // `dragKind` distinguishes card-drag from column-reorder so the column
  // header's onDragOver doesn't accidentally fire highlights during a
  // card-drop (and vice versa).
  const [dragKind, setDragKind] = useState<'card' | 'column' | null>(null);
  const [dragTicker, setDragTicker] = useState<string | null>(null);
  const [dragFromGroup, setDragFromGroup] = useState<string | null>(null);
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);
  const [dropTargetColumnId, setDropTargetColumnId] = useState<string | null>(null);
  // dragenter/dragleave fire on every child element. A counter avoids
  // flicker as the dragged item moves over cards inside a column.
  const dragOverCounters = useRef<Record<string, number>>({});

  // Per-column add UI: which column has the add panel open
  const [addingInGroup, setAddingInGroup] = useState<string | null>(null);

  // New column UI
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Batch import dialog
  const [importOpen, setImportOpen] = useState(false);

  // Mobile move menu (per-card kebab) — which ticker's menu is open
  const [openMenuTicker, setOpenMenuTicker] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<WatchlistSecurityResult | null>(null);
  const [quickViewTicker, setQuickViewTicker] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<WatchlistPendingAction | null>(null);
  const [securityIdentities, setSecurityIdentities] = useState<Record<string, WatchlistSecurityResult>>({});
  const watchlistViewTracked = useRef(false);
  const postAddTracked = useRef<string | null>(null);

  // The watchlist hook owns data reconciliation; this lookup only controls the
  // signed-in banner and must never write a second watchlist snapshot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isSupabaseConfigured()) {
          const sb = getBrowserSupabase();
          const { data: { user: u } } = await sb.auth.getUser();
          if (u && !cancelled) {
            setUser({ id: u.id, email: u.email });
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  function persist(next: Group[]) {
    setGroups(next);
  }

  // ─── Live quotes (batch) ───
  const allTickers = useMemo(() => uniqueWatchlistTickers(groups), [groups]);

  useEffect(() => {
    if (!isSupabaseConfigured() || allTickers.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = getBrowserSupabase();
        const rows: WatchlistSecurityResult[] = [];
        for (let index = 0; index < allTickers.length; index += 100) {
          const { data, error } = await sb
            .from('stocks_universe')
            .select('ticker,name,pinyin,market,asset_type,list_status')
            .in('ticker', allTickers.slice(index, index + 100))
            .eq('is_active', true);
          if (error) throw error;
          const identityRows = (data ?? []) as unknown as SecurityIdentityRow[];
          rows.push(...identityRows.map((row) => ({
            t: row.ticker,
            n: row.name,
            py: row.pinyin ?? '',
            m: row.market,
            asset_type: row.asset_type,
            list_status: row.list_status,
            selectable: true,
            verification_status: 'verified',
          })));
        }
        if (!cancelled) {
          setSecurityIdentities((current) => ({
            ...current,
            ...Object.fromEntries(rows.map((row) => [row.t, row])),
          }));
        }
      } catch {
        // Quotes and cards remain usable with ticker-only fallback.
      }
    })();
    return () => { cancelled = true; };
  }, [allTickers]);

  const { quotes, loading: quotesLoading, loadedAt, refetch } = useBatchQuotes(allTickers, {
    refreshIntervalMs: REFRESH_MS,
  });
  const overview = useWatchlistOverview(!!user && allTickers.length > 0);
  const { ensureTicker, rows: overviewRows } = overview;
  const loadQuickViewBenchmark = useCallback(async (ticker: string, benchmark: string | null) => (
    await ensureTicker(ticker, { benchmark, force: true })
  ) !== null, [ensureTicker]);

  useEffect(() => {
    if (quickViewTicker && user && !overviewRows[quickViewTicker]?.market) {
      void ensureTicker(quickViewTicker);
    }
  }, [ensureTicker, overviewRows, quickViewTicker, user]);

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
      const response = await fetch('/api/watchlist/items/bulk', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items, tag, mode }),
      });
      const body = await response.json().catch(() => null);
      if (response.status === 409) {
        await overview.refetch();
        show(t('bulkTagsConflict'));
        return false;
      }
      if (!response.ok || !Array.isArray(body?.items)) throw new Error(body?.error || 'bulk_tags_failed');
      body.items.forEach(overview.updateItem);
      show(t(mode === 'add' ? 'bulkTagsAdded' : 'bulkTagsRemoved', { count: tickers.length, tag }));
      return true;
    } catch {
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

  // ─── Drag-and-drop handlers ───
  // Card drag (within column body)
  function onCardDragStart(e: React.DragEvent, ticker: string, fromGroup: string) {
    setDragKind('card');
    setDragTicker(ticker);
    setDragFromGroup(fromGroup);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ticker);
    // Apply 'grabbing' cursor to the whole document during drag so the
    // experience matches Trello / Linear regardless of where the cursor goes.
    document.body.style.cursor = 'grabbing';
  }

  // Column drag (from column header)
  function onColumnDragStart(e: React.DragEvent, columnId: string) {
    setDragKind('column');
    setDragColumnId(columnId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-watchlist-column', columnId);
    document.body.style.cursor = 'grabbing';
  }

  const onDragEnd = useCallback(() => {
    setDragKind(null);
    setDragTicker(null);
    setDragFromGroup(null);
    setDragColumnId(null);
    setDropTargetGroup(null);
    setDropTargetColumnId(null);
    dragOverCounters.current = {};
    document.body.style.cursor = '';
  }, []);

  // Column body drop zone (cards only)
  function onColumnDragEnter(groupId: string) {
    if (dragKind !== 'card') return;
    const counters = dragOverCounters.current;
    counters[groupId] = (counters[groupId] || 0) + 1;
    setDropTargetGroup(groupId);
  }

  function onColumnDragLeave(groupId: string) {
    if (dragKind !== 'card') return;
    const counters = dragOverCounters.current;
    counters[groupId] = Math.max(0, (counters[groupId] || 0) - 1);
    if (counters[groupId] === 0) {
      setDropTargetGroup((cur) => (cur === groupId ? null : cur));
    }
  }

  function onColumnDragOver(e: React.DragEvent, groupId: string) {
    if (dragKind === 'card') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    } else if (dragKind === 'column') {
      // Column being dragged over another column header — allow drop on the
      // column shell so the user has a wider drop zone
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragColumnId && dragColumnId !== groupId) setDropTargetColumnId(groupId);
    }
  }

  function onColumnDrop(e: React.DragEvent, toGroup: string) {
    e.preventDefault();
    if (dragKind === 'card' && dragTicker && dragFromGroup) {
      if (dragFromGroup !== toGroup) moveTicker(dragTicker, dragFromGroup, toGroup);
    } else if (dragKind === 'column' && dragColumnId && dragColumnId !== toGroup) {
      reorderColumn(dragColumnId, toGroup);
    }
    onDragEnd();
  }

  function moveTicker(ticker: string, fromGroup: string, toGroup: string) {
    const next = groups.map((g) => {
      if (g.id === fromGroup) return { ...g, tickers: g.tickers.filter((t) => t !== ticker) };
      if (g.id === toGroup && !g.tickers.includes(ticker)) return { ...g, tickers: [...g.tickers, ticker] };
      return g;
    });
    persist(next);
    const toName = groups.find((g) => g.id === toGroup)?.name || toGroup;
    show(t('movedTo', { ticker, group: toName }));
  }

  function reorderColumn(fromId: string, toId: string) {
    const fromIdx = groups.findIndex((g) => g.id === fromId);
    const toIdx = groups.findIndex((g) => g.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const next = [...groups];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persist(next);
    show(t('reordered', { name: moved.name }));
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
      const response = await fetch(`/api/watchlist/export?format=${format}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('watchlist_export_failed');
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
    <>
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
      />

      {conflictSnapshot && (
        <WatchlistSyncConflict
          onUseServer={() => resolveSyncConflict('server')}
          onKeepLocal={() => resolveSyncConflict('local')}
          onMerge={() => resolveSyncConflict('merge')}
        />
      )}

      {!user && isSupabaseConfigured() && (
        <div className="card-base mb-3 flex items-center justify-between bg-accent-dim/10 text-sm">
          <span>
            {t('guestBanner')}
            <Link href="/login" className="font-semibold">{t('guestLogin')}</Link>{t('guestSuffix')}
          </span>
        </div>
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
          overviewLoadingMore={overview.loadingMore}
          onLoadMoreOverview={overview.loadMore}
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
            isDropTarget={dropTargetGroup === g.id && dragKind === 'card'}
            isColumnDropTarget={dropTargetColumnId === g.id && dragKind === 'column'}
            isBeingDragged={dragColumnId === g.id && dragKind === 'column'}
            dragTicker={dragTicker}
            isAdding={addingInGroup === g.id}
            openMenuTicker={openMenuTicker}
            onDragOver={(e) => onColumnDragOver(e, g.id)}
            onDragEnter={() => onColumnDragEnter(g.id)}
            onDragLeave={() => onColumnDragLeave(g.id)}
            onDrop={(e) => onColumnDrop(e, g.id)}
            onColumnDragStart={(e) => onColumnDragStart(e, g.id)}
            onCardDragStart={(e, t) => onCardDragStart(e, t, g.id)}
            onCardDragEnd={onDragEnd}
            onRetryTicker={refetch}
            onAddOpen={() => setAddingInGroup(g.id)}
            onAddClose={() => setAddingInGroup(null)}
            onCardMove={(ticker, toGroupId) => moveTicker(ticker, g.id, toGroupId)}
            onCardRemove={removeTicker}
            onOpenMenu={(ticker) => setOpenMenuTicker((cur) => (cur === ticker ? null : ticker))}
            onQuickView={setQuickViewTicker}
            onRename={() => renameColumn(g.id)}
            onDelete={() => deleteColumn(g.id)}
            onTickerAdded={(info) => {
              const exists = groups.some((gg) => gg.tickers.includes(info.t));
              if (exists) {
                trackEvent('watchlist_add_duplicate', { ticker: info.t });
                show(t('alreadyInWatchlist', { ticker: info.t }));
                return;
              }
              trackEvent('watchlist_stock_added', { ticker: info.t, group: g.name, market: info.m });
              setLastAdded(info);
              setSecurityIdentities((current) => ({ ...current, [info.t]: info }));
              persist(
                groups.map((gg) => (gg.id === g.id ? { ...gg, tickers: [...gg.tickers, info.t] } : gg))
              );
              show(t('addedTo', { group: g.name, name: info.n, ticker: info.t }));
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
          onClose={() => setQuickViewTicker(null)}
        />
      )}

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
    </>
  );
}
