'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { MOCK_DATA, MOCK_STOCKS, getStockOrStub } from '@/lib/data/mock';
import { addCustomStock } from '@/lib/data/custom-stocks';
import { formatPrice, formatPct, changeClass, marketLabel } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';
import { useToast } from '@/components/Toast';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Market } from '@/lib/supabase/database.types';

const STORAGE_KEY = 'stock-monitor:watchlist:v2';

interface Group { id: string; name: string; tickers: string[] }
interface ApiResult { t: string; n: string; py: string; m: Market }

export default function WatchlistPage() {
  const { show } = useToast();
  const [groups, setGroups] = useState<Group[]>(() =>
    MOCK_DATA.watchlist_groups.map((g) => ({ id: g.id, name: g.name, tickers: [...g.tickers] }))
  );
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [editMode, setEditMode] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  // === Add-stock UI state ===
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<ApiResult[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addFocusIdx, setAddFocusIdx] = useState(-1);
  const [addGroupId, setAddGroupId] = useState('opportunity');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate watchlist
  useEffect(() => {
    (async () => {
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
            return;
          }
        }
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setGroups(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  function persist(next: Group[]) {
    setGroups(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  const totalCount = groups.reduce((s, g) => s + g.tickers.length, 0);
  const visibleGroups = activeGroup === 'all' ? groups : groups.filter((g) => g.id === activeGroup);

  // ─── Async search via /api/search ───
  async function performSearch(q: string) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAddLoading(true);
    setAddError(null);
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setAddResults(data.results || []);
      setDropdownOpen(true);
      setAddFocusIdx((data.results || []).length > 0 ? 0 : -1);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setAddError(e.message || '搜索失败');
        setAddResults([]);
      }
    } finally {
      setAddLoading(false);
    }
  }

  function onAddQueryChange(v: string) {
    setAddQuery(v);
    setAddError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length === 0) {
      setAddResults([]);
      setDropdownOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => performSearch(v.trim()), 250);
  }

  // ─── Add ticker action ───
  function addTickerInfo(info: ApiResult) {
    const exists = groups.some((g) => g.tickers.includes(info.t));
    if (exists) {
      show(`${info.t} 已经在股票池中`);
      return;
    }
    // Save custom stock info so it displays properly
    addCustomStock({ t: info.t, n: info.n, py: info.py, m: info.m });
    const next = groups.map((g) =>
      g.id === addGroupId ? { ...g, tickers: [...g.tickers, info.t] } : g
    );
    persist(next);
    setAddQuery('');
    setAddResults([]);
    setDropdownOpen(false);
    show(`✓ 已加入：${info.n} (${info.t})`);
    addInputRef.current?.focus();
  }

  // Click "+ 加入" button (the explicit confirm action)
  function handleConfirmAdd() {
    if (addLoading) return;
    const q = addQuery.trim();
    if (!q) {
      show('请先输入股票代码或名称');
      addInputRef.current?.focus();
      return;
    }
    // If we have results, use focused/first
    if (addResults.length > 0) {
      const target = addFocusIdx >= 0 ? addResults[addFocusIdx] : addResults[0];
      addTickerInfo(target);
      return;
    }
    // No results — let user add as raw ticker (with confirmation)
    if (addLoading) return;
    if (confirm(`未在数据库中找到 "${q}"。\n仍然加入到股票池？\n（建议先检查拼写或试试英文代码）`)) {
      addTickerInfo({ t: q.toUpperCase(), n: q, py: '', m: 'A' });  // best-guess market
    }
  }

  function onAddKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmAdd();
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
      addInputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && addResults.length) {
      e.preventDefault();
      setAddFocusIdx((i) => (i + 1) % addResults.length);
    } else if (e.key === 'ArrowUp' && addResults.length) {
      e.preventDefault();
      setAddFocusIdx((i) => (i - 1 + addResults.length) % addResults.length);
    }
  }

  function removeTicker(ticker: string) {
    if (!editMode && !confirm(`删除 ${ticker} ?`)) return;
    const next = groups.map((g) => ({ ...g, tickers: g.tickers.filter((t) => t !== ticker) }));
    persist(next);
    show(`✓ 已删除：${ticker}`);
  }

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
      <h1 className="mb-3 text-xl font-bold">📋 我的股票池</h1>

      {!user && isSupabaseConfigured() && (
        <div className="card-base flex items-center justify-between bg-accent-dim/10 text-sm">
          <span>
            👤 访客模式（数据存浏览器本地）。
            <Link href="/login" className="font-semibold">登录</Link> 后多设备同步。
          </span>
        </div>
      )}

      {/* ─── Add Stock Card (重设计) ─── */}
      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">➕ 添加新标的</div>

        {/* Input + Confirm button row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">
              {addLoading ? '⏳' : '🔍'}
            </span>
            <input
              ref={addInputRef}
              type="text"
              value={addQuery}
              onChange={(e) => onAddQueryChange(e.target.value)}
              onKeyDown={onAddKeyDown}
              onFocus={() => addResults.length && setDropdownOpen(true)}
              placeholder="输入股票代码或名称（如 完美世界 / AAPL / 600519）"
              className="w-full pl-9"
              autoComplete="off"
            />
            {/* Dropdown */}
            {dropdownOpen && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[340px] overflow-y-auto rounded-lg border border-border bg-bg-elevated shadow-lg">
                {addLoading && addResults.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-text-dim">⏳ 搜索中...</div>
                )}
                {!addLoading && addResults.length === 0 && addQuery.trim().length > 0 && (
                  <div className="px-3 py-4 text-center text-xs text-text-dim">
                    没有匹配结果<br />
                    <span className="text-[10px] text-text-muted">
                      可以点击右侧 &ldquo;+ 加入&rdquo; 强制以 &ldquo;{addQuery.trim()}&rdquo; 为代码加入
                    </span>
                  </div>
                )}
                {addResults.map((r, i) => (
                  <button
                    key={`${r.t}-${i}`}
                    onClick={() => addTickerInfo(r)}
                    onMouseEnter={() => setAddFocusIdx(i)}
                    className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 ${
                      i === addFocusIdx ? 'bg-bg-card' : 'hover:bg-bg-card'
                    }`}
                  >
                    <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                      {marketLabel(r.m)}
                    </span>
                    <div>
                      <div className="font-semibold">{r.n}</div>
                      <div className="text-xs text-text-dim">{r.t} {r.py && `· ${r.py}`}</div>
                    </div>
                    <span className="text-xs text-accent">+ 加入</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleConfirmAdd}
            disabled={!addQuery.trim() || addLoading}
            className="whitespace-nowrap rounded-lg bg-accent-dim px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
            title="加入到选定分组（也可按 Enter）"
          >
            {addLoading ? '搜索中...' : '+ 加入'}
          </button>
        </div>

        {/* Helper text */}
        <div className="mt-1.5 text-[11px] text-text-muted">
          按 <kbd className="rounded bg-bg-card px-1">Enter</kbd> 加入第一个匹配项 ·
          按 <kbd className="rounded bg-bg-card px-1">↑↓</kbd> 选择
        </div>

        {/* Group selector */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
          <span className="text-text-dim">加入到分组：</span>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <label
                key={g.id}
                className={`flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 transition ${
                  addGroupId === g.id ? 'border-accent bg-accent-dim/20 text-accent' : 'border-border text-text-dim hover:text-text'
                }`}
              >
                <input
                  type="radio"
                  name="add-group"
                  value={g.id}
                  checked={addGroupId === g.id}
                  onChange={() => setAddGroupId(g.id)}
                  className="sr-only"
                />
                {g.name} <span className="text-[10px] opacity-60">({g.tickers.length})</span>
              </label>
            ))}
          </div>
        </div>

        {addError && (
          <div className="mt-2 rounded bg-down/10 px-3 py-2 text-xs text-down">
            ⚠️ {addError}
          </div>
        )}
      </div>

      {/* ─── Tabs ─── */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveGroup('all')}
          className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs transition ${
            activeGroup === 'all' ? 'border-accent bg-accent-dim text-white' : 'border-border bg-bg-card text-text-dim hover:text-text'
          }`}
        >
          全部 {totalCount}
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveGroup(g.id)}
            className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs transition ${
              activeGroup === g.id ? 'border-accent bg-accent-dim text-white' : 'border-border bg-bg-card text-text-dim hover:text-text'
            }`}
          >
            {g.name} {g.tickers.length}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between rounded-lg bg-bg-card px-3 py-2.5">
        <div className="text-xs text-text-dim">
          {editMode ? '✏️ 编辑模式：点 × 删除' : '👆 点击进入详情，或开启编辑模式'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className="rounded border border-border bg-transparent px-3 py-1.5 text-xs text-text-dim"
          >
            {editMode ? '完成' : '编辑模式'}
          </button>
          <button onClick={exportYaml} className="rounded bg-accent-dim px-3 py-1.5 text-xs text-white">
            📤 导出 YAML
          </button>
        </div>
      </div>

      {/* Groups */}
      {visibleGroups.map((g) => (
        <div key={g.id} className="card-base">
          <div className="mb-3 text-sm font-semibold text-text-dim">
            {g.name} ({g.tickers.length})
          </div>
          {g.tickers.length === 0 && (
            <div className="py-8 text-center text-sm text-text-dim">
              这个分组还没有标的，去上面搜索加入吧。
            </div>
          )}
          {g.tickers.map((t) => {
            const s = getStockOrStub(t);
            const display = s || { name: t, ticker: t, market: 'A' as Market, currency: '', price: 0, change_pct: 0 };
            return (
              <div key={t} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-border px-2 py-2.5 last:border-b-0">
                <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                  {marketLabel(display.market)}
                </span>
                <Link href={`/stock/${encodeURIComponent(t)}`} className="text-text hover:no-underline">
                  <div className="font-semibold">{display.name}</div>
                  <div className="text-[11px] text-text-dim">{display.ticker}</div>
                </Link>
                <Link
                  href={`/stock/${encodeURIComponent(t)}`}
                  className="text-right font-semibold tabular-nums text-text hover:no-underline"
                >
                  {s && s.price > 0 ? `${display.currency}${formatPrice(s.price)}` : '—'}
                </Link>
                <div className={`min-w-[60px] text-right text-sm tabular-nums ${s && s.price > 0 ? changeClass(s.change_pct) : ''}`}>
                  {s && s.price > 0 ? formatPct(s.change_pct) : '—'}
                </div>
                <button
                  onClick={() => removeTicker(t)}
                  className={`rounded p-1.5 text-lg ${editMode ? 'text-down hover:bg-down/10' : 'text-text-dim hover:text-text'}`}
                  title={editMode ? '删除' : '更多'}
                >
                  {editMode ? '×' : '⋯'}
                </button>
              </div>
            );
          })}
        </div>
      ))}

      <Disclaimer />
    </>
  );
}
