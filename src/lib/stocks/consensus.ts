// Broker consensus target price derived from Tushare `report_rc` (卖方盈利预测)
// rows. Pure & testable — mirrors the median/range conventions used by
// deriveTargetPrice / deriveValuationRange in metrics.ts:
//   - median is computed over sorted values (even count -> avg of the two
//     middle values, odd count -> the middle value)
//   - a min/max range is only reported when there are >= 2 valid data points
//
// Unlike metrics.ts (single `target` string per report), report_rc rows carry
// a max_price/min_price pair per report. We reduce each report to a single
// "midpoint" price — (max+min)/2 when both are present, else whichever one
// is present — then apply the same median/range logic over those midpoints.

export interface ConsensusReport {
  max_price?: number | string | null;
  min_price?: number | string | null;
}

export interface Consensus {
  target_median: number;
  target_min: number | null;
  target_max: number | null;
  n: number;
}

/** Coerce a possibly-string, possibly-missing price to a finite positive number, else null. */
function coercePrice(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Reduce one report row to a single midpoint price, or null if unusable. */
function reportMidpoint(r: ConsensusReport): number | null {
  const max = coercePrice(r.max_price);
  const min = coercePrice(r.min_price);
  if (max != null && min != null) return (max + min) / 2;
  return max ?? min ?? null;
}

/**
 * Derive consensus target price stats from a list of report_rc rows.
 * Returns null when there are zero usable rows. `target_min`/`target_max`
 * are only populated when n >= 2 (single-report consensus has no range).
 */
export function deriveConsensus(reports: ConsensusReport[]): Consensus | null {
  const vals = (reports ?? [])
    .map(reportMidpoint)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);

  if (vals.length === 0) return null;

  const mid = Math.floor(vals.length / 2);
  const target_median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;

  const hasRange = vals.length >= 2;
  return {
    target_median,
    target_min: hasRange ? vals[0] : null,
    target_max: hasRange ? vals[vals.length - 1] : null,
    n: vals.length,
  };
}
