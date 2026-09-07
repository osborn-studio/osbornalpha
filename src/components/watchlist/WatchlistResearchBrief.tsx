'use client';

import { AlertTriangle, CheckCircle2, CircleGauge, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WatchlistResearchDecisionBrief } from '@/lib/watchlist/research-decision-brief';

const STANCE_TONE = {
  bullish: 'text-status-good',
  neutral: 'text-warn',
  bearish: 'text-status-bad',
} as const;

export function WatchlistResearchBrief({ brief }: { brief: WatchlistResearchDecisionBrief }) {
  const t = useTranslations('market.table.drawer.research.brief');
  if (brief.averageConfidence === null) return null;

  return (
    <section className="mb-4 border-y border-border/70 bg-bg-elevated/25" aria-label={t('title')}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase text-text-muted">{t('title')}</div>
          <div className={`mt-1 text-base font-semibold ${STANCE_TONE[brief.stance]}`}>{t(`stances.${brief.stance}`)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1"><CircleGauge className="h-3.5 w-3.5" aria-hidden="true" />{t('confidence', { value: brief.averageConfidence.toFixed(1) })}</span>
          <span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />{t('agreement', { value: Math.round((brief.agreementRatio ?? 0) * 100) })}</span>
          {brief.hasMaterialDisagreement && <span className="inline-flex items-center gap-1 text-warn"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{t('disagreement')}</span>}
          {brief.historicalAccuracy !== null && <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{t('accuracy', { value: Math.round(brief.historicalAccuracy * 100), count: brief.evaluatedOutcomes })}</span>}
        </div>
      </header>
      {(brief.catalysts.length > 0 || brief.risks.length > 0) && (
        <div className="grid border-t border-border/60 md:grid-cols-2 md:divide-x md:divide-border/60">
          <BriefList title={t('catalysts')} items={brief.catalysts} tone="before:bg-status-good" />
          <BriefList title={t('risks')} items={brief.risks} tone="before:bg-status-bad" />
        </div>
      )}
      {brief.challengedClaims > 0 && <p className="border-t border-border/60 px-3 py-2 text-[11px] text-warn">{t('challengedClaims', { count: brief.challengedClaims })}</p>}
    </section>
  );
}

function BriefList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="px-3 py-3">
      <h4 className="mb-2 text-[11px] font-semibold text-text-dim">{title}</h4>
      {items.length === 0 ? <span className="text-[11px] text-text-muted">--</span> : (
        <ul className="space-y-1.5">
          {items.map((item) => <li key={item} className={`relative pl-3 text-xs leading-relaxed text-text-dim before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full ${tone}`}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}
