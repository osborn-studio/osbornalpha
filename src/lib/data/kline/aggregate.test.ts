import { describe, expect, it } from 'vitest';
import { aggregateMonthlyBars } from './aggregate';

describe('aggregateMonthlyBars', () => {
  it('builds natural-month OHLCV candles from daily bars', () => {
    expect(aggregateMonthlyBars([
      { time: '2026-01-30', open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: '2026-02-02', open: 11, high: 13, low: 10, close: 12, volume: 200 },
      { time: '2026-02-28', open: 12, high: 15, low: 11, close: 14, volume: 300 },
      { time: '2026-03-03', open: 14, high: 16, low: 13, close: 15, volume: 400 },
    ])).toEqual([
      { time: '2026-01-30', open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: '2026-02-28', open: 11, high: 15, low: 10, close: 14, volume: 500 },
      { time: '2026-03-03', open: 14, high: 16, low: 13, close: 15, volume: 400 },
    ]);
  });

  it('sorts input and ignores malformed period keys', () => {
    const result = aggregateMonthlyBars([
      { time: '2026-02-03', open: 11, high: 12, low: 10, close: 11, volume: 2 },
      { time: 'bad', open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: '2026-01-05', open: 10, high: 11, low: 9, close: 10, volume: 1 },
    ]);
    expect(result.map((bar) => bar.time)).toEqual(['2026-01-05', '2026-02-03']);
  });
});
