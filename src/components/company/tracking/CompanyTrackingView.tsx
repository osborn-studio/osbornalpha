// src/components/company/tracking/CompanyTrackingView.tsx
'use client';
// Integration point for Task 17 (plan 2026-11-06): the company page's tracking view renders
// CompanyTrackingView. Task 17 overwrites this file with its timeline component and keeps the export
// name and props; in replay (asOf) events are computed live and read receipts are off.
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui';
import type { Market } from '@/lib/company/types';

export interface CompanyTrackingViewProps { issuerId: string; ticker: string; market: Market; asOf: string | null }

export function CompanyTrackingView({ asOf }: CompanyTrackingViewProps) {
  const t = useTranslations('company');
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{t('tracking.slotTitle')}</h2>
      <p className="text-sm text-[var(--text-dim)]">{t('tracking.slotBody')}</p>
      {asOf && <p className="text-xs text-[var(--text-dim)]">{t('replay.readsDisabled')}</p>}
      <Link href="/watchlist/tracking" className="text-sm">{t('tracking.slotLink')}</Link>
    </Card>
  );
}
