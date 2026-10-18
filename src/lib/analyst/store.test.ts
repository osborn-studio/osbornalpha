// Only the pure row mappers are unit-tested; the rest of store.ts is thin I/O
// glue over an RLS-authenticated Supabase client (same treatment as
// src/lib/portfolio/store.test.ts).

import { describe, expect, it } from 'vitest';
import { coerceProfileRow, coerceRecommendationRow, coerceScoreRow, joinViews, toExistingPlaybookRecommendation } from './store';
import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';

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
    const out = coerceScoreRow({ recommendation_id: 'r1', forward_5d_pct: '1.5', forward_20d_pct: null, forward_60d_pct: '-2', score: '3', hit: true, last_close: '110', last_close_date: '2026-07-01', base_close: '50', base_date: '2026-06-01' });
    expect(out.forward_5d_pct).toBe(1.5);
    expect(out.forward_20d_pct).toBeNull();
    expect(out.forward_60d_pct).toBe(-2);
    expect(out.score).toBe(3);
    expect(out.hit).toBe(true);
    expect(out.last_close).toBe(110);
    expect(out.base_close).toBe(50);
    expect(out.base_date).toBe('2026-06-01');
  });

  it('keeps base_close null for rows scored before the column existed', () => {
    const out = coerceScoreRow({ recommendation_id: 'r1', forward_5d_pct: null, forward_20d_pct: null, forward_60d_pct: null, score: null, hit: null, last_close: null, last_close_date: null, base_close: null, base_date: null });
    expect(out.base_close).toBeNull();
  });
});

describe('coerceProfileRow', () => {
  it('passes rows through untouched (no numerics)', () => {
    const row = { id: 'a1', user_id: 'u', display_name: '我', kind: 'human', is_self: true, note: null, created_at: 'x', archived_at: null };
    expect(coerceProfileRow(row)).toEqual(row);
  });
});

describe('joinViews', () => {
  it('attaches scores by recommendation id and collects adopting decisions', () => {
    const recs = [{ id: 'r1' }, { id: 'r2' }] as unknown as Recommendation[];
    const scores = [{ recommendation_id: 'r1', score: 3 }] as unknown as RecommendationScore[];
    const decisions = [
      { id: 'd1', recommendation_id: 'r2' },
      { id: 'd2', recommendation_id: 'r2' },
      { id: 'd3', recommendation_id: null },
      { id: 'd4', recommendation_id: 'r2', status: 'cancelled' },
      { id: 'd5', recommendation_id: 'r1', status: 'cancelled' },
    ];
    const [first, second] = joinViews(recs, scores, decisions);
    expect(first.score).toEqual(scores[0]);
    expect(first.adopted_by).toEqual([]); // d5 is cancelled
    expect(second.score).toBeNull();
    expect(second.adopted_by).toEqual(['d1', 'd2']);
  });
});

describe('toExistingPlaybookRecommendation', () => {
  it('reads entity_id from source_ref and keeps ticker/market', () => {
    const rec = { id: 'r1', ticker: '600519.SH', market: 'A', source_ref: { playbook_run_id: 'run-1', entity_id: 'e-a' } } as unknown as Parameters<typeof toExistingPlaybookRecommendation>[0];
    expect(toExistingPlaybookRecommendation(rec)).toEqual({ id: 'r1', ticker: '600519.SH', market: 'A', entity_id: 'e-a' });
  });
  it('yields entity_id null when source_ref lacks a string entity_id', () => {
    const rec = { id: 'r2', ticker: 'NVDA', market: 'US', source_ref: { playbook_run_id: 'run-1' } } as unknown as Parameters<typeof toExistingPlaybookRecommendation>[0];
    expect(toExistingPlaybookRecommendation(rec).entity_id).toBeNull();
  });
});
