import type { KlineBar } from '@/lib/chart/kline';

export interface HistoricalWatchlistMetrics {
  periodReturnPct: number | null;
  annualizedVolatilityPct: number | null;
  maxDrawdownPct: number | null;
  rangePositionPct: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Price-only metrics. Total return must not be inferred without cash distributions. */
export function calculateHistoricalWatchlistMetrics(bars: KlineBar[]): HistoricalWatchlistMetrics {
  const usable = bars.filter((bar) => finitePositive(bar.close) && finitePositive(bar.high) && finitePositive(bar.low));
  if (usable.length === 0) {
    return {
      periodReturnPct: null,
      annualizedVolatilityPct: null,
      maxDrawdownPct: null,
      rangePositionPct: null,
      rangeHigh: null,
      rangeLow: null,
    };
  }

  const closes = usable.map((bar) => bar.close);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const periodReturnPct = closes.length >= 2 ? ((last / first) - 1) * 100 : null;
  const rangeHigh = Math.max(...usable.map((bar) => bar.high));
  const rangeLow = Math.min(...usable.map((bar) => bar.low));
  const rangePositionPct = rangeHigh > rangeLow
    ? Math.min(100, Math.max(0, ((last - rangeLow) / (rangeHigh - rangeLow)) * 100))
    : null;

  let peak = closes[0];
  let maxDrawdown = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    maxDrawdown = Math.max(maxDrawdown, (peak - close) / peak);
  }

  const logReturns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    logReturns.push(Math.log(closes[index] / closes[index - 1]));
  }
  let annualizedVolatilityPct: number | null = null;
  if (logReturns.length >= 2) {
    const mean = logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length;
    const variance = logReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logReturns.length - 1);
    annualizedVolatilityPct = Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  return {
    periodReturnPct,
    annualizedVolatilityPct,
    maxDrawdownPct: maxDrawdown * 100,
    rangePositionPct,
    rangeHigh,
    rangeLow,
  };
}
