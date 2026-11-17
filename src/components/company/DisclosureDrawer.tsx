// src/components/company/DisclosureDrawer.tsx
'use client';
// Disclosure-history drawer (plan 2026-11-06 Task 12; spec §5.6, §0 #62, #68; canvas Drawer A/D/E,
// M-Drawer): the full series of one natural key, ascending, from /api/companies/[ticker]/facts with
// its evidence; a fact id is first resolved to its key through spec-2 /api/facts?factIds= (value unused).
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import type { FactIdsResponse, FactSeriesResponse } from '@/lib/company/client';
import type { WithheldReason } from '@/lib/company/types';
import { useCompanyFetch } from './useCompanyFetch';
import { SourceDrawer } from '@/components/research-ui';
import { disclosureDrawerInput, transformText, withheldDrawerInput } from './disclosure-drawer-adapter';
import { defaultSelected, drawerRows, evidenceFields, factsRequest, filingLink, keyFromFactRow, otherUnitRows, scaleExpFor, type DrawerRow, type SeriesKey } from './drawer-model';
import { groupNumber } from './format';
import { useDrawers, type DrawerTarget } from './DrawerHost';

type HistoryTarget = Extract<DrawerTarget, { kind: 'history' | 'historyByFact' }>;

export function WithheldDrawer({ reason, title, id, onClose }: { reason: WithheldReason; title: string; id?: string; onClose: () => void }) {
  const t = useTranslations('company.drawer');
  return <SourceDrawer input={withheldDrawerInput(title, reason, t, id)} text={t} onClose={onClose} />;
}

export function DisclosureDrawer({ ticker, asOf, admin, target, onClose }: { ticker: string; asOf: string | null; admin: boolean; target: HistoryTarget; onClose: () => void }) {
  const t = useTranslations('company.drawer');
  const byFact = useCompanyFetch<FactIdsResponse>(target.kind === 'historyByFact' ? `/api/facts/${encodeURIComponent(ticker)}?factIds=${target.factId}` : null);
  const key: SeriesKey | null = target.kind === 'history' ? target.key
    : byFact.state.status === 'ok' && byFact.state.data.facts[0] ? keyFromFactRow(byFact.state.data.facts[0]) : null;
  const failure = target.kind === 'historyByFact'
    ? byFact.state.status === 'error' ? t('loadFailed', {code: byFact.state.code})
      : byFact.state.status === 'ok' && !byFact.state.data.facts[0] ? t('notFound') : null
    : null;
  return <SeriesDrawer ticker={ticker} asOf={asOf} admin={admin} seriesKey={key} scaleExp={target.scaleExp} onClose={onClose} resolveFailure={failure} resolveRetry={byFact.retry} unresolvedId={target.kind === 'historyByFact' ? target.factId : undefined} />;
}

function RevisionText({ r }: { r: DrawerRow }) {
  const t = useTranslations('company.drawer');
  // 计划第 3 轮审计 R3: explicit withheld branch, never falls through to firstDisclosure
  if (r.revision.kind === 'diff') return <>{`${r.revision.abs}${r.revision.rel ? ` · ${r.revision.rel}` : ''}`}</>;
  if (r.revision.kind === 'same') return <>{t('sameValue')}</>;
  if (r.revision.kind === 'withheld') return <span className="text-[var(--text-dim)]" data-testid="drawer-revision-withheld">{t('revisionWithheld')}</span>;
  return <>{t('firstDisclosure')}</>;
}

