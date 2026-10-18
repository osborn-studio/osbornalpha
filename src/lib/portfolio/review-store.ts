// Supabase I/O for decision review scoring. Runs as the signed-in user (RLS
// enforced) — see docs/superpowers/plans/2026-07-02-p2b-review-scoring.md for
// why this is an on-demand refresh (POST /api/reviews) rather than a cron:
// the codebase has no service-role pattern and cron carries no user session.

import { getServerSupabase } from '@/lib/supabase/server';
import type { Decision, DecisionReview } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import { exchangeDate } from '@/lib/scoring/forward';
import { scoreDecision } from './review';
import type { DecisionReviewDraft } from './review';
import { coerceDecisionRow } from './store';

// 60 trading days ≈ 86-91 calendar days (more across CNY/Golden Week); 130 days leaves room to
// resolve the 60d window on a manual refresh while the base bar stays inside the 120-bar fetch.
// Same cap as the analyst layer (MAX_SCORING_AGE_MS in analyst/score-store.ts).
const MAX_SCORING_AGE_MS = 130 * 24 * 60 * 60 * 1000;

export const REVIEW_KLINE_BARS = 120;
const REVIEW_KLINE_FETCH_TIMEOUT_MS = 20_000;


// PostgREST serializes Postgres `numeric` as JSON strings; coerce at the read
// boundary so callers always get real numbers.
export function coerceReviewRow(row: Record<string, unknown>): DecisionReview {
  const r = row as unknown as DecisionReview;
  return {
    ...r,
    forward_5d_pct: r.forward_5d_pct === null ? null : Number(r.forward_5d_pct),
    forward_20d_pct: r.forward_20d_pct === null ? null : Number(r.forward_20d_pct),
    forward_60d_pct: r.forward_60d_pct === null ? null : Number(r.forward_60d_pct),
    score: r.score === null ? null : Number(r.score),
  };
}

async function requireUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  return { supabase, userId: data.user.id };
}

export async function listReviews(): Promise<DecisionReview[]> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.from('decision_reviews').select('*').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(coerceReviewRow);
}

function needsScoring(decision: Decision, review: DecisionReview | undefined): boolean {
  if (!review) return true;
  if (review.forward_60d_pct !== null) return false;
  const decidedAt = new Date(decision.decided_at).getTime();
  return Date.now() - decidedAt < MAX_SCORING_AGE_MS;
}

// Pure: decide which candidates get a draft. A full window whose first bar is after the decision
// day means the base bar is off-window — scoreForward would silently use the window's first bar
// as base — so skip. A short window is a newly listed ticker; ride forward to its first bar.
export function buildReviewDrafts(
  candidates: Decision[],
  barsByTicker: Map<string, KlineBar[] | null>,
): { drafts: DecisionReviewDraft[]; skipped: number } {
  const drafts: DecisionReviewDraft[] = [];
  let skipped = 0;
  for (const d of candidates) {
    const bars = barsByTicker.get(d.ticker);
    const beforeWindow =
      !!bars && bars.length >= REVIEW_KLINE_BARS && bars[0].time > exchangeDate(d.decided_at, d.market);
    const draft = bars && !beforeWindow ? scoreDecision(d, bars) : null;
    if (!draft) { skipped += 1; continue; }
    drafts.push(draft);
  }
  return { drafts, skipped };
}

export async function refreshReviews(): Promise<{ scored: number; skipped: number }> {
  const { supabase, userId } = await requireUser();

  const [{ data: decisionRows, error: dErr }, { data: reviewRows, error: rErr }] = await Promise.all([
    supabase.from('decisions').select('*').eq('user_id', userId).neq('status', 'cancelled'),
    supabase.from('decision_reviews').select('*').eq('user_id', userId),
  ]);
  if (dErr) throw new Error(dErr.message);
  if (rErr) throw new Error(rErr.message);

  const decisions = ((decisionRows ?? []) as Record<string, unknown>[]).map(coerceDecisionRow);
  const reviewsByDecisionId = new Map(
    ((reviewRows ?? []) as Record<string, unknown>[]).map(coerceReviewRow).map((r) => [r.decision_id, r]),
  );

  const candidates = decisions.filter((d) => needsScoring(d, reviewsByDecisionId.get(d.id)));
  if (candidates.length === 0) return { scored: 0, skipped: 0 };

  const tickers = [...new Set(candidates.map((d) => d.ticker))];
  const barsByTicker = new Map<string, KlineBar[] | null>();
  for (const ticker of tickers) {
    try {
      // signal → cache: 'no-store'; the next.revalidate variant stalls inside POST handlers on Vercel
      // (see KLINE_FETCH_TIMEOUT_MS in src/lib/analyst/score-store.ts).
      barsByTicker.set(ticker, (await fetchEastmoneyKline(ticker, 'D', REVIEW_KLINE_BARS, { signal: AbortSignal.timeout(REVIEW_KLINE_FETCH_TIMEOUT_MS) }))?.bars ?? null);
    } catch {
      // Skip this ticker's candidates rather than failing the whole refresh.
      barsByTicker.set(ticker, null);
    }
  }

  const { drafts, skipped } = buildReviewDrafts(candidates, barsByTicker);

  if (drafts.length === 0) return { scored: 0, skipped };

  // scored_at refreshes on re-score (upsert's update path would otherwise keep the original).
  const rows = drafts.map((draft) => ({ ...draft, user_id: userId, scored_at: new Date().toISOString() }));
  const { error: upErr } = await (supabase as any).from('decision_reviews').upsert(rows, { onConflict: 'decision_id' });
  if (upErr) throw new Error(upErr.message);

  return { scored: drafts.length, skipped };
}
