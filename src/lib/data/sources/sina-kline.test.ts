import { describe, expect, it } from 'vitest';
import { parseSinaIntradayKline } from './sina-kline';

describe('Sina minute K-line adapter', () => {
  it('normalizes minute OHLCV rows', () => {
    expect(parseSinaIntradayKline([
      { day: '2026-08-27 09:31:00', open: '1304', high: '1305', low: '1300', close: '1301', volume: '6800' },
    ])).toEqual([{ time: '2026-08-27T09:31:00', open: 1304, high: 1305, low: 1300, close: 1301, volume: 6800 }]);
  });

  it('rejects an unexpected response envelope', () => {
    expect(() => parseSinaIntradayKline({ data: [] })).toThrow(/not an array/);
  });
});
