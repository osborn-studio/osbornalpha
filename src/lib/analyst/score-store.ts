// On-demand scoring of analyst recommendations (POST /api/analyst/scores).
// Same shape as src/lib/portfolio/review-store.ts: no cron, no service role;
// the signed-in user refreshes their own rows. Uses the shared kernel so a
// recommendation and a portfolio decision made at the same time score alike.
// First successful score also writes the recommendation's one-shot fill_price
// (= base close) which the paper book uses as the hypothetical fill.
// Known limits: fills are frozen on the price basis of the first refresh, so later qfq re-adjustments (A-share 送转/dividends) or unadjusted HK/US splits make fill and last_close drift; last_close freezes once a ticker's calls stop being re-scored.

import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import type { KlineBar } from '@/lib/data/sources/eastmoney';
import { exchangeDate, scoreForward } from '@/lib/scoring/forward';
import { readAllRecommendations, readAllScores, requireUser } from './store';

// 60 trading days ≈ 86-91 calendar days (more across CNY/Golden Week); 130 days leaves room to
// resolve the 60d window on a manual refresh while the base bar stays inside the 120-bar fetch.
const MAX_SCORING_AGE_MS = 130 * 24 * 60 * 60 * 1000;

export const KLINE_BARS = 120;

export function needsScoring(rec: Recommendation, score: RecommendationScore | undefined): boolean {
  if (rec.withdrawn_at !== null) return false;
  // Never scored, or the one-shot fill write failed/was skipped: retry (cheap — skipped again if bars don't reach).
  if (!score || rec.fill_price === null) return true;
  if (score.forward_60d_pct !== null) return false;
  return Date.now() - new Date(rec.recommended_at).getTime() < MAX_SCORING_AGE_MS;
}

export interface ScoreWrites {
  scoreUpserts: Array<Record<string, unknown>>;
  fills: Array<{ id: string; fill_price: number; fill_date: string }>;
  skipped: number;
}

// Pure: turns candidates + fetched bars into DB writes. A call whose exchange-local date is older than
// the first fetched bar of a FULL window is skipped — the kernel would otherwise take the window's
// first bar as base and freeze a wrong fill. A short window (< KLINE_BARS) means the whole listing
// history is in hand (new IPO), so falling forward to the first bar is legitimate.
export function buildScoreWrites(
  candidates: Recommendation[],
  barsByTicker: Map<string, KlineBar[] | null>,
  userId: string,
  now: string,
): ScoreWrites {
  const scoreUpserts: ScoreWrites['scoreUpserts'] = [];
  const fills: ScoreWrites['fills'] = [];
  let skipped = 0;
  for (const r of candidates) {
    const bars = barsByTicker.get(r.ticker);
    const callDate = exchangeDate(r.recommended_at, r.market);
    const beforeWindow = !!bars && bars.length >= KLINE_BARS && bars[0].time > callDate;
    const s = bars && !beforeWindow ? scoreForward({ market: r.market, action: r.action, at: r.recommended_at, confidence: r.confidence }, bars) : null;
    if (!s) { skipped += 1; continue; }
    scoreUpserts.push({
      recommendation_id: r.id, user_id: userId, scored_at: now,
      forward_5d_pct: s.forward_5d_pct, forward_20d_pct: s.forward_20d_pct, forward_60d_pct: s.forward_60d_pct,
      hit: s.hit, score: s.score, calibration_bucket: s.calibration_bucket,
      last_close: s.last_close, last_close_date: s.last_close_date,
    });
    // Fill = close of the call's exchange-local day (an intraday look-ahead of a few hours, accepted by design).
    if (r.fill_price === null) fills.push({ id: r.id, fill_price: s.base_close, fill_date: s.base_date });
  }
  return { scoreUpserts, fills, skipped };
}

export async function refreshRecommendationScores(): Promise<{ scored: number; skipped: number }> {
  const { supabase, userId } = await requireUser();
  const [recs, scoreRows] = await Promise.all([readAllRecommendations(supabase, userId), readAllScores(supabase, userId)]);
  const scores = new Map(scoreRows.map((s) => [s.recommendation_id, s]));
  const candidates = recs.filter((r) => needsScoring(r, scores.get(r.id)));
  if (candidates.length === 0) return { scored: 0, skipped: 0 };

  // 120 daily bars ≈ 6 months; a recommendation older than that has no base bar
  // in range and is skipped by buildScoreWrites. (portfolio/review-store.ts has no
  // such guard yet and would take the window's first bar as base — follow-up.)
  const tickers = [...new Set(candidates.map((r) => r.ticker))];
  const barsByTicker = new Map<string, KlineBar[] | null>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, tickers.length) }, async () => {
    while (next < tickers.length) {
      const ticker = tickers[next++];
      try { barsByTicker.set(ticker, (await fetchEastmoneyKline(ticker, 'D', KLINE_BARS))?.bars ?? null); }
      catch { barsByTicker.set(ticker, null); } // skip this ticker, keep going
    }
  }));

  const { scoreUpserts, fills, skipped } = buildScoreWrites(candidates, barsByTicker, userId, new Date().toISOString());

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
