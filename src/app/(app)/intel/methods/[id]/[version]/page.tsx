'use client';

// /intel/methods/[id]/[version] — method detail (spec §9.5, canvas board 4b): the two gates (enough samples, calibration
// passes) and validity, reliability bins (+ optional chart), confusion matrix, holdout validation, formula document, params,
// versions and recent settlements. Every chart has a table equivalent; brass only on the calibrated badge and selected states.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalibrationBadge } from '@/components/judgments/CalibrationBadge';
import { ReliabilityTable } from '@/components/judgments/ReliabilityTable';
import type { CalibrationResponse, MethodologiesResponse, MethodologyDetailResponse } from '@/components/judgments/api-types';
import { LINK, TONE, confusionView, day, gatesView, holdoutRows, methodHref, methodState, segmentClass } from '@/components/judgments/view-model';

interface Loaded { detail: MethodologyDetailResponse; calibration: CalibrationResponse; versions: MethodologiesResponse['methodologies'] }

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: { code?: string } }).error?.code ?? `http ${r.status}`);
  return j as T;
}

function Gate({ title, ok, children }: { title: string; ok: boolean | null; children: ReactNode }) {
  const t = useTranslations('judgments');
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <div className="text-[11px] text-[var(--text-dim)]">{title}</div>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className={ok === null ? 'text-[var(--text-muted)]' : ok ? 'text-[var(--text)]' : 'text-[var(--danger)]'}>{ok === null ? t('ui.method.gateNa') : ok ? t('ui.method.gatePass') : t('ui.method.gateFail')}</span>
      </div>
      <div className="num mt-1 text-[11px] text-[var(--text-dim)]">{children}</div>
    </div>
  );
}

