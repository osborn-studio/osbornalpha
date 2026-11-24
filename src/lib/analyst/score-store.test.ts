import { afterEach, describe, it, expect, vi } from 'vitest';
import * as store from './store';
import * as daily from '@/lib/scoring/daily-bars';
import { POST } from '@/app/api/analyst/scores/route';
import { needsScoring, buildScoreWrites, refreshRecommendationScores, KLINE_BARS } from './score-store';
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
  hit: true, score: 1, calibration_bucket: null, last_close: 1, last_close_date: '2026-01-01', base_close: 1, base_date: '2026-01-01', ...o,
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
  it('retries unscored or incomplete historical calls and lets the actual price window decide', () => {
    const historical = rec({ recommended_at: new Date(Date.now() - 250 * DAY).toISOString() });
    expect(needsScoring(historical, undefined)).toBe(true);
    expect(needsScoring(historical, score({}))).toBe(true);
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
    expect(w.reasons).toEqual({ price_unavailable: 0, before_window: 0, too_recent: 0 });
    expect(w.scoreUpserts).toHaveLength(1);
    expect(Object.keys(w.scoreUpserts[0])).toHaveLength(13);
    // Every refresh re-states the fill on the current price basis next to last_close.
    expect(w.scoreUpserts[0]).toMatchObject({ base_close: 100, base_date: '2026-06-01' });
    expect(w.fills).toEqual([{ id: 'r1', fill_price: 100, fill_date: '2026-06-01' }]);
  });
  it('skips a call dated before a full window', () => {
    const bars = makeBars('2026-06-15', KLINE_BARS);
    const w = buildScoreWrites([call()], new Map([['NVDA', bars]]), 'u', NOW);
    expect(w.skipped).toBe(1);
    expect(w.reasons).toEqual({ price_unavailable: 0, before_window: 1, too_recent: 0 });
    expect(w.scoreUpserts).toHaveLength(0);
    expect(w.fills).toHaveLength(0);
  });
  it('does not invent a fill when even a short history begins after the call', () => {
    const bars = makeBars('2026-06-10', 30);
    const w = buildScoreWrites([call()], new Map([['NVDA', bars]]), 'u', NOW);
    expect(w.reasons.before_window).toBe(1);
    expect(w.fills).toEqual([]);
  });
  it('uses the first bar when it is the verified IPO date', () => {
    const bars = makeBars('2026-06-10', 30);
    const w = buildScoreWrites([call()], new Map([['NVDA', bars]]), 'u', NOW, new Map(), new Map([['NVDA', '2026-06-10']]));
    expect(w.fills[0].fill_date).toBe('2026-06-10');
  });
  it('rolls a weekend forward at the left edge and a holiday forward between known sessions', () => {
    const bars = makeBars('2026-06-01', 30);
    const weekend = call({ recommended_at: '2026-05-30T00:00:00Z' });
    const w = buildScoreWrites([weekend], new Map([['NVDA', bars]]), 'u', NOW);
    expect(w.fills[0].fill_date).toBe('2026-06-01');
    const holiday = call({ recommended_at: '2026-06-03T00:00:00Z' });
    const withHoliday = bars.filter((b) => b.time !== '2026-06-03');
    expect(buildScoreWrites([holiday], new Map([['NVDA', withHoliday]]), 'u', NOW).fills[0].fill_date).toBe('2026-06-04');
  });
  it('preserves a persisted result when the replacement feed regresses the date or loses a computed window', () => {
    const bars = makeBars('2026-06-01', 12);
    const partial = score({ base_date: bars[0].time, last_close_date: '2026-07-02' });
    const resolved20 = score({ base_date: bars[0].time, last_close_date: bars.at(-1)!.time, forward_20d_pct: 3 });
    const otherSession = score({ base_date: '2026-06-02' });
    for (const previous of [partial, resolved20, otherSession]) {
      const w = buildScoreWrites([call()], new Map([['NVDA', bars]]), 'u', NOW, new Map([['r1', previous]]));
      expect(w.scoreUpserts).toEqual([]);
      expect(w.fills).toEqual([]);
      expect(w.reasons.price_unavailable).toBe(1);
    }
  });
  it('skips a candidate whose ticker has no bars', () => {
    const w = buildScoreWrites([call()], new Map([['NVDA', null]]), 'u', NOW);
    expect(w.skipped).toBe(1);
    expect(w.reasons).toEqual({ price_unavailable: 1, before_window: 0, too_recent: 0 });
    expect(w.scoreUpserts).toHaveLength(0);
  });
  it('reports no completed sessions as pending when only an intraday bar was available', () => {
    const w = buildScoreWrites([call()], new Map([['NVDA', []]]), 'u', NOW);
    expect(w.reasons).toEqual({ price_unavailable: 0, before_window: 0, too_recent: 1 });
    expect(w.fills).toEqual([]);
  });
  it('counts a call with fewer than 5 bars after it as too recent', () => {
    // A full window ending 06-03: only 2 bars after the 06-01 call.
    const bars = makeBars('2026-01-31', KLINE_BARS + 4);
    const w = buildScoreWrites([call()], new Map([['NVDA', bars]]), 'u', NOW);
    expect(bars.at(-1)!.time).toBe('2026-06-03');
    expect(w.skipped).toBe(1);
    expect(w.reasons).toEqual({ price_unavailable: 0, before_window: 0, too_recent: 1 });
    expect(w.fills).toHaveLength(0);
  });
  it('does not emit a fill for a candidate that already has one', () => {
    const bars = makeBars('2026-05-01', KLINE_BARS);
    const w = buildScoreWrites([call({ fill_price: 99, fill_date: '2026-06-01' })], new Map([['NVDA', bars]]), 'u', NOW);
    expect(w.scoreUpserts).toHaveLength(1);
    expect(w.fills).toHaveLength(0);
    // The frozen fill (99) stays; the score row carries the kernel's current-basis base close (100).
    expect(w.scoreUpserts[0]).toMatchObject({ base_close: 100, base_date: '2026-06-01' });
  });
});

