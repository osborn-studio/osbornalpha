// src/components/company/StateCallout.tsx
'use client';
// Missing/special-state callouts and the route error card (plan 2026-11-06 Task 11; spec §5.7, canvas States).
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, Tag } from '@/components/ui';

export function Callout({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-dim)]">{children}</div>;
}

export function FactStateCallout({ state, isAdmin }: { state: 'no_issuer' | 'no_facts' | 'hk_pending'; isAdmin: boolean }) {
  const t = useTranslations('company.states');
  const th = useTranslations('company.header');
  return (
    <div className="flex flex-col gap-2">
      <Callout>{state === 'no_issuer' ? t('noIssuer') : state === 'hk_pending' ? t('hkPending') : t('noFacts')}</Callout>
      {state === 'no_facts' && isAdmin && (
        <div className="flex items-center gap-2 text-sm"><Tag tone="accent">{th('adminTag')}</Tag><Link href="/admin/dq">{t('adminDq')}</Link></div>
      )}
    </div>
  );
}

export function ErrorCard({ message, onRetry, extra }: { message: string; onRetry?: () => void; extra?: React.ReactNode }) {
  const t = useTranslations('company.states');
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--bg-elevated)] px-4 py-3 text-sm">
      <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--danger)]" />
      <span className="flex-1">{message}</span>
      {extra}
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t('retry')}</Button>}
    </div>
  );
}

export function TruncatedCard({ onRetry, onEightPeriods }: { onRetry: () => void; onEightPeriods?: () => void }) {
  const t = useTranslations('company.states');
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--bg-elevated)] px-4 py-3 text-sm">
      <strong>{t('truncated')}</strong>
      <span className="text-[var(--text-dim)]">{t('truncatedDetail')}</span>
      <div className="flex gap-2">
        {onEightPeriods && <Button variant="secondary" size="sm" onClick={onEightPeriods}>{t('useEightPeriods')}</Button>}
        <Button variant="ghost" size="sm" onClick={onRetry}>{t('retry')}</Button>
      </div>
    </div>
  );
}

export function LoadingGrid() {
  const t = useTranslations('company.states');
  return (
    <div aria-busy="true" aria-label={t('loading')} className="grid grid-cols-[160px_repeat(6,minmax(0,1fr))] gap-1.5">
      {Array.from({ length: 21 }, (_, i) => <div key={i} className="h-[18px] rounded bg-[var(--bg-hover)]" />)}
    </div>
  );
}
