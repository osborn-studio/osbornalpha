import type { SourceKlineBar } from './types';

/** Aggregate date-based bars into natural-calendar-month candles. */
export function aggregateMonthlyBars(bars: SourceKlineBar[]): SourceKlineBar[] {
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time));
  const monthly: SourceKlineBar[] = [];
  let currentKey = '';
  let bucket: SourceKlineBar | null = null;

  for (const bar of sorted) {
    const key = bar.time.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (key !== currentKey) {
      if (bucket) monthly.push(bucket);
      currentKey = key;
      bucket = { ...bar };
      continue;
    }
    if (!bucket) continue;
    bucket.high = Math.max(bucket.high, bar.high);
    bucket.low = Math.min(bucket.low, bar.low);
    bucket.close = bar.close;
    bucket.volume += bar.volume;
    bucket.time = bar.time;
  }
  if (bucket) monthly.push(bucket);
  return monthly;
}
