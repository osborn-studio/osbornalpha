'use client';

import { Clock3, Database } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DataEnvelope, DataStatus } from '@/lib/watchlist/overview-contract';

const STATUS_TONE: Record<DataStatus, string> = {
  fresh: 'border-up/20 bg-up/10 text-up',
  delayed: 'border-warn/25 bg-warn/10 text-warn',
  stale: 'border-warn/25 bg-warn/10 text-warn',
  unavailable: 'border-border bg-bg-elevated text-text-muted',
};

export function WatchlistDataStatus({
  label,
  envelope,
}: {
  label: string;
  envelope: DataEnvelope<unknown> | null | undefined;
}) {
  const t = useTranslations('market.table.drawer.dataStatus');
  const status = envelope?.status ?? 'unavailable';
  const diagnostics = [
    envelope?.source ? t('source', { value: envelope.source }) : null,
    envelope?.asOf ? t('asOf', { value: new Date(envelope.asOf).toLocaleString() }) : null,
    ...(envelope?.warnings ?? []),
  ].filter(Boolean).join(' | ');

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded border px-2 py-1 text-[10px] ${STATUS_TONE[status]}`} title={diagnostics || t('noDetails')}>
      {status === 'fresh' ? <Database className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">{label}</span>
      <span className="font-semibold">{t(`statuses.${status}`)}</span>
    </span>
  );
}
