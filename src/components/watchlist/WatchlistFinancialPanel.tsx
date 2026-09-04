'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Database, TrendingDown, TrendingUp } from 'lucide-react';
import { useFinancials } from '@/lib/hooks/useQuote';
import {
  buildFinancialViewRows,
  financialGrowthPct,
  type FinancialViewMode,
  type FinancialViewRow,
} from '@/lib/watchlist/financial-view';

function value(value: number | null, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '--' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function growthTone(growth: number | null): string {
  return growth == null ? 'text-text-muted' : growth >= 0 ? 'text-up' : 'text-down';
}

function SummaryMetric({ label, valueText, growth, growthLabel }: {
  label: string;
  valueText: string;
  growth: number | null;
  growthLabel: string;
}) {
  const Icon = growth != null && growth < 0 ? TrendingDown : TrendingUp;
  return (
    <div className="min-w-0 bg-bg-elevated/55 px-3 py-3">
      <div className="text-[10px] font-medium text-text-muted">{label}</div>
      <div className="mt-1 truncate font-mono text-base font-semibold tabular-nums text-text">{valueText}</div>
      <div className={`mt-1 flex items-center gap-1 text-[10px] ${growthTone(growth)}`}>
        {growth != null && <Icon className="h-3 w-3" aria-hidden="true" />}
        {growth == null ? '--' : `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`} <span className="text-text-muted">{growthLabel}</span>
      </div>
    </div>
  );
}

function TrendBars({ label, rows, metric }: {
  label: string;
  rows: FinancialViewRow[];
  metric: 'revenue' | 'netIncome';
}) {
  const points = rows.slice(-6);
  const maximum = Math.max(0, ...points.map((row) => Math.abs(row[metric] ?? 0)));
  return (
    <div className="min-w-0 px-3 py-3">
      <div className="mb-3 text-[10px] font-semibold text-text-dim">{label}</div>
      <div className="flex h-28 items-end gap-2" role="img" aria-label={label}>
        {points.map((row) => {
          const point = row[metric];
          const height = point == null || maximum === 0 ? 2 : Math.max(6, Math.round((Math.abs(point) / maximum) * 72));
          return (
            <div key={row.key} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center" title={`${row.label}: ${value(point)}`}>
              <div className="mb-1 truncate font-mono text-[9px] text-text-muted">{value(point)}</div>
              <div
                className="mx-auto w-full max-w-9 shrink-0 rounded-t-sm opacity-75"
                style={{ height, backgroundColor: point != null && point < 0 ? 'var(--down)' : 'var(--accent)' }}
              />
              <div className="mt-1.5 truncate text-[9px] text-text-muted">{row.label.replace('20', "'")}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WatchlistFinancialPanel({ ticker }: { ticker: string }) {
  const t = useTranslations('market.table.drawer.financials');
  const financials = useFinancials(ticker);
  const [mode, setMode] = useState<FinancialViewMode>('quarterly');
  const effectiveMode = mode === 'quarterly' && financials.quarterly.length === 0 ? 'annual' : mode;
  const rows = useMemo(
    () => buildFinancialViewRows(financials.yearly, financials.quarterly, effectiveMode),
    [effectiveMode, financials.quarterly, financials.yearly],
  );
  const latest = rows.at(-1) ?? null;
  const previous = rows.at(-2) ?? null;
  const useTtm = effectiveMode === 'quarterly' && financials.ttm != null;
  const summary = useTtm ? {
    revenue: financials.ttm!.revenue,
    netIncome: financials.ttm!.netIncome,
    eps: financials.ttm!.epsBasic,
    freeCashflow: financials.ttm!.freeCashflow,
  } : latest;
  const unit = financials.meta?.unit === 'CNY_100M'
    ? t('unitCny100m')
    : financials.meta?.unit === 'USD_MILLION' ? t('unitUsdMillion') : financials.meta?.currency ?? '';

  if (financials.loading) {
    return <div className="space-y-3" role="status" aria-label={t('loading')}><div className="h-20 animate-pulse rounded bg-bg-elevated" /><div className="h-40 animate-pulse rounded bg-bg-elevated" /></div>;
  }

  if (financials.meta?.supported === false) {
    return <div className="border-y border-border py-12 text-center"><Database className="mx-auto h-5 w-5 text-text-muted" aria-hidden="true" /><div className="mt-3 text-sm font-medium text-text">{t('unsupportedTitle')}</div><p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-text-muted">{t('unsupportedBody')}</p></div>;
  }

  if (financials.error && rows.length === 0) {
    return <div className="border-y border-border py-12 text-center"><AlertCircle className="mx-auto h-5 w-5 text-warn" aria-hidden="true" /><div className="mt-3 text-sm font-medium text-text">{t('unavailable')}</div></div>;
  }

  return (
    <section aria-label={t('title')}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">{t('title')}</h3>
          <p className="mt-0.5 text-[10px] text-text-muted">{t('meta', { source: financials.source ?? '--', unit, period: financials.meta?.latestPeriodEnd ?? '--' })}</p>
        </div>
        <div className="ml-auto inline-flex rounded-md border border-border bg-bg-elevated p-0.5" role="group" aria-label={t('periodMode')}>
          {(['quarterly', 'annual'] as FinancialViewMode[]).map((item) => (
            <button key={item} type="button" onClick={() => setMode(item)} disabled={item === 'quarterly' && financials.quarterly.length === 0} aria-pressed={effectiveMode === item} className={`h-7 rounded px-2.5 text-[10px] font-medium transition disabled:opacity-40 ${effectiveMode === item ? 'bg-bg-card text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>{t(item)}</button>
          ))}
        </div>
      </div>

      {financials.meta?.warnings.length ? <div className="mb-3 flex items-start gap-2 border-l-2 border-warn bg-warn/5 px-3 py-2 text-[10px] text-text-dim"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden="true" /><span>{t('partialData', { count: financials.meta.warnings.length })}</span></div> : null}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
        <SummaryMetric label={t('revenue', { basis: useTtm ? 'TTM' : latest?.label ?? '--' })} valueText={value(summary?.revenue ?? null)} growth={financialGrowthPct(latest?.revenue ?? null, previous?.revenue ?? null)} growthLabel={t(effectiveMode === 'quarterly' ? 'quarterGrowth' : 'annualGrowth')} />
        <SummaryMetric label={t('netIncome', { basis: useTtm ? 'TTM' : latest?.label ?? '--' })} valueText={value(summary?.netIncome ?? null)} growth={financialGrowthPct(latest?.netIncome ?? null, previous?.netIncome ?? null)} growthLabel={t(effectiveMode === 'quarterly' ? 'quarterGrowth' : 'annualGrowth')} />
        <SummaryMetric label={t('eps', { basis: useTtm ? 'TTM' : latest?.label ?? '--' })} valueText={value(summary?.eps ?? null, 2)} growth={financialGrowthPct(latest?.eps ?? null, previous?.eps ?? null)} growthLabel={t(effectiveMode === 'quarterly' ? 'quarterGrowth' : 'annualGrowth')} />
        <SummaryMetric label={t('freeCashflow', { basis: useTtm ? 'TTM' : latest?.label ?? '--' })} valueText={value(summary?.freeCashflow ?? null)} growth={financialGrowthPct(latest?.freeCashflow ?? null, previous?.freeCashflow ?? null)} growthLabel={t(effectiveMode === 'quarterly' ? 'quarterGrowth' : 'annualGrowth')} />
      </div>

      {rows.length > 0 ? <>
        <div className="mt-4 grid divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <TrendBars label={t('revenueTrend')} rows={rows} metric="revenue" />
          <TrendBars label={t('incomeTrend')} rows={rows} metric="netIncome" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-xs">
            <thead className="text-[10px] text-text-muted"><tr className="border-b border-border"><th className="px-2 py-2 text-left font-medium">{t('period')}</th><th className="px-2 py-2 text-right font-medium">{t('revenueLabel')}</th><th className="px-2 py-2 text-right font-medium">{t('netIncomeLabel')}</th><th className="px-2 py-2 text-right font-medium">EPS</th><th className="px-2 py-2 text-right font-medium">{t('operatingCashflow')}</th><th className="px-2 py-2 text-right font-medium">{t('freeCashflowLabel')}</th><th className="px-2 py-2 text-right font-medium">{t('assets')}</th></tr></thead>
            <tbody>{[...rows].reverse().map((row) => <tr key={row.key} className="border-b border-border/60 last:border-0"><td className="px-2 py-2 font-medium text-text">{row.label}</td><td className="px-2 py-2 text-right tabular-nums">{value(row.revenue)}</td><td className={`px-2 py-2 text-right tabular-nums ${row.netIncome != null && row.netIncome < 0 ? 'text-down' : ''}`}>{value(row.netIncome)}</td><td className="px-2 py-2 text-right tabular-nums">{value(row.eps, 2)}</td><td className="px-2 py-2 text-right tabular-nums">{value(row.operatingCashflow)}</td><td className={`px-2 py-2 text-right tabular-nums ${row.freeCashflow != null && row.freeCashflow < 0 ? 'text-down' : ''}`}>{value(row.freeCashflow)}</td><td className="px-2 py-2 text-right tabular-nums">{value(row.totalAssets)}</td></tr>)}</tbody>
          </table>
        </div>
      </> : <div className="border-y border-border py-12 text-center text-xs text-text-muted">{t('empty')}</div>}
    </section>
  );
}
