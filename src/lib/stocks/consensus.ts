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
  report_date?: string | null;
  org_name?: string | null;
  report_title?: string | null;
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
  if (max != null && min != null) return (Math.min(max, min) + Math.max(max, min)) / 2;
  return max ?? min ?? null;
}

export interface ConsensusFilterOptions {
  asOf?: Date;
  maxAgeDays?: number;
  currentPrice?: number | null;
  maxTargetMultiple?: number;
  /** Guard stored snapshots that do not have a contemporaneous quote. */
  maxRelativeMedianMultiple?: number;
}

export interface ConsensusFilterResult<T extends ConsensusReport = ConsensusReport> {
  accepted: T[];
  excluded: number;
  reasons: string[];
}

function reportDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const compact = /^\d{8}$/.test(value) ? value : value.slice(0, 10).replace(/-/g, '');
  if (!/^\d{8}$/.test(compact)) return null;
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6)) - 1;
  const day = Number(compact.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Remove reports that should not participate in a current consensus view.
 * The original rows remain available to the research list; only the aggregate
 * is filtered, with machine-readable reasons for the UI/audit log.
 */
export function filterConsensusReports<T extends ConsensusReport>(
  reports: T[],
  options: ConsensusFilterOptions = {},
): ConsensusFilterResult<T> {
  const asOf = options.asOf ?? new Date();
  const maxAgeDays = Math.max(1, Math.floor(options.maxAgeDays ?? 180));
  const maxTargetMultiple = Math.max(1, options.maxTargetMultiple ?? 10);
  const maxRelativeMedianMultiple = Math.max(1, options.maxRelativeMedianMultiple ?? 10);
  const currentPrice = options.currentPrice != null && Number.isFinite(options.currentPrice) && options.currentPrice > 0
    ? options.currentPrice
    : null;
  const seen = new Set<string>();
  const accepted: T[] = [];
  const reasons = new Set<string>();
  for (const [index, report] of (reports ?? []).entries()) {
    const midpoint = reportMidpoint(report);
    if (midpoint == null) {
      reasons.add('invalid_target');
      continue;
    }
    const published = reportDate(report.report_date);
    if (published && asOf.getTime() - published.getTime() > maxAgeDays * 86_400_000) {
      reasons.add('stale_report');
      continue;
    }
    if (currentPrice && (midpoint > currentPrice * maxTargetMultiple || midpoint < currentPrice / maxTargetMultiple)) {
      reasons.add('target_outlier');
      continue;
    }
    const identity = [report.org_name?.trim().toLocaleLowerCase() || `row-${index}`, report.report_date || '', report.report_title?.trim().toLocaleLowerCase() || ''].join('|');
    if (seen.has(identity)) {
      reasons.add('duplicate_report');
      continue;
    }
    seen.add(identity);
    accepted.push(report);
  }

  // Stored research may be read hours after the quote used to create it. When
  // no current price is available, use the accepted snapshot's median as a
  // conservative reference so one malformed target cannot dominate the
  // aggregate. A single report is never rejected by this relative guard.
  if (!currentPrice && accepted.length >= 2) {
    const values = accepted.map(reportMidpoint).filter((value): value is number => value != null).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    const reference = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    if (reference > 0) {
      const retained = accepted.filter((report) => {
        const midpoint = reportMidpoint(report);
        const valid = midpoint != null
          && midpoint <= reference * maxRelativeMedianMultiple
          && midpoint >= reference / maxRelativeMedianMultiple;
        if (!valid) reasons.add('target_outlier');
        return valid;
      });
      accepted.splice(0, accepted.length, ...retained);
    }
  }
  return { accepted, excluded: (reports ?? []).length - accepted.length, reasons: [...reasons] };
}

export type BrokerRating = 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell' | 'unknown';

/** Normalize broker-specific rating labels without overwriting the raw label. */
export function normalizeBrokerRating(value: string | null | undefined): BrokerRating {
  const normalized = (value ?? '').trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) return 'unknown';
  if (/强烈买入|strongbuy|outperform\+|overweight\+/.test(normalized)) return 'strong_buy';
  if (/买入|增持|推荐|buy|outperform|overweight|accumulate/.test(normalized)) return 'buy';
  if (/强烈卖出|strongsell|underweight\+/.test(normalized)) return 'strong_sell';
  if (/卖出|减持|回避|sell|underperform|underweight|reduce/.test(normalized)) return 'sell';
  if (/中性|持有|观望|neutral|hold|marketperform/.test(normalized)) return 'hold';
  return 'unknown';
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
