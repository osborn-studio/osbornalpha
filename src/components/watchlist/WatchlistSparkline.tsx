'use client';

import { useMemo } from 'react';

function sparklinePoints(values: number[], width: number, height: number): string {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0);
  if (finite.length < 2) return '';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  return finite.map((value, index) => {
    const x = (index / (finite.length - 1)) * width;
    const y = height - 2 - ((value - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function WatchlistSparkline({ values, label, className = '' }: { values?: number[]; label: string; className?: string }) {
  const usable = useMemo(() => values?.filter((value) => Number.isFinite(value) && value > 0) ?? [], [values]);
  const points = useMemo(() => sparklinePoints(usable, 64, 28), [usable]);
  if (!points) return <span className={`block h-7 w-16 ${className}`} aria-hidden="true" />;
  const positive = usable.at(-1)! >= usable[0];
  return (
    <svg viewBox="0 0 64 28" className={`h-7 w-16 overflow-visible ${positive ? 'text-up' : 'text-down'} ${className}`} role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
