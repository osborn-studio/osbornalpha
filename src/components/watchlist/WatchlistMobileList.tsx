'use client';

import { BellRing, ChevronRight, Newspaper } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarketLabel } from '@/components/MarketLabel';
import type { WatchlistMarketRow } from '@/lib/watchlist/market-row';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import { changeClass, formatPct, formatPrice } from '@/lib/utils';
import { WatchlistSparkline } from './WatchlistSparkline';

function statusAccent(status: WatchlistMarketRow['status']): string {
  if (status === 'live') return 'border-l-status-good';
  if (status === 'delayed') return 'border-l-status-info';
  if (status === 'unavailable') return 'border-l-status-bad';
  return 'border-l-warn';
}

function statusDot(status: WatchlistMarketRow['status']): string {
  if (status === 'live') return 'bg-status-good';
  if (status === 'delayed') return 'bg-status-info';
  if (status === 'unavailable') return 'bg-status-bad';
  return 'bg-warn';
}

export function WatchlistMobileList({ rows, overviewByTicker = {}, onSelect, selectionMode = false, selected, onToggle }: { rows: WatchlistMarketRow[]; overviewByTicker?: Record<string, WatchlistOverviewRow>; onSelect?: (ticker: string) => void; selectionMode?: boolean; selected?: Set<string>; onToggle?: (ticker: string) => void }) {
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
        const unreadAlerts = overview?.alerts.value?.unreadCount ?? 0;
        const failedAlerts = overview?.alerts.value?.failedDeliveryCount ?? 0;
        return (
          <div key={row.ticker} style={{ contentVisibility: 'auto', containIntrinsicSize: '88px' }} className={`grid min-h-[88px] w-full items-center gap-2 border-l-2 px-3 py-2.5 transition-colors hover:bg-bg-hover focus-within:bg-bg-hover ${statusAccent(row.status)} ${selectionMode ? 'grid-cols-[24px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
            {selectionMode && <input type="checkbox" checked={selected?.has(row.ticker) ?? false} onChange={() => onToggle?.(row.ticker)} aria-label={t('selection.toggle', { ticker: row.ticker })} />}
            <button type="button" onClick={() => selectionMode ? onToggle?.(row.ticker) : onSelect?.(row.ticker)} aria-pressed={selectionMode ? selected?.has(row.ticker) ?? false : undefined} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_16px] items-start gap-x-2 gap-y-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-text">{row.name}</span></span>
              <span className="font-mono text-sm font-semibold tabular-nums text-text">{hasQuote ? formatPrice(quote.price, row.currency) : '--'}</span>
              <ChevronRight className="h-4 w-4 text-text-muted" aria-hidden="true" />
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted"><span className="truncate font-mono">{row.ticker}</span><span className="rounded border border-border px-1 py-0.5"><MarketLabel m={row.market} /></span></span>
              <span className={`font-mono text-right text-xs tabular-nums ${hasQuote ? changeClass(quote.change_pct) : 'text-text-muted'}`}>{hasQuote ? formatPct(quote.change_pct) : t(`status.${row.status}`)}</span>
              <span />
              <span className="col-span-3 mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-text-muted">
                <span className="max-w-24 truncate text-text-dim" title={row.group}>{row.group}</span>
                {history?.sparkline && history.sparkline.length > 1 && <WatchlistSparkline values={history.sparkline} label={t('mobile.sparkline', { ticker: row.ticker })} />}
                {returnValue != null && <span className={changeClass(returnValue)}>{t('mobile.return')}: {formatPct(returnValue)}</span>}
                {volatility != null && <span>{t('mobile.volatility')}: {volatility.toFixed(1)}%</span>}
                {researchCount > 0 && <span className="inline-flex items-center gap-1" title={t('mobile.research')}><Newspaper className="h-3 w-3" aria-hidden="true" />{researchCount}</span>}
                {(unreadAlerts > 0 || failedAlerts > 0) && <span className={`inline-flex items-center gap-1 ${failedAlerts > 0 ? 'text-status-bad' : 'text-warn'}`} title={failedAlerts > 0 ? t('mobile.alertFailures', { count: failedAlerts }) : t('mobile.unreadAlerts', { count: unreadAlerts })}><BellRing className="h-3 w-3" aria-hidden="true" />{failedAlerts > 0 ? `!${failedAlerts}` : unreadAlerts}</span>}
                {decision && <span className="max-w-28 truncate rounded border border-border px-1.5 py-0.5 text-text-dim">{t(`decisionStatuses.${decision}`)}</span>}
                <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[10px] text-text-dim" title={t(`status.${row.status}`)}><span className={`h-1.5 w-1.5 rounded-full ${statusDot(row.status)}`} aria-hidden="true" />{t(`status.${row.status}`)}</span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
