// Decision scoring for /portfolio/review. The forward-return rules live in the
// shared kernel (src/lib/scoring/forward.ts); this file only adapts a Decision
// row into a ForwardCall and the result into a decision_reviews draft.

import type { Decision } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';
import { scoreForward } from '@/lib/scoring/forward';

export interface DecisionReviewDraft {
  decision_id: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
}

export function scoreDecision(d: Decision, bars: KlineBar[]): DecisionReviewDraft | null {
  const s = scoreForward({ market: d.market, action: d.action, at: d.decided_at, confidence: d.confidence }, bars);
  if (!s) return null;
  return {
    decision_id: d.id,
    forward_5d_pct: s.forward_5d_pct,
    forward_20d_pct: s.forward_20d_pct,
    forward_60d_pct: s.forward_60d_pct,
    hit: s.hit,
    score: s.score,
    calibration_bucket: s.calibration_bucket,
  };
}
