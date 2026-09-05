import { periodKeyOf } from '@/lib/chart/kline';
import type { SourceKlineBar } from './types';

function mergeInto(bucket: SourceKlineBar, bar: SourceKlineBar): void {
  bucket.high = Math.max(bucket.high, bar.high);
  bucket.low = Math.min(bucket.low, bar.low);
  bucket.close = bar.close;
  bucket.volume += bar.volume;
  // A partial turnover sum cannot seed a trustworthy VWAP. Preserve amount
  // only when every constituent bar supplied it.
  if (bucket.amount !== undefined && bar.amount !== undefined) bucket.amount += bar.amount;
  else delete bucket.amount;
}

/**
 * Aggregates daily bars into natural-calendar weekly or monthly candles.
 * Used when a provider only serves daily history but a long range renders
 * better as weekly/monthly bars. Buckets are stamped at the period start
 * (Monday / first of month) so the timeline stays monotonic; the forming
 * period keeps whatever partial data exists.
 */
export function aggregateDailyBars(bars: SourceKlineBar[], interval: 'week' | 'month'): SourceKlineBar[] {
  const sorted = [...bars].sort((a, b) => a.time.localeCompare(b.time));
  const aggregated: SourceKlineBar[] = [];
  let currentKey = '';
  let bucket: SourceKlineBar | null = null;

  const pushBucket = () => {
    if (!bucket) return;
    bucket.time = interval === 'month' ? `${currentKey}-01` : currentKey;
    aggregated.push(bucket);
  };

  for (const bar of sorted) {
    const key = periodKeyOf(interval, bar.time);
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(key)) continue;
    if (key !== currentKey) {
      pushBucket();
      currentKey = key;
      bucket = { ...bar };
      continue;
    }
    if (!bucket) continue;
    mergeInto(bucket, bar);
  }
  pushBucket();
  return aggregated;
}

/**
 * Resamples one-minute bars onto a coarser minute grid (e.g. 5). Used when a
 * range renders 5-minute bars but a provider only serves one-minute history.
 * Buckets are stamped at the grid time, so off-grid minutes floor into the
 * bucket they belong to.
 */
export function resampleMinuteBars(bars: SourceKlineBar[], targetMinutes: number): SourceKlineBar[] {
  const bucketTime = (time: string): string | null => {
    const match = time.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
    if (!match) return null;
    const minute = Math.floor(Number(match[3]) / targetMinutes) * targetMinutes;
    return `${match[1]} ${match[2]}:${String(minute).padStart(2, '0')}`;
  };
  const out: SourceKlineBar[] = [];
  let currentTime: string | null = null;
  let bucket: SourceKlineBar | null = null;
  for (const bar of bars) {
    const time = bucketTime(bar.time);
    if (!time) continue;
    if (time !== currentTime) {
      if (bucket) out.push(bucket);
      currentTime = time;
      bucket = { ...bar, time };
      continue;
    }
    if (bucket) mergeInto(bucket, bar);
  }
  if (bucket) out.push(bucket);
  return out;
}
