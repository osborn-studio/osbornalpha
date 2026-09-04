'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarketLabel } from '@/components/MarketLabel';
import type { WatchlistMarketRow } from '@/lib/watchlist/market-row';
import { changeClass, formatPct, formatPrice } from '@/lib/utils';

function MiniRange({ values, positive }: { values: number[]; positive: boolean }) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length < 2) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  return <span className="inline-flex h-6 w-14 items-end gap-0.5" aria-hidden="true">{values.map((value, index) => <span key={index} className={`w-1.5 rounded-t-sm ${positive ? 'bg-up/70' : 'bg-down/70'}`} style={{ height: `${Math.max(18, ((value - min) / span) * 100)}%` }} />)}</span>;
}

export function WatchlistMobileList({ rows, onSelect, selected, onToggle }: { rows: WatchlistMarketRow[]; onSelect?: (ticker: string) => void; selected?: Set<string>; onToggle?: (ticker: string) => void }) {
  const t = useTranslations('market.table');
  return (
    <div className="divide-y divide-border/70 sm:hidden" aria-label={t('ariaLabel')}>
      {rows.map((row) => {
        const quote = row.quote;
        const hasQuote = !!quote && quote.price > 0;
        const range = hasQuote && quote.high > quote.low
          ? Math.min(100, Math.max(0, ((quote.price - quote.low) / (quote.high - quote.low)) * 100))
          : null;
        return (
          <div key={row.ticker} className="grid min-h-[68px] w-full grid-cols-[24px_minmax(0,1fr)_auto_28px] items-center gap-2 px-3 py-2.5 hover:bg-bg-hover">
            <input type="checkbox" checked={selected?.has(row.ticker) ?? false} onChange={() => onToggle?.(row.ticker)} aria-label={t('selection.toggle', { ticker: row.ticker })} />
            <button type="button" onClick={() => onSelect?.(row.ticker)} className="col-span-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-text">{row.name}</span>
                <span className="rounded border border-border px-1 py-0.5 text-[8px] text-text-muted"><MarketLabel m={row.market} /></span>
              </span>
              <span className="mt-0.5 block font-mono text-[10px] text-text-muted">{row.ticker}</span>
              {range !== null && (
                <span className="mt-1.5 block h-1 w-full max-w-32 overflow-hidden rounded bg-border">
                  <span className="block h-full bg-accent" style={{ width: `${range}%` }} />
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 text-right">
              {hasQuote && <MiniRange values={[quote.low, quote.open, quote.prev_close, quote.price, quote.high]} positive={quote.change_pct >= 0} />}
              <span>
              <span className="block font-mono text-sm font-semibold tabular-nums text-text">
                {hasQuote ? formatPrice(quote.price, row.currency) : '--'}
              </span>
              <span className={`mt-0.5 block font-mono text-xs tabular-nums ${hasQuote ? changeClass(quote.change_pct) : 'text-text-muted'}`}>
                {hasQuote ? formatPct(quote.change_pct) : t(`status.${row.status}`)}
              </span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
