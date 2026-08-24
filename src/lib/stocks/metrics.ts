import type { MockStock } from '@/lib/data/mock';

// Derived watchlist metrics — investment rating, risk level, target price, and
// valuation range — computed from the existing stock model (sentinel score,
// broker reports, PE/volatility). Pure & testable; the watchlist Table view
// renders these as columns. Returns null where there is no data (stub stocks),
// so the UI shows "--" rather than a misleading value.

export type RatingLabel = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';
export type RatingTone = 'strong-buy' | 'buy' | 'hold' | 'sell' | 'strong-sell';
export interface Rating { label: RatingLabel; tone: RatingTone; }

/** Investment rating from the Sentinel score (0-10). null when unscored. */
export function deriveRating(sentinelScore: number): Rating | null {
  if (!Number.isFinite(sentinelScore) || sentinelScore <= 0) return null;
  if (sentinelScore >= 8) return { label: 'STRONG BUY', tone: 'strong-buy' };
  if (sentinelScore >= 6.5) return { label: 'BUY', tone: 'buy' };
  if (sentinelScore >= 4.5) return { label: 'HOLD', tone: 'hold' };
  if (sentinelScore >= 3) return { label: 'SELL', tone: 'sell' };
  return { label: 'STRONG SELL', tone: 'strong-sell' };
}

/** Risk level 1 (low) – 5 (high) from valuation + volatility. null when no data. */
export function deriveRiskLevel(
  s: Pick<MockStock, 'pe_ttm' | 'amplitude' | 'dividend_yield'>,
): number | null {
  const pe = s.pe_ttm ?? 0;
  const amp = s.amplitude ?? 0;
  if (pe === 0 && amp === 0) return null; // stub / no data
  let score = 1;
  // valuation risk
  if (pe <= 0) score += 2;          // losses / no earnings
  else if (pe > 40) score += 2;
  else if (pe > 25) score += 1;
  // volatility risk
  if (amp > 5) score += 2;
  else if (amp > 3) score += 1;
  // defensive offset for solid dividend payers
  if ((s.dividend_yield ?? 0) > 2) score -= 1;
  return Math.min(5, Math.max(1, score));
}

/** Parse a broker target like 'HK$580' / '$1,250' → number. */
export function parseTarget(t: string): number | null {
  const n = parseFloat(String(t).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Consensus target = median of broker targets. null when none. */
export function deriveTargetPrice(reports: MockStock['broker_reports']): number | null {
  const vals = (reports ?? [])
    .map((r) => parseTarget(r.target))
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/** Valuation band = min/max of broker targets (needs ≥2). null otherwise. */
export function deriveValuationRange(
  reports: MockStock['broker_reports'],
): { min: number; max: number } | null {
  const vals = (reports ?? [])
    .map((r) => parseTarget(r.target))
    .filter((n): n is number => n != null);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return max > min ? { min, max } : null;
}

/** Position 0-1 of price within [min,max], clamped. */
export function rangePosition(price: number, range: { min: number; max: number }): number {
  if (range.max <= range.min) return 0.5;
  return Math.min(1, Math.max(0, (price - range.min) / (range.max - range.min)));
}
