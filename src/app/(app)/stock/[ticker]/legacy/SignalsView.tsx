// src/app/(app)/stock/[ticker]/legacy/SignalsView.tsx
'use client';
// Former signals tab, unchanged (plan 2026-11-06 Task 11).
import { useTranslations } from 'next-intl';

export function SignalsView() {
  const t = useTranslations('market.stock');
  return (
    <div className="card-base">
      <div className="mb-3 text-sm font-semibold text-text-dim">{t('signals.heading')}</div>
      <div className="py-8 text-center text-sm text-text-dim">
        <p>{t('signals.pending')}</p>
        <p className="mt-2 text-[11px]">{t('signals.pendingDetail')}</p>
      </div>
    </div>
  );
}
