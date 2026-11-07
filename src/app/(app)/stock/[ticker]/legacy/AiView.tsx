// src/app/(app)/stock/[ticker]/legacy/AiView.tsx
'use client';
// Former "AI 观点" tab (plan 2026-11-06 Task 11; decision E): renamed 模型观点（未校准）, the
// consensus x.x/10 number is removed; counts and the button-triggered generation stay unchanged.
import { useTranslations } from 'next-intl';
import { PerspectiveCard } from '@/components/PerspectiveCard';
import { QuotaNotice } from '@/components/QuotaNotice';
import { usePerspectives } from '@/lib/hooks/useQuote';

export function AiView({ ticker }: { ticker: string }) {
  const t = useTranslations('market.stock');
  const tc = useTranslations('company.legacy');
  const pers = usePerspectives(ticker);
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
          <button onClick={pers.refetch} className="mt-3 rounded bg-accent-dim px-4 py-2 text-white">{t('ai.generate')}</button>
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
          <button onClick={pers.refetch} className="mt-3 rounded border border-accent-dim/60 px-3 py-1.5 text-xs font-semibold text-accent-dim">{t('ai.regenerate')}</button>
        </>
      )}
    </div>
  );
}
