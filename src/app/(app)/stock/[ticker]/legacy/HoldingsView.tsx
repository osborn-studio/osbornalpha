// src/app/(app)/stock/[ticker]/legacy/HoldingsView.tsx
'use client';
// Former holdings tab, unchanged; US-ness now comes from the ticker, not the mock stock (plan 2026-11-06 Task 11).
import { useTranslations } from 'next-intl';
import { classifyMarket } from '@/lib/utils';

export function HoldingsView({ ticker }: { ticker: string }) {
  const t = useTranslations('market.stock');
  const isUs = classifyMarket(ticker) === 'US';
  return (
    <div className="card-base">
      <div className="mb-3 text-sm font-semibold text-text-dim">{t('holdings.heading', { suffix: isUs ? '' : t('holdings.headingSuffix') })}</div>
      <div className="py-8 text-center text-sm text-text-dim">
        <p>{isUs ? t('holdings.usBody') : t('holdings.nonUsBody')}</p>
        <p className="mt-2 text-[11px]">{t('holdings.dataSource')}</p>
      </div>
    </div>
  );
}
