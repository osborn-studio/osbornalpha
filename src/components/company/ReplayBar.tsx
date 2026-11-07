// src/components/company/ReplayBar.tsx
'use client';
// Page-level asOf replay (plan 2026-11-06 Task 11; spec §5.2, §5.10, canvas Replay): brass outline
// bar while replaying, a compact opener otherwise; dates after today are not accepted.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { companyHref, parseAsOf, utcToday, type ViewId } from '@/lib/company/client';

function DateInput({ value, onPick }: { value: string; onPick: (d: string) => void }) {
  const t = useTranslations('company.replay');
  const today = utcToday();
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
      <span className="sr-only">{t('dateLabel')}</span>
      <input type="date" max={today} defaultValue={value} aria-label={t('dateLabel')} className="num w-[160px]"
        onChange={(e) => { const d = parseAsOf(e.target.value, today); if (d) onPick(d); }} />
    </label>
  );
}

export function ReplayBar({ ticker, view, asOf, extra }: { ticker: string; view: ViewId; asOf: string; extra?: Record<string, string | null> }) {
  const t = useTranslations('company.replay');
  const router = useRouter();
  return (
    <div role="status" data-testid="replay-bar" className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-wash)] px-4 py-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">{t('label')}</span>
      <span className="text-sm">{t('asOf', { date: asOf })}</span>
      <span className="text-xs text-[var(--text-dim)]">{t('ownershipNote')}</span>
      <div className="ml-auto flex items-center gap-2">
        <DateInput value={asOf} onPick={(d) => router.push(companyHref(ticker, { view, asOf: d, extra }) as never)} />
        <Button variant="secondary" size="sm" onClick={() => router.push(companyHref(ticker, { view, asOf: null, extra }) as never)}>{t('back')}</Button>
      </div>
    </div>
  );
}

export function ReplayOpener({ ticker, view }: { ticker: string; view: ViewId }) {
  const t = useTranslations('company.replay');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return open
    ? <DateInput value="" onPick={(d) => router.push(companyHref(ticker, { view, asOf: d }) as never)} />
    : <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>{t('button')}</Button>;
}

export function ReplayUnsupportedBanner({ ticker, view }: { ticker: string; view: ViewId }) {
  const t = useTranslations('company.replay');
  const router = useRouter();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-[var(--text-muted)] px-3 py-2.5">
      <span className="text-sm font-semibold">{t('unsupportedTitle')}</span>
      <span className="text-xs text-[var(--text-dim)]">{t('unsupportedBody')}</span>
      <Button variant="secondary" size="sm" className="ml-auto" onClick={() => router.push(companyHref(ticker, { view, asOf: null }) as never)}>{t('back')}</Button>
    </div>
  );
}
