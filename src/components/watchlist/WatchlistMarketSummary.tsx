'use client';

import { Activity, Gauge, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { changeClass, formatPct } from '@/lib/utils';
import type { WatchlistMarketSummary as Summary } from '@/lib/watchlist/summary';

function Metric({ label, value, detail, tone = 'text-text', iconTone = 'text-text-muted', icon: Icon }: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: string;
  iconTone?: string;
  icon: typeof Activity;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg-elevated shadow-sm ${iconTone}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-medium text-text-muted">{label}</span>
        <span className={`mt-0.5 block font-mono text-base font-semibold tabular-nums ${tone}`}>{value}</span>
        {detail && <span className="mt-0.5 hidden truncate text-[10px] text-text-muted sm:block">{detail}</span>}
      </span>
    </div>
  );
}

export function WatchlistMarketSummary({ summary }: { summary: Summary }) {
  const t = useTranslations('market.table');
  const average = summary.averageChangePct;
  const breadth = summary.breadthPct;
  const attention = summary.delayed + summary.stale + summary.unavailable;
  const coverage = summary.tracked > 0 ? Math.round((summary.quoted / summary.tracked) * 100) : 0;

  return <>
    <section className="grid h-[52px] grid-cols-4 divide-x divide-border border-b border-border bg-bg-card sm:hidden" aria-label={t('summary.quoteStatusAriaLabel')}>
      <div className="min-w-0 px-2 py-2"><span className="block truncate text-[9px] text-text-muted">{t('summary.tracked')}</span><span className="mt-0.5 block font-mono text-sm font-semibold text-text">{summary.tracked}</span></div>
      <div className="min-w-0 px-2 py-2"><span className="block truncate text-[9px] text-text-muted">{t('summary.average')}</span><span className={`mt-0.5 block truncate font-mono text-sm font-semibold ${average == null ? 'text-text-muted' : changeClass(average)}`}>{average == null ? '--' : formatPct(average)}</span></div>
      <div className="min-w-0 px-2 py-2"><span className="block truncate text-[9px] text-text-muted">{t('summary.breadth')}</span><span className={`mt-0.5 block truncate font-mono text-sm font-semibold ${breadth == null ? 'text-text-muted' : changeClass(breadth)}`}>{breadth == null ? '--' : formatPct(breadth)}</span></div>
      <div className="min-w-0 px-2 py-2"><span className={`block truncate text-[9px] ${attention > 0 ? 'text-warn' : 'text-status-good'}`}>{attention > 0 ? t('summary.needsAttention') : t('summary.live')}</span><span className="mt-0.5 block font-mono text-sm font-semibold text-text">{coverage}%</span></div>
    </section>
    <section
      className="hidden grid-cols-4 divide-x divide-border border-b border-border bg-bg-card sm:grid xl:grid-cols-[0.82fr_1fr_1fr_1.35fr]"
      aria-label={t('summary.quoteStatusAriaLabel')}
    >
      <Metric
        icon={Activity}
        iconTone="bg-status-info/10 text-status-info"
        label={t('summary.tracked')}
        value={summary.tracked}
        detail={`${summary.quoted}/${summary.tracked} · ${coverage}%`}
      />
      <Metric
        icon={TrendingUp}
        iconTone={average == null ? 'text-text-muted' : average >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}
        label={t('summary.average')}
        value={average == null ? '--' : formatPct(average)}
        detail={`${t('summary.gainers')} ${summary.gainers} · ${t('summary.decliners')} ${summary.decliners} · ${t('summary.sample', { count: summary.movementSample, total: summary.quoted })}`}
        tone={average == null ? 'text-text-muted' : changeClass(average)}
      />
      <Metric
        icon={breadth != null && breadth < 0 ? TrendingDown : Gauge}
        iconTone={breadth == null ? 'text-text-muted' : breadth >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}
        label={t('summary.breadth')}
        value={breadth == null ? '--' : formatPct(breadth)}
        detail={`${t('summary.median')} ${summary.medianChangePct == null ? '--' : formatPct(summary.medianChangePct)} · ${t('summary.sample', { count: summary.movementSample, total: summary.quoted })}`}
        tone={breadth == null ? 'text-text-muted' : changeClass(breadth)}
      />
      <div className="flex min-w-0 items-center px-3 py-3 sm:px-4">
        <div className="w-full min-w-0">
          <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-text-muted">
            <span>{t('summary.quoteStatus')}</span>
            <span className={attention > 0 ? 'text-warn' : 'text-status-good'}>
              {attention > 0 ? t('summary.needsAttention') : t('summary.live')}
            </span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-bg-elevated" aria-hidden="true">
            {summary.tracked > 0 && <>
              <span className="bg-status-good" style={{ width: `${(summary.live / summary.tracked) * 100}%` }} />
              <span className="bg-status-info" style={{ width: `${(summary.delayed / summary.tracked) * 100}%` }} />
              <span className="bg-warn" style={{ width: `${(summary.stale / summary.tracked) * 100}%` }} />
              <span className="bg-status-bad" style={{ width: `${(summary.unavailable / summary.tracked) * 100}%` }} />
            </>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-text-muted">
            <span className="text-status-good">{t('summary.live')} {summary.live}</span>
            {summary.delayed > 0 && <span className="text-status-info">{t('summary.delayed')} {summary.delayed}</span>}
            {summary.stale > 0 && <span className="text-warn">{t('summary.stale')} {summary.stale}</span>}
            {summary.unavailable > 0 && <span className="text-status-bad">{t('summary.unavailable')} {summary.unavailable}</span>}
          </div>
        </div>
      </div>
    </section>
  </>;
}
