// src/components/company/DisclosureDrawer.tsx
'use client';
// Disclosure-history drawer (plan 2026-11-06 Task 12; spec §5.6, §0 #62, #68; canvas Drawer A/D/E,
// M-Drawer): the full series of one natural key, ascending, from /api/companies/[ticker]/facts with
// its evidence; a fact id is first resolved to its key through spec-2 /api/facts?factIds= (value unused).
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import type { FactIdsResponse, FactSeriesResponse } from '@/lib/company/client';
import type { WithheldReason } from '@/lib/company/types';
import { useCompanyFetch } from './useCompanyFetch';
import { DrawerShell } from './DrawerShell';
import { defaultSelected, drawerRows, evidenceFields, factsRequest, filingLink, keyFromFactRow, type SeriesKey } from './drawer-model';
import { divisorLabel, formatScaled, groupNumber } from './format';
import type { DrawerTarget } from './DrawerHost';

type HistoryTarget = Extract<DrawerTarget, { kind: 'history' | 'historyByFact' }>;

export function WithheldDrawer({ reason, title, onClose }: { reason: WithheldReason; title: string; onClose: () => void }) {
  const t = useTranslations('company.drawer');
  return (
    <DrawerShell label={t('historyTitle')} kicker={t('historyTitle')} title={title} onClose={onClose}>
      <p className="text-sm text-[var(--text-dim)]">{t('withheldOnly', { reason: reason === 'citation_pending' ? t('reasonPending') : t('reasonIncomplete') })}</p>
    </DrawerShell>
  );
}

export function DisclosureDrawer({ ticker, asOf, admin, target, onClose }: { ticker: string; asOf: string | null; admin: boolean; target: HistoryTarget; onClose: () => void }) {
  const t = useTranslations('company.drawer');
  const byFact = useCompanyFetch<FactIdsResponse>(target.kind === 'historyByFact' ? `/api/facts/${encodeURIComponent(ticker)}?factIds=${target.factId}` : null).state;
  const key: SeriesKey | null = target.kind === 'history' ? target.key
    : byFact.status === 'ok' && byFact.data.facts[0] ? keyFromFactRow(byFact.data.facts[0]) : null;
  if (target.kind === 'historyByFact' && byFact.status === 'error') {
    return <DrawerShell label={t('historyTitle')} kicker={t('historyTitle')} title="—" onClose={onClose}><p className="text-sm">{t('loadFailed', { code: byFact.code })}</p></DrawerShell>;
  }
  return <SeriesDrawer ticker={ticker} asOf={asOf} admin={admin} seriesKey={key} scaleExp={target.scaleExp} onClose={onClose} />;
}

