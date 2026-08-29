'use client';

import { useState, useMemo } from 'react';
import { MarketLabel } from '@/components/MarketLabel';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useBatchQuotes } from '@/lib/hooks/useQuote';
import { formatPrice, formatPct, changeClass, classifyMarket, currencyOfMarket } from '@/lib/utils';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { uniqueWatchlistTickers } from '@/lib/watchlist/store';

interface Props {
  selectedTicker: string;
  onSelect: (ticker: string) => void;
  variant?: 'sidebar' | 'page';
}

export function WatchlistSidebar({ selectedTicker, onSelect, variant = 'sidebar' }: Props) {
  const t = useTranslations('watchlist.sidebar');
  const { groups } = useWatchlist();
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const allTickers = useMemo(() => uniqueWatchlistTickers(groups), [groups]);
  const { quotes, loading: quotesLoading, loadedAt } = useBatchQuotes(allTickers, { refreshIntervalMs: 30_000 });

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
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-text-dim">
            Watchlist · {totalCount}
            {quotesLoading && <span className="ml-1 text-text-muted">⏳</span>}
          </span>
          <Link href="/watchlist" className="text-[11px] text-accent">{t('manage')}</Link>
        </div>

        <div className="mb-2 flex gap-1 overflow-x-auto pb-1 px-1">
          <button
            onClick={() => setActiveGroup('all')}
            className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] ${
              activeGroup === 'all' ? 'bg-accent-dim text-white' : 'text-text-dim hover:bg-bg-card'
            }`}
          >
            {t('all')}
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

        <div className="grid grid-cols-[1fr_auto_55px] gap-2 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-text-muted">
          <span>Symbol</span>
          <span className="text-right">Last</span>
          <span className="text-right">Chg%</span>
        </div>

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
                {!isCollapsed && g.tickers.map((ticker) => {
                  const live = quotes[ticker];
                  const market = live?.market || classifyMarket(ticker);
                  const currency = live?.currency || currencyOfMarket(market);
                  const price = live?.price ?? 0;
                  const changePct = live?.change_pct ?? 0;
                  const hasQuote = price > 0;
                  const status = !hasQuote && loadedAt !== null
                    ? t('unavailable')
                    : live?.delayed ? t('delayed') : live?.source || t('loading');
                  const selected = ticker === selectedTicker;
                  return (
                    <button
                      key={ticker}
                      onClick={() => onSelect(ticker)}
                      className={`grid w-full grid-cols-[1fr_auto_55px] items-center gap-2 px-2 py-1.5 text-left text-[12px] transition ${
                        selected ? 'bg-accent-dim/20 ring-1 ring-accent-dim' : 'hover:bg-bg-card'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="truncate font-semibold leading-tight">{live?.name || ticker}</div>
                        <div className="truncate text-[10px] text-text-dim">{ticker}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] leading-tight">
                        <div className="font-semibold tabular-nums">
                          {hasQuote ? formatPrice(price, currency) : '—'}
                        </div>
                        <div className="truncate text-[10px] text-text-muted" title={live?.updated_at || status}>
                          {hasQuote ? status : <MarketLabel m={market} />}
                        </div>
                      </div>
                      <div className={`text-right font-mono text-[11px] tabular-nums ${hasQuote ? changeClass(changePct) : 'text-text-muted'}`}>
                        {hasQuote ? formatPct(changePct) : '—'}
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
