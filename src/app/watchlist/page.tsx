'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { MOCK_DATA } from '@/lib/data/mock';
import { addCustomStock } from '@/lib/data/custom-stocks';
import { formatPrice, formatPct, changeClass, marketLabel, classifyMarket } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';
import { useToast } from '@/components/Toast';
import { useBatchQuotes, type LiveQuote } from '@/lib/hooks/useQuote';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Market } from '@/lib/supabase/database.types';

const STORAGE_KEY = 'stock-monitor:watchlist:v2';
const REFRESH_MS = 60_000;

interface Group { id: string; name: string; tickers: string[] }
interface SearchResult { t: string; n: string; py: string; m: Market }

export default function WatchlistPage() {
  const { show } = useToast();
  const [groups, setGroups] = useState<Group[]>(() =>
    MOCK_DATA.watchlist_groups.map((g) => ({ id: g.id, name: g.name, tickers: [...g.tickers] }))
  );
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Drag state — single source of truth
  const [dragTicker, setDragTicker] = useState<string | null>(null);
  const [dragFromGroup, setDragFromGroup] = useState<string | null>(null);
  const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);

  // Per-column add UI: which column has the add panel open
  const [addingInGroup, setAddingInGroup] = useState<string | null>(null);

  // New column UI
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Mobile move menu (per-card kebab) — which ticker's menu is open
  const [openMenuTicker, setOpenMenuTicker] = useState<string | null>(null);

  // ─── Hydrate watchlist (Supabase → localStorage → mock) ───
  useEffect(() => {
    (async () => {
      try {
        if (isSupabaseConfigured()) {
          const sb = getBrowserSupabase();
          const { data: { user: u } } = await sb.auth.getUser();
          if (u) {
            setUser({ id: u.id, email: u.email });
            const { data: wl } = await sb
              .from('watchlists')
              .select('id, name, watchlist_items (ticker, sort_order)')
              .order('sort_order');
            if (wl && wl.length > 0) {
              const groupsFromDb: Group[] = wl.map((w: any) => ({
                id: w.id,
                name: w.name,
                tickers: (w.watchlist_items || [])
                  .sort((a: any, b: any) => a.sort_order - b.sort_order)
                  .map((it: any) => it.ticker),
              }));
              setGroups(groupsFromDb);
              setHydrated(true);
              return;
            }
          }
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setGroups(JSON.parse(raw));
      } catch {}
      setHydrated(true);
    })();
  }, []);

  function persist(next: Group[]) {
    setGroups(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  // ─── Live quotes (batch) ───
  const allTickers = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) for (const t of g.tickers) set.add(t);
    return Array.from(set);
  }, [groups]);

  const { quotes, loading: quotesLoading } = useBatchQuotes(allTickers, {
    refreshIntervalMs: REFRESH_MS,
  });

  // ─── Drag-and-drop handlers ───
  function onDragStart(e: React.DragEvent, ticker: string, fromGroup: string) {
    setDragTicker(ticker);
    setDragFromGroup(fromGroup);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ticker);
  }

  function onDragEnd() {
    setDragTicker(null);
    setDragFromGroup(null);
    setDropTargetGroup(null);
  }

  function onColumnDragOver(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    setDropTargetGroup(groupId);
  }

  function onColumnDrop(e: React.DragEvent, toGroup: string) {
    e.preventDefault();
    if (!dragTicker || !dragFromGroup) return;
    if (dragFromGroup === toGroup) {
      onDragEnd();
      return;
    }
    moveTicker(dragTicker, dragFromGroup, toGroup);
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
    show(`✓ ${ticker} → ${toName}`);
  }

  // ─── Card actions ───
  function removeTicker(ticker: string) {
    if (!confirm(`从股票池移除 ${ticker} ?`)) return;
    const next = groups.map((g) => ({ ...g, tickers: g.tickers.filter((t) => t !== ticker) }));
    persist(next);
    show(`✓ 已移除：${ticker}`);
  }

  // ─── Column management ───
  function addColumn() {
    const name = newColumnName.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    persist([...groups, { id, name, tickers: [] }]);
    setNewColumnName('');
    setNewColumnOpen(false);
    show(`✓ 已新增看板：${name}`);
  }

  function renameColumn(id: string) {
    const cur = groups.find((g) => g.id === id);
    if (!cur) return;
    const next = prompt(`重命名「${cur.name}」`, cur.name);
    if (!next || !next.trim() || next.trim() === cur.name) return;
    persist(groups.map((g) => (g.id === id ? { ...g, name: next.trim() } : g)));
  }

  function deleteColumn(id: string) {
    const cur = groups.find((g) => g.id === id);
    if (!cur) return;
    if (cur.tickers.length > 0) {
      if (!confirm(`删除「${cur.name}」？该列还有 ${cur.tickers.length} 只股票，将一并移除。`)) return;
    } else if (!confirm(`删除「${cur.name}」？`)) return;
    persist(groups.filter((g) => g.id !== id));
  }

  // ─── Export ───
  function exportYaml() {
    const lines = ['# Stock Monitor watchlist', 'version: 1', '', 'groups:'];
    for (const g of groups) {
      lines.push(`  - id: ${g.id}`);
      lines.push(`    name: "${g.name}"`);
      lines.push(`    tickers:`);
      for (const t of g.tickers) lines.push(`      - "${t}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `watchlist-${new Date().toISOString().slice(0, 10)}.yml`;
    a.click();
    URL.revokeObjectURL(url);
    show('✓ YAML 已导出');
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">📋 股票池</h1>
          <div className="mt-0.5 text-[11px] text-text-dim">
            拖拽卡片在看板间移动 · 实时报价每 {REFRESH_MS / 1000}s 自动刷新
            {quotesLoading && allTickers.length > 0 && <span className="ml-2 text-accent">⏳ 加载报价…</span>}
          </div>
        </div>
        <button onClick={exportYaml} className="shrink-0 rounded-md bg-bg-card px-3 py-1.5 text-xs text-text-dim hover:text-text">
          📤 导出
        </button>
      </div>

      {!user && isSupabaseConfigured() && (
        <div className="card-base mb-3 flex items-center justify-between bg-accent-dim/10 text-sm">
          <span>
            👤 访客模式（数据存浏览器本地）。
            <Link href="/login" className="font-semibold">登录</Link> 后多设备同步。
          </span>
        </div>
      )}

      {/* ─── Kanban Board ─── */}
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
            isDropTarget={dropTargetGroup === g.id}
            dragTicker={dragTicker}
            isAdding={addingInGroup === g.id}
            openMenuTicker={openMenuTicker}
            onDragOver={(e) => onColumnDragOver(e, g.id)}
            onDragLeave={() => setDropTargetGroup((cur) => (cur === g.id ? null : cur))}
            onDrop={(e) => onColumnDrop(e, g.id)}
            onCardDragStart={(e, t) => onDragStart(e, t, g.id)}
            onCardDragEnd={onDragEnd}
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
                show(`${info.t} 已经在股票池中`);
                return;
              }
              addCustomStock({ t: info.t, n: info.n, py: info.py, m: info.m });
              persist(
                groups.map((gg) => (gg.id === g.id ? { ...gg, tickers: [...gg.tickers, info.t] } : gg))
              );
              show(`✓ 已加入「${g.name}」：${info.n} (${info.t})`);
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
                placeholder="新看板名称（如：基本盘 / 短线机会）"
                className="w-full text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={addColumn}
                  disabled={!newColumnName.trim()}
                  className="flex-1 rounded bg-accent-dim px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  + 新增看板
                </button>
                <button
                  onClick={() => { setNewColumnOpen(false); setNewColumnName(''); }}
                  className="rounded border border-border px-3 py-1.5 text-xs text-text-dim"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNewColumnOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-transparent py-3 text-sm text-text-dim hover:border-accent-dim hover:text-accent"
            >
              <span>＋</span><span>新增看板</span>
            </button>
          )}
        </div>
      </div>

      {hydrated && allTickers.length === 0 && (
        <div className="card-base bg-bg-card py-8 text-center text-sm text-text-dim">
          股票池是空的。点任意看板上的「＋ 加入股票」开始添加。
        </div>
      )}

      <Disclaimer />
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
  isDropTarget: boolean;
  dragTicker: string | null;
  isAdding: boolean;
  openMenuTicker: string | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onCardDragStart: (e: React.DragEvent, ticker: string) => void;
  onCardDragEnd: () => void;
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
    group, allGroups, quotes, isDropTarget, dragTicker, isAdding, openMenuTicker,
    onDragOver, onDragLeave, onDrop, onCardDragStart, onCardDragEnd,
    onAddOpen, onAddClose, onCardMove, onCardRemove, onOpenMenu,
    onRename, onDelete, onTickerAdded,
  } = props;

  return (
    <div
      className={`flex shrink-0 flex-col rounded-lg border ${isDropTarget ? 'border-accent bg-accent-dim/10' : 'border-border bg-bg-card'} transition-colors`}
      style={{ width: 'min(85vw, 300px)', maxHeight: '78vh', scrollSnapAlign: 'start' }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{group.name}</span>
          <span className="rounded-full bg-bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-text-dim">
            {group.tickers.length}
          </span>
        </div>
        <div className="flex gap-0.5">
          <button onClick={onRename} title="重命名" className="rounded p-1 text-text-dim hover:bg-bg-elevated hover:text-text">
            ✎
          </button>
          <button onClick={onDelete} title="删除看板" className="rounded p-1 text-text-dim hover:bg-down/10 hover:text-down">
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {group.tickers.length === 0 && !isAdding && (
          <div className="rounded border border-dashed border-border/60 py-6 text-center text-[11px] text-text-muted">
            拖拽卡片到此处<br />
            或点下方 + 加入
          </div>
        )}

        {group.tickers.map((ticker) => (
          <StockCard
            key={ticker}
            ticker={ticker}
            quote={quotes[ticker] || null}
            isDragging={dragTicker === ticker}
            menuOpen={openMenuTicker === ticker}
            currentGroupId={group.id}
            allGroups={allGroups}
            onDragStart={(e) => onCardDragStart(e, ticker)}
            onDragEnd={onCardDragEnd}
            onMove={(to) => onCardMove(ticker, to)}
            onRemove={() => onCardRemove(ticker)}
            onToggleMenu={() => onOpenMenu(ticker)}
          />
        ))}

        {isAdding ? (
          <AddStockInline groupName={group.name} onAdd={onTickerAdded} onClose={onAddClose} />
        ) : (
          <button
            onClick={onAddOpen}
            className="w-full rounded border border-dashed border-border bg-transparent px-2 py-1.5 text-xs text-text-dim hover:border-accent-dim hover:text-accent"
          >
            ＋ 加入股票
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
  isDragging: boolean;
  menuOpen: boolean;
  currentGroupId: string;
  allGroups: Group[];
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (toGroupId: string) => void;
  onRemove: () => void;
  onToggleMenu: () => void;
}

function StockCard({
  ticker, quote, isDragging, menuOpen, currentGroupId, allGroups,
  onDragStart, onDragEnd, onMove, onRemove, onToggleMenu,
}: CardProps) {
  const market = quote?.market || classifyMarket(ticker);
  const name = quote?.name || ticker;
  const currency = quote?.currency || (market === 'A' ? '¥' : market === 'HK' ? 'HK$' : '$');
  const hasPrice = !!quote && quote.price > 0;
  const otherGroups = allGroups.filter((g) => g.id !== currentGroupId);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative rounded-lg border border-border bg-bg-elevated p-2.5 transition ${isDragging ? 'opacity-30' : 'hover:border-accent-dim'}`}
      style={{ cursor: 'grab' }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/stock/${encodeURIComponent(ticker)}`} className="min-w-0 flex-1 text-text hover:no-underline">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
              {marketLabel(market)}
            </span>
            <span className="truncate text-sm font-semibold">{name}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-text-muted">{ticker}</div>
        </Link>

        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleMenu(); }}
          className="rounded p-1 text-text-dim hover:bg-bg-card hover:text-text"
          title="移动 / 删除"
        >
          ⋯
        </button>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-base font-semibold tabular-nums">
          {hasPrice ? `${currency}${formatPrice(quote!.price)}` : <span className="text-text-muted">—</span>}
        </span>
        <span className={`text-xs tabular-nums ${hasPrice ? changeClass(quote!.change_pct) : 'text-text-muted'}`}>
          {hasPrice ? formatPct(quote!.change_pct) : '加载中…'}
        </span>
      </div>

      {menuOpen && (
        <div
          className="absolute right-2 top-9 z-20 w-40 rounded-lg border border-border bg-bg-elevated p-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase text-text-muted">移到看板</div>
          {otherGroups.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-text-muted">没有其他看板</div>
          )}
          {otherGroups.map((g) => (
            <button
              key={g.id}
              onClick={() => { onMove(g.id); onToggleMenu(); }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-bg-card"
            >
              → {g.name}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <button
            onClick={() => { onRemove(); onToggleMenu(); }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-down hover:bg-down/10"
          >
            🗑 从股票池移除
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
  groupName: string;
  onAdd: (info: SearchResult) => void;
  onClose: () => void;
}

function AddStockInline({ groupName, onAdd, onClose }: AddInlineProps) {
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

  function runSearch(q: string) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        setResults(d.results || []);
        setFocusIdx((d.results || []).length > 0 ? 0 : -1);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setResults([]);
        setLoading(false);
      });
  }

  function onChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => runSearch(v.trim()), 250);
  }

  function confirmAdd() {
    if (results.length > 0) {
      const target = focusIdx >= 0 ? results[focusIdx] : results[0];
      onAdd(target);
      setQuery('');
      setResults([]);
      inputRef.current?.focus();
      return;
    }
    const q = query.trim();
    if (!q) return;
    if (confirm(`未在数据库中找到 "${q}"。\n仍然加入到「${groupName}」？\n（建议先检查拼写或试试英文代码）`)) {
      onAdd({ t: q.toUpperCase(), n: q, py: '', m: classifyMarket(q.toUpperCase()) as Market });
      setQuery('');
      setResults([]);
    }
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
        placeholder="代码 / 名称（如 完美世界 / AAPL / 600519）"
        className="w-full text-xs"
        autoComplete="off"
      />
      {results.length > 0 && (
        <div className="mt-1.5 max-h-44 overflow-y-auto rounded border border-border bg-bg-card">
          {results.map((r, i) => (
            <button
              key={`${r.t}-${i}`}
              onClick={() => { onAdd(r); setQuery(''); setResults([]); inputRef.current?.focus(); }}
              onMouseEnter={() => setFocusIdx(i)}
              className={`grid w-full grid-cols-[auto_1fr] items-center gap-2 border-b border-border px-2 py-1.5 text-left last:border-b-0 ${
                i === focusIdx ? 'bg-bg-elevated' : 'hover:bg-bg-elevated'
              }`}
            >
              <span className="rounded bg-bg-elevated px-1 py-0.5 text-[9px] font-semibold text-text-dim">
                {marketLabel(r.m)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">{r.n}</div>
                <div className="truncate text-[10px] text-text-dim">{r.t}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {query.trim() && !loading && results.length === 0 && (
        <div className="mt-1.5 text-[10px] text-text-muted">
          没有匹配。回车以「{query.trim()}」强制加入。
        </div>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <button
          onClick={confirmAdd}
          disabled={loading || !query.trim()}
          className="flex-1 rounded bg-accent-dim px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? '搜索中…' : '+ 加入'}
        </button>
        <button onClick={onClose} className="rounded border border-border px-2 py-1 text-[11px] text-text-dim">
          完成
        </button>
      </div>
    </div>
  );
}
