// src/components/company/StatementsView.tsx
'use client';
// Statements view (plan 2026-11-06 Task 12; spec §5.3, §5.7, §5.9; canvas Main, Replay, M-Company, States).
// Table is the primary view; values are display strings from value_text; withheld cells never show a value.
import { Fragment, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Tag } from '@/components/ui';
import { companyApi, companyHref, type StatementsResponse } from '@/lib/company/client';
import type { Basis, GridRow, PeriodCol, StatementKind } from '@/lib/company/types';
import { useCompanyFetch } from './useCompanyFetch';
import { Seg } from './Seg';
import { useDrawers } from './DrawerHost';
import { ConceptPopover } from './ConceptPopover';
import { MiniBars } from './MiniBars';
import { Callout, ErrorCard, LoadingGrid, TruncatedCard } from './StateCallout';
import { SCALES, SCALE_EXP, defaultScale, type ScaleId } from './format';
import { barSeries, cellView, gridEmptyState, moneyCurrency, statementsCsv, type Badge } from './statements-model';

const PERIODS = [8, 20, 40] as const;
const SCALE_KEYS: Record<ScaleId, string> = { raw: 'scaleRaw', thousand: 'scaleThousand', million: 'scaleMillion', hundred_million: 'scaleHundredMillion' };

function BadgeMark({ b }: { b: Badge }) {
  const t = useTranslations('company.badges');
  const title = b.code === 'R' ? t('R') : b.code === 'n' ? t('n', { seq: b.seq ?? 2 }) : b.code === 'U' ? t('U') : t('pending');
  return (
    <span title={title}
      className={`num ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm border px-0.5 text-[10px] leading-none ${b.code === '!' ? 'border-[var(--warn)] text-[var(--warn)]' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>
      <span aria-hidden>{b.code}</span><span className="sr-only">{title}</span>
    </span>
  );
}

export function StatementsView({ ticker, asOf, isAdmin, adminView, onAdminView, highlight }: { ticker: string; asOf: string | null; isAdmin: boolean; adminView: boolean; onAdminView: (v: boolean) => void; highlight: string | null }) {
  const t = useTranslations('company.statements');
  const ts = useTranslations('company.states');
  const tc = useTranslations('company.concepts');
  const td = useTranslations('company.durations');
  const tab = useTranslations('company.tabs');
  const router = useRouter();
  const drawers = useDrawers();
  const [statement, setStatement] = useState<StatementKind>('IS');
  const [basis, setBasis] = useState<Basis>('disclosed');
  const [periods, setPeriods] = useState<(typeof PERIODS)[number]>(8);
  const [scale, setScale] = useState<ScaleId | null>(null);
  const [bars, setBars] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<string | null>(null);
  const headRefs = useRef(new Map<string, HTMLButtonElement>());

  const url = companyApi('statements', ticker, { statement, basis, periods: String(periods), asOf }, isAdmin && adminView);
  const { state, retry } = useCompanyFetch<StatementsResponse>(url);
  const data = state.status === 'ok' ? state.data : null;
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const scaleId = scale ?? defaultScale(data ? moneyCurrency(data.rows) : null, locale);
  const exp = SCALE_EXP[scaleId];
  const label = (c: string) => (tc.has(c) ? tc(c) : c);
  const durLabel = (d: string) => (td.has(d) ? td(d) : d);

  function pickStatement(s: StatementKind) { setStatement(s); if (s === 'BS' && basis === 'quarterly') setBasis('disclosed'); }
  function exportCsv(r: StatementsResponse) {
    const blob = new Blob([statementsCsv(r)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${ticker}_${r.statement}_${r.basis}_${asOf ?? 'latest'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function openCell(row: GridRow, p: PeriodCol) {
    const v = cellView(row.cells[p.key] ?? null, row, exp, data?.filings ?? {}, data?.otherUnitOnly[row.concept]?.includes(p.key) ?? false, data?.otherUnitsAlso?.[row.concept]?.includes(p.key) ?? false);
    const title = `${label(row.concept)} · ${p.periodEnd} ${durLabel(p.duration)}`;
    if (v.kind === 'fact') {
      drawers.open({ kind: 'history', key: { concept: row.concept, periodStart: p.periodStart, periodEnd: p.periodEnd, unit: v.cell.unit }, duration: p.duration, otherUnits: v.cell.otherUnits, scaleExp: row.unitKind === 'money' ? exp : 0 });
    } else if (v.kind === 'derived') {
      drawers.open({ kind: 'formula', metric: v.cell.metric, cell: v.cell, periodLabel: `${p.periodEnd} ${durLabel(p.duration)}`, computedAt: null, computedAtKind: 'live', basedOnRev: data?.stateRev ?? null, scaleExp: exp });
    } else if (v.kind === 'withheld') {
      drawers.open({ kind: 'withheld', reason: v.reason, title });
    } else if (v.kind === 'missing' && v.otherUnitOnly && row.unit) {
      // "— U": only other-unit facts exist; the history endpoint lists them in otherUnitSeries (primary unit = the row's).
      drawers.open({ kind: 'history', key: { concept: row.concept, periodStart: p.periodStart, periodEnd: p.periodEnd, unit: row.unit }, duration: p.duration, otherUnits: true, scaleExp: 0 });
    }
  }
  function closePopover(concept: string) { setPopover(null); requestAnimationFrame(() => headRefs.current.get(concept)?.focus()); }

  const hl = highlight && data?.filings[highlight];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Seg label={t('statement')} value={statement} onChange={pickStatement}
          options={(['IS', 'BS', 'CF'] as const).map((s) => ({ value: s, label: t(s) }))} />
        <Seg label={t('basis')} value={basis} onChange={setBasis}
          options={[{ value: 'disclosed' as Basis, label: t('disclosed') }, { value: 'annual' as Basis, label: t('annual') },
            { value: 'quarterly' as Basis, label: t('quarterly'), disabled: statement === 'BS', title: statement === 'BS' ? t('quarterlyBsDisabled') : undefined }]} />
        {statement === 'BS' && <span className="text-[11px] text-[var(--text-dim)]">{t('quarterlyBsDisabled')}</span>}
        <Seg label={t('periods')} value={periods} onChange={setPeriods} options={PERIODS.map((n) => ({ value: n, label: String(n) }))} />
        <Seg label={t('scale')} value={scaleId} onChange={setScale} options={SCALES.map((s) => ({ value: s, label: t(SCALE_KEYS[s]) }))} />
        <Tag>{t('consolidated')}</Tag>
        {isAdmin && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <input type="checkbox" checked={adminView} onChange={(e) => onAdminView(e.target.checked)} />{t('adminToggle')}
          </label>
        )}
        <Button variant="secondary" size="sm" className="sm:ml-auto" disabled={!data || data.truncated} onClick={() => data && exportCsv(data)}>{t('exportCsv')}</Button>
      </div>

      {hl && (
        <div className="flex items-center gap-2 text-xs">
          <Tag tone="accent">{t('highlight', { label: `${hl.formType} ${hl.sourceRef}` })}</Tag>
          <Button variant="ghost" size="sm" onClick={() => router.push(companyHref(ticker, { view: 'statements', asOf }) as never)}>{t('clearHighlight')}</Button>
        </div>
      )}

      {(state.status === 'loading' || state.status === 'idle') && <LoadingGrid />}
      {state.status === 'error' && <ErrorCard message={ts('routeError', { view: tab('statements'), code: state.code })} onRetry={retry} />}
      {data && data.truncated && <TruncatedCard onRetry={retry} onEightPeriods={periods === 8 ? undefined : () => setPeriods(8)} />}
      {data && !data.truncated && gridEmptyState(data, asOf) && <Callout>{gridEmptyState(data, asOf) === 'before_first' ? ts('beforeFirst') : t('empty')}</Callout>}

      {data && !data.truncated && !gridEmptyState(data, asOf) && (
        <>
          {(data.withheld.citationPending > 0 || data.withheld.evidenceIncomplete > 0) && (
            <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs">
              {data.withheld.citationPending > 0 && <span><span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />{t('withheldPending', { n: data.withheld.citationPending })}</span>}
              {data.withheld.evidenceIncomplete > 0 && <span><span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />{t('withheldIncomplete', { n: data.withheld.evidenceIncomplete })}</span>}
            </div>
          )}
          <div className="text-[11px] text-[var(--text-dim)]">{t('badgeLegend')}</div>

          <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
            <table className="w-max min-w-full text-sm">
              <thead>
                <tr className="text-[var(--text-dim)]">
                  <th scope="col" className="sticky left-0 z-10 min-w-[160px] bg-[var(--bg-card)] px-3 py-2 text-left font-medium sm:min-w-[220px]">{t('conceptHeader')}</th>
                  {data.periods.map((p) => (
                    <th key={p.key} scope="col" className="px-3 py-2 text-right font-medium">
                      <span className="num block text-[var(--text)]">{p.periodEnd}</span><span className="block text-[11px]">{durLabel(p.duration)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <Fragment key={row.concept}>
                    <tr className="border-t border-[var(--border)]" data-testid={`grid-row-${row.concept}`}>
                      <th scope="row" className="sticky left-0 z-10 bg-[var(--bg-card)] px-3 py-1.5 text-left font-normal">
                        <div className="relative flex items-center gap-2">
                          <button type="button" ref={(el) => { if (el) headRefs.current.set(row.concept, el); }}
                            onClick={() => setPopover(popover === row.concept ? null : row.concept)} aria-expanded={popover === row.concept}
                            className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                            {label(row.concept)}
                            <span className="num block text-[11px] text-[var(--text-dim)]">{row.concept}{row.unit ? ` · ${row.unit}` : ''}</span>
                          </button>
                          <button type="button" aria-pressed={bars.has(row.concept)}
                            onClick={() => setBars((s) => { const n = new Set(s); if (n.has(row.concept)) n.delete(row.concept); else n.add(row.concept); return n; })}
                            className={`hidden rounded-full border px-2 text-[10px] sm:inline-flex ${bars.has(row.concept) ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>
                            {t('miniBars')}
                          </button>
                          {popover === row.concept && <ConceptPopover row={row} mappingGen={data.mappingGen} label={label(row.concept)} anchor={headRefs.current.get(row.concept) ?? null} onClose={() => closePopover(row.concept)} />}
                        </div>
                      </th>
                      {data.periods.map((p) => {
                        const v = cellView(row.cells[p.key] ?? null, row, exp, data.filings, data.otherUnitOnly[row.concept]?.includes(p.key) ?? false, data.otherUnitsAlso?.[row.concept]?.includes(p.key) ?? false);
                        const isHl = !!highlight && v.kind === 'fact' && v.cell.filingId === highlight;
                        return (
                          <td key={p.key} className={`num whitespace-nowrap px-3 py-1.5 text-right ${isHl ? 'bg-[var(--accent-wash)]' : ''}`}>
                            {v.kind === 'missing' && !v.otherUnitOnly && <span className="text-[var(--text-muted)]" title={t('cellMissingTitle')}>—</span>}
                            {v.kind === 'missing' && v.otherUnitOnly && (
                              <>
                                <button type="button" onClick={() => openCell(row, p)} data-testid={`cell-${row.concept}-${p.key}`} title={t('cellOtherUnitTitle')}
                                  className="text-[var(--text-muted)] hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">—</button>
                                <BadgeMark b={{ code: 'U' }} />
                              </>
                            )}
                            {v.kind === 'withheld' && (
                              <button type="button" onClick={() => openCell(row, p)} className="text-[var(--text-dim)]" data-testid={`cell-${row.concept}-${p.key}`}
                                title={v.reason === 'citation_pending' ? t('cellPendingTitle') : t('cellIncompleteTitle')}>
                                {v.reason === 'citation_pending' ? t('cellPending') : t('cellIncomplete')}
                              </button>
                            )}
                            {(v.kind === 'fact' || v.kind === 'derived') && (
                              <button type="button" onClick={() => openCell(row, p)} data-testid={`cell-${row.concept}-${p.key}`}
                                aria-label={`${label(row.concept)} ${p.periodEnd} ${durLabel(p.duration)} ${v.text}`}
                                className="underline decoration-dotted underline-offset-4 hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                                {v.text}
                              </button>
                            )}
                            {(v.kind === 'fact' || v.kind === 'derived') && v.badges.map((b) => <BadgeMark key={b.code} b={b} />)}
                          </td>
                        );
                      })}
                    </tr>
                    {bars.has(row.concept) && (
                      <tr className="hidden sm:table-row">
                        <td className="sticky left-0 z-10 bg-[var(--bg-card)] px-3 text-[11px] text-[var(--text-dim)]">{t('miniBarsNote')}</td>
                        <td colSpan={data.periods.length} className="px-3 py-1.5">
                          <MiniBars series={barSeries(row, data.periods)} label={t('miniBarsAria', { concept: label(row.concept) })} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-dim)]">{t('footnote')}</p>
        </>
      )}
    </div>
  );
}
