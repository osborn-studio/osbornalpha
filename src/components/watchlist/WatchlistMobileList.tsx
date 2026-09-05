'use client';

import { ChevronRight, Newspaper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarketLabel } from '@/components/MarketLabel';
import type { WatchlistMarketRow } from '@/lib/watchlist/market-row';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import { changeClass, formatPct, formatPrice } from '@/lib/utils';
import { WatchlistSparkline } from './WatchlistSparkline';

export function WatchlistMobileList({ rows, overviewByTicker = {}, onSelect, selected, onToggle }: { rows: WatchlistMarketRow[]; overviewByTicker?: Record<string, WatchlistOverviewRow>; onSelect?: (ticker: string) => void; selected?: Set<string>; onToggle?: (ticker: string) => void }) {
  const t = useTranslations('market.table');
  return (
    <div className="divide-y divide-border/45 sm:hidden" aria-label={t('ariaLabel')}>
      {rows.map((row) => {
        const quote = row.quote;
        const hasQuote = !!quote && quote.price > 0;
        const overview = overviewByTicker[row.ticker];
        const history = overview?.history?.value;
        const returnValue = history?.periodReturnPct;
        const volatility = history?.annualizedVolatilityPct;
        const decision = overview?.item.status;
        const researchCount = overview?.research.value?.recentNewsCount ?? 0;
        return (
          <div key={row.ticker} style={{ contentVisibility: 'auto', containIntrinsicSize: '102px' }} className="grid min-h-[102px] w-full grid-cols-[24px_minmax(0,1fr)] items-center gap-2 px-3 py-3 transition-colors hover:bg-bg-hover focus-within:bg-bg-hover">
            <input type="checkbox" checked={selected?.has(row.ticker) ?? false} onChange={() => onToggle?.(row.ticker)} aria-label={t('selection.toggle', { ticker: row.ticker })} />
            <button type="button" onClick={() => onSelect?.(row.ticker)} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_16px] items-start gap-x-2 gap-y-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-text">{row.name}</span></span>
              <span className="font-mono text-sm font-semibold tabular-nums text-text">{hasQuote ? formatPrice(quote.price, row.currency) : '--'}</span>
              <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden="true" />
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted"><span className="truncate font-mono">{row.ticker}</span><span className="rounded border border-border px-1 py-0.5"><MarketLabel m={row.market} /></span></span>
              <span className={`font-mono text-right text-xs tabular-nums ${hasQuote ? changeClass(quote.change_pct) : 'text-text-muted'}`}>{hasQuote ? formatPct(quote.change_pct) : t(`status.${row.status}`)}</span>
              <span />
              <span className="col-span-3 mt-1 flex min-w-0 items-center gap-2 text-[11px] text-text-muted">
                {history?.sparkline && history.sparkline.length > 1 && <WatchlistSparkline values={history.sparkline} label={t('mobile.sparkline', { ticker: row.ticker })} />}
                <span className={returnValue == null ? '' : changeClass(returnValue)}>{t('mobile.return')}: {returnValue == null ? '--' : formatPct(returnValue)}</span>
                <span>{t('mobile.volatility')}: {volatility == null ? '--' : `${volatility.toFixed(1)}%`}</span>
                <span className="inline-flex items-center gap-1"><Newspaper className="h-3 w-3" aria-hidden="true" />{researchCount}</span>
                {decision && <span className="hidden max-w-24 truncate rounded border border-border px-1.5 py-0.5 text-text-dim min-[420px]:inline">{t(`decisionStatuses.${decision}`)}</span>}
                <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${row.status === 'live' ? 'bg-status-good' : row.status === 'delayed' ? 'bg-status-info' : row.status === 'unavailable' ? 'bg-status-bad' : 'bg-warn'}`} title={t(`status.${row.status}`)} />
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
