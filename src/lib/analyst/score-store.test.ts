import { describe, it, expect } from 'vitest';
import { needsScoring, buildScoreWrites, KLINE_BARS } from './score-store';
import type { KlineBar } from '@/lib/data/sources/eastmoney';
import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';

const rec = (o: Partial<Recommendation>): Recommendation => ({
  id: 'r1', user_id: 'u', analyst_id: 'a', ticker: 'NVDA', market: 'US', action: 'buy',
  reference_price: null, rationale: null, confidence: null, target_price: null, stop_loss: null,
  horizon: null, thesis_ref: null, source_type: 'manual', source_ref: null,
  recommended_at: new Date().toISOString(), created_at: new Date().toISOString(),
  withdrawn_at: null, withdraw_reason: null, fill_price: 100, fill_date: '2026-01-01', ...o,
});
const score = (o: Partial<RecommendationScore>): RecommendationScore => ({
  recommendation_id: 'r1', user_id: 'u', scored_at: 'x', forward_5d_pct: 1, forward_20d_pct: null, forward_60d_pct: null,
  hit: true, score: 1, calibration_bucket: null, last_close: 1, last_close_date: '2026-01-01', ...o,
});
const DAY = 86400000;

describe('needsScoring', () => {
  it('scores anything without a score', () => {
    expect(needsScoring(rec({}), undefined)).toBe(true);
  });
  it('stops once the 60d window is resolved and the fill is present', () => {
    expect(needsScoring(rec({ fill_price: 100, fill_date: '2026-01-01' }), score({ forward_60d_pct: 3 }))).toBe(false);
  });
  it('retries when the fill is missing even if the 60d window is resolved', () => {
    expect(needsScoring(rec({ fill_price: null, fill_date: null }), score({ forward_60d_pct: 3 }))).toBe(true);
  });
  it('keeps re-scoring immature rows younger than the age limit', () => {
    expect(needsScoring(rec({ recommended_at: new Date(Date.now() - 10 * DAY).toISOString() }), score({}))).toBe(true);
  });
  it('gives up on immature rows older than 130 days', () => {
    expect(needsScoring(rec({ recommended_at: new Date(Date.now() - 131 * DAY).toISOString() }), score({}))).toBe(false);
  });
  it('stops trying never-scored calls older than 170 days', () => {
    expect(needsScoring(rec({ recommended_at: new Date(Date.now() - 171 * DAY).toISOString() }), undefined)).toBe(false);
    expect(needsScoring(rec({ recommended_at: new Date(Date.now() - 100 * DAY).toISOString() }), undefined)).toBe(true);
  });
  it('never scores withdrawn rows', () => {
    expect(needsScoring(rec({ withdrawn_at: 'x' }), undefined)).toBe(false);
  });
});

// One bar per calendar day starting at startDate, flat closes.
function makeBars(startDate: string, n: number, close = 100): KlineBar[] {
  const start = new Date(startDate + 'T00:00:00Z');
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(start.getTime() + i * DAY);
    return { time: t.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1000 };
  });
}

describe('buildScoreWrites', () => {
  const NOW = '2026-09-01T00:00:00Z';
  const call = (o: Partial<Recommendation> = {}) =>
    rec({ market: 'A', recommended_at: '2026-06-01T00:00:00Z', fill_price: null, fill_date: null, ...o });

  it('scores a call inside a full window and emits a fill', () => {
    const bars = makeBars('2026-05-01', KLINE_BARS);
    const w = buildScoreWrites([call()], new Map([['NVDA', bars]]), 'u', NOW);
    expect(w.skipped).toBe(0);
    expect(w.scoreUpserts).toHaveLength(1);
    expect(Object.keys(w.scoreUpserts[0])).toHaveLength(11);
    expect(w.fills).toEqual([{ id: 'r1', fill_price: 100, fill_date: '2026-06-01' }]);
  });
  it('skips a call dated before a full window', () => {
    const bars = makeBars('2026-06-15', KLINE_BARS);
    const w = buildScoreWrites([call()], new Map([['NVDA', bars]]), 'u', NOW);
    expect(w.skipped).toBe(1);
    expect(w.scoreUpserts).toHaveLength(0);
    expect(w.fills).toHaveLength(0);
  });
  it('falls forward to the first bar on a short window (new listing)', () => {
    const bars = makeBars('2026-06-10', 30);
    const w = buildScoreWrites([call()], new Map([['NVDA', bars]]), 'u', NOW);
    expect(w.skipped).toBe(0);
    expect(w.scoreUpserts).toHaveLength(1);
    expect(w.fills[0].fill_date).toBe(bars[0].time);
  });
  it('skips a candidate whose ticker has no bars', () => {
    const w = buildScoreWrites([call()], new Map([['NVDA', null]]), 'u', NOW);
    expect(w.skipped).toBe(1);
    expect(w.scoreUpserts).toHaveLength(0);
  });
  it('does not emit a fill for a candidate that already has one', () => {
    const bars = makeBars('2026-05-01', KLINE_BARS);
    const w = buildScoreWrites([call({ fill_price: 99, fill_date: '2026-06-01' })], new Map([['NVDA', bars]]), 'u', NOW);
    expect(w.scoreUpserts).toHaveLength(1);
    expect(w.fills).toHaveLength(0);
  });
});
