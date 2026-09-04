'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { KlineChart } from '@/components/KlineChart';
import { MarketLabel } from '@/components/MarketLabel';
import { useKline, type LiveQuote } from '@/lib/hooks/useQuote';
import { changeClass, classifyMarket, formatPct, formatPrice } from '@/lib/utils';
import { calculateHistoricalWatchlistMetrics } from '@/lib/watchlist/analytics';

function Metric({ label, value, tone = 'text-text' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-bg-elevated px-3 py-2.5">
      <div className="truncate text-[10px] font-medium text-text-muted" title={label}>{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function optional(value: number | null | undefined, suffix = '') {
  return value == null || !Number.isFinite(value) ? '--' : `${value.toFixed(2)}${suffix}`;
}

export function WatchlistQuickView({ ticker, quote, onClose }: { ticker: string; quote: LiveQuote | null; onClose: () => void }) {
  const t = useTranslations('market.table.drawer');
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const market = quote?.market ?? classifyMarket(ticker);
  const history = useKline(ticker, '1y');
  const historicalMetrics = calculateHistoricalWatchlistMetrics(history.bars);
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t('ariaLabel', { ticker })}>
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" onClick={onClose} aria-label={t('dismiss')} />
      <aside className="absolute inset-y-0 right-0 w-full max-w-[800px] overflow-y-auto border-l border-border bg-bg shadow-2xl">
        <div className="sticky top-0 z-30 h-0.5 bg-accent" />
        <header className="sticky top-0 z-20 flex items-start gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold">{quote?.name || ticker}</h2>
              <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[9px] text-text-dim"><MarketLabel m={market} /></span>
              <span className="font-mono text-[11px] text-text-muted">{ticker}</span>
            </div>
            {quote && quote.price > 0 ? <div className="mt-1.5 flex items-baseline gap-3"><span className="text-2xl font-bold tabular-nums sm:text-3xl">{formatPrice(quote.price, quote.currency)}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${quote.change_pct >= 0 ? 'bg-up/10' : 'bg-down/10'} ${changeClass(quote.change_pct)}`}>{formatPct(quote.change_pct)}</span></div> : <div className="mt-1 text-sm text-text-muted">{t('unavailable')}</div>}
          </div>
          <Link href={`/stock/${encodeURIComponent(ticker)}` as never} className="shrink-0 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 hover:no-underline">{t('fullDetail')}</Link>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xl text-text-dim hover:bg-bg-card hover:text-text" aria-label={t('close')}>×</button>
        </header>

        <div className="p-3 sm:p-5">
          <section className="mb-5 rounded-md border border-border bg-bg-elevated p-2 sm:p-3">
            <KlineChart ticker={ticker} />
          </section>
          <section aria-label={t('metrics')}>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-text-dim"><span className="h-px w-5 bg-accent" />{t('metrics')}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label={t('open')} value={quote ? formatPrice(quote.open, quote.currency) : '--'} />
            <Metric label={t('dayRange')} value={quote ? `${formatPrice(quote.low, quote.currency)} - ${formatPrice(quote.high, quote.currency)}` : '--'} />
            <Metric label={t('amplitude')} value={optional(quote?.amplitude, '%')} />
            <Metric label={t('volumeRatio')} value={optional(quote?.volume_ratio, 'x')} />
            <Metric label={t('marketCap')} value={quote?.market_cap_label || '--'} />
            <Metric label="PE (TTM)" value={optional(quote?.pe_ttm)} />
            <Metric label="PB" value={optional(quote?.pb)} />
            <Metric label={t('turnover')} value={optional(quote?.turnover, '%')} />
            </div>
          </section>
          <section className="mt-5" aria-label={t('historyMetrics')}>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-text-dim"><span className="h-px w-5 bg-accent" />{t('historyMetrics')}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label={t('oneYearPriceReturn')} value={history.loading ? t('calculating') : optional(historicalMetrics.periodReturnPct, '%')} tone={historicalMetrics.periodReturnPct == null ? 'text-text' : changeClass(historicalMetrics.periodReturnPct)} />
            <Metric label={t('annualizedVolatility')} value={history.loading ? t('calculating') : optional(historicalMetrics.annualizedVolatilityPct, '%')} />
            <Metric label={t('maxDrawdown')} value={history.loading ? t('calculating') : optional(historicalMetrics.maxDrawdownPct, '%')} tone="text-warn" />
            <Metric label={t('rangePosition')} value={history.loading ? t('calculating') : optional(historicalMetrics.rangePositionPct, '%')} />
            </div>
          </section>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[10px] text-text-muted">
            <span>{t('source', { value: quote?.source || '--' })}</span>
            <span>{t('updated', { value: quote?.updated_at ? new Date(quote.updated_at).toLocaleString() : '--' })}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
