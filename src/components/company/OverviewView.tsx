'use client';
// Overview view (plan 2026-11-06 Task 13; spec §5.8, §5.10, decision J; canvas Overview).
// No K-line, no quote card, no PE/PB/ROE/dividend yield/market cap.
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card, Tag } from '@/components/ui';
import { companyApi, companyHref, isWithheld, type OverviewResponse } from '@/lib/company/client';
import type { Cell, Market } from '@/lib/company/types';
import { useCompanyFetch } from './useCompanyFetch';
import { useDrawers } from './DrawerHost';
import { Callout, ErrorCard, LoadingGrid, TruncatedCard } from './StateCallout';
import { SCALE_EXP, defaultScale, formatPercent, formatValue, signed, unitCaption, unitKindOfUnit, type ScaleId } from './format';
import { formTypeLabel } from './filings-model';
import { eventView, quickItems, type ValueRef } from './overview-model';
import { periodKeyParts } from './statements-model';
// INDUSTRY:BEGIN — industry row from the industry research module (canvas Overview 所属行业)
import { IndustryRow } from '@/components/industries/IndustryRow';
// INDUSTRY:END

const SCALE_KEYS: Record<ScaleId, string> = { raw: 'scaleRaw', thousand: 'scaleThousand', million: 'scaleMillion', hundred_million: 'scaleHundredMillion' };

