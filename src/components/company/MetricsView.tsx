'use client';
// Metrics view + valuation-model area (plan 2026-11-06 Task 13; spec §5.4, §5.10; canvas Metrics).
// Reads only the company metrics proxy; stale → "pending recomputation", never "not produced" or old values.
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Tag } from '@/components/ui';
import { DcfStudio } from '@/components/DcfStudio';
import { metricNames } from '@/lib/facts/derive';
import { companyApi, type MetricEntry, type MetricsResponse } from '@/lib/company/client';
import type { Market } from '@/lib/company/types';
import { useCompanyFetch } from './useCompanyFetch';
import { useDrawers } from './DrawerHost';
import { Seg } from './Seg';
import { Callout, ErrorCard, LoadingGrid, TruncatedCard } from './StateCallout';
import { SCALES, SCALE_EXP, defaultScale, type ScaleId } from './format';
import { basedOnRevOf, metricText, metricsGrid, type MetricCol, type MetricGridRow } from './metrics-model';

const PERIODS = [8, 20, 40] as const;
const SCALE_KEYS: Record<ScaleId, string> = { raw: 'scaleRaw', thousand: 'scaleThousand', million: 'scaleMillion', hundred_million: 'scaleHundredMillion' };

export function MetricsView({ ticker, market, asOf }: { ticker: string; market: Market; asOf: string | null }) {
  const t = useTranslations('company.metrics');
  const tn = useTranslations('company.metrics.names');
  const tst = useTranslations('company.statements');
  const ts = useTranslations('company.states');
  const td = useTranslations('company.durations');
  const tab = useTranslations('company.tabs');
  const tr = useTranslations('company.replay');
  const drawers = useDrawers();
  const [periods, setPeriods] = useState<(typeof PERIODS)[number]>(8);
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const [scale, setScale] = useState<ScaleId>(defaultScale(market === 'CN' ? 'CNY' : 'USD', locale));
  // 计划第 3 轮审计 R5: the server keeps every metric row of the newest `periods` keys (no silent 200-row cut).
  const { state, retry } = useCompanyFetch<MetricsResponse>(companyApi('metrics', ticker, { asOf, periods: String(periods) }));
  const exp = SCALE_EXP[scale];
  const name = (m: string) => (tn.has(m) ? tn(m) : m);
  const dur = (d: string) => (td.has(d) ? td(d) : d);
  // 计划第 3 轮审计 R6: the row label names the surviving input unit and basis.
  const rowSub = (row: MetricGridRow) => (row.inputUnit === null ? row.metric : `${row.metric} · ${row.inputUnit} · ${row.basis}`);

  function open(e: MetricEntry, c: MetricCol) {
    if (e.cell.kind === 'withheld') { drawers.open({ kind: 'withheld', reason: e.cell.reason, title: `${name(e.metric)} · ${c.periodEnd} ${dur(c.duration)}` }); return; }
    drawers.open({ kind: 'formula', metric: e.metric, cell: e.cell, periodLabel: `${c.periodEnd} ${dur(c.duration)}`, computedAt: e.computedAt, computedAtKind: e.computedAtKind, basedOnRev: e.basedOnRev, scaleExp: exp });
  }

  function renderTable(r: MetricsResponse) {
    const g = metricsGrid(r, metricNames(market), periods);
    if (g.cols.length === 0) return <Callout>{asOf ? ts('beforeFirst') : tst('empty')}</Callout>;
    return (
      <>
        {(r.withheld.citationPending > 0 || r.withheld.evidenceIncomplete > 0) && (
          <div className="rounded-md border border-[var(--border)] px-3 py-2 text-xs">
            {r.withheld.citationPending > 0 && <div>{tst('withheldPending', { n: r.withheld.citationPending })}</div>}
            {r.withheld.evidenceIncomplete > 0 && <div>{tst('withheldIncomplete', { n: r.withheld.evidenceIncomplete })}</div>}
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="w-max min-w-full text-sm">
            <thead><tr className="text-[var(--text-dim)]">
              <th scope="col" className="sticky left-0 z-10 min-w-[160px] bg-[var(--bg-card)] px-3 py-2 text-left font-medium sm:min-w-[240px]">{t('header')}</th>
              {g.cols.map((c) => <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium"><span className="num block text-[var(--text)]">{c.periodEnd}</span><span className="block text-[11px]">{dur(c.duration)}</span></th>)}
            </tr></thead>
            <tbody>
              {g.rows.map((row) => {
                const firstCol = g.cols.find((c) => row.cells[c.key]?.cell.kind === 'derived');
                const first = firstCol ? row.cells[firstCol.key] : undefined;
                return (
                  <tr key={row.id} className="border-t border-[var(--border)]" data-testid={row.alt === 0 ? `metric-row-${row.metric}` : `metric-row-${row.metric}-${row.alt}`}>
                    <th scope="row" className="sticky left-0 z-10 bg-[var(--bg-card)] px-3 py-1.5 text-left font-normal">
                      {first && firstCol ? (
                        <button type="button" className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" onClick={() => open(first, firstCol)}>
                          {name(row.metric)}<span className="num block text-[11px] text-[var(--text-dim)]">{rowSub(row)}</span>
                        </button>
                      ) : (<>{name(row.metric)}<span className="num block text-[11px] text-[var(--text-dim)]">{rowSub(row)}</span></>)}
                    </th>
                    {g.cols.map((c) => {
                      const e = row.cells[c.key];
                      if (!e) return <td key={c.key} className="px-3 py-1.5 text-right text-[var(--text-muted)]" title={t('notProducedTitle')}>{t('notProduced')}</td>;
                      const text = metricText(e, exp);
                      const pending = e.cell.kind === 'withheld' && e.cell.reason === 'citation_pending';
                      return (
                        <td key={c.key} className="num whitespace-nowrap px-3 py-1.5 text-right">
                          <button type="button" onClick={() => open(e, c)} title={text === null ? (pending ? tst('cellPendingTitle') : tst('cellIncompleteTitle')) : undefined}
                            className={`${text === null ? 'text-[var(--text-dim)]' : 'underline decoration-dotted underline-offset-4 hover:text-[var(--accent)]'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]`}>
                            {text ?? (pending ? tst('cellPending') : tst('cellIncomplete'))}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--text-dim)]">{t('footnote')}</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Seg label={tst('periods')} value={periods} onChange={setPeriods} options={PERIODS.map((n) => ({ value: n, label: String(n) }))} />
        <Seg label={tst('scale')} value={scale} onChange={setScale} options={SCALES.map((s) => ({ value: s, label: tst(SCALE_KEYS[s]) }))} />
        {state.status === 'ok' && !state.data.stale && (
          <Tag>{state.data.asOf ? t('live', { version: state.data.formulaVersion }) : t('materialized', { rev: String(basedOnRevOf(state.data) ?? '—'), version: state.data.formulaVersion })}</Tag>
        )}
        <span className="text-[11px] text-[var(--text-dim)] sm:ml-auto">{t('note')}</span>
      </div>

      {(state.status === 'loading' || state.status === 'idle') && <LoadingGrid />}
      {state.status === 'error' && <ErrorCard message={ts('routeError', { view: tab('metrics'), code: state.code })} onRetry={retry} />}
      {state.status === 'ok' && state.data.stale && <Callout>{t('stale')}</Callout>}
      {state.status === 'ok' && !state.data.stale && state.data.truncated && <TruncatedCard onRetry={retry} onEightPeriods={periods === 8 ? undefined : () => setPeriods(8)} />}
      {state.status === 'ok' && !state.data.stale && !state.data.truncated && renderTable(state.data)}

      <div className="mt-6 flex items-center gap-3">
        <hr className="flex-1 border-[var(--border)]" /><span className="text-xs text-[var(--text-muted)]">{t('modelDivider')}</span><hr className="flex-1 border-[var(--border)]" />
      </div>
      <section aria-label={t('modelTitle')} data-testid="valuation-section" className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{t('modelTitle')}</h2><Tag>{t('modelChip')}</Tag></div>
        {asOf ? <Callout>{tr('dcfHidden')}</Callout> : <DcfStudio ticker={ticker} onOpenFact={(factId) => drawers.open({ kind: 'historyByFact', factId, scaleExp: exp })} />}
      </section>
    </div>
  );
}