function SeriesDrawer({ ticker, asOf, admin, seriesKey, scaleExp, onClose }: {
  ticker: string; asOf: string | null; admin: boolean; seriesKey: SeriesKey | null; scaleExp: number; onClose: () => void;
}) {
  const t = useTranslations('company.drawer');
  const tc = useTranslations('company.concepts');
  const tf = useTranslations('company.filings.types');
  const url = seriesKey ? factsRequest(ticker, seriesKey, asOf, admin) : null;
  const main = useCompanyFetch<FactSeriesResponse>(url).state;
  const rows = useMemo(() => (main.status === 'ok' ? drawerRows(main.data, scaleExp) : []), [main, scaleExp]);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sel = selected ?? defaultSelected(rows);
  const selRow = rows.find((r) => r.entry.factId === sel) ?? null;
  const last = rows.length ? rows[rows.length - 1] : null;
  const money = seriesKey && !/\//.test(seriesKey.unit ?? '') && seriesKey.unit !== 'shares' && seriesKey.unit !== 'pure';
  const exp = money ? scaleExp : 0;
  const label = seriesKey ? `${tc.has(seriesKey.concept) ? tc(seriesKey.concept) : seriesKey.concept} ${seriesKey.concept}` : '…';
  const title = seriesKey ? `${label} · ${seriesKey.periodStart ?? seriesKey.periodEnd} → ${seriesKey.periodEnd}` : '…';
  const formLabel = (form: string) => (tf.has(form) ? tf(form) : form);

  return (
    <DrawerShell label={t('historyTitle')} kicker={t('historyTitle')} title={title} onClose={onClose}>
      {main.status === 'loading' || main.status === 'idle' ? <p className="text-sm text-[var(--text-dim)]">…</p> : null}
      {main.status === 'error' && <p role="alert" className="text-sm">{t('loadFailed', { code: main.code })}</p>}
      {main.status === 'ok' && (
        <>
          {last?.valueText && (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="num text-2xl font-medium">{formatScaled(last.valueText, exp)}</span>
              <span className="text-xs text-[var(--text-dim)]">{last.entry.unit} · {exp ? t('displayTransform', { divisor: divisorLabel(exp) }) : t('displayRaw')}</span>
              {last.entry.isRevision && <span className="num rounded-sm border border-[var(--border)] px-1 text-[10px]">R</span>}
            </div>
          )}
          <div className="text-xs text-[var(--text-dim)]">{t('series')}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="text-left text-[var(--text-dim)]">
                <tr><th className="py-1.5 pr-2">{t('colAvailable')}</th><th className="pr-2">{t('colFiling')}</th><th className="pr-2 text-right">{t('colValue')}</th><th className="pr-2 text-right">{t('colRevision')}</th><th className="pr-2" data-testid="drawer-transform-chain">{t('colTransforms')}</th><th>{t('colCode')}</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const f = main.data.filings[r.entry.filingId];
                  const link = filingLink(f);
                  const ev = r.evidence;
                  return (
                    <tr key={r.entry.factId} aria-selected={r.entry.factId === sel}
                      className={`border-t border-[var(--border)] ${r.entry.factId === sel ? 'bg-[var(--accent-wash)]' : ''}`}>
                      <td className="num py-1.5 pr-2">
                        <button type="button" onClick={() => setSelected(r.entry.factId)} className="num underline-offset-2 hover:underline" data-testid="drawer-available-date">{r.entry.availableDate}</button>
                      </td>
                      <td className="pr-2">
                        {f ? (link
                          ? <a href={link} target="_blank" rel="noopener noreferrer">{formLabel(f.formType)} {f.sourceRef} ↗</a>
                          : <span>{formLabel(f.formType)} {f.sourceRef} <span className="text-[var(--text-dim)]">{f.citation === 'pending' ? t('pendingFiling') : ''}</span></span>) : '—'}
                      </td>
                      <td className="num pr-2 text-right">
                        {r.valueText !== null ? `${groupNumber(r.valueText)} ${r.entry.unit}` : <span className="text-[var(--text-dim)]">{r.entry.kind === 'withheld' && r.entry.reason === 'citation_pending' ? t('reasonPending') : t('reasonIncomplete')}</span>}
                      </td>
                      <td className="num pr-2 text-right">
                        {/* 计划第 3 轮审计 R3: explicit withheld branch, never falls through to firstDisclosure */}
                        {r.revision.kind === 'diff' ? `${r.revision.abs}${r.revision.rel ? ` · ${r.revision.rel}` : ''}`
                          : r.revision.kind === 'same' ? t('sameValue')
                          : r.revision.kind === 'withheld' ? <span className="text-[var(--text-dim)]" data-testid="drawer-revision-withheld">{t('revisionWithheld')}</span>
                          : t('firstDisclosure')}
                      </td>
                      <td className="pr-2 text-[11px] text-[var(--text-dim)]">
                        {t('tMap', { source: r.entry.sourceConcept, concept: main.data.concept, version: r.entry.mappingVersion, gen: r.entry.mappingGen })}{' '}
                        {ev?.unitRule ? t('tUnit', { rule: ev.unitRule }) : t('tUnitNone')}{' '}
                        {exp ? t('tScale', { divisor: divisorLabel(exp) }) : t('tScaleNone')}
                      </td>
                      <td className="num text-[var(--text-dim)]" data-testid="drawer-code-version">{r.codeVersion ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {main.data.otherUnitSeries.length > 0 && (
            <div>
              <div className="mb-1 text-xs text-[var(--text-dim)]">{t('otherUnits')}</div>
              <table className="w-full text-xs"><tbody>
                {main.data.otherUnitSeries.map((s) => (
                  <tr key={s.factId} className="border-t border-[var(--border)]">
                    <td className="num py-1">{s.unit}</td><td className="num text-right">{s.kind === 'fact' ? groupNumber(s.value) : '—'}</td>
                    <td className="num pl-2">{s.availableDate}</td><td className="pl-2 text-[var(--text-dim)]">{t('unitOther')}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}

          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="mb-2 flex items-center gap-2"><span className="text-sm font-semibold">{t('evidence')}</span><span className="ml-auto text-[11px] text-[var(--text-dim)]">{t('evidenceNote')}</span></div>
            {selRow?.evidence ? (
              <>
                <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-1 text-xs">
                  {evidenceFields(selRow.evidence).map(([k, v]) => (
                    <div key={k} className="contents"><dt className="text-[var(--text-dim)]">{k === 'snapshot.capturedAt' ? `${k} · ${t('capturedAt')}` : k}</dt><dd className="num break-all">{v}</dd></div>
                  ))}
                  <dt className="text-[var(--text-dim)]">sourceDocument</dt>
                  <dd>{selRow.evidence.sourceDocument ? <a href={selRow.evidence.sourceDocument.url} target="_blank" rel="noopener noreferrer">{selRow.evidence.sourceDocument.kind} ↗</a> : '—'}</dd>
                  <dt className="text-[var(--text-dim)]">download</dt>
                  <dd>{selRow.evidence.snapshot.download ? <a className="num" href={selRow.evidence.snapshot.download}>{selRow.evidence.snapshot.download}</a> : t('downloadNull')}</dd>
                </dl>
                <p className="mt-2 text-[11px] text-[var(--text-dim)]">{t('replaySteps')}</p>
              </>
            ) : <p className="text-xs text-[var(--text-dim)]">{t('evidenceMissing')}</p>}
          </section>

          {url && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}${url}`).then(() => setCopied(true)); }}>
                {copied ? t('copied') : t('copyQuery')}
              </Button>
              <code className="break-all text-[11px] text-[var(--text-dim)]">{url}</code>
            </div>
          )}
        </>
      )}
    </DrawerShell>
  );
}
