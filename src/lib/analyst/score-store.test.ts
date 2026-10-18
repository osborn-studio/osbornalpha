import { describe, it, expect } from 'vitest';
import { needsScoring } from './score-store';
import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';

const rec = (o: Partial<Recommendation>): Recommendation => ({
  id: 'r1', user_id: 'u', analyst_id: 'a', ticker: 'NVDA', market: 'US', action: 'buy',
  reference_price: null, rationale: null, confidence: null, target_price: null, stop_loss: null,
  horizon: null, thesis_ref: null, source_type: 'manual', source_ref: null,
  recommended_at: new Date().toISOString(), created_at: new Date().toISOString(),
  withdrawn_at: null, withdraw_reason: null, fill_price: null, fill_date: null, ...o,
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
  it('stops once the 60d window is resolved', () => {
    expect(needsScoring(rec({}), score({ forward_60d_pct: 3 }))).toBe(false);
  });
  it('keeps re-scoring immature rows younger than 90 days', () => {
    expect(needsScoring(rec({ recommended_at: new Date(Date.now() - 10 * DAY).toISOString() }), score({}))).toBe(true);
  });
  it('gives up on immature rows older than 90 days', () => {
    expect(needsScoring(rec({ recommended_at: new Date(Date.now() - 91 * DAY).toISOString() }), score({}))).toBe(false);
  });
  it('never scores withdrawn rows', () => {
    expect(needsScoring(rec({ withdrawn_at: 'x' }), undefined)).toBe(false);
  });
});
