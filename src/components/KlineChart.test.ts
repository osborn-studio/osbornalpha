import { describe, expect, it } from 'vitest';
import { computeSessionVwap } from '@/lib/chart/session-vwap';
import type { KlineBar } from '@/lib/chart/kline';

const bar = (time: number, amount: number | undefined, volume = 100): KlineBar => ({
  time,
  open: 10,
  high: 11,
  low: 9,
  close: 10,
  volume,
  ...(amount === undefined ? {} : { amount }),
  previousClose: null,
  change: null,
  changePct: null,
});

describe('computeSessionVwap', () => {
  it('uses actual turnover and inserts a whitespace break between sessions', () => {
    const first = Date.UTC(2026, 7, 14, 9, 30) / 1_000;
    const next = Date.UTC(2026, 7, 17, 9, 30) / 1_000;
    expect(computeSessionVwap([
      bar(first, 1_000),
      bar(first + 60, 1_100),
      bar(next, 1_200),
    ])).toEqual([
      { time: first, value: 10 },
      { time: first + 60, value: 10.5 },
      { time: next - 1 },
      { time: next, value: 12 },
    ]);
  });

  it('does not present an estimated price as a session average', () => {
    expect(computeSessionVwap([bar(Date.UTC(2026, 7, 14, 9, 30) / 1_000, undefined)])).toEqual([]);
  });
});
