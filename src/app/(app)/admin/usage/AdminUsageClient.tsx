'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { AdminUsageResponse, UsageWindowKey } from '@/lib/admin/usage';

type ViewState =
  | { status: 'loading'; data: AdminUsageResponse | null }
  | { status: 'ready'; data: AdminUsageResponse }
  | { status: 'error'; data: AdminUsageResponse | null; message: string };

const RANGES: UsageWindowKey[] = ['24h', '7d', '30d'];

function Metric({ label, value, tone = 'default' }: {
  label: string;
  value: string | number;
  tone?: 'default' | 'positive' | 'negative';
}) {
  const valueClass = tone === 'positive' ? 'text-up' : tone === 'negative' ? 'text-down' : 'text-text';
  return (
    <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
      <div className="truncate text-[11px] text-text-dim" title={label}>{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function duration(value: number | null): string {
  if (value === null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

export function AdminUsageClient() {
  const t = useTranslations('admin.usage');
  const securitiesT = useTranslations('admin.securities');
  const locale = useLocale();
  const [range, setRange] = useState<UsageWindowKey>('7d');
  const [state, setState] = useState<ViewState>({ status: 'loading', data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ status: 'loading', data: previous.data }));
    fetch(`/api/admin/usage?range=${range}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<AdminUsageResponse>;
      })
      .then((data) => setState({ status: 'ready', data }))
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setState((previous) => ({ status: 'error', data: previous.data, message: t('refreshFailed') }));
      });
    return () => controller.abort();
  }, [range, t]);

  const data = state.data;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div data-density="data" className="mx-auto max-w-7xl">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="mb-2 flex gap-3 text-xs">
            <span className="font-medium text-accent">{securitiesT('usageLink')}</span>
            <Link href="/admin/securities" className="text-text-dim hover:text-text">{securitiesT('securitiesLink')}</Link>
          </div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-xs text-text-dim">{t('subtitle')}</p>
        </div>
        <div className="inline-flex rounded-md border border-border bg-bg-elevated p-0.5" role="group">
          {RANGES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              aria-pressed={range === key}
              className={`min-h-8 rounded px-3 text-xs transition-colors ${
                range === key ? 'bg-accent-dim text-white' : 'text-text-dim hover:bg-bg-hover hover:text-text'
              }`}
            >
              {t(`ranges.${key}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="mb-3 min-h-5 text-xs text-text-dim" aria-live="polite">
        {state.status === 'loading' && t('loading')}
        {state.status === 'error' && <span className="text-down">{state.message}</span>}
        {state.status === 'ready' && t('updated', {
          from: dateFormatter.format(new Date(state.data.window.from)),
          to: dateFormatter.format(new Date(state.data.window.to)),
        })}
      </div>

      {data && (
        <>
          <section className="border-y border-border py-4">
            <h2 className="mb-3 text-sm font-semibold">{t('sections.funnel')}</h2>
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              <Metric label={t('metrics.registrations')} value={data.funnel.registrations} />
              <Metric label={t('metrics.watchlistViewers')} value={data.funnel.watchlist_viewers} />
              <Metric label={t('metrics.activatedUsers')} value={data.funnel.activated_users} tone="positive" />
              <Metric label={t('metrics.activationRate')} value={percent(data.funnel.activation_rate)} tone="positive" />
            </div>
          </section>

          <section className="border-b border-border py-4">
            <h2 className="mb-3 text-sm font-semibold">{t('sections.search')}</h2>
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              <Metric label={t('metrics.searchSubmitted')} value={data.search.submitted} />
              <Metric label={t('metrics.searchClicked')} value={data.search.clicked} />
              <Metric label={t('metrics.forceAdded')} value={data.search.force_added} />
              <Metric label={t('metrics.stocksAdded')} value={data.search.added} tone="positive" />
            </div>
          </section>

          <section className="border-b border-border py-4">
            <h2 className="mb-3 text-sm font-semibold">{t('sections.ai')}</h2>
            <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label={t('metrics.aiTotal')} value={data.ai.total} />
              <Metric label={t('metrics.aiCompleted')} value={data.ai.completed} tone="positive" />
              <Metric label={t('metrics.aiFailed')} value={data.ai.failed} tone={data.ai.failed ? 'negative' : 'default'} />
              <Metric label={t('metrics.completionRate')} value={percent(data.ai.completion_rate)} />
              <Metric label={t('metrics.medianDuration')} value={duration(data.ai.median_duration_ms)} />
              <Metric label={t('metrics.postAddClickRate')} value={percent(data.ai.post_add_click_rate)} />
            </div>
            {Object.keys(data.ai.by_method).length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-text-dim">{t('methods')}</span>
                {Object.entries(data.ai.by_method).map(([method, count]) => (
                  <span key={method} className="rounded border border-border bg-bg-elevated px-2 py-1">
                    {method} <span className="ml-1 tabular-nums text-text-dim">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:gap-8">
            <section className="min-w-0 border-b border-border py-4">
              <h2 className="mb-3 text-sm font-semibold">{t('sections.popular')}</h2>
              {data.popular_tickers.length === 0 ? (
                <p className="text-xs text-text-dim">{t('emptyPopular')}</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-text-dim">
                    <tr><th className="pb-2 font-medium">{t('columns.ticker')}</th><th className="pb-2 text-right font-medium">{t('columns.adds')}</th></tr>
                  </thead>
                  <tbody>{data.popular_tickers.map((row) => (
                    <tr key={row.ticker} className="border-t border-border">
                      <td className="py-2 font-medium">{row.ticker}</td><td className="py-2 text-right tabular-nums">{row.adds}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>

            <section className="min-w-0 border-b border-border py-4">
              <h2 className="mb-3 text-sm font-semibold">{t('sections.sources')}</h2>
              <div className="mb-4 grid grid-cols-3 gap-y-4">
                <Metric label={t('metrics.quoteBatches')} value={data.quotes.batches} />
                <Metric label={t('metrics.quoteFailed')} value={data.quotes.failed_tickers} tone={data.quotes.failed_tickers ? 'negative' : 'default'} />
                <Metric label={t('metrics.quoteStale')} value={data.quotes.stale} />
              </div>
              {Object.keys(data.quotes.sources).length === 0 ? (
                <p className="text-xs text-text-dim">{t('emptySources')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] text-left text-xs">
                    <thead className="text-text-dim">
                      <tr>
                        <th className="pb-2 font-medium">{t('columns.source')}</th>
                        <th className="pb-2 text-right font-medium">{t('columns.attempted')}</th>
                        <th className="pb-2 text-right font-medium">{t('columns.succeeded')}</th>
                        <th className="pb-2 text-right font-medium">{t('columns.failed')}</th>
                        <th className="pb-2 text-right font-medium">{t('columns.duration')}</th>
                      </tr>
                    </thead>
                    <tbody>{Object.entries(data.quotes.sources).map(([source, row]) => (
                      <tr key={source} className="border-t border-border">
                        <td className="py-2 font-medium">{source}</td>
                        <td className="py-2 text-right tabular-nums">{row.attempted}</td>
                        <td className="py-2 text-right tabular-nums text-up">{row.succeeded}</td>
                        <td className="py-2 text-right tabular-nums text-down">{row.failed}</td>
                        <td className="py-2 text-right tabular-nums">{duration(row.duration_ms)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="py-4">
            <h2 className="mb-3 text-sm font-semibold">{t('sections.failures')}</h2>
            {data.recent_ai_failures.length === 0 ? (
              <p className="text-xs text-text-dim">{t('emptyFailures')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="text-text-dim">
                    <tr>
                      <th className="pb-2 font-medium">{t('columns.ticker')}</th>
                      <th className="pb-2 font-medium">{t('columns.method')}</th>
                      <th className="pb-2 font-medium">{t('columns.error')}</th>
                      <th className="pb-2 text-right font-medium">{t('columns.time')}</th>
                    </tr>
                  </thead>
                  <tbody>{data.recent_ai_failures.map((failure, index) => (
                    <tr key={`${failure.created_at}-${index}`} className="border-t border-border">
                      <td className="py-2 font-medium">{failure.ticker ?? '—'}</td>
                      <td className="py-2 pr-4">{failure.method_id}</td>
                      <td className="py-2 text-down">{failure.error_code ?? '—'}</td>
                      <td className="py-2 text-right tabular-nums text-text-dim">{dateFormatter.format(new Date(failure.created_at))}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
