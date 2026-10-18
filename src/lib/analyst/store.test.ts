// Only the pure row mappers are unit-tested; the rest of store.ts is thin I/O
// glue over an RLS-authenticated Supabase client (same treatment as
// src/lib/portfolio/store.test.ts).

import { describe, expect, it } from 'vitest';
import { coerceProfileRow, coerceRecommendationRow, coerceScoreRow } from './store';

describe('coerceRecommendationRow', () => {
  it('turns PostgREST numeric strings into numbers and keeps nulls', () => {
    const out = coerceRecommendationRow({
      id: 'r1', analyst_id: 'a1', ticker: 'NVDA', market: 'US', action: 'buy',
      reference_price: '120.5', confidence: 70, target_price: null, stop_loss: '99', fill_price: '121.25', fill_date: '2026-06-01',
    });
    expect(out.reference_price).toBe(120.5);
    expect(out.target_price).toBeNull();
    expect(out.stop_loss).toBe(99);
    expect(out.fill_price).toBe(121.25);
    expect(out.ticker).toBe('NVDA');
  });
});

describe('coerceScoreRow', () => {
  it('coerces every numeric column and preserves booleans', () => {
    const out = coerceScoreRow({ recommendation_id: 'r1', forward_5d_pct: '1.5', forward_20d_pct: null, forward_60d_pct: '-2', score: '3', hit: true, last_close: '110', last_close_date: '2026-07-01' });
    expect(out.forward_5d_pct).toBe(1.5);
    expect(out.forward_20d_pct).toBeNull();
    expect(out.forward_60d_pct).toBe(-2);
    expect(out.score).toBe(3);
    expect(out.hit).toBe(true);
    expect(out.last_close).toBe(110);
  });
});

describe('coerceProfileRow', () => {
  it('passes rows through untouched (no numerics)', () => {
    const row = { id: 'a1', user_id: 'u', display_name: '我', kind: 'human', is_self: true, note: null, created_at: 'x', archived_at: null };
    expect(coerceProfileRow(row)).toEqual(row);
  });
});
