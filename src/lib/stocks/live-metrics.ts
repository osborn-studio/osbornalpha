// Live-signal derived metrics — investment rating and risk level computed from
// real-time signal inputs (intraday bias score + recent hit-rate, intraday
// amplitude + trailing PE). Pure & dependency-free; tested in isolation so the
// UI layer can render these without re-implementing the math.

export type LiveRating = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';

/**
 * Investment rating from a live bias signal and short-window hit rate.
 *
 * - `biasScore` in [-1, 1] — positive = bullish bias, negative = bearish.
 * - `hitRate5d` in [0, 1] — fraction of correct directional calls over the last
 *   ~5 sessions; 0.5 is neutral.
 *
 * Combined into a 0-10 score:
 *   score = 5 + biasScore * 4 + (hitRate5d - 0.5) * 4   (clamped to [0, 10])
 *
 * Banded into a rating: ≥8 STRONG BUY, ≥6.5 BUY, ≥4.5 HOLD, ≥3 SELL, else STRONG SELL.
 */
export function deriveLiveRating(input: { biasScore: number; hitRate5d: number }): LiveRating {
  const bias = Number.isFinite(input.biasScore) ? input.biasScore : 0;
  const hit = Number.isFinite(input.hitRate5d) ? input.hitRate5d : 0.5;
  const raw = 5 + bias * 4 + (hit - 0.5) * 4;
  const score = Math.min(10, Math.max(0, raw));
  if (score >= 8) return 'STRONG BUY';
  if (score >= 6.5) return 'BUY';
  if (score >= 4.5) return 'HOLD';
  if (score >= 3) return 'SELL';
  return 'STRONG SELL';
}

/**
 * Risk level 1 (low) – 5 (high) derived from intraday amplitude and trailing PE.
 *
 * Mirrors the scoring style of `deriveRiskLevel` in `./metrics.ts`:
 *   - pe ≤ 0  → +2 (losses / no earnings)
 *   - pe > 40 → +2
 *   - pe > 25 → +1
 *   - amplitude > 5 → +2
 *   - amplitude > 3 → +1
 * Starts from 1 and is clamped to [1, 5].
 */
export function deriveLiveRisk(input: { amplitude: number; peTtm: number }): number {
  const pe = Number.isFinite(input.peTtm) ? input.peTtm : 0;
  const amp = Number.isFinite(input.amplitude) ? input.amplitude : 0;
  let score = 1;
  if (pe <= 0) score += 2;
  else if (pe > 40) score += 2;
  else if (pe > 25) score += 1;
  if (amp > 5) score += 2;
  else if (amp > 3) score += 1;
  return Math.min(5, Math.max(1, score));
}
