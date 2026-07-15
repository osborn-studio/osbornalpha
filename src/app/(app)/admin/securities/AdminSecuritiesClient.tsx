'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { SecuritiesHealthResponse } from '@/lib/admin/securities-health';

type State =
  | { status: 'loading'; data: SecuritiesHealthResponse | null }
  | { status: 'ready'; data: SecuritiesHealthResponse }
  | { status: 'error'; data: SecuritiesHealthResponse | null };

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function AdminSecuritiesClient() {
  const t = useTranslations('admin.securities');
  const locale = useLocale();
  const [state, setState] = useState<State>({ status: 'loading', data: null });

  const refresh = useCallback(async () => {
    setState((previous) => ({ status: 'loading', data: previous.data }));
    try {
      const response = await fetch('/api/admin/securities', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setState({ status: 'ready', data: await response.json() as SecuritiesHealthResponse });
    } catch {
      setState((previous) => ({ status: 'error', data: previous.data }));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const data = state.data;
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div data-density="data" className="mx-auto max-w-7xl">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="mb-2 flex gap-3 text-xs">
            <Link href="/admin/usage" className="text-text-dim hover:text-text">{t('usageLink')}</Link>
            <span className="font-medium text-accent">{t('securitiesLink')}</span>
          </div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-xs text-text-dim">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={state.status === 'loading'}
          className="flex size-9 items-center justify-center rounded border border-border text-lg text-text-dim hover:bg-bg-hover hover:text-text disabled:opacity-50"
          title={t('refresh')}
          aria-label={t('refresh')}
        >
          <span aria-hidden="true">↻</span>
        </button>
      </header>

      <div className="mb-3 min-h-5 text-xs text-text-dim" aria-live="polite">
        {state.status === 'loading' && t('loading')}
        {state.status === 'error' && <span className="text-down">{t('refreshFailed')}</span>}
        {state.status === 'ready' && t('updated', { time: date.format(new Date(state.data.generated_at)) })}
      </div>

      {data && (
        <>
          <section className="grid grid-cols-2 gap-y-4 border-y border-border py-4 sm:grid-cols-5">
            <Metric label={t('metrics.backlog')} value={data.candidate_backlog} />
            <Metric label={t('metrics.hitRate')} value={percent(data.search.hit_rate)} />
            <Metric label={t('metrics.zeroRate')} value={percent(data.search.zero_result_rate)} />
            <Metric label={t('metrics.resolveRate')} value={percent(data.search.resolver_completion_rate)} />
            <Metric label={t('metrics.forceRatio')} value={percent(data.search.legacy_force_add_ratio)} />
          </section>

          <section className="overflow-x-auto border-b border-border py-4">
            <h2 className="mb-3 text-sm font-semibold">{t('scopeTitle')}</h2>
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="text-text-dim">
                <tr>
                  <th className="pb-2 font-medium">{t('columns.scope')}</th>
                  <th className="pb-2 font-medium">{t('columns.status')}</th>
                  <th className="pb-2 text-right font-medium">{t('columns.active')}</th>
                  <th className="pb-2 text-right font-medium">{t('columns.age')}</th>
                  <th className="pb-2 text-right font-medium">{t('columns.changed')}</th>
                  <th className="pb-2 text-right font-medium">{t('columns.deactivated')}</th>
                  <th className="pb-2 font-medium">{t('columns.lastResult')}</th>
                  <th className="pb-2 font-medium">{t('columns.error')}</th>
                </tr>
              </thead>
              <tbody>{data.scopes.map((row) => (
                <tr key={row.scope} className="border-t border-border">
                  <td className="py-2 font-medium">{t(`scopes.${row.scope}`)}</td>
                  <td className="py-2"><Status status={row.status} label={t(`statuses.${row.status}`)} /></td>
                  <td className="py-2 text-right tabular-nums">{row.active_count.toLocaleString(locale)}</td>
                  <td className="py-2 text-right tabular-nums">{row.data_age_hours === null ? '—' : t('hours', { value: row.data_age_hours })}</td>
                  <td className="py-2 text-right tabular-nums">{row.changed_count.toLocaleString(locale)}</td>
                  <td className="py-2 text-right tabular-nums">{row.deactivated_count.toLocaleString(locale)}</td>
                  <td className="py-2">{row.last_result ?? '—'}</td>
                  <td className="py-2 text-down">{row.error_code ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </section>

          <section className="py-4">
            <h2 className="mb-3 text-sm font-semibold">{t('canaryTitle')}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {data.canaries.map((canary) => (
                <span key={canary.ticker} className="inline-flex items-center gap-2">
                  <span className={`size-2 rounded-full ${canary.healthy ? 'bg-up' : 'bg-down'}`} aria-hidden="true" />
                  <span className="font-medium">{canary.ticker}</span>
                  <span className="text-text-dim">{canary.healthy ? t('available') : t('unavailable')}</span>
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
      <div className="truncate text-[11px] text-text-dim" title={label}>{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Status({ status, label }: { status: string; label: string }) {
  const tone = status === 'healthy' ? 'bg-up' : status === 'warning' ? 'bg-accent' : status === 'error' ? 'bg-down' : 'bg-text-muted';
  return <span className="inline-flex items-center gap-2"><span className={`size-2 rounded-full ${tone}`} />{label}</span>;
}
