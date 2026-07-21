'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MarketLabel } from '@/components/MarketLabel';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatPrice, formatPct, changeClass, classifyMarket, currencyOfMarket } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';
import { useToast } from '@/components/Toast';
import { useBatchQuotes, type LiveQuote } from '@/lib/hooks/useQuote';
import { normalizeWindTicker } from '@/lib/stocks/wind-normalize';
import { WatchlistTable } from '@/components/WatchlistTable';
import { WatchlistOnboarding } from '@/components/WatchlistOnboarding';
import { PostAddInsight } from '@/components/PostAddInsight';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { AssetType, Market } from '@/lib/supabase/database.types';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { uniqueWatchlistTickers, type WatchlistGroup } from '@/lib/watchlist/store';
import { formatDateLocale, type AppLocale } from '@/lib/i18n/locale';
import { trackEvent } from '@/lib/analytics/client';
import {
  SAMPLE_TICKERS,
  createPrimaryBoard,
  installSampleBoard,
} from '@/lib/watchlist/onboarding';
import { classifyAssetType } from '@/lib/stocks/asset-type';
import { canAddResult, nextSearchAction } from '@/lib/watchlist/security-validation';

const REFRESH_MS = 60_000;

type Group = WatchlistGroup;
interface SearchResult {
  t: string;
  n: string;
  py: string;
  m: Market;
  asset_type: AssetType;
  selectable?: boolean;
  verification_status?: string;
  list_status?: string;
}

