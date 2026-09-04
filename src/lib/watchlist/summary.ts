import type { WatchlistMarketRow } from './market-row';

export interface WatchlistMarketSummary {
  tracked: number;
  quoted: number;
  loading: number;
  live: number;
  delayed: number;
  unavailable: number;
  gainers: number;
  decliners: number;
  unchanged: number;
  averageChangePct: number | null;
  medianChangePct: number | null;
  breadthPct: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

/**
 * Summarise only the quote rows supplied by the caller. Missing quotes are
 * counted explicitly and never treated as a zero return.
 */
export function summarizeWatchlistMarketRows(rows: WatchlistMarketRow[]): WatchlistMarketSummary {
  const quoted = rows.filter((row) => row.quote != null && row.quote.price > 0);
  const changes = quoted
    .map((row) => row.quote!.change_pct)
    .filter((value) => Number.isFinite(value));
  const gainers = changes.filter((value) => value > 0).length;
  const decliners = changes.filter((value) => value < 0).length;
  return {
    tracked: rows.length,
    quoted: quoted.length,
    loading: rows.filter((row) => row.status === 'loading').length,
    live: rows.filter((row) => row.status === 'live').length,
    delayed: rows.filter((row) => row.status === 'delayed').length,
    unavailable: rows.filter((row) => row.status === 'unavailable').length,
    gainers,
    decliners,
    unchanged: changes.length - gainers - decliners,
    averageChangePct: changes.length > 0
      ? changes.reduce((sum, value) => sum + value, 0) / changes.length
      : null,
    medianChangePct: median(changes),
    breadthPct: changes.length > 0 ? ((gainers - decliners) / changes.length) * 100 : null,
  };
}
