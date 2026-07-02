import { describe, it, expect } from 'vitest';
import { computePositions, type TradeLike } from './positions';

const t = (o: Partial<TradeLike>): TradeLike => ({
  ticker: '300750',
  direction: 'buy',
  price: 100,
  quantity: 100,
  fee: 0,
  currency: 'CNY',
  executed_at: '2026-01-01T00:00:00Z',
  ...o,
});

describe('computePositions', () => {
  it('single buy opens a position at cost incl. fee', () => {
    const [p] = computePositions([t({ price: 100, quantity: 100, fee: 10 })]);
    expect(p.shares).toBe(100);
    expect(p.avgCost).toBeCloseTo(100.1); // (100*100+10)/100
    expect(p.realizedPnl).toBe(0);
    expect(p.closedAt).toBeNull();
  });

  it('second buy re-weights average cost', () => {
    const [p] = computePositions([
      t({ price: 100, quantity: 100 }),
      t({ price: 120, quantity: 100, executed_at: '2026-01-02T00:00:00Z' }),
    ]);
    expect(p.shares).toBe(200);
    expect(p.avgCost).toBeCloseTo(110);
  });

  it('sell realizes pnl net of fee and keeps avg cost', () => {
    const [p] = computePositions([
      t({ price: 100, quantity: 200 }),
      t({ direction: 'sell', price: 130, quantity: 100, fee: 5, executed_at: '2026-01-03T00:00:00Z' }),
    ]);
    expect(p.shares).toBe(100);
    expect(p.avgCost).toBeCloseTo(100);
    expect(p.realizedPnl).toBeCloseTo(100 * 30 - 5); // 2995
  });

  it('selling everything closes the position', () => {
    const [p] = computePositions([
      t({ price: 100, quantity: 100 }),
      t({ direction: 'sell', price: 90, quantity: 100, executed_at: '2026-01-04T00:00:00Z' }),
    ]);
    expect(p.shares).toBe(0);
    expect(p.avgCost).toBe(0);
    expect(p.closedAt).toBe('2026-01-04T00:00:00Z');
    expect(p.realizedPnl).toBeCloseTo(-1000);
  });

  it('re-buying after close reopens with fresh openedAt', () => {
    const [p] = computePositions([
      t({ price: 100, quantity: 100 }),
      t({ direction: 'sell', price: 110, quantity: 100, executed_at: '2026-01-05T00:00:00Z' }),
      t({ price: 105, quantity: 50, executed_at: '2026-02-01T00:00:00Z' }),
    ]);
    expect(p.shares).toBe(50);
    expect(p.avgCost).toBeCloseTo(105);
    expect(p.openedAt).toBe('2026-02-01T00:00:00Z');
    expect(p.closedAt).toBeNull();
    expect(p.realizedPnl).toBeCloseTo(1000); // carried across the reopen
  });

  it('throws on oversell (no shorting)', () => {
    expect(() =>
      computePositions([
        t({ price: 100, quantity: 100 }),
        t({ direction: 'sell', price: 100, quantity: 150, executed_at: '2026-01-06T00:00:00Z' }),
      ]),
    ).toThrow(/oversell/i);
  });

  it('groups by ticker and sorts trades by time internally', () => {
    const ps = computePositions([
      t({ ticker: 'NVDA', currency: 'USD', executed_at: '2026-01-02T00:00:00Z' }),
      t({ ticker: '300750', executed_at: '2026-01-03T00:00:00Z' }),
      t({ ticker: 'NVDA', currency: 'USD', price: 120, executed_at: '2026-01-01T00:00:00Z' }),
    ]);
    expect(ps).toHaveLength(2);
    const nvda = ps.find((p) => p.ticker === 'NVDA')!;
    expect(nvda.shares).toBe(200);
    expect(nvda.avgCost).toBeCloseTo(110);
    expect(nvda.currency).toBe('USD');
    const cn = ps.find((p) => p.ticker === '300750')!;
    expect(cn.shares).toBe(100);
  });

  it('returns empty array for empty input', () => {
    expect(computePositions([])).toEqual([]);
  });
});
