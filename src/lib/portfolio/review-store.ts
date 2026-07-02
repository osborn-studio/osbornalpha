// Supabase I/O for decision review scoring. Runs as the signed-in user (RLS
// enforced) — see docs/superpowers/plans/2026-07-02-p2b-review-scoring.md for
// why this is an on-demand refresh (POST /api/reviews) rather than a cron:
// the codebase has no service-role pattern and cron carries no user session.

import { getServerSupabase } from '@/lib/supabase/server';
import type { Decision, DecisionReview } from '@/lib/supabase/database.types';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import { scoreDecision } from './review';
import { coerceDecisionRow } from './store';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

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
  return Date.now() - decidedAt < NINETY_DAYS_MS;
}

export async function refreshReviews(): Promise<{ scored: number }> {
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
  if (candidates.length === 0) return { scored: 0 };

  const tickers = [...new Set(candidates.map((d) => d.ticker))];
  const barsByTicker = new Map<string, Awaited<ReturnType<typeof fetchEastmoneyKline>>>();
  for (const ticker of tickers) {
    try {
      barsByTicker.set(ticker, await fetchEastmoneyKline(ticker, 'D', 120));
    } catch {
      // Skip this ticker's candidates rather than failing the whole refresh.
      barsByTicker.set(ticker, null);
    }
  }

  const drafts = candidates
    .map((d) => {
      const klineResult = barsByTicker.get(d.ticker);
      if (!klineResult) return null;
      return scoreDecision(d, klineResult.bars);
    })
    .filter((draft): draft is NonNullable<typeof draft> => draft !== null);

  if (drafts.length === 0) return { scored: 0 };

  // scored_at refreshes on re-score (upsert's update path would otherwise keep the original).
  const rows = drafts.map((draft) => ({ ...draft, user_id: userId, scored_at: new Date().toISOString() }));
  const { error: upErr } = await (supabase as any).from('decision_reviews').upsert(rows, { onConflict: 'decision_id' });
  if (upErr) throw new Error(upErr.message);

  return { scored: drafts.length };
}