/** Currency and applied scale printed next to a value (e.g. "100M · CNY"): never implicit. */
function UnitCaption({ unit, exp }: { unit: string; exp: number }) {
  const tst = useTranslations('company.statements');
  const c = unitCaption(unit, unitKindOfUnit(unit) === 'money' ? exp : 0);
  if (!c) return null;
  return <span className="ml-1 text-[11px] text-[var(--text-dim)]" data-testid="unit-caption">{c.scaleId ? `${tst(SCALE_KEYS[c.scaleId])} · ` : ''}{c.unit}</span>;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';

export function SignalsCard() {
  const t = useTranslations('company.overview');
  return <Card className="flex flex-col gap-1.5" data-testid="signals-card"><h2 className="text-sm font-semibold">{t('signalsTitle')}</h2><span className="text-sm text-[var(--text-dim)]">{t('signalsNone')}</span></Card>;
}

/** A payload / headline value as a drawer-opening button; a withheld marker opens the withheld-reason drawer. */
function ValueButton({ refv, concept, unit: unitHint, currency, exp }: { refv: ValueRef; concept: string; unit?: string; currency: string; exp: number }) {
  const tst = useTranslations('company.statements');
  const drawers = useDrawers();
  if (isWithheld(refv)) {
    return <button type="button" className={`text-[var(--text-dim)] ${FOCUS}`} onClick={() => drawers.open({ kind: 'withheld', reason: refv.reason, title: concept })}>{refv.reason === 'citation_pending' ? tst('cellPending') : tst('cellIncomplete')}</button>;
  }
  const unit = refv.unit ?? unitHint ?? currency;
  return (
    <>
      <button type="button" onClick={() => drawers.open({ kind: 'historyByFact', factId: refv.factId, scaleExp: unitKindOfUnit(unit) === 'money' ? exp : 0 })}
        className={`num underline decoration-dotted underline-offset-4 hover:text-[var(--accent)] ${FOCUS}`}>
        {formatValue(refv.value, unitKindOfUnit(unit), exp)}
      </button>
      <UnitCaption unit={unit} exp={exp} />
    </>
  );
}

function QuickValue({ cell, k, periodKey, stateRev, exp, label, unavailableReason }: { cell: Cell | undefined; k: string; periodKey: string; stateRev: number; exp: number; label: string; unavailableReason?: 'multiple_units' }) {
  const tst = useTranslations('company.statements');
  const td = useTranslations('company.durations');
  const t = useTranslations('company.overview');
  const drawers = useDrawers();
  const dur = (d: string) => (td.has(d) ? td(d) : d);
  if (!cell && unavailableReason === 'multiple_units') return <span className="text-sm text-[var(--text-dim)]">{t('multipleUnits')}</span>;
  if (!cell) return <span className="num text-[var(--text-muted)]" title={tst('cellMissingTitle')}>—</span>;
  if (cell.kind === 'withheld') {
    return <button type="button" className={`text-sm text-[var(--text-dim)] ${FOCUS}`} onClick={() => drawers.open({ kind: 'withheld', reason: cell.reason, title: label })}>{cell.reason === 'citation_pending' ? tst('cellPending') : tst('cellIncomplete')}</button>;
  }
  const parts = periodKeyParts(periodKey);
  const cls = `num text-xl underline decoration-dotted underline-offset-4 hover:text-[var(--accent)] ${FOCUS}`;
  if (cell.kind === 'derived') {
    // Neutral colour with an explicit sign for YoY: no up/down colours (spec §5.8).
    const text = cell.unit === 'pure' ? (k === 'revenue_yoy' ? signed(formatPercent(cell.value)) : formatPercent(cell.value)) : formatValue(cell.value, unitKindOfUnit(cell.unit), exp);
    return (
      <span>
        <button type="button" className={cls} onClick={() => drawers.open({ kind: 'formula', metric: cell.metric, cell, periodLabel: `${parts.periodEnd} ${dur(parts.duration)}`, computedAt: null, computedAtKind: 'live', basedOnRev: stateRev, scaleExp: exp })}>{text}</button>
        <UnitCaption unit={cell.unit} exp={exp} />
      </span>
    );
  }
  const kind = unitKindOfUnit(cell.unit);
  const shown = kind === 'money' ? exp : 0;
  return (
    <span>
      <button type="button" className={cls}
        onClick={() => drawers.open({ kind: 'history', key: { concept: k, periodStart: parts.periodStart, periodEnd: parts.periodEnd, unit: cell.unit }, duration: parts.duration, otherUnits: cell.otherUnits, scaleExp: shown })}>
        {formatValue(cell.value, kind, shown)}
      </button>
      <UnitCaption unit={cell.unit} exp={exp} />
    </span>
  );
}

export function OverviewView({ ticker, market, asOf }: { ticker: string; market: Market; asOf: string | null }) {
  const t = useTranslations('company.overview');
  const tl = useTranslations('company.overview.labels');
  const tc = useTranslations('company.concepts');
  const tt = useTranslations('company.filings.types');
  const ts = useTranslations('company.states');
  const td = useTranslations('company.durations');
  const tab = useTranslations('company.tabs');
  const { state, retry } = useCompanyFetch<OverviewResponse>(companyApi('overview', ticker, { asOf }));
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const currency = market === 'CN' ? 'CNY' : 'USD';
  const exp = SCALE_EXP[defaultScale(currency, locale)];
  const dur = (d: string) => (td.has(d) ? td(d) : d);
  const formLabel = (form: string) => { const l = formTypeLabel(form, market); return 'text' in l ? l.text : tt(l.key); };
  const conceptName = (c: string) => (tc.has(c) ? tc(c) : c);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="flex flex-col gap-5">
        {(state.status === 'loading' || state.status === 'idle') && <LoadingGrid />}
        {state.status === 'error' && <ErrorCard message={ts('routeError', { view: tab('overview'), code: state.code })} onRetry={retry} />}
        {state.status === 'ok' && (() => {
          const o = state.data;
          const latest = o.latest;
          const hasMultipleUnits = latest && quickItems(market).some(it =>
            !(it.group === 'facts' ? latest.facts : latest.derived)[it.key] && latest.unavailableReasons?.[it.group]?.[it.key] === 'multiple_units');
          return (
            <>
              <Card aria-label={t('latestTitle')} className="flex flex-col gap-3" data-testid="overview-latest">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{t('latestTitle')}</h2>
                  {latest && !latest.truncated && latest.periodKey && (() => { const p = periodKeyParts(latest.periodKey); return <Tag><span className="num">{p.periodStart} → {p.periodEnd} · {dur(p.duration)}</span></Tag>; })()}
                </div>
                {latest?.truncated && <TruncatedCard onRetry={retry} />}
                {!latest && <Callout>{asOf ? ts('beforeFirst') : t('noLatest')}</Callout>}
                {latest && !latest.truncated && latest.periodKey && (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {quickItems(market).map((it) => (
                        <div key={it.key} className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-xs text-[var(--text-dim)]">{tl(it.key)}</span>
                          <span className="num truncate text-[10px] text-[var(--text-muted)]">{it.key}{it.group === 'derived' ? ` · ${t('derived')}` : ''}</span>
                          <QuickValue cell={(it.group === 'facts' ? latest.facts : latest.derived)[it.key]} k={it.key} periodKey={latest.periodKey ?? ''} stateRev={latest.stateRev} exp={exp} label={tl(it.key)} unavailableReason={latest.unavailableReasons?.[it.group]?.[it.key]} />
                        </div>
                      ))}
                    </div>
                    {hasMultipleUnits && <p className="text-xs text-[var(--text-dim)]">
                      {t('multipleUnitsExplanation')}{' '}
                      <Link href={companyHref(ticker, { view: 'statements', asOf }) as never} className={`whitespace-nowrap underline underline-offset-4 hover:text-[var(--accent)] ${FOCUS}`}>{t('toStatements')}</Link>
                    </p>}
                    <p className="text-[11px] text-[var(--text-dim)]">{t('envelope', { rev: String(latest.stateRev) })}</p>
                  </>
                )}
              </Card>

              <Card aria-label={t('eventsTitle')} className="flex flex-col gap-2" data-testid="overview-events">
                <div className="flex items-center"><h2 className="text-lg font-semibold">{t('eventsTitle')}</h2>
                  <Link href={companyHref(ticker, { view: 'tracking', asOf }) as never} className="ml-auto text-sm">{t('eventsAll')}</Link></div>
                {o.recentEvents.length === 0 ? <Callout>{t('noEvents')}</Callout> : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><tbody>
                    {o.recentEvents.slice(0, 3).map((e) => {
                      const v = eventView(e, market);
                      return (
                        <tr key={v.eventId} className="border-t border-[var(--border)]">
                          <td className="num w-[110px] py-2 text-[var(--text-dim)]">{v.occurredOn}</td>
                          <td className="whitespace-nowrap pr-2"><Tag>{t(v.chip)}</Tag>{v.updated && <span className="ml-1 text-[10px] text-[var(--text-dim)]">{t('updated')}</span>}</td>
                          <td>
                            {v.filing && t('filingLine', { form: formLabel(v.filing.form), fiscal: v.filing.fiscal, n: String(v.filing.factCount) })}
                            {v.period && (<>{t('periodLine', { period: v.period.periodEnd, duration: dur(v.period.duration) })}{v.period.headline && <> · {conceptName(v.period.headline.concept)} <ValueButton refv={v.period.headline.ref} concept={v.period.headline.concept} currency={currency} exp={exp} /></>}</>)}
                            {v.revised && (<>
                              {v.revised.periodEnd} {conceptName(v.revised.concept)}{' '}
                              <ValueButton refv={v.revised.from} concept={v.revised.concept} unit={v.revised.unit} currency={currency} exp={exp} /> → <ValueButton refv={v.revised.to} concept={v.revised.concept} unit={v.revised.unit} currency={currency} exp={exp} />
                              {typeof v.revised.relChange === 'string' && <span className="num ml-1 text-xs text-[var(--text-dim)]">{signed(formatPercent(v.revised.relChange))}</span>}
                            </>)}
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <Link href={companyHref(ticker, { view: v.link.view, asOf: v.link.asOf ?? asOf }) as never} className="text-xs">{v.link.view === 'filings' ? t('toFilings') : t('toStatements')}</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody></table></div>
                )}
              </Card>
            </>
          );
        })()}
      </div>
      <div className="flex flex-col gap-5">{/* INDUSTRY:BEGIN */}<IndustryRow ticker={ticker} />{/* INDUSTRY:END */}<SignalsCard /></div>
    </div>
  );
}
