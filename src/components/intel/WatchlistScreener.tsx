'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { uniqueWatchlistTickers } from '@/lib/watchlist/store';
import { useBatchQuotes } from '@/lib/hooks/useQuote';
import { formatPrice, formatPct, changeClass, marketLabel, classifyMarket } from '@/lib/utils';
import type { Market } from '@/lib/supabase/database.types';

type MarketFilter = Market;
const ALL_MARKETS: MarketFilter[] = ['A', 'HK', 'US'];
type ChangeDirection = 'any' | 'up' | 'down';

/**
 * v1 scope: filters within the user's own watchlist (live quote fields
 * pe_ttm/pb/market_cap/change_pct). Full-market screening waits for the P5
 * Tushare data upgrade — the note below makes that explicit in the UI.
 */
export function WatchlistScreener() {
  const t = useTranslations('intel');
  const { groups, hydrated } = useWatchlist();
  const allTickers = useMemo(() => uniqueWatchlistTickers(groups), [groups]);
  const { quotes, loading } = useBatchQuotes(allTickers);

  const [markets, setMarkets] = useState<Set<MarketFilter>>(new Set(ALL_MARKETS));
  const [peMax, setPeMax] = useState('');
  const [pbMax, setPbMax] = useState('');
  const [marketCapMinYi, setMarketCapMinYi] = useState('');
  const [direction, setDirection] = useState<ChangeDirection>('any');

  function toggleMarket(m: MarketFilter) {
    setMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  const rows = useMemo(() => {
    const peLimit = peMax.trim() ? Number(peMax) : null;
    const pbLimit = pbMax.trim() ? Number(pbMax) : null;
    // market_cap on LiveQuote is stored in raw currency units; the filter input is 亿 (100M).
    const capMinRaw = marketCapMinYi.trim() ? Number(marketCapMinYi) * 1e8 : null;

    return allTickers
      .map((t) => ({ ticker: t, quote: quotes[t] || null, market: quotes[t]?.market || classifyMarket(t) }))
      .filter((r) => markets.has(r.market))
      .filter((r) => {
        const q = r.quote;
        if (!q) return false;
        if (peLimit != null && (q.pe_ttm == null || q.pe_ttm > peLimit)) return false;
        if (pbLimit != null && (q.pb == null || q.pb > pbLimit)) return false;
        if (capMinRaw != null && (q.market_cap == null || q.market_cap < capMinRaw)) return false;
        if (direction === 'up' && !(q.change_pct > 0)) return false;
        if (direction === 'down' && !(q.change_pct < 0)) return false;
        return true;
      });
  }, [allTickers, quotes, markets, peMax, pbMax, marketCapMinYi, direction]);

  return (
    <div className="card-base">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="text-lg">🧮</span>{t('screener.title')}
      </div>
      <div className="mb-3 text-[11px] text-text-muted">
        {t('screener.scopeNote')}
      </div>

      {/* Filter row */}
      <div className="mb-3 flex flex-wrap items-end gap-3 text-xs">
        <div>
          <div className="mb-1 text-text-dim">{t('screener.filters.market')}</div>
          <div className="flex gap-1">
            {ALL_MARKETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleMarket(m)}
                className={`rounded px-2 py-1 ${
                  markets.has(m) ? 'bg-accent-dim/20 font-semibold text-accent' : 'bg-bg-card text-text-dim'
                }`}
              >
                {marketLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-text-dim">{t('screener.filters.peMax')}</span>
          <input
            type="number"
            value={peMax}
            onChange={(e) => setPeMax(e.target.value)}
            placeholder={t('screener.filters.unlimited')}
            className="w-20 rounded-md bg-bg-card px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-text-dim">{t('screener.filters.pbMax')}</span>
          <input
            type="number"
            value={pbMax}
            onChange={(e) => setPbMax(e.target.value)}
            placeholder={t('screener.filters.unlimited')}
            className="w-20 rounded-md bg-bg-card px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-text-dim">{t('screener.filters.marketCapMinYi')}</span>
          <input
            type="number"
            value={marketCapMinYi}
            onChange={(e) => setMarketCapMinYi(e.target.value)}
            placeholder={t('screener.filters.unlimited')}
            className="w-24 rounded-md bg-bg-card px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-text-dim">{t('screener.filters.changeToday')}</span>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as ChangeDirection)}
            className="rounded-md bg-bg-card px-2 py-1"
          >
            <option value="any">{t('screener.filters.unlimited')}</option>
            <option value="up">{t('screener.filters.up')}</option>
            <option value="down">{t('screener.filters.down')}</option>
          </select>
        </label>
      </div>

      {/* Results */}
      {!hydrated || (loading && allTickers.length > 0) ? (
        <div className="py-6 text-center text-xs text-text-muted">{t('screener.states.loading')}</div>
      ) : allTickers.length === 0 ? (
        <div className="py-6 text-center text-xs text-text-muted">{t('screener.states.emptyWatchlist')}</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-text-muted">{t('screener.states.noMatches')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-text-dim">
                <th className="py-1.5 pr-2">{t('screener.columns.name')}</th>
                <th className="py-1.5 pr-2">{t('screener.columns.ticker')}</th>
                <th className="py-1.5 pr-2 text-right">{t('screener.columns.price')}</th>
                <th className="py-1.5 pr-2 text-right">{t('screener.columns.change')}</th>
                <th className="py-1.5 pr-2 text-right">{t('screener.columns.pe')}</th>
                <th className="py-1.5 pr-2 text-right">{t('screener.columns.pb')}</th>
                <th className="py-1.5 text-right">{t('screener.columns.marketCap')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker} className="border-b border-border/50 last:border-b-0">
                  <td className="py-0" colSpan={7}>
                    <Link
                      href={`/stock/${encodeURIComponent(r.ticker)}` as any}
                      className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center gap-2 py-1.5 pr-2 hover:bg-bg-card"
                    >
                      <span className="truncate font-semibold">{r.quote?.name ?? r.ticker}</span>
                      <span className="pr-2 font-mono text-text-dim">{r.ticker}</span>
                      <span className="pr-2 text-right tabular-nums">{r.quote ? formatPrice(r.quote.price) : '—'}</span>
                      <span className={`pr-2 text-right tabular-nums ${r.quote ? changeClass(r.quote.change_pct) : ''}`}>
                        {r.quote ? formatPct(r.quote.change_pct) : '—'}
                      </span>
                      <span className="pr-2 text-right tabular-nums">{r.quote?.pe_ttm != null ? r.quote.pe_ttm.toFixed(1) : '—'}</span>
                      <span className="pr-2 text-right tabular-nums">{r.quote?.pb != null ? r.quote.pb.toFixed(2) : '—'}</span>
                      <span className="text-right tabular-nums">{r.quote?.market_cap_label ?? '—'}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
