'use client';

import { useTranslations } from 'next-intl';
import type { DataEnvelope } from '@/lib/watchlist/overview-contract';
import { watchlistWarningMessageKey } from '@/lib/watchlist/data-notice';
import { WatchlistFreshnessBadge } from './WatchlistFreshnessBadge';

export function WatchlistDataStatus({
  label,
  envelope,
}: {
  label: string;
  envelope: DataEnvelope<unknown> | null | undefined;
}) {
  const t = useTranslations('market.table.drawer.dataStatus');
  const health = useTranslations('market.table.health');
  const status = envelope?.status ?? 'unavailable';
  const diagnostics = [
    ...(envelope?.warnings ?? []).map((warning) => health(`warnings.${watchlistWarningMessageKey(warning)}`)),
  ].filter(Boolean).join(' | ');

  return (
    <WatchlistFreshnessBadge
      label={label}
      status={status}
      statusLabel={t(`statuses.${status}`)}
      source={envelope?.source}
      asOf={envelope?.asOf}
      details={diagnostics || t('noDetails')}
    />
  );
}