function SeriesDrawer({ ticker, asOf, admin, seriesKey, scaleExp, onClose, resolveFailure, resolveRetry, unresolvedId }: {
  ticker: string; asOf: string | null; admin: boolean; seriesKey: SeriesKey | null; scaleExp: number; onClose: () => void; resolveFailure: string | null; resolveRetry: () => void; unresolvedId?: string;
}) {
  const t = useTranslations('company.drawer');
  const ts = useTranslations('company.states');
  const tc = useTranslations('company.concepts');
  const tf = useTranslations('company.filings.types');
  const drawers = useDrawers();
  const url = seriesKey ? factsRequest(ticker, seriesKey, asOf, admin) : null;
  const { state: main, retry } = useCompanyFetch<FactSeriesResponse>(url);
  // The page scale applies to money units only; shares, per-share and ratio series are raw (review fix 7).
  const exp = scaleExpFor(seriesKey?.unit ?? null, scaleExp);
  const data = main.status === 'ok' && !main.data.truncated ? main.data : null;
  const rows = useMemo(() => (data ? drawerRows(data, exp) : []), [data, exp]);
  const others = useMemo(() => (data ? otherUnitRows(data) : []), [data]);
  const [selected, setSelected] = useState<string | null>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (copy === 'idle') return;
    const h = setTimeout(() => setCopy('idle'), 2000);
    return () => clearTimeout(h);
  }, [copy]);
  const sel = selected ?? defaultSelected(rows);
  const selRow = rows.find((r) => r.entry.factId === sel) ?? others.find((r) => r.entry.factId === sel) ?? null;
  const formLabel = (form: string) => (tf.has(form) ? tf(form) : form);
  const reasonText = (r: DrawerRow) => (r.entry.kind === 'withheld' ? (r.entry.reason === 'citation_pending' ? t('reasonPending') : t('reasonIncomplete')) : '');
  const filingCell = (r: DrawerRow) => {
    const f = data?.filings[r.entry.filingId];
    const link = filingLink(f);
    if (!f) return '—';
    return link
      ? <a href={link} target="_blank" rel="noopener noreferrer">{formLabel(f.formType)} {f.sourceRef} ↗</a>
      : <span>{formLabel(f.formType)} {f.sourceRef} <span className="text-[var(--text-dim)]">{f.citation === 'pending' ? t('pendingFiling') : ''}</span></span>;
  };
  const valueCell = (r: DrawerRow) => (r.valueText !== null ? `${groupNumber(r.valueText)} ${r.entry.unit}` : <span className="text-[var(--text-dim)]">{reasonText(r)}</span>);
  const transforms = (r: DrawerRow, rowExp: number) => transformText(r, data?.concept ?? '', rowExp, t);
  const dateButton = (r: DrawerRow) => (
    <button type="button" aria-pressed={r.entry.factId === sel} onClick={() => setSelected(r.entry.factId)} aria-label={`${t('selectEvidence')} ${r.entry.availableDate}`}
      className="num min-h-11 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" data-testid="drawer-available-date">{r.entry.availableDate}</button>
  );
  async function copyQuery() {
    try {
      if (!navigator.clipboard) throw new Error('unavailable');
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      setCopy('copied');
    } catch { setCopy('failed'); }
  }

  const failure = resolveFailure ?? (main.status === 'error' ? t('loadFailed', {code: main.code}) : main.status === 'ok' && main.data.truncated ? t('truncated') : data && rows.length === 0 && others.length === 0 ? t('notFound') : null);
  const input = disclosureDrawerInput({ticker, key: seriesKey, data, selected: selRow, scaleExp, asOf,
    conceptLabel: seriesKey ? tc.has(seriesKey.concept) ? tc(seriesKey.concept) : seriesKey.concept : '', text: t});
  if (input.variant === 'ok') {
    // The interactive series below owns revisions; do not also render the shared revision table.
    if (input.extras) delete input.extras.revisions;
    if (!seriesKey && unresolvedId) input.payload.identity.id = unresolvedId;
  }
  return <SourceDrawer input={input} text={t} onClose={onClose}
    pending={!failure && !data ? ['source','times','transform','licence'] : []}
    failed={failure ? ['source','times','transform','licence'] : []} failedText={failure ?? undefined}
    slots={{
      identity: failure ? <Button variant="secondary" size="sm" onClick={resolveFailure ? resolveRetry : retry}>{ts('retry')}</Button> : undefined,
      times: data ? <div className="flex flex-col gap-2">
        <div className="text-xs text-text-dim">{t('series')}</div>
        {rows.map(r => <div key={r.entry.factId} className={`flex flex-col gap-1.5 rounded-lg border border-border p-3 ${r.entry.factId === sel ? 'bg-[var(--accent-wash)]' : 'bg-bg-card'}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">{dateButton(r)}<span className="ml-auto">{filingCell(r)}</span></div>
          <div className="num text-[13px]">{valueCell(r)}</div>
          <div className="num text-[11px] text-text-dim"><RevisionText r={r} /> · #{r.entry.disclosureSeq ?? '—'}{r.entry.isCurrent === null ? '' : ` · ${t(r.entry.isCurrent ? 'currentDisclosure' : 'supersededDisclosure')}`}</div>
        </div>)}
      </div> : undefined,
      source: <>
          {others.length > 0 && (
            <div className="overflow-x-auto">
              <div className="mb-1 text-xs text-[var(--text-dim)]">{t('otherUnits')}</div>
              <table className="w-full text-xs"><tbody>
                {others.map((o) => (
                  <tr key={o.entry.factId} className={`border-t border-[var(--border)] ${o.entry.factId === sel ? 'bg-[var(--accent-wash)]' : ''}`}>
                    <td className="py-1">
                      <button type="button" disabled={!seriesKey}
                        onClick={() => seriesKey && drawers.open({ kind: 'history', key: { ...seriesKey, unit: o.entry.unit }, duration: '', otherUnits: false, scaleExp })}
                        aria-label={t('openUnitHistory', { unit: o.entry.unit })}
                        className="num min-h-11 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{o.entry.unit}</button>
                    </td>
                    <td className="num text-right">{o.valueText !== null ? groupNumber(o.valueText) : <span className="text-[var(--text-dim)]">{t('withheldRow', { reason: reasonText(o) })}</span>}</td>
                    <td className="num pl-2">{dateButton(o)}</td>
                    <td className="pl-2 text-[var(--text-dim)]">{t('unitOther')}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}

      </>,
      transform: data ? <>
        {selRow && <><div data-testid="drawer-transform-chain" className="text-xs">{transforms(selRow, scaleExpFor(selRow.entry.unit, scaleExp))}</div><div data-testid="drawer-code-version" className="num text-xs">{selRow.evidence?.run.codeVersion ?? '—'}</div></>}
          <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="mb-2 flex items-center gap-2"><span className="text-sm font-semibold">{t('evidence')}</span><span className="ml-auto text-[11px] text-[var(--text-dim)]">{t('evidenceNote')}</span></div>
            {selRow?.evidence ? (
              <>
                <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs sm:grid-cols-[150px_minmax(0,1fr)]">
                  {evidenceFields(selRow.evidence).map(([k, v]) => (
                    <div key={k} className="contents"><dt className="text-[var(--text-dim)]">{k === 'snapshot.capturedAt' ? `${k} · ${t('capturedAt')}` : k}</dt><dd className="num break-all">{v}</dd></div>
                  ))}
                  <dt className="text-[var(--text-dim)]">sourceDocument</dt>
                  <dd>{selRow.evidence.sourceDocument ? <a href={selRow.evidence.sourceDocument.url} target="_blank" rel="noopener noreferrer">{selRow.evidence.sourceDocument.kind} ↗</a> : '—'}</dd>
                  <dt className="text-[var(--text-dim)]">download</dt>
                  <dd className="break-all">{selRow.evidence.snapshot.download ? <a className="num" href={selRow.evidence.snapshot.download}>{selRow.evidence.snapshot.download}</a> : t('downloadNull')}</dd>
                </dl>
                <p className="mt-2 text-[11px] text-[var(--text-dim)]">{t('replaySteps')}</p>
              </>
            ) : <p className="text-xs text-[var(--text-dim)]">{t('evidenceMissing')}</p>}
          </section>

          {url && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => { void copyQuery(); }}>
                {copy === 'copied' ? t('copied') : t('copyQuery')}
              </Button>
              {copy === 'failed' && <span role="status" className="text-[11px] text-[var(--warn)]">{t('copyFailed')}</span>}
              <code className="break-all text-[11px] text-[var(--text-dim)]">{url}</code>
            </div>
          )}
      </> : undefined,
    }} />;
}
