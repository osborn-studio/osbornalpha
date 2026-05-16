'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { MOCK_DATA, MOCK_STOCKS, MOCK_UNIVERSE } from '@/lib/data/mock';
import { searchUniverse } from '@/lib/stocks/search';
import { formatPrice, formatPct, changeClass, marketLabel } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';
import { useToast } from '@/components/Toast';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

const STORAGE_KEY = 'stock-monitor:watchlist:v2';

interface Group {
  id: string;
  name: string;
  tickers: string[];
}

export default function WatchlistPage() {
  const { show } = useToast();
  const [groups, setGroups] = useState<Group[]>(() =>
    MOCK_DATA.watchlist_groups.map((g) => ({ id: g.id, name: g.name, tickers: [...g.tickers] }))
  );
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [editMode, setEditMode] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addGroupId, setAddGroupId] = useState('opportunity');
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  const addResults = useMemo(() => searchUniverse(MOCK_UNIVERSE, addQuery), [addQuery]);

  // Hydrate: try Supabase first, fall back to localStorage
  useEffect(() => {
    (async () => {
      if (isSupabaseConfigured()) {
        const sb = getBrowserSupabase();
        const { data: { user: u } } = await sb.auth.getUser();
        if (u) {
          setUser({ id: u.id, email: u.email });
          // Load from Supabase
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
      // Guest mode: localStorage
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setGroups(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  function persist(next: Group[]) {
    setGroups(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    // TODO: when authed, write to Supabase here
  }

  const totalCount = groups.reduce((s, g) => s + g.tickers.length, 0);
  const visibleGroups = activeGroup === 'all' ? groups : groups.filter((g) => g.id === activeGroup);

  function addTicker(ticker: string) {
    const exists = groups.some((g) => g.tickers.includes(ticker));
    if (exists) {
      show(`${ticker} 已经在股票池中`);
      return;
    }
    const next = groups.map((g) =>
      g.id === addGroupId ? { ...g, tickers: [...g.tickers, ticker] } : g
    );
    persist(next);
    setAddQuery('');
    show(`✓ 已加入：${ticker}`);
  }

  function removeTicker(ticker: string) {
    if (!editMode && !confirm(`删除 ${ticker} ?`)) return;
    const next = groups.map((g) => ({ ...g, tickers: g.tickers.filter((t) => t !== ticker) }));
    persist(next);
    show(`✓ 已删除：${ticker}`);
  }

  function exportYaml() {
    const lines = [
      '# Stock Monitor watchlist',
      'version: 1',
      '',
      'groups:',
    ];
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
          <span>👤 当前是访客模式（数据存浏览器本地）。<Link href="/login" className="font-semibold">登录</Link> 后多设备同步。</span>
        </div>
      )}

      {/* Add card */}
      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">➕ 添加新标的</div>
        <div className="relative">
          <input
            type="text"
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && addResults.length) addTicker(addResults[0].t);
            }}
            placeholder="输入股票代码或名称（如 腾讯 / AAPL / 600519）"
            className="w-full"
          />
          {addResults.length > 0 && addQuery.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[300px] overflow-y-auto rounded-lg border border-border bg-bg-elevated shadow-lg">
              {addResults.map((r) => (
                <button
                  key={r.t}
                  onClick={() => addTicker(r.t)}
                  className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-bg-card"
                >
                  <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">{marketLabel(r.m)}</span>
                  <div>
                    <div className="font-semibold">{r.n}</div>
                    <div className="text-xs text-text-dim">{r.t}</div>
                  </div>
                  <span className="text-xs text-accent">+ 加入</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-text-dim">
          <span>加入分组：</span>
          {groups.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-center gap-1">
              <input
                type="radio"
                name="add-group"
                value={g.id}
                checked={addGroupId === g.id}
                onChange={() => setAddGroupId(g.id)}
              />
              {g.name}
            </label>
          ))}
        </div>
      </div>

      {/* Tabs */}
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
            const s = MOCK_STOCKS[t];
            const display = s || { name: t, ticker: t, market: 'A', currency: '', price: 0, change_pct: 0 };
            return (
              <div key={t} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-border px-2 py-2.5 last:border-b-0">
                <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                  {marketLabel(display.market)}
                </span>
                <Link href={`/stock/${encodeURIComponent(t)}`} className="text-text hover:no-underline">
                  <div className="font-semibold">{display.name}</div>
                  <div className="text-[11px] text-text-dim">{display.ticker}</div>
                </Link>
                <Link href={`/stock/${encodeURIComponent(t)}`} className="text-right font-semibold tabular-nums text-text hover:no-underline">
                  {s ? `${display.currency}${formatPrice(s.price)}` : '—'}
                </Link>
                <div className={`min-w-[60px] text-right text-sm tabular-nums ${s ? changeClass(s.change_pct) : ''}`}>
                  {s ? formatPct(s.change_pct) : '—'}
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
