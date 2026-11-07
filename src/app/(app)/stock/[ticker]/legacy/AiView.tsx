// src/app/(app)/stock/[ticker]/legacy/AiView.tsx
'use client';
// Former "AI 观点" tab (plan 2026-11-06 Task 11; decision E): renamed 模型观点（未校准）, the
// consensus x.x/10 number is removed; counts and the button-triggered generation stay unchanged.
import { useTranslations } from 'next-intl';
import { PerspectiveCard } from '@/components/PerspectiveCard';
import { QuotaNotice } from '@/components/QuotaNotice';
import { Button } from '@/components/ui';
import type { usePerspectives } from '@/lib/hooks/useQuote';

export type Perspectives = ReturnType<typeof usePerspectives>;

/** Presentational: the persistent shell owns usePerspectives so results and in-flight runs survive tab switches. */
export function AiView({ pers }: { pers: Perspectives }) {
  const t = useTranslations('market.stock');
  const tc = useTranslations('company.legacy');
  const perspectives = pers.perspectives;
  const bullish = perspectives.filter((p) => p.stance === 'bullish');
  const neutral = perspectives.filter((p) => p.stance === 'neutral');
  const bearish = perspectives.filter((p) => p.stance === 'bearish');
  return (
    <div className="card-base">
      <div className="mb-1 text-sm font-semibold text-text-dim">{tc('aiHeading')}</div>
      <p className="mb-3 text-xs text-text-dim">{tc('aiNote')}</p>
      {pers.quota && <div className="mb-3"><QuotaNotice {...pers.quota} /></div>}
      {pers.loading ? (
        <div className="py-8 text-center text-sm text-text-dim">{t('ai.generating')}</div>
      ) : perspectives.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-dim">
          {t('ai.pendingLine1')}
          {pers.error && <div className="mt-2 text-xs text-down">{t('ai.errorLine', { error: pers.error })}</div>}
          <br />
          <Button className="mt-3" onClick={pers.refetch}>{t('ai.generate')}</Button>
        </div>
      ) : (
        <>
          <div className="mb-3 text-xs text-text-dim">{tc('aiCounts', { bullish: bullish.length, neutral: neutral.length, bearish: bearish.length })}</div>
          {bullish.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-bullish">{t('ai.bullishHeading', { count: bullish.length })}</h3>}
          {bullish.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
          {neutral.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-neutral">{t('ai.neutralHeading', { count: neutral.length })}</h3>}
          {neutral.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
          {bearish.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-bearish">{t('ai.bearishHeading', { count: bearish.length })}</h3>}
          {bearish.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
          <Button variant="secondary" size="sm" className="mt-3" onClick={pers.refetch}>{t('ai.regenerate')}</Button>
        </>
      )}
    </div>
  );
}