// Start at the normal refresh endpoint. Verify both writes of a previously unscored call,
// including which request owns the one-shot fill when two requests race to insert the score.
describe('analyst score refresh', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it.each([true, false])('backfills old recommendations and only fills accepted inserts (won=%s)', async (won) => {
    const callDate = new Date(Date.now() - 210 * DAY).toISOString().slice(0, 10);
    const call = rec({ market: 'A', recommended_at: `${callDate}T04:00:00Z`, fill_price: null, fill_date: null });
    const bars = makeBars(callDate, 65);
    bars[5] = { ...bars[5], close: 105 };
    bars[20] = { ...bars[20], close: 98 };
    const scoreSelect = vi.fn().mockResolvedValue({ data: won ? [{ recommendation_id: call.id }] : [], error: null });
    const upsert = vi.fn().mockReturnValue({ select: scoreSelect });
    const fillQuery = { eq: vi.fn().mockReturnThis(), is: vi.fn().mockResolvedValue({ error: null }) };
    const update = vi.fn().mockReturnValue(fillQuery);
    const supabase = { from: (table: string) => table === 'recommendation_scores' ? { upsert } : { update } };
    vi.spyOn(store, 'requireUser').mockResolvedValue({ userId: 'u', supabase: supabase as any });
    vi.spyOn(store, 'readAllRecommendations').mockResolvedValue([call]);
    vi.spyOn(store, 'readAllScores').mockResolvedValue([]);
    vi.spyOn(daily, 'fetchScoringBars').mockResolvedValue(new Map([[call.ticker, bars]]));

    const response = await POST(new Request('http://localhost/api/analyst/scores', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scored: won ? 1 : 0, skipped: 0 });
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ recommendation_id: call.id, base_date: callDate,
      hit: true, score: -2, forward_5d_pct: 5, forward_20d_pct: -2 })], { onConflict: 'recommendation_id', ignoreDuplicates: true });
    if (won) {
      expect(update).toHaveBeenCalledWith({ fill_price: 100, fill_date: callDate });
      expect(fillQuery.is).toHaveBeenCalledWith('fill_price', null);
    } else {
      expect(update).not.toHaveBeenCalled();
    }
  });

  it('repairs the first fill from a previously saved score even when the provider is down', async () => {
    const call = rec({ fill_price: null, fill_date: null });
    const saved = score({ base_close: 92, base_date: '2026-01-05' });
    const fillQuery = { eq: vi.fn().mockReturnThis(), is: vi.fn().mockResolvedValue({ error: null }) };
    const update = vi.fn().mockReturnValue(fillQuery);
    const from = vi.fn().mockReturnValue({ update });
    vi.spyOn(store, 'requireUser').mockResolvedValue({ userId: 'u', supabase: { from } as any });
    vi.spyOn(store, 'readAllRecommendations').mockResolvedValue([call]);
    vi.spyOn(store, 'readAllScores').mockResolvedValue([saved]);
    vi.spyOn(daily, 'fetchScoringBars').mockResolvedValue(new Map());
    const result = await refreshRecommendationScores();
    expect(result.reasons.price_unavailable).toBe(1);
    expect(from.mock.calls.flat()).toEqual(['recommendations']);
    expect(update).toHaveBeenCalledWith({ fill_price: 92, fill_date: '2026-01-05' });
    expect(fillQuery.is).toHaveBeenCalledWith('fill_price', null);
  });

  it('paginates by ticker, counts all calls of each selected ticker, and keeps the final page cursor-free', async () => {
    const rows = ['E', 'C', 'D', 'A', 'B', 'D', 'F'].map((ticker, i) => rec({ ticker, id: String(i) }));
    vi.spyOn(store, 'requireUser').mockResolvedValue({ userId: 'u', supabase: {} as any });
    vi.spyOn(store, 'readAllRecommendations').mockResolvedValue(rows);
    vi.spyOn(store, 'readAllScores').mockResolvedValue([]);
    const prices = vi.spyOn(daily, 'fetchScoringBars').mockResolvedValue(new Map());
    expect(await refreshRecommendationScores('')).toMatchObject({ skipped: 5, nextTicker: 'D' });
    expect(new Set(prices.mock.calls[0][0])).toEqual(new Set(['A', 'B', 'C', 'D']));
    const final = await refreshRecommendationScores('D');
    expect(final.skipped).toBe(2);
    expect(final.nextTicker).toBeUndefined();
    expect(new Set(prices.mock.calls[1][0])).toEqual(new Set(['E', 'F']));
    expect((await refreshRecommendationScores()).skipped).toBe(7);
  });
});
