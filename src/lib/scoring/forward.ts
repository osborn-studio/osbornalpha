// Shared forward-return scoring kernel. Pure: no fetch, no Supabase, so the
// node-env vitest covers it. Used by portfolio decision reviews
// (src/lib/portfolio/review.ts) and analyst recommendation scores
// (src/lib/analyst/score-store.ts). Rules are frozen here; both callers must
// stay byte-for-byte comparable.

import type { DecisionAction, Market } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';

export interface ForwardCall {
  market: Market;
  action: DecisionAction;
  /** UTC timestamptz of the call (decision.decided_at / recommendation.recommended_at). */
  at: string;
  confidence: number | null;
}

export interface ForwardScore {
  /** Close of the first bar on/after the call's exchange-local date. */
  base_close: number;
  base_date: string;
  forward_5d_pct: number | null;
  forward_20d_pct: number | null;
  forward_60d_pct: number | null;
  hit: boolean | null;
  score: number | null;
  calibration_bucket: string | null;
  /** Close/date of the newest bar supplied — the book's "last price". */
  last_close: number;
  last_close_date: string;
}

export function callDirection(action: DecisionAction): 1 | -1 | 0 {
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

// Kline bar dates are exchange-local trading days; normalize the UTC call
// time into the exchange timezone before extracting the date, otherwise
// late-night calls drift one trading day.
const EXCHANGE_TZ: Record<string, string> = { A: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', US: 'America/New_York' };

export function exchangeDate(at: string, market: string): string {
  try {
    // en-CA locale formats as YYYY-MM-DD.
    return new Date(at).toLocaleDateString('en-CA', { timeZone: EXCHANGE_TZ[market] ?? 'Asia/Shanghai' });
  } catch {
    return at.slice(0, 10);
  }
}

export function scoreForward(call: ForwardCall, bars: KlineBar[]): ForwardScore | null {
  const callDate = exchangeDate(call.at, call.market);
  const baseIdx = bars.findIndex((b) => b.time >= callDate);
  if (baseIdx === -1) return null;

  const base = bars[baseIdx].close;
  // Bad feed data (0/NaN close) would poison every downstream pct with
  // Infinity/NaN and get persisted — refuse to score instead.
  if (!Number.isFinite(base) || base <= 0) return null;

  const forwardAt = (n: number): number | null => {
    const bar = bars[baseIdx + n];
    return bar ? pct(base, bar.close) : null;
  };

  const forward_5d_pct = forwardAt(5);
  if (forward_5d_pct === null) return null;

  const forward_20d_pct = forwardAt(20);
  const forward_60d_pct = forwardAt(60);

  const dir = callDirection(call.action);
  const hit = dir !== 0 ? forward_5d_pct * dir > 0 : null;
  const score = dir !== 0 ? round1((forward_20d_pct ?? forward_5d_pct) * dir) : null;
  const last = bars[bars.length - 1];

  return {
    base_close: base,
    base_date: bars[baseIdx].time,
    forward_5d_pct,
    forward_20d_pct,
    forward_60d_pct,
    hit,
    score,
    calibration_bucket: calibrationBucket(call.confidence),
    last_close: last.close,
    last_close_date: last.time,
  };
}
