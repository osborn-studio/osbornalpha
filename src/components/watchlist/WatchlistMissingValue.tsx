'use client';

import { useTranslations } from 'next-intl';
import type { DataEnvelope } from '@/lib/watchlist/overview-contract';

type MissingState = 'loading' | 'insufficient' | 'unavailable' | 'notProvided' | 'stale' | 'delayed';

function missingState(
  envelope: DataEnvelope<unknown> | null | undefined,
  loading: boolean,
  fallback: Extract<MissingState, 'unavailable' | 'notProvided'>,
): MissingState {
  if (loading) return 'loading';
  if (!envelope) return fallback;
  if (envelope.status === 'stale' || envelope.status === 'delayed' || envelope.status === 'unavailable') {
    return envelope.status;
  }
  return envelope.value == null ? 'unavailable' : 'insufficient';
}

export function WatchlistMissingValue({
  envelope,
  loading = false,
  fallback = 'unavailable',
  source,
  asOf,
}: {
  envelope?: DataEnvelope<unknown> | null;
  loading?: boolean;
  fallback?: Extract<MissingState, 'unavailable' | 'notProvided'>;
  source?: string | null;
  asOf?: string | null;
}) {
  const t = useTranslations('market.table.missingData');
  const state = missingState(envelope, loading, fallback);
  const coverage = envelope?.coverage?.total
    ? t('coverage', { available: envelope.coverage.available, total: envelope.coverage.total })
    : null;
  const observations = envelope?.observations != null
    ? t('observations', { count: envelope.observations })
    : null;
  const timestamp = envelope?.asOf ?? asOf;
  const details = [
    t(`states.${state}`),
    envelope?.source ?? source,
    timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toLocaleString() : null,
    coverage,
    observations,
  ].filter(Boolean).join(' | ');

  return (
    <span tabIndex={0} aria-label={t(`states.${state}`)} title={details} className="cursor-help text-text-muted underline decoration-border-active decoration-dotted underline-offset-4 focus:outline-none focus-visible:text-text">
      --
    </span>
  );
}
