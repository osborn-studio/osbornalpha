'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { MOCK_DATA, MOCK_STOCKS, getStockOrStub } from '@/lib/data/mock';
import { Sparkline } from './Sparkline';
import { formatPrice, formatPct, changeClass, marketLabel } from '@/lib/utils';

const STORAGE_KEY = 'stock-monitor:watchlist:v2';

interface Group { id: string; name: string; tickers: string[] }

interface Props {
  selectedTicker: string;
  onSelect: (ticker: string) => void;
  variant?: 'sidebar' | 'page';
}

export function WatchlistSidebar({ selectedTicker, onSelect, variant = 'sidebar' }: Props) {
  const [groups, setGroups] = useState<Group[]>(() =>
    MOCK_DATA.watchlist_groups.map((g) => ({ id: g.id, name: g.name, tickers: [...g.tickers] }))
  );
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setGroups(JSON.parse(raw));
    } catch {}
  }, []);

  const totalCount = groups.reduce((s, g) => s + g.tickers.length, 0);

  const visibleGroups = useMemo(
    () => (activeGroup === 'all' ? groups : groups.filter((g) => g.id === activeGroup)),
    [activeGroup, groups]
  );

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className={variant === 'sidebar' ? 'sticky top-[57px]' : ''}>
      <div className="card-base !p-2">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Watchlist · {totalCount}
          </span>
          <Link href="/watchlist" className="text-[11px] text-accent">管理 →</Link>
        </div>

        {/* Group tabs */}
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1 px-1">
          <button
            onClick={() => setActiveGroup('all')}
            className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] ${
              activeGroup === 'all' ? 'bg-accent-dim text-white' : 'text-text-dim hover:bg-bg-card'
            }`}
          >
            全部
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] ${
                activeGroup === g.id ? 'bg-accent-dim text-white' : 'text-text-dim hover:bg-bg-card'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        {/* Column header */}
        <div className="grid grid-cols-[1fr_auto_70px_55px] gap-2 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-text-muted">
          <span>Symbol</span>
          <span className="text-right">Last</span>
          <span className="text-right">Trend</span>
          <span className="text-right">Chg%</span>
        </div>

        {/* Rows */}
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
          {visibleGroups.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            return (
              <div key={g.id}>
                {activeGroup === 'all' && (
                  <button
                    onClick={() => toggleCollapse(g.id)}
                    className="flex w-full items-center gap-1 px-2 py-1.5 text-[10px] font-semibold text-text-dim hover:bg-bg-card"
                  >
                    <span>{isCollapsed ? '▸' : '▾'}</span>
                    <span>{g.name}</span>
                    <span className="text-text-muted">({g.tickers.length})</span>
                  </button>
                )}
                {!isCollapsed && g.tickers.map((t) => {
                  const s = getStockOrStub(t);
                  if (!s) return null;
                  const selected = t === selectedTicker;
                  return (
                    <button
                      key={t}
                      onClick={() => onSelect(t)}
                      className={`grid w-full grid-cols-[1fr_auto_70px_55px] items-center gap-2 px-2 py-1.5 text-left text-[12px] transition ${
                        selected ? 'bg-accent-dim/20 ring-1 ring-accent-dim' : 'hover:bg-bg-card'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="truncate font-semibold leading-tight">{s.name}</div>
                        <div className="truncate text-[10px] text-text-dim">{s.ticker}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] leading-tight">
                        <div className="font-semibold tabular-nums">{formatPrice(s.price)}</div>
                        <div className="text-[10px] text-text-muted">{marketLabel(s.market)}</div>
                      </div>
                      <div className="flex justify-end">
                        <Sparkline ticker={t} changePct={s.change_pct} width={60} height={20} />
                      </div>
                      <div className={`text-right font-mono text-[11px] tabular-nums ${changeClass(s.change_pct)}`}>
                        {formatPct(s.change_pct)}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
