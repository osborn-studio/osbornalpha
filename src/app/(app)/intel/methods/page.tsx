'use client';

// /intel/methods — methodology registry (spec §9.5, canvas board 4a). Lists every synced method with its latest valid
// scope='all' calibration (Task 18 GET /api/methodologies) plus the read-only private adapter recommendation_call@v1, which
// is not a registry row (spec §11.2). Filters are real buttons with aria-pressed; brass only on the selected filter.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Kind } from '@/lib/judgments/types';
import { CalibrationBadge } from '@/components/judgments/CalibrationBadge';
import type { MethodologiesResponse } from '@/components/judgments/api-types';
import { DOMAINS, KINDS, LINK, fmt, methodRows, segmentClass, type Domain } from '@/components/judgments/view-model';

export default function MethodsPage() {
  const t = useTranslations('judgments');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const [data, setData] = useState<MethodologiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [domain, setDomain] = useState<Domain>('all');

  useEffect(() => {
    let alive = true;
    fetch('/api/methodologies')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j as { error?: { code?: string } }).error?.code ?? `http ${r.status}`);
        return j as MethodologiesResponse;
      })
      .then((j) => { if (alive) setData(j); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  const rows = data ? methodRows(data.methodologies, kind, domain) : [];
  const showAdapter = domain === 'all' && (kind === 'all' || kind === 'probability');
  const th = 'whitespace-nowrap px-2 py-1.5 font-medium';
  const td = 'whitespace-nowrap px-2 py-1.5';
  return (
    <div className="space-y-4 p-4">
      <nav aria-label={t('ui.nav.breadcrumb')} className="text-xs text-[var(--text-dim)]"><Link className={LINK} href="/intel">{t('ui.nav.intel')}</Link> / {t('ui.nav.methods')}</nav>
      <header>
        <h1 className="text-xl font-semibold">{t('ui.methods.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-dim)]">{t('ui.methods.subtitle')}</p>
      </header>
      <div className="flex flex-wrap gap-3">
        <div role="group" aria-label={t('ui.methods.filterDomain')} className="flex overflow-hidden rounded border border-[var(--border)] text-xs">
          {DOMAINS.map((d) => <button type="button" key={d} aria-pressed={domain === d} className={`px-2.5 py-1 ${segmentClass(domain === d)}`} onClick={() => setDomain(d)}>{t(`ui.domain.${d}`)}</button>)}
        </div>
        <div role="group" aria-label={t('ui.methods.filterKind')} className="flex overflow-hidden rounded border border-[var(--border)] text-xs">
          {KINDS.map((k) => <button type="button" key={k} aria-pressed={kind === k} className={`px-2.5 py-1 ${segmentClass(kind === k)}`} onClick={() => setKind(k)}>{t(`ui.kind.${k}`)}</button>)}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{t('ui.common.error', { message: error })}</p>}
      {!data && !error && <p className="text-sm text-[var(--text-dim)]">{t('ui.common.loading')}</p>}
      {data && (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full min-w-[880px] text-left text-xs">
            <caption className="sr-only">{t('ui.methods.caption')}</caption>
            <thead className="bg-[var(--bg-card)] text-[var(--text-dim)]">
              <tr>
                <th scope="col" className={th}>{t('ui.methods.columns.method')}</th>
                <th scope="col" className={th}>{t('ui.methods.columns.version')}</th>
                <th scope="col" className={th}>{t('ui.methods.columns.kind')}</th>
                <th scope="col" className={th}>{t('ui.methods.columns.subject')}</th>
                <th scope="col" className={th}>{t('ui.methods.columns.status')}</th>
                <th scope="col" className={th}>{t('ui.methods.columns.calibration')}</th>
                <th scope="col" className={`${th} text-right`}>{t('ui.methods.columns.samples')}</th>
                <th scope="col" className={`${th} text-right`}>{t('ui.methods.columns.brier')}</th>
                <th scope="col" className={th}>{t('ui.methods.columns.validUntil')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={`${r.id}@${r.version}`}>
                  <td className={td}><Link className={LINK} href={r.href}>{r.title[locale]}</Link> <span className="num text-[var(--text-muted)]">{r.id}</span></td>
                  <td className={`${td} num`}>{r.version}</td>
                  <td className={td}>{t(`ui.kind.${r.kind}`)}</td>
                  <td className={td}>{t(`ui.domain.${r.domain}`)}</td>
                  <td className={td}>{t(`ui.status.${r.status}`)} · {r.publishable ? t('ui.methods.publishable') : t('ui.methods.unpublished')}</td>
                  <td className={td}><CalibrationBadge state={r.state} /></td>
                  <td className={`${td} num text-right`}>{r.kind === 'score' ? r.nIndependent : `${r.nIndependent} / ${r.thresholdN}`}</td>
                  <td className={`${td} num text-right`}>{fmt(r.brier, 3)}</td>
                  <td className={`${td} num text-[var(--text-dim)]`}>{r.validUntil ?? '—'}</td>
                </tr>
              ))}
              {showAdapter && (
                <tr>
                  <td className={td}><Link className={LINK} href="/analyst">{t('ui.methods.adapterTitle')}</Link> <span className="num text-[var(--text-muted)]">recommendation_call</span></td>
                  <td className={`${td} num`}>v1</td>
                  <td className={td}>{t('ui.kind.probability')}</td>
                  <td className={td}>{t('ui.domain.private')}</td>
                  <td className={td}>{t('ui.methods.adapterStatus')}</td>
                  <td className={td}><CalibrationBadge state="self_assessed" /></td>
                  <td className={`${td} num text-right`}>—</td>
                  <td className={`${td} num text-right`}>—</td>
                  <td className={`${td} num text-[var(--text-dim)]`}>—</td>
                </tr>
              )}
              {rows.length === 0 && !showAdapter && <tr><td colSpan={9} className="px-2 py-3 text-[var(--text-muted)]">{t('ui.methods.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-[var(--text-muted)]">{t('ui.methods.note')}</p>
    </div>
  );
}