export default function MethodDetailPage() {
  const t = useTranslations('judgments');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const { id, version } = useParams<{ id: string; version: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null); setError(null);
    const base = `/api/methodologies/${encodeURIComponent(id)}/${encodeURIComponent(version)}`;
    Promise.all([
      getJson<MethodologyDetailResponse>(base),
      getJson<CalibrationResponse>(`${base}/calibration?scope_type=all`),
      getJson<MethodologiesResponse>('/api/methodologies'),
    ])
      .then(([detail, calibration, list]) => { if (alive) setData({ detail, calibration, versions: list.methodologies.filter((m) => m.methodology.methodology_id === id) }); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [id, version]);

  if (error) return <p role="alert" className="p-4 text-sm text-[var(--danger)]">{error === 'unknown_methodology' ? t('ui.method.unknown') : t('ui.common.error', { message: error })}</p>;
  if (!data) return <p className="p-4 text-sm text-[var(--text-dim)]">{t('ui.common.loading')}</p>;

  const { row, doc_markdown, recent_settlements } = data.detail;
  const cal = data.calibration.calibration;
  const state = methodState(cal ? { state: cal.state, valid: data.calibration.valid } : null);
  const gates = gatesView(cal, data.calibration.valid);
  const confusion = row.kind === 'categorical' ? confusionView(cal) : null;
  const split = holdoutRows(cal);
  const th = 'px-2 py-1 font-normal';
  const classLabel = (c: string) => (t.has(`ui.classes.${c}`) ? t(`ui.classes.${c}`) : c);
  return (
    <div className="space-y-4 p-4">
      <nav aria-label={t('ui.nav.breadcrumb')} className="text-xs text-[var(--text-dim)]">
        <Link className={LINK} href="/intel">{t('ui.nav.intel')}</Link> / <Link className={LINK} href="/intel/methods">{t('ui.nav.methods')}</Link> / <span className="num">{row.methodology_id} / {row.version}</span>
      </nav>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">{locale === 'en' ? row.title_en : row.title_zh} <span className="num text-sm text-[var(--text-dim)]">{row.methodology_id}@{row.version}</span></h1>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-dim)]">{t(`ui.kind.${row.kind}`)}</span>
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-dim)]">{t('ui.method.producer', { kind: row.producer_kind })}</span>
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[var(--text-dim)]">{t(`ui.status.${row.status}`)} · {row.publishable ? t('ui.methods.publishable') : t('ui.methods.unpublished')}</span>
          <CalibrationBadge state={state} />
        </div>
      </header>

      {gates ? (
        <section aria-label={t('ui.method.gates')} className="grid gap-3 sm:grid-cols-3">
          <Gate title={t('ui.method.gateSample')} ok={gates.sample.ok}>{t('ui.method.gateSampleDetail', { n: gates.sample.n, threshold: gates.sample.threshold, total: gates.sample.total })}</Gate>
          <Gate title={t('ui.method.gateCalibration')} ok={gates.calibration.ok}>{t(gates.calibration.metric.key, gates.calibration.metric.values)}</Gate>
          <Gate title={t('ui.method.validity')} ok={gates.validity.valid}>{t('ui.method.validityDetail', { until: gates.validity.validUntil, computed: gates.validity.computedAt, revision: gates.validity.revision })}</Gate>
        </section>
      ) : (
        <p className="rounded-md border border-[var(--border)] p-3 text-sm text-[var(--text-dim)]">{t('ui.method.noCalibration')}</p>
      )}

      {cal && row.kind === 'probability' && <ReliabilityTable bins={cal.reliability} metrics={cal.metrics} />}

      {confusion && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t('ui.method.confusion')}</h2>
          <div className="overflow-x-auto">
            <table className="num text-xs">
              <caption className="sr-only">{t('ui.method.confusionCaption')}</caption>
              <thead><tr className="text-[var(--text-dim)]"><th scope="col" className={th}><span className="sr-only">{t('ui.method.confusionCorner')}</span></th>{confusion.classes.map((c) => <th key={c} scope="col" className={`${th} text-right`}>{classLabel(c)}</th>)}</tr></thead>
              <tbody>
                {confusion.rows.map((r) => (
                  <tr key={r.cls} className="border-t border-[var(--border)]">
                    <th scope="row" className={`${th} text-left`}>{classLabel(r.cls)}</th>
                    {r.cells.map((c, i) => <td key={i} className={`px-2 py-1 text-right ${c.diagonal ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>{c.n}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {split.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t('ui.method.temporal')}</h2>
          <table className="num text-xs">
            <caption className="sr-only">{t('ui.method.temporal')}</caption>
            <thead><tr className="text-[var(--text-dim)]"><th scope="col" className={th}>{t('ui.method.splitColumns.segment')}</th><th scope="col" className={`${th} text-right`}>n</th><th scope="col" className={`${th} text-right`}>Brier</th><th scope="col" className={`${th} text-right`}>{t('ui.method.splitColumns.skill')}</th><th scope="col" className={`${th} text-right`}>ECE</th></tr></thead>
            <tbody>{split.map((s) => <tr key={s.key} className="border-t border-[var(--border)]"><th scope="row" className={`${th} text-left`}>{t(s.key)}</th><td className="px-2 py-1 text-right">{s.n}</td><td className="px-2 py-1 text-right">{s.brier}</td><td className="px-2 py-1 text-right">{s.skill}</td><td className="px-2 py-1 text-right">{s.ece}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">{t('ui.method.doc')}</h2>
          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--bg-card)] p-3 font-sans text-xs leading-relaxed">{doc_markdown ?? '—'}</pre>
          <table className="num text-xs">
            <caption className="sr-only">{t('ui.method.params')}</caption>
            <thead><tr className="text-[var(--text-dim)]"><th scope="col" className={th}>{t('ui.method.paramColumns.name')}</th><th scope="col" className={`${th} text-right`}>{t('ui.method.paramColumns.value')}</th></tr></thead>
            <tbody>{Object.entries(row.params).map(([k, v]) => <tr key={k} className="border-t border-[var(--border)]"><th scope="row" className={`${th} text-left`}>{k}</th><td className="px-2 py-1 text-right">{String(v)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="space-y-4">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t('ui.method.versions')}</h2>
            <ul className="space-y-1 text-xs">
              {data.versions.map((v) => {
                const current = v.methodology.version === row.version;
                return (
                  <li key={v.methodology.version}>
                    <Link href={methodHref(v.methodology.methodology_id, v.methodology.version)} aria-current={current ? 'page' : undefined} className={`flex justify-between rounded px-2 py-1 ${segmentClass(current)}`}>
                      <span className="num">{v.methodology.version}</span><span>{t(`ui.status.${v.methodology.status}`)} · {day(v.methodology.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t('ui.method.recent')}</h2>
            {recent_settlements.length === 0 ? <p className="text-xs text-[var(--text-muted)]">{t('ui.method.noSettlements')}</p> : (
              <table className="text-xs">
                <caption className="sr-only">{t('ui.method.recent')}</caption>
                <tbody>
                  {recent_settlements.map((s) => (
                    <tr key={s.settlement_id} className="border-t border-[var(--border)]">
                      <td className="num px-2 py-1 text-[var(--text-dim)]">{day(s.settled_at)}</td>
                      <td className="px-2 py-1">{s.subject_key} · <span className="num">{s.judgment_id.slice(0, 8)}…</span></td>
                      <td className={`px-2 py-1 ${s.outcome === 'hit' ? TONE.up : s.outcome === 'miss' ? TONE.down : TONE.neutral}`}>{s.kind === 'settled' && s.outcome ? t(`ui.lifecycle.${s.outcome}`) : t(`ui.lifecycle.${s.kind === 'reopened' ? 'open' : s.kind}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