interface WatchlistDbRow {
  id: string;
  name: string;
  watchlist_items: Array<{ ticker: string; sort_order: number }> | null;
}

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
  const { groups, hydrated, setGroups } = useWatchlist();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  // Default to the table view (评级/风险/目标价/估值区间 are the high-signal columns);
  // the user's last choice is remembered.
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
  const [lastAdded, setLastAdded] = useState<SearchResult | null>(null);
  const [securityIdentities, setSecurityIdentities] = useState<Record<string, SearchResult>>({});
  const watchlistViewTracked = useRef(false);
  const postAddTracked = useRef<string | null>(null);

  // ─── Optional Supabase overlay for signed-in users ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isSupabaseConfigured()) {
          const sb = getBrowserSupabase();
          const { data: { user: u } } = await sb.auth.getUser();
          if (u && !cancelled) {
            setUser({ id: u.id, email: u.email });
            const { data: wl } = await sb
              .from('watchlists')
              .select('id, name, watchlist_items (ticker, sort_order)')
              .order('sort_order');
            if (wl && wl.length > 0) {
              const groupsFromDb: Group[] = (wl as unknown as WatchlistDbRow[]).map((w) => ({
                id: w.id,
                name: w.name,
                tickers: (w.watchlist_items || [])
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((item) => item.ticker),
              }));
              setGroups(groupsFromDb);
              return;
            }
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [setGroups]);

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
        const rows: SearchResult[] = [];
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
    if (!confirm(t('confirmRemove', { ticker }))) return;
    const next = groups.map((g) => ({ ...g, tickers: g.tickers.filter((t) => t !== ticker) }));
    persist(next);
    show(t('removed', { ticker }));
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
    const next = prompt(t('renamePrompt', { name: cur.name }), cur.name);
    if (!next || !next.trim() || next.trim() === cur.name) return;
    persist(groups.map((g) => (g.id === id ? { ...g, name: next.trim() } : g)));
  }

  function deleteColumn(id: string) {
    const cur = groups.find((g) => g.id === id);
    if (!cur) return;
    if (cur.tickers.length > 0) {
      if (!confirm(t('deleteConfirmWithStocks', { name: cur.name, count: cur.tickers.length }))) return;
    } else if (!confirm(t('deleteConfirmEmpty', { name: cur.name }))) return;
    persist(groups.filter((g) => g.id !== id));
  }

  // ─── Batch import ───
  function importBatch(tickers: string[], boardName: string) {
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
    show(
      skipped.length > 0
        ? t('importDoneDedup', { fresh: fresh.length, name: finalName, skipped: skipped.length })
        : t('importDone', { fresh: fresh.length, name: finalName })
    );
  }

  // ─── Export ───
  function exportYaml() {
    const lines = ['# osbornalpha watchlist', 'version: 1', '', 'groups:'];
    for (const g of groups) {
      lines.push(`  - id: ${g.id}`);
      lines.push(`    name: "${g.name}"`);
      lines.push(`    tickers:`);
      for (const tk of g.tickers) lines.push(`      - "${tk}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watchlist-${new Date().toISOString().slice(0, 10)}.yml`;
    a.click();
    URL.revokeObjectURL(url);
    show(t('exportDone'));
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{t('heading')}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-dim">
            <span>
              {viewMode === 'kanban' ? t('hintKanban') : t('hintTable')}
              {' · '}{t('autoRefresh', { seconds: REFRESH_MS / 1000 })}
            </span>
            {quotesLoading && allTickers.length > 0 && <span className="text-accent">{t('loadingQuotes')}</span>}
            {!quotesLoading && failedTickers.length > 0 && (
              <span className="text-down">
                {t('quotesFailed', { count: failedTickers.length })}
              </span>
            )}
          </div>
        </div>
        <div className="flex w-full gap-1.5 overflow-x-auto pb-1 sm:w-auto sm:shrink-0 sm:overflow-visible sm:pb-0">
          <div className="flex shrink-0 overflow-hidden rounded-md border border-border text-xs">
            <button
              onClick={() => setView('kanban')}
              className={`whitespace-nowrap px-3 py-1.5 ${viewMode === 'kanban' ? 'bg-accent-dim/20 font-semibold text-accent' : 'text-text-dim hover:text-text'}`}
              title={t('viewKanbanTitle')}
            >
              {t('viewKanban')}
            </button>
            <button
              onClick={() => setView('table')}
              className={`whitespace-nowrap border-l border-border px-3 py-1.5 ${viewMode === 'table' ? 'bg-accent-dim/20 font-semibold text-accent' : 'text-text-dim hover:text-text'}`}
              title={t('viewTableTitle')}
            >
              {t('viewTable')}
            </button>
          </div>
          <button
            onClick={refreshQuotes}
            disabled={allTickers.length === 0 || quotesLoading}
            className="whitespace-nowrap rounded-md bg-bg-card px-3 py-1.5 text-xs text-text-dim hover:text-text disabled:opacity-50"
            title={t('refreshTitle')}
          >
            {t('refresh')}
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="whitespace-nowrap rounded-md bg-accent-dim/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-dim/25"
            title={t('importBatchTitle')}
          >
            {t('importBatch')}
          </button>
          <button
            onClick={exportYaml}
            className="whitespace-nowrap rounded-md bg-bg-card px-3 py-1.5 text-xs text-text-dim hover:text-text"
          >
            {t('export')}
          </button>
        </div>
      </div>

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

      {/* ─── Table view (评级 / 风险 / 目标价 / 估值区间) ─── */}
      {hydrated && allTickers.length > 0 && viewMode === 'table' && <WatchlistTable groups={groups} quotes={quotes} loading={quotesLoading} />}

      {/* ─── Kanban Board ─── */}
      {hydrated && viewMode === 'kanban' && (
      <div
        className="flex gap-3 overflow-x-auto pb-3"
        style={{ scrollSnapType: 'x mandatory' }}
        onClick={() => setOpenMenuTicker(null)}
      >
        {groups.map((g) => (
          <KanbanColumn
            key={g.id}
            group={g}
            allGroups={groups}
            quotes={quotes}
            securityIdentities={securityIdentities}
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

      {importOpen && (
        <ImportDialog
          existingTickerCount={allTickers.length}
          existingTickers={new Set(allTickers.map((t) => t.toUpperCase()))}
          onCancel={() => setImportOpen(false)}
          onConfirm={importBatch}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Kanban Column
// ──────────────────────────────────────────────────────────────────────────

interface ColumnProps {
  group: Group;
  allGroups: Group[];
  quotes: Record<string, LiveQuote | null>;
  securityIdentities: Record<string, SearchResult>;
  loadedAt: number | null;
  isDropTarget: boolean;            // card being dragged into this column
  isColumnDropTarget: boolean;      // another column being dragged onto this one
  isBeingDragged: boolean;          // this column is the one being dragged
  dragTicker: string | null;
  isAdding: boolean;
  openMenuTicker: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onColumnDragStart: (e: React.DragEvent) => void;
  onCardDragStart: (e: React.DragEvent, ticker: string) => void;
  onCardDragEnd: () => void;
  onRetryTicker: () => void;
  onAddOpen: () => void;
  onAddClose: () => void;
  onCardMove: (ticker: string, toGroupId: string) => void;
  onCardRemove: (ticker: string) => void;
  onOpenMenu: (ticker: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onTickerAdded: (info: SearchResult) => void;
}

function KanbanColumn(props: ColumnProps) {
  const {
    group, allGroups, quotes, securityIdentities, loadedAt,
    isDropTarget, isColumnDropTarget, isBeingDragged,
    dragTicker, isAdding, openMenuTicker,
    onDragOver, onDragEnter, onDragLeave, onDrop,
    onColumnDragStart, onCardDragStart, onCardDragEnd, onRetryTicker,
    onAddOpen, onAddClose, onCardMove, onCardRemove, onOpenMenu,
    onRename, onDelete, onTickerAdded,
  } = props;
  const t = useTranslations('market.watchlist.kanban');

  // Visual states stack:
  //   - isBeingDragged: this column is the one being dragged → fade out
  //   - isColumnDropTarget: another column hovering this → left/right indicator
  //   - isDropTarget: card hovering this → fill highlight
  const shellClass = isBeingDragged
    ? 'border-border bg-bg-card opacity-40'
    : isColumnDropTarget
    ? 'border-accent bg-bg-card ring-2 ring-accent/40'
    : isDropTarget
    ? 'border-accent bg-accent-dim/10'
    : 'border-border bg-bg-card';

  return (
    <div
      className={`flex shrink-0 flex-col rounded-lg border ${shellClass} transition-all`}
      style={{ width: 'min(85vw, 300px)', maxHeight: '78vh', scrollSnapAlign: 'start' }}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header — draggable for column reorder */}
      <div
        draggable
        onDragStart={onColumnDragStart}
        onDragEnd={onCardDragEnd}
        className="flex items-center justify-between border-b border-border px-3 py-2.5 select-none"
        style={{ cursor: 'grab' }}
        title={t('reorderTitle')}
      >
        <div className="flex items-center gap-2">
          <span className="text-text-muted" aria-hidden="true">⠿</span>
          <span className="text-sm font-semibold">{group.name}</span>
          <span className="rounded-full bg-bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-text-dim">
            {group.tickers.length}
          </span>
        </div>
        <div className="flex gap-0.5" onDragStart={(e) => e.preventDefault()}>
          <button
            onClick={(e) => { e.stopPropagation(); onRename(); }}
            title={t('rename')}
            className="rounded p-1 text-text-dim hover:bg-bg-elevated hover:text-text"
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title={t('delete')}
            className="rounded p-1 text-text-dim hover:bg-down/10 hover:text-down"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {group.tickers.length === 0 && !isAdding && (
          <div className="rounded border border-dashed border-border/60 py-6 text-center text-[11px] text-text-muted">
            {t('dropHint')}<br />
            {t('orAddBelow')}
          </div>
        )}

        {group.tickers.map((ticker) => (
          <StockCard
            key={ticker}
            ticker={ticker}
            quote={quotes[ticker] || null}
            identity={securityIdentities[ticker]}
            loadedAt={loadedAt}
            isDragging={dragTicker === ticker}
            menuOpen={openMenuTicker === ticker}
            currentGroupId={group.id}
            allGroups={allGroups}
            onDragStart={(e) => onCardDragStart(e, ticker)}
            onDragEnd={onCardDragEnd}
            onMove={(to) => onCardMove(ticker, to)}
            onRemove={() => onCardRemove(ticker)}
            onRetry={onRetryTicker}
            onToggleMenu={() => onOpenMenu(ticker)}
          />
        ))}

        {isAdding ? (
          <AddStockInline onAdd={onTickerAdded} onClose={onAddClose} />
        ) : (
          <button
            onClick={onAddOpen}
            className="w-full rounded border border-dashed border-border bg-transparent px-2 py-1.5 text-xs text-text-dim hover:border-accent-dim hover:text-accent"
          >
            {t('addStock')}
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Stock Card
// ──────────────────────────────────────────────────────────────────────────

interface CardProps {
  ticker: string;
  quote: LiveQuote | null;
  identity?: SearchResult;
  loadedAt: number | null;
  isDragging: boolean;
  menuOpen: boolean;
  currentGroupId: string;
  allGroups: Group[];
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (toGroupId: string) => void;
  onRemove: () => void;
  onRetry: () => void;
  onToggleMenu: () => void;
}

function StockCard({
  ticker, quote, identity, loadedAt, isDragging, menuOpen, currentGroupId, allGroups,
  onDragStart, onDragEnd, onMove, onRemove, onRetry, onToggleMenu,
}: CardProps) {
  const t = useTranslations('market.watchlist.kanban');
  const market = quote?.market || identity?.m || classifyMarket(ticker);
  const name = quote?.name || identity?.n || ticker;
  const currency = quote?.currency || currencyOfMarket(market);
  const hasPrice = !!quote && quote.price > 0;
  // Distinguish "still loading first batch" from "loaded but failed":
  // - loadedAt === null  → first batch hasn't returned yet → 加载中…
  // - loadedAt !== null && !hasPrice → load completed but no usable quote → 失败 state
  const isFailed = loadedAt !== null && !hasPrice;
  const otherGroups = allGroups.filter((g) => g.id !== currentGroupId);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative rounded-lg border bg-bg-elevated p-2.5 transition-all ${
        isDragging
          ? 'border-accent opacity-50 shadow-lg shadow-accent/20'
          : isFailed
          ? 'border-down/40 hover:border-down/70'
          : 'border-border hover:border-accent-dim'
      }`}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: isDragging ? 'rotate(-1.5deg) scale(0.98)' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/stock/${encodeURIComponent(ticker)}`} className="min-w-0 flex-1 text-text hover:no-underline">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
              <MarketLabel m={market} />
            </span>
            <span className="truncate text-sm font-semibold">{name}</span>
          </div>
          <div className="tabular mt-0.5 text-[11px] text-text-muted">{ticker}</div>
        </Link>

        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleMenu(); }}
          className="rounded p-1 text-text-dim hover:bg-bg-card hover:text-text"
          title={t('moveMenu')}
        >
          ⋯
        </button>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        {hasPrice ? (
          <>
            <span className="text-base font-semibold tabular-nums">
              {currency}{formatPrice(quote!.price)}
            </span>
            <span className={`text-xs tabular-nums ${changeClass(quote!.change_pct)}`}>
              {formatPct(quote!.change_pct)}
            </span>
          </>
        ) : isFailed ? (
          <>
            <span className="text-[11px] text-down" title={t('fetchFailedTitle')}>
              {t('fetchFailed')}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRetry(); }}
              className="rounded border border-down/40 px-1.5 py-0.5 text-[10px] text-down hover:bg-down/10"
              title={t('retryTitle')}
            >
              {t('retry')}
            </button>
          </>
        ) : (
          <>
            <span className="text-text-muted">—</span>
            <span className="text-xs text-text-muted">{t('loading')}</span>
          </>
        )}
      </div>

      {menuOpen && (
        <div
          className="absolute right-2 top-9 z-20 w-40 rounded-lg border border-border bg-bg-elevated p-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase text-text-muted">{t('moveTo')}</div>
          {otherGroups.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-text-muted">{t('noOtherColumns')}</div>
          )}
          {otherGroups.map((g) => (
            <button
              key={g.id}
              onClick={() => { onMove(g.id); onToggleMenu(); }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-bg-card"
            >
              {t('moveToArrow', { name: g.name })}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            onClick={() => { onRemove(); onToggleMenu(); }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-down hover:bg-down/10"
          >
            {t('removeFromWatchlist')}
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Inline Add Stock (within a column)
// ──────────────────────────────────────────────────────────────────────────

interface AddInlineProps {
  onAdd: (info: SearchResult) => void;
  onClose: () => void;
}

function AddStockInline({ onAdd, onClose }: AddInlineProps) {
  const t = useTranslations('market.watchlist.kanban');
  const assetTypes = useTranslations('market.watchlist.assetTypes');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function runSearch(q: string) {
    trackEvent('stock_search_submitted', { query_length: q.length });
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const searchResponse = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      const data = await searchResponse.json();
      let nextResults = (data.results || []).map((result: Omit<SearchResult, 'asset_type'> & { asset_type?: AssetType }) => ({
          ...result,
          asset_type: result.asset_type ?? classifyAssetType({ ticker: result.t, name: result.n }),
      }));
      trackEvent('stock_search_completed', { query_length: q.length, results: nextResults.length });

      if (nextSearchAction({ localResults: nextResults, query: q }) === 'resolve') {
        trackEvent('security_resolve_started', { query_length: q.length });
        const resolveResponse = await fetch('/api/securities/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
          signal: ctrl.signal,
        });
        if (resolveResponse.ok) {
          const resolved = await resolveResponse.json();
          nextResults = resolved.result ? [{
            ...resolved.result,
            asset_type: resolved.result.asset_type
              ?? classifyAssetType({ ticker: resolved.result.t, name: resolved.result.n }),
          }] : [];
          trackEvent('security_resolve_completed', {
            query_length: q.length,
            selectable: nextResults.some(canAddResult),
          });
        } else {
          trackEvent('security_resolve_failed', { query_length: q.length, status: resolveResponse.status });
        }
      }

      setResults(nextResults);
      setFocusIdx(nextResults.findIndex(canAddResult));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      trackEvent('stock_search_failed', { query_length: q.length });
      setResults([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  function onChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(v.trim()), 250);
  }

  function confirmAdd() {
    const selectableResults = results.filter(canAddResult);
    if (selectableResults.length > 0) {
      const focused = focusIdx >= 0 ? results[focusIdx] : undefined;
      const target = focused && canAddResult(focused) ? focused : selectableResults[0];
      selectResult(target);
      setQuery('');
      setResults([]);
      inputRef.current?.focus();
      return;
    }
    if (query.trim()) void runSearch(query.trim());
  }

  function selectResult(result: SearchResult) {
    if (!canAddResult(result)) return;
    trackEvent('stock_search_result_clicked', {
      ticker: result.t,
      market: result.m,
      asset_type: result.asset_type,
      rank: Math.max(0, results.findIndex((row) => row.t === result.t)),
    });
    onAdd(result);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); }
    else if (e.key === 'Escape') { onClose(); }
    else if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault(); setFocusIdx((i) => (i + 1) % results.length);
    }
    else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault(); setFocusIdx((i) => (i - 1 + results.length) % results.length);
    }
  }

  return (
    <div className="rounded-lg border border-accent-dim bg-bg-elevated p-2">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('searchPlaceholder')}
        className="w-full text-xs"
        autoComplete="off"
      />
      {results.length > 0 && (
        <div className="mt-1.5 max-h-44 overflow-y-auto rounded border border-border bg-bg-card">
          {results.map((r, i) => (
            <button
              key={`${r.t}-${i}`}
              onClick={() => {
                if (!canAddResult(r)) return;
                selectResult(r); setQuery(''); setResults([]); inputRef.current?.focus();
              }}
              onMouseEnter={() => setFocusIdx(i)}
              disabled={!canAddResult(r)}
              className={`grid w-full grid-cols-[auto_1fr] items-center gap-2 border-b border-border px-2 py-1.5 text-left last:border-b-0 ${
                i === focusIdx ? 'bg-bg-elevated' : 'hover:bg-bg-elevated'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="rounded bg-bg-elevated px-1 py-0.5 text-[9px] font-semibold text-text-dim">
                <MarketLabel m={r.m} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">{r.n}</div>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-text-dim">
                  <span className="truncate">{r.t}</span>
                  <span aria-hidden="true">·</span>
                  <span>{assetTypes(r.asset_type)}</span>
                  {!canAddResult(r) && <span>{t('pendingVerification')}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {query.trim() && !loading && results.length === 0 && (
        <div className="mt-1.5 text-[10px] text-text-muted">
          {t('noMatch', { query: query.trim() })}
          {normalizeWindTicker(query.trim()) !== query.trim().toUpperCase()
            ? ` ${t('normalizedNote', { canonical: normalizeWindTicker(query.trim()) })}`
            : ''}
        </div>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <button
          onClick={confirmAdd}
          disabled={loading || !results.some(canAddResult)}
          className="flex-1 rounded bg-accent-dim px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? t('searching') : t('add')}
        </button>
        <button onClick={onClose} className="rounded border border-border px-2 py-1 text-[11px] text-text-dim">
          {t('done')}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Batch Import Dialog
// ──────────────────────────────────────────────────────────────────────────

interface ImportDialogProps {
  existingTickerCount: number;
  existingTickers: Set<string>;
  onCancel: () => void;
  onConfirm: (tickers: string[], boardName: string) => void;
}

/**
 * Parse free-form ticker input. Accepts:
 *   - CSV (single column, or first column with header row auto-skipped)
 *   - Comma-separated:    600519.SH, 002594.SZ, AAPL
 *   - Newline-separated:  one per line
 *   - Whitespace-mixed:   anything that splits on /[\s,;]+/
 *
 * Header detection: first row is dropped if it contains any non-ticker-shaped
 * cell (e.g. "ticker", "代码", "name"). A ticker shape is one of:
 *   - 6 digits + .SH/.SZ/.BJ (A-share)
 *   - 5 digits + .HK
 *   - 1-6 letters (US, including dots like BRK.B)
 */
function parseTickerInput(raw: string): string[] {
  if (!raw.trim()) return [];

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // CSV: take first column of each line. Also splits comma/semicolon lists.
  const cells: string[] = [];
  for (const line of lines) {
    const parts = line.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) cells.push(...parts);
  }

  // Digit-led shapes: A (6 digits), HK (5), JP .T (4), KR .KS/.KQ (6), TW .TW/.TWO (4-6).
  const tickerRegex = /^(\d{6}\.(SH|SZ|BJ)|\d{5}\.HK|\d{4}\.T|\d{6}\.(KS|KQ)|\d{4,6}\.(TW|TWO)|[A-Z][A-Z.]{0,9})$/;
  const looksLikeTicker = (s: string) => tickerRegex.test(s.toUpperCase());

  // Drop the first cell if it's clearly a header label, not a ticker.
  // Header check runs against the *normalized* first cell, so a Wind code
  // like "AAPL.O" doesn't get mistaken for a header.
  const out: string[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (i === 0 && !looksLikeTicker(normalizeWindTicker(cell))) continue; // skip header
    // Final whitespace split (handles "600519.SH AAPL TSLA" on one line)
    for (const tok of cell.split(/\s+/)) {
      const upper = tok.trim().toUpperCase();
      if (!upper) continue;
      // Normalize Wind / Sina / Yahoo / Snowball dialects to canonical form
      const canonical = normalizeWindTicker(upper);
      // Be permissive on import; the user has signalled intent. Only reject
      // pure garbage (no alphanumeric).
      if (/[A-Z0-9]/.test(canonical)) out.push(canonical);
    }
  }
  return out;
}

function ImportDialog({ existingTickerCount, existingTickers, onCancel, onConfirm }: ImportDialogProps) {
  const t = useTranslations('market.watchlist.import');
  const tw = useTranslations('market.watchlist');
  const locale = useLocale() as AppLocale;
  const [text, setText] = useState('');
  const [boardName, setBoardName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  const parsed = useMemo(() => parseTickerInput(text), [text]);
  const dedupStats = useMemo(() => {
    const seen = new Set<string>();
    let fresh = 0;
    let duplicateOfExisting = 0;
    let duplicateWithinInput = 0;
    for (const t of parsed) {
      if (existingTickers.has(t)) {
        duplicateOfExisting++;
      } else if (seen.has(t)) {
        duplicateWithinInput++;
      } else {
        seen.add(t);
        fresh++;
      }
    }
    return { fresh, duplicateOfExisting, duplicateWithinInput, total: parsed.length };
  }, [parsed, existingTickers]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Excel files compress well — allow 2 MB
    const maxSize = 1024 * 1024 * 2;
    if (file.size > maxSize) {
      setFileError(t('fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }));
      e.target.value = '';
      return;
    }
    setFileError(null);
    const ext = file.name.toLowerCase().split('.').pop() || '';
    const isExcel = ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'xlsb';

    try {
      if (isExcel) {
        // Lazy-load SheetJS — only fetched when an Excel file is actually picked
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const lines: string[] = [];
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          // sheet_to_csv handles merged cells, formulas (as values), and quoting.
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          if (csv.trim()) lines.push(csv);
        }
        const content = lines.join('\n');
        if (!content.trim()) {
          setFileError(t('excelEmpty'));
          e.target.value = '';
          return;
        }
        setText((cur) => (cur.trim() ? cur + '\n' + content : content));
      } else {
        // CSV / TXT — plain text read
        const content = await file.text();
        setText((cur) => (cur.trim() ? cur + '\n' + content : content));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('unknownError');
      setFileError(t('readFailed', { message }));
    }
    e.target.value = '';  // allow re-select same file
  }

  const canConfirm = dedupStats.fresh > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-bg-elevated p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-text-dim hover:bg-bg-card hover:text-text"
          >
            ×
          </button>
        </div>

        <div className="mb-3 text-[11px] text-text-dim">
          {t('existingCountPrefix')} <span className="font-semibold tabular-nums text-text">{existingTickerCount}</span> {t('existingCountSuffix')}
        </div>

        {/* Board name */}
        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-text-dim">{t('boardNameLabel')}</span>
          <input
            type="text"
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            placeholder={t('boardNamePlaceholder', { defaultName: tw('importDefaultName', { date: formatDateLocale(new Date().toISOString(), locale) }) })}
            className="w-full text-sm"
          />
        </label>

        {/* Text paste */}
        <label className="mb-2 block">
          <span className="mb-1 block text-xs text-text-dim">{t('pasteLabel')}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('pastePlaceholder')}
            rows={6}
            className="w-full font-mono text-xs"
            style={{ resize: 'vertical' }}
          />
        </label>

        {/* File upload */}
        <div className="mb-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border bg-bg-card px-3 py-1.5 text-xs text-text-dim hover:text-text">
            <span>{t('uploadFile')}</span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls,.xlsm,.xlsb,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroenabled.12"
              onChange={onFile}
              className="hidden"
            />
          </label>
          {fileError && (
            <span className="ml-2 text-[11px] text-down">{fileError}</span>
          )}
          <div className="mt-1 text-[10px] text-text-muted">
            {t('supportedFormats')}
          </div>
          <div className="mt-1 text-[10px] text-text-muted">
            {t('dialectHint')}
          </div>
        </div>

        {/* Preview */}
        {parsed.length > 0 && (
          <div className="mb-3 rounded border border-border bg-bg-card p-2.5 text-[11px]">
            <div className="mb-1.5 flex items-baseline gap-3 text-text-dim">
              <span>{t('parsedTotal', { total: dedupStats.total })}</span>
              <span className="text-up">{t('parsedFresh', { fresh: dedupStats.fresh })}</span>
              {dedupStats.duplicateOfExisting > 0 && (
                <span className="text-text-muted">
                  {t('parsedDupExisting', { count: dedupStats.duplicateOfExisting })}
                </span>
              )}
              {dedupStats.duplicateWithinInput > 0 && (
                <span className="text-text-muted">
                  {t('parsedDupWithinInput', { count: dedupStats.duplicateWithinInput })}
                </span>
              )}
            </div>
            <div className="max-h-28 overflow-y-auto rounded bg-bg-elevated p-1.5 font-mono text-[10px] leading-relaxed">
              {Array.from(new Set(parsed)).map((tk) => (
                <span
                  key={tk}
                  className={`mr-1.5 inline-block ${existingTickers.has(tk) ? 'text-text-muted line-through' : 'text-text'}`}
                  title={existingTickers.has(tk) ? t('willSkipTitle') : t('willImportTitle')}
                >
                  {tk}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button
            onClick={onCancel}
            className="rounded border border-border px-3 py-1.5 text-xs text-text-dim"
          >
            {tw('cancel')}
          </button>
          <button
            onClick={() => {
              const seen = new Set<string>();
              const fresh: string[] = [];
              for (const tk of parsed) {
                if (existingTickers.has(tk) || seen.has(tk)) continue;
                seen.add(tk);
                fresh.push(tk);
              }
              onConfirm(fresh, boardName);
            }}
            disabled={!canConfirm}
            className="rounded bg-accent-dim px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {canConfirm ? t('confirmImport', { count: dedupStats.fresh }) : t('noneToImport')}
          </button>
        </div>
      </div>
    </div>
  );
}
