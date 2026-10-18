// On-demand scoring of analyst recommendations (POST /api/analyst/scores).
// Same shape as src/lib/portfolio/review-store.ts: no cron, no service role;
// the signed-in user refreshes their own rows. Uses the shared kernel so a
// recommendation and a portfolio decision made at the same time score alike.
// First successful score also writes the recommendation's one-shot fill_price
// (= base close) which the paper book uses as the hypothetical fill.

import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import { scoreForward } from '@/lib/scoring/forward';
import { readAllRecommendations, readAllScores, requireUser } from './store';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function needsScoring(rec: Recommendation, score: RecommendationScore | undefined): boolean {
  if (rec.withdrawn_at !== null) return false;
  if (!score) return true;
  if (score.forward_60d_pct !== null) return false;
  return Date.now() - new Date(rec.recommended_at).getTime() < NINETY_DAYS_MS;
}

export async function refreshRecommendationScores(): Promise<{ scored: number; skipped: number }> {
  const { supabase, userId } = await requireUser();
  const [recs, scoreRows] = await Promise.all([readAllRecommendations(supabase, userId), readAllScores(supabase, userId)]);
  const scores = new Map(scoreRows.map((s) => [s.recommendation_id, s]));
  const candidates = recs.filter((r) => needsScoring(r, scores.get(r.id)));
  if (candidates.length === 0) return { scored: 0, skipped: 0 };

  // 120 daily bars ≈ 6 months; a recommendation older than that has no base bar
  // in range and is skipped (same limitation as decision reviews).
  const barsByTicker = new Map<string, Awaited<ReturnType<typeof fetchEastmoneyKline>>>();
  for (const ticker of new Set(candidates.map((r) => r.ticker))) {
    try {
      barsByTicker.set(ticker, await fetchEastmoneyKline(ticker, 'D', 120));
    } catch {
      barsByTicker.set(ticker, null); // skip this ticker, keep going
    }
  }

  const now = new Date().toISOString();
  const scoreUpserts: Array<Record<string, unknown>> = [];
  const fills: Array<{ id: string; fill_price: number; fill_date: string }> = [];
  let skipped = 0;
  for (const r of candidates) {
    const kline = barsByTicker.get(r.ticker);
    const s = kline ? scoreForward({ market: r.market, action: r.action, at: r.recommended_at, confidence: r.confidence }, kline.bars) : null;
    if (!s) { skipped += 1; continue; }
    scoreUpserts.push({
      recommendation_id: r.id, user_id: userId, scored_at: now,
      forward_5d_pct: s.forward_5d_pct, forward_20d_pct: s.forward_20d_pct, forward_60d_pct: s.forward_60d_pct,
      hit: s.hit, score: s.score, calibration_bucket: s.calibration_bucket,
      last_close: s.last_close, last_close_date: s.last_close_date,
    });
    if (r.fill_price === null) fills.push({ id: r.id, fill_price: s.base_close, fill_date: s.base_date });
  }

  if (scoreUpserts.length) {
    const { error } = await (supabase as any).from('recommendation_scores').upsert(scoreUpserts, { onConflict: 'recommendation_id' });
    if (error) throw new Error(error.message);
  }
  // One-shot: the `is('fill_price', null)` guard means a fill, once written, never moves.
  // fill_price and fill_date are written together (schema check pairs them).
  for (const f of fills) {
    const { error } = await (supabase as any).from('recommendations')
      .update({ fill_price: f.fill_price, fill_date: f.fill_date })
      .eq('id', f.id).eq('user_id', userId).is('fill_price', null);
    if (error) throw new Error(error.message);
  }
  return { scored: scoreUpserts.length, skipped };
}
