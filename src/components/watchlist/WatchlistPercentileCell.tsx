'use client';

import type { ReactNode } from 'react';

export function WatchlistPercentileCell({
  value,
  sampleSize,
  label,
  tone = 'positive',
  missing,
}: {
  value: number | null | undefined;
  sampleSize: number;
  label: string;
  tone?: 'positive' | 'valuation' | 'neutral';
  missing?: ReactNode;
}) {
  if (value == null || !Number.isFinite(value)) return missing ?? <span className="text-text-muted">--</span>;
  const bounded = Math.max(0, Math.min(100, value));
  const color = tone === 'valuation'
    ? bounded >= 80 ? 'bg-warn' : bounded <= 20 ? 'bg-status-good' : 'bg-status-info'
    : tone === 'positive'
      ? bounded >= 70 ? 'bg-status-good' : bounded <= 30 ? 'bg-status-bad' : 'bg-status-info'
      : 'bg-accent';
  return (
    <div className="ml-auto w-24" title={`${label} · n=${sampleSize}`}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold tabular-nums text-text">P{Math.round(bounded)}</span>
        <span className="text-text-muted">n={sampleSize}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded bg-border">
        <div className={`h-full ${color}`} style={{ width: `${bounded}%` }} />
      </div>
    </div>
  );
}
