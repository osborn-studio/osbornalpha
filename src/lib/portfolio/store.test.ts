// Tests for the pure row mappers only — the rest of store.ts is thin I/O
// glue over an RLS-authenticated Supabase client (not unit-tested, same
// treatment as src/lib/llm/settings-store.ts).

import { describe, expect, it } from 'vitest';
import { coerceDecisionRow, coercePositionRow, coerceTradeRow } from './store';

describe('coerceTradeRow', () => {
  it('coerces string numerics from PostgREST into numbers', () => {
    const out = coerceTradeRow({
      id: 't1',
      user_id: 'u1',
      decision_id: null,
      ticker: '600519',
      direction: 'buy',
      price: '100.5',
      quantity: '100',
      fee: '0',
      currency: 'CNY',
      executed_at: '2026-07-01T00:00:00Z',
      note: null,
    });
    expect(out.price).toBe(100.5);
    expect(out.quantity).toBe(100);
    expect(out.fee).toBe(0);
    // Non-numeric fields pass through untouched.
    expect(out.ticker).toBe('600519');
    expect(out.direction).toBe('buy');
    expect(out.executed_at).toBe('2026-07-01T00:00:00Z');
    expect(out.note).toBeNull();
  });

  it('passes through already-number inputs unchanged', () => {
    const out = coerceTradeRow({ ticker: 'AAPL', direction: 'sell', price: 250, quantity: 10, fee: 1.5, currency: 'USD', executed_at: '2026-07-02T00:00:00Z' });
    expect(out.price).toBe(250);
    expect(out.quantity).toBe(10);
    expect(out.fee).toBe(1.5);
  });
});

describe('coercePositionRow', () => {
  it('coerces string numerics and leaves other fields untouched', () => {
    const out = coercePositionRow({
      user_id: 'u1',
      ticker: '600519',
      shares: '100',
      avg_cost: '100.5',
      realized_pnl: '0',
      currency: 'CNY',
      opened_at: '2026-07-01T00:00:00Z',
      closed_at: null,
    });
    expect(out.shares).toBe(100);
    expect(out.avg_cost).toBe(100.5);
    expect(out.realized_pnl).toBe(0);
    expect(out.ticker).toBe('600519');
    expect(out.closed_at).toBeNull();

    // Already-number inputs pass through.
    const num = coercePositionRow({ user_id: 'u1', ticker: 'AAPL', shares: 10, avg_cost: 250, realized_pnl: -3.5, currency: 'USD', opened_at: '2026-07-02T00:00:00Z', closed_at: null });
    expect(num.shares).toBe(10);
    expect(num.avg_cost).toBe(250);
    expect(num.realized_pnl).toBe(-3.5);
  });
});

describe('coerceDecisionRow', () => {
  it('coerces string price fields, keeps nulls null, leaves confidence/status untouched', () => {
    const out = coerceDecisionRow({
      id: 'd1',
      user_id: 'u1',
      ticker: '600519',
      market: 'A',
      action: 'buy',
      thesis: null,
      confidence: 70,
      entry_low: '1500.5',
      entry_high: '1600',
      target_price: '2000',
      stop_loss: null,
      horizon: 'mid',
      source_type: 'manual',
      source_ref: null,
      status: 'open',
      decided_at: '2026-07-01T00:00:00Z',
      expires_at: null,
    });
    expect(out.entry_low).toBe(1500.5);
    expect(out.entry_high).toBe(1600);
    expect(out.target_price).toBe(2000);
    expect(out.stop_loss).toBeNull();
    // int4 / non-numeric fields untouched.
    expect(out.confidence).toBe(70);
    expect(out.status).toBe('open');
    expect(out.ticker).toBe('600519');
  });
});
