import { describe, it, expect } from 'vitest';
import { buildBook, type BookInput } from './book';
import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';

let seq = 0;
function rec(o: Partial<Recommendation>): Recommendation {
  seq += 1;
  return {
    id: `r${seq}`, user_id: 'u', analyst_id: 'a', ticker: '600519.SH', market: 'A', action: 'buy',
    reference_price: null, rationale: null, confidence: null, target_price: null, stop_loss: null,
    horizon: null, thesis_ref: null, source_type: 'manual', source_ref: null,
    recommended_at: `2026-06-${String(seq).padStart(2, '0')}T01:00:00Z`, created_at: '2026-06-01T01:00:00Z',
    withdrawn_at: null, withdraw_reason: null, fill_price: 100, fill_date: '2026-06-01', ...o,
  };
}
function score(id: string, o: Partial<RecommendationScore> = {}): RecommendationScore {
  return {
    recommendation_id: id, user_id: 'u', scored_at: '2026-07-01T00:00:00Z',
    forward_5d_pct: 1, forward_20d_pct: 2, forward_60d_pct: null, hit: true, score: 2,
    calibration_bucket: null, last_close: 110, last_close_date: '2026-07-01', ...o,
  };
}
const row = (r: Recommendation, s: RecommendationScore | null = null): BookInput => ({ recommendation: r, score: s });

describe('buildBook — positions', () => {
  it('opens one unit per buy and averages the fill on add', () => {
    const a = rec({ action: 'buy', fill_price: 100 });
    const b = rec({ action: 'add', fill_price: 120 });
    const book = buildBook([row(a, score(a.id)), row(b, score(b.id, { last_close: 132 }))]);
    expect(book.positions).toHaveLength(1);
    const p = book.positions[0];
    expect(p.units).toBe(2);
    expect(p.avg_fill).toBe(110);
    expect(p.last_close).toBe(132); // newest score wins
    expect(p.unrealized_pct).toBe(20);
    expect(p.weight).toBe(1);
    expect(p.opened_at).toBe(a.recommended_at);
  });

  it('splits weight across tickers by units', () => {
    const a = rec({ ticker: 'AAA.SH' });
    const b = rec({ ticker: 'BBB.SH' });
    const c = rec({ ticker: 'BBB.SH', action: 'add' });
    const book = buildBook([row(a), row(b), row(c)]);
    const byTicker = Object.fromEntries(book.positions.map((p) => [p.ticker, p.weight]));
    expect(byTicker['AAA.SH']).toBeCloseTo(1 / 3);
    expect(byTicker['BBB.SH']).toBeCloseTo(2 / 3);
  });

  it('leaves last_close and unrealized null when no score exists yet', () => {
    const book = buildBook([row(rec({}))]);
    expect(book.positions[0].last_close).toBeNull();
    expect(book.positions[0].unrealized_pct).toBeNull();
  });
});

describe('buildBook — exits', () => {
  it('trim removes one unit and books one realized lot', () => {
    const a = rec({ action: 'buy', fill_price: 100 });
    const b = rec({ action: 'add', fill_price: 100 });
    const c = rec({ action: 'trim', fill_price: 150 });
    const book = buildBook([row(a), row(b), row(c)]);
    expect(book.positions[0].units).toBe(1);
    expect(book.closed).toEqual([{ ticker: '600519.SH', units: 1, avg_fill: 100, exit_price: 150, realized_pct: 50, closed_at: c.recommended_at, recommendation_id: c.id }]);
  });

  it('sell closes every unit at the average fill', () => {
    const a = rec({ action: 'buy', fill_price: 100 });
    const b = rec({ action: 'add', fill_price: 200 });
    const c = rec({ action: 'sell', fill_price: 120 });
    const book = buildBook([row(a), row(b), row(c)]);
    expect(book.positions).toHaveLength(0);
    expect(book.closed[0].units).toBe(2);
    expect(book.closed[0].realized_pct).toBe(-20); // 120/150 - 1
    expect(book.summary.avg_realized_pct).toBe(-20);
  });

  it('counts sells with no open position instead of booking them', () => {
    const book = buildBook([row(rec({ action: 'sell' }))]);
    expect(book.closed).toHaveLength(0);
    expect(book.summary.no_position_to_sell).toBe(1);
  });
});

describe('buildBook — exclusions and counters', () => {
  it('skips unpriced recommendations and counts them', () => {
    const book = buildBook([row(rec({ fill_price: null, fill_date: null }))]);
    expect(book.positions).toHaveLength(0);
    expect(book.summary.unpriced).toBe(1);
    expect(book.summary.recommendations).toBe(1);
  });

  it('ignores withdrawn recommendations entirely', () => {
    const a = rec({ withdrawn_at: '2026-06-05T00:00:00Z' });
    const book = buildBook([row(a, score(a.id))]);
    expect(book.positions).toHaveLength(0);
    expect(book.summary.recommendations).toBe(0);
    expect(book.summary.scorable).toBe(0);
  });

  it('hold and pass never touch the book but count as recommendations', () => {
    const h = rec({ action: 'hold' });
    const p = rec({ action: 'pass' });
    const book = buildBook([row(h, score(h.id, { hit: null, score: null })), row(p, score(p.id, { hit: false, score: -3 }))]);
    expect(book.positions).toHaveLength(0);
    expect(book.summary.recommendations).toBe(2);
    expect(book.summary.scorable).toBe(1);
    expect(book.summary.hit_rate).toBe(0);
    expect(book.summary.avg_score).toBe(-3);
  });

  it('processes in recommended_at order regardless of input order', () => {
    const buy = rec({ action: 'buy', recommended_at: '2026-06-01T00:00:00Z' });
    const sell = rec({ action: 'sell', recommended_at: '2026-06-02T00:00:00Z', fill_price: 110 });
    const book = buildBook([row(sell), row(buy)]);
    expect(book.positions).toHaveLength(0);
    expect(book.closed).toHaveLength(1);
    expect(book.summary.no_position_to_sell).toBe(0);
  });

  it('returns an empty book with null ratios for no input', () => {
    const book = buildBook([]);
    expect(book.positions).toEqual([]);
    expect(book.closed).toEqual([]);
    expect(book.summary).toEqual({
      recommendations: 0, scorable: 0, hits: 0, hit_rate: null, n_score: 0, avg_score: null,
      open_positions: 0, avg_unrealized_pct: null, closed_lots: 0, avg_realized_pct: null,
      unpriced: 0, no_position_to_sell: 0,
    });
  });
});
