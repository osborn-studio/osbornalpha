// Pure decision scoring: forward returns, hit/miss, and confidence calibration.
// Kept free of hooks/fetch so the node-env vitest covers it.

import type { Decision } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';

export interface DecisionReviewDraft {
  decision_id: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
}

function direction(action: Decision['action']): 1 | -1 | 0 {
  if (action === 'buy' || action === 'add') return 1;
  if (action === 'sell' || action === 'trim' || action === 'pass') return -1;
  return 0;
}

function pct(base: number, value: number): number {
  return ((value - base) / base) * 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function calibrationBucket(confidence: number | null): string | null {
  if (confidence === null) return null;
  const bucket = Math.min(Math.floor(confidence / 20), 4);
  return `${bucket * 20}-${bucket * 20 + 20}`;
}

export function scoreDecision(d: Decision, bars: KlineBar[]): DecisionReviewDraft | null {
  const decisionDate = d.decided_at.slice(0, 10);
  const baseIdx = bars.findIndex((b) => b.time >= decisionDate);
  if (baseIdx === -1) return null;

  const base = bars[baseIdx].close;

  const forwardAt = (n: number): number | null => {
    const bar = bars[baseIdx + n];
    return bar ? pct(base, bar.close) : null;
  };

  const forward_5d_pct = forwardAt(5);
  if (forward_5d_pct === null) return null;

  const forward_20d_pct = forwardAt(20);
  const forward_60d_pct = forwardAt(60);

  const dir = direction(d.action);
  const hit = dir !== 0 ? forward_5d_pct * dir > 0 : null;
  const score = dir !== 0 ? round1((forward_20d_pct ?? forward_5d_pct) * dir) : null;
  const calibration_bucket = calibrationBucket(d.confidence);

  return {
    decision_id: d.id,
    forward_5d_pct,
    forward_20d_pct,
    forward_60d_pct,
    hit,
    score,
    calibration_bucket,
  };
}
