import { periodKeyOf } from '@/lib/chart/kline';
import type { SourceKlineBar } from './types';

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
    bucket.high = Math.max(bucket.high, bar.high);
    bucket.low = Math.min(bucket.low, bar.low);
    bucket.close = bar.close;
    bucket.volume += bar.volume;
  }
  pushBucket();
  return aggregated;
}
