'use client';
// Filings view (plan 2026-11-06 Task 13; spec §5.5, §10.3; canvas Filings).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { F3_DRAWER_FLAG, companyApi, companyHref, type CompanyFilingsResponse } from '@/lib/company/client';
import type { Market } from '@/lib/company/types';
import { useCompanyFetch } from './useCompanyFetch';
import { Callout, ErrorCard, LoadingGrid } from './StateCallout';
import { citationBadge, fiscalLabel, originalHref, typeLabel } from './filings-model';
import { F3_SOURCE_DRAWER_AVAILABLE, SourceDrawerAdapter } from './f3-source-drawer';

const USE_F3 = F3_DRAWER_FLAG && F3_SOURCE_DRAWER_AVAILABLE;
const chip = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] no-underline';

export function FilingsView({ ticker, market, asOf }: { ticker: string; market: Market; asOf: string | null }) {
  const t = useTranslations('company.filings');
  const tt = useTranslations('company.filings.types');
  const ts = useTranslations('company.states');
  const tab = useTranslations('company.tabs');
  const router = useRouter();
  const [source, setSource] = useState<string | null>(null);
  const { state, retry } = useCompanyFetch<CompanyFilingsResponse>(companyApi('filings', ticker, { asOf }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 text-xs text-[var(--text-dim)]"><span>{t('order')}</span><span className="sm:ml-auto">{t('unpublishedNote')}</span></div>
      {(state.status === 'loading' || state.status === 'idle') && <LoadingGrid />}
      {state.status === 'error' && <ErrorCard message={ts('routeError', { view: tab('filings'), code: state.code })} onRetry={retry} />}
      {state.status === 'ok' && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="px-4 pb-1 pt-3 text-xs font-medium text-[var(--text-dim)]">{t('periodic')}</div>
          {state.data.filings.length === 0 ? <div className="px-4 pb-4"><Callout>{asOf ? ts('beforeFirst') : t('empty')}</Callout></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-xs text-[var(--text-dim)]"><tr>
                  <th scope="col" className="px-4 py-2 font-medium">{t('colAvailable')}</th><th scope="col" className="font-medium">{t('colType')}</th><th scope="col" className="font-medium">{t('colFiscal')}</th><th scope="col" className="font-medium">{t('colPeriodEnd')}</th>
                  <th scope="col" className="font-medium">{t('colSource')}</th><th scope="col" className="font-medium">{t('colCitation')}</th><th scope="col" className="text-right font-medium">{t('colFacts')}</th><th scope="col" className="px-4 text-left font-medium">{t('colActions')}</th>
                </tr></thead>
                <tbody>
                  {state.data.filings.map((f) => {
                    const type = typeLabel(f, market);
                    const badge = citationBadge(f);
                    const original = originalHref(f);
                    return (
                      <tr key={f.filingId} className="border-t border-[var(--border)]" data-testid="filing-row">
                        <td className="num px-4 py-2">{f.availableDate}</td>
                        <td>{'text' in type ? <span className="num">{type.text}</span> : tt(type.key)}</td>
                        <td className="num">{fiscalLabel(f)}</td>
                        <td className="num text-[var(--text-dim)]">{f.periodEnd ?? '—'}</td>
                        <td className="text-xs text-[var(--text-dim)]">{f.source === 'edgar' ? t('sourceEdgar') : t('sourceTushare')}</td>
                        <td>
                          {(badge.kind === 'edgar' || badge.kind === 'linked') && (badge.href
                            ? <a href={badge.href} target="_blank" rel="noopener noreferrer" className={`${chip} border-[var(--border-active)] text-[var(--accent)]`}>{badge.kind === 'edgar' ? t('citeEdgar') : t('citeLinked')}</a>
                            : <span className={`${chip} border-[var(--border)]`}>{badge.kind}</span>)}
                          {badge.kind === 'pending' && <span className={`${chip} border-[var(--border)] text-[var(--text-dim)]`}>{t('citePending')}</span>}
                          {badge.kind === 'failed' && <span className={`${chip} border-[var(--warn)] text-[var(--warn)]`}>{t('citeFailed', { n: badge.attempts })}</span>}
                        </td>
                        <td className="num text-right">{f.factCount}</td>
                        <td className="px-4">
                          <div className="flex gap-1.5">
                            <Button variant="ghost" size="sm" onClick={() => router.push(companyHref(ticker, { view: 'statements', asOf, extra: { highlight: f.filingId } }) as never)}>{t('highlight')}</Button>
                            {original && (USE_F3
                              ? <Button variant="ghost" size="sm" onClick={() => setSource(f.filingId)}>{t('original')}</Button>
                              : <a href={original} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-2.5 py-1 text-xs">{t('original')}</a>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 pb-1 pt-4 text-xs font-medium text-[var(--text-dim)]">{t('transcripts')}</div>
          <div className="px-4 pb-4 text-sm text-[var(--text-dim)]">{t('transcriptsPending')}</div>
        </section>
      )}
      {source && <SourceDrawerAdapter filingId={source} onClose={() => setSource(null)} />}
    </div>
  );
}
