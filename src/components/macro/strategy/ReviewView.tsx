'use client';
// Single-month review (spec §3.2, §3.5, §6.2): the seven fact sections in spec order (fact text from the system
// templates), the read-time judgment section and deviation cases when the judgment layer is on, the explanation panel
// bound to this immutable result_id (never the moving month pointer), and the method footer (method · manifest · input hash · code version · generation).
import Link from 'next/link';
import { Panel, Tag } from '@/components/ui';
import { namesFrom, renderFact } from '@/lib/macro/strategy/explain-render';
import type { ReviewDetailResponse } from '@/lib/macro/strategy/route-helpers';
import { DependencyState } from './DependencyState';
import { DeviationCases } from './DeviationCases';
import { ExplanationPanel } from './ExplanationPanel';
import { F4SummaryPanel } from './F4Summary';
import { formatInstant, reviewSections, strategyApi } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function ReviewView({ data }: { data: ReviewDetailResponse }) {
  const { t, locale } = useStrategyT();
  const r = data.result;
  const names = namesFrom(data.names);
  const sections = reviewSections(r.facts, (f) => renderFact(f, locale, names));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link href="/intel/macro/review" className="text-xs text-accent hover:underline">{t('review.back')}</Link>
          <h2 className="text-lg font-semibold">{t(`region.${r.region}`)} · <span className="font-mono">{r.month}</span></h2>
          <Tag>{t(`review.status.${r.status}`)}</Tag>
          <span className="font-mono text-[11px] text-text-dim">{t('review.generatedAt', { time: formatInstant(r.created_at) })}</span>
        </div>
        <span className="text-[11px] text-text-dim">{t('review.scope')}</span>
      </div>
      {r.status === 'insufficient' ? <p role="status" className="text-xs text-text-dim">{t('review.insufficient')}</p> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Panel key={s.key} className="space-y-1">
            <h3 className="text-sm font-semibold">{t(s.titleKey)} <span className="font-mono text-xs font-normal text-text-dim">{s.items.length}</span></h3>
            {s.emptyKey ? <p className="text-xs text-text-dim">{t(s.emptyKey)}</p> : (
              <ul className="space-y-1 text-xs">
                {s.items.map((it) => (
                  <li key={it.factId}>
                    {it.text}
                    {it.seriesId ? <> · <Link className="text-accent hover:underline" href={`/intel/macro/${it.seriesId}`}>{t('review.openSeries')}</Link></> : null}
                  </li>
                ))}
              </ul>
            )}
            {s.key === 'revisions' ? <p className="text-[10px] text-text-dim">{t('review.revisionScope')}</p> : null}
          </Panel>
        ))}
      </div>
      {data.judgment_status !== 'disabled' ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('review.judgment')}</h3>
          {data.judgment_status === 'ok' && data.f4 ? <F4SummaryPanel summary={data.f4.summary} /> : <DependencyState kind="judgments_unavailable" />}
          <DeviationCases region={r.region} />
        </section>
      ) : null}
      <ExplanationPanel subject={{ kind: 'review', id: r.result_id }} />
      <p className="border-t border-border pt-2 font-mono text-[11px] text-text-dim">
        {t('review.footer', { method: r.method_version, manifest: r.manifest_id, hash: r.manifest_hash.slice(0, 12), code: r.code_version.slice(0, 12), generation: data.generation })}
        {' · '}<a className="text-accent hover:underline" href={strategyApi.manifest(r.manifest_id)}>{t('meta.manifestLink')}</a>
      </p>
    </div>
  );
}
