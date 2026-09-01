import { describe, expect, it } from 'vitest';
import { aggregateDailyBars } from './aggregate';
import type { SourceKlineBar } from './types';

const bar = (time: string, open: number, high: number, low: number, close: number, volume: number): SourceKlineBar =>
  ({ time, open, high, low, close, volume });

describe('aggregateDailyBars', () => {
  it('merges each natural month into one candle stamped at month start', () => {
    const bars = [
      bar('2026-06-28', 10, 12, 9, 11, 100),
      bar('2026-06-29', 11, 13, 10, 12, 150),
      bar('2026-07-01', 12, 15, 11, 14, 200),
      bar('2026-07-02', 14, 16, 13, 15, 250),
      bar('2026-07-03', 15, 17, 14, 13, 300),
    ];
    expect(aggregateDailyBars(bars, 'month')).toEqual([
      { time: '2026-06-01', open: 10, high: 13, low: 9, close: 12, volume: 250 },
      { time: '2026-07-01', open: 12, high: 17, low: 11, close: 13, volume: 750 },
    ]);
  });

  it('merges Monday-anchored weeks regardless of intra-week gaps', () => {
    // 2026-08-10 is a Monday; 2026-08-12 Wednesday; 2026-08-17 next Monday.
    const bars = [
      bar('2026-08-07', 20, 22, 19, 21, 10),   // prior week (Friday)
      bar('2026-08-10', 21, 24, 20, 23, 10),
      bar('2026-08-12', 23, 25, 22, 24, 10),
      bar('2026-08-17', 24, 26, 23, 25, 10),
    ];
    expect(aggregateDailyBars(bars, 'week')).toEqual([
      { time: '2026-08-03', open: 20, high: 22, low: 19, close: 21, volume: 10 },
      { time: '2026-08-10', open: 21, high: 25, low: 20, close: 24, volume: 20 },
      { time: '2026-08-17', open: 24, high: 26, low: 23, close: 25, volume: 10 },
    ]);
  });

  it('keeps the forming period as a partial candle and skips malformed rows', () => {
    const bars = [
      bar('nonsense', 1, 1, 1, 1, 1),
      bar('2026-08-31', 30, 31, 29, 30.5, 400),
    ];
    expect(aggregateDailyBars(bars, 'month')).toEqual([
      { time: '2026-08-01', open: 30, high: 31, low: 29, close: 30.5, volume: 400 },
    ]);
  });
});
