'use client';

import { AlertTriangle, ArrowUpRight, CircleAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';
import { changeClass, formatPct, formatPrice, formatVolume } from '@/lib/utils';
import {
  buildWatchlistComparisonContext,
  watchlistComparisonMetricIssue,
  watchlistComparisonValueRoles,
  WATCHLIST_COMPARISON_METRICS,
  type WatchlistComparisonMetric,
} from '@/lib/watchlist/comparison';
import type { WatchlistMarketRow } from '@/lib/watchlist/market-row';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import { watchlistTableMetricValue } from '@/lib/watchlist/table-model';

function formattedValue(
  metric: WatchlistComparisonMetric,
  row: WatchlistMarketRow,
  overview: WatchlistOverviewRow | undefined,
): { text: string; tone: string } {
  const value = watchlistTableMetricValue(row, metric.key, overview);
  if (typeof value !== 'number' || !Number.isFinite(value)) return { text: '--', tone: 'text-text-muted' };
  if (metric.format === 'price') return { text: formatPrice(value, row.currency), tone: 'text-text' };
  if (metric.format === 'compact') return { text: `${formatVolume(value)} ${row.currency}`, tone: 'text-text' };
  if (metric.format === 'percent') return { text: formatPct(value), tone: changeClass(value) };
  if (metric.format === 'percentile') return { text: `P${Math.round(value)}`, tone: 'text-text' };
  if (metric.format === 'count') return { text: String(Math.round(value)), tone: 'text-text' };
  return { text: value.toFixed(2), tone: 'text-text' };
}

export function WatchlistComparisonPanel({
  rows,
  overviewByTicker,
  historyRange,
  onOpenTicker,
  onClose,
}: {
  rows: WatchlistMarketRow[];
  overviewByTicker: Record<string, WatchlistOverviewRow>;
  historyRange: string;
  onOpenTicker?: (ticker: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('market.table');
  const panelRef = useDialogFocusTrap<HTMLElement>(onClose);
  const comparisonContext = buildWatchlistComparisonContext(rows, overviewByTicker);
  const metricRows = WATCHLIST_COMPARISON_METRICS.map((metric) => ({
    metric,
    numericValues: rows.map((row) => {
      const value = watchlistTableMetricValue(row, metric.key, overviewByTicker[row.ticker]);
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }),
  }));
  const visibleMetricRows = metricRows.filter((item) => item.numericValues.some((value) => value !== null));
  const hiddenMetricCount = metricRows.length - visibleMetricRows.length;
  const groups = [...new Set(visibleMetricRows.map(({ metric }) => metric.group))];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="watchlist-comparison-title" className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden border border-border bg-bg-card shadow-2xl sm:max-h-[86dvh] sm:rounded-lg">
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="watchlist-comparison-title" className="text-base font-semibold text-text">{t('comparison.title')}</h2>
            <p className="mt-0.5 text-[11px] text-text-muted">{t('comparison.subtitle', { count: rows.length, range: t(`filters.ranges.${historyRange}`) })}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button !h-8 !w-8 !basis-8" aria-label={t('comparison.close')} title={t('comparison.close')}><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>
        {comparisonContext.issues.length > 0 && <div className="flex items-start gap-2 border-b border-warn/25 bg-warn/5 px-4 py-2.5 text-[11px] leading-4 text-text-dim sm:px-5" role="note">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" />
          <span>{comparisonContext.issues.map((issue) => t(`comparison.issues.${issue}`)).join(' · ')}</span>
        </div>}
        {hiddenMetricCount > 0 && <div className="flex items-center gap-2 border-b border-border bg-bg-elevated/45 px-4 py-2.5 text-[11px] text-text-muted sm:px-5" role="status" data-comparison-hidden-count={hiddenMetricCount}>
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t('comparison.missingSummary', { count: hiddenMetricCount })}</span>
          {onOpenTicker && rows[0] && <button type="button" onClick={() => onOpenTicker(rows[0].ticker)} className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-text-dim hover:border-border-active hover:text-text">{t('comparison.openFirst')}<ArrowUpRight className="h-3 w-3" aria-hidden="true" /></button>}
        </div>}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs" aria-label={t('comparison.ariaLabel')}>
            <thead>
              <tr className="border-b border-border bg-bg-elevated/95">
                <th className="sticky left-0 top-0 z-20 w-32 min-w-32 bg-bg-elevated px-3 py-3 text-left text-[11px] font-semibold text-text-muted sm:w-44 sm:min-w-44 sm:px-4">{t('comparison.metric')}</th>
                {rows.map((row) => <th key={row.ticker} className="sticky top-0 z-10 min-w-[130px] bg-bg-elevated px-3 py-3 text-right sm:min-w-36 sm:px-4"><button type="button" onClick={() => onOpenTicker?.(row.ticker)} className="ml-auto flex items-center gap-1 text-right text-text hover:text-accent"><span className="min-w-0"><span className="block font-mono text-xs font-bold">{row.ticker}</span><span className="block max-w-24 truncate text-[11px] font-normal text-text-muted sm:max-w-32">{row.name}</span><span className="mt-0.5 block text-[10px] font-normal text-text-muted">{row.market} · {row.currency}</span></span>{onOpenTicker && <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}</button></th>)}
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((group) => [
                <tr key={`group:${group}`}><th colSpan={rows.length + 1} className="border-y border-border bg-bg-elevated/55 px-3 py-2 text-left text-[10px] font-semibold uppercase text-text-muted sm:px-4">{t(`comparison.groups.${group}`)}</th></tr>,
                ...visibleMetricRows.filter(({ metric }) => metric.group === group).map(({ metric, numericValues }) => {
                  const roles = watchlistComparisonValueRoles(metric, numericValues);
                  const issue = watchlistComparisonMetricIssue(metric, comparisonContext);
                  return <tr key={metric.key} className="border-b border-border/60 last:border-0 hover:bg-bg-hover/60"><th className="sticky left-0 z-10 bg-bg-card px-3 py-2.5 text-left font-medium text-text-dim sm:px-4"><span className="inline-flex items-center gap-1.5">{t(`headers.${metric.key}`)}{issue && <CircleAlert className="h-3 w-3 text-warn" aria-label={t(`comparison.issues.${issue}`)} />}</span></th>{rows.map((row, index) => { const value = formattedValue(metric, row, overviewByTicker[row.ticker]); const role = roles[index]; return <td key={row.ticker} data-comparison-role={role} className={`px-3 py-2.5 text-right font-mono tabular-nums sm:px-4 ${value.tone} ${role === 'best' ? 'bg-status-good/5 font-semibold' : role === 'worst' ? 'bg-status-bad/5' : ''}`}>{value.text}</td>; })}</tr>;
                }),
              ])}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
