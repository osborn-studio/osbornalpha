'use client';

import { CircleAlert, Clock3, Database, LoaderCircle } from 'lucide-react';

export type WatchlistFreshnessStatus = 'fresh' | 'live' | 'delayed' | 'stale' | 'partial' | 'closed' | 'unavailable' | 'loading';

const TONE: Record<WatchlistFreshnessStatus, string> = {
  fresh: 'border-status-good/25 bg-status-good/10 text-status-good',
  live: 'border-status-good/25 bg-status-good/10 text-status-good',
  delayed: 'border-status-info/25 bg-status-info/10 text-status-info',
  closed: 'border-status-info/25 bg-status-info/10 text-status-info',
  stale: 'border-warn/25 bg-warn/10 text-warn',
  partial: 'border-warn/25 bg-warn/10 text-warn',
  unavailable: 'border-status-bad/25 bg-status-bad/10 text-status-bad',
  loading: 'border-border bg-bg-elevated text-text-muted',
};

export function WatchlistFreshnessBadge({
  label,
  status,
  statusLabel,
  source,
  asOf,
  details,
  compact = false,
}: {
  label?: string;
  status: WatchlistFreshnessStatus;
  statusLabel: string;
  source?: string | null;
  asOf?: string | null;
  details?: string | null;
  compact?: boolean;
}) {
  const diagnostics = [
    source,
    asOf && Number.isFinite(Date.parse(asOf)) ? new Date(asOf).toLocaleString() : null,
    details,
  ].filter(Boolean).join(' | ');
  const Icon = status === 'fresh' || status === 'live' ? Database
    : status === 'loading' ? LoaderCircle
      : status === 'unavailable' ? CircleAlert : Clock3;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded border font-medium ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} ${TONE[status]}`} title={diagnostics || undefined}>
      <Icon className={`shrink-0 ${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} ${status === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label && <span className="truncate opacity-80">{label}</span>}
      <span className="shrink-0 font-semibold">{statusLabel}</span>
    </span>
  );
}
