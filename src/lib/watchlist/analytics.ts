import type { KlineBar } from '@/lib/chart/kline';
import type { KlineAdjustment } from '@/lib/data/kline/types';
import type { Market } from '@/lib/supabase/database.types';

type HistoricalPriceBar = Pick<KlineBar, 'close' | 'high' | 'low'> & { time: string | number };

const MARKET_BENCHMARKS: Record<Market, string> = {
  A: '510300.SH',
  HK: '02800.HK',
  US: 'SPY',
  JP: '1306.T',
  KR: '069500.KS',
  TW: '0050.TW',
};

export function watchlistBenchmarkTicker(market: Market): string {
  return MARKET_BENCHMARKS[market];
}

export interface HistoricalWatchlistMetrics {
  periodReturnPct: number | null;
  annualizedVolatilityPct: number | null;
  downsideVolatilityPct: number | null;
  sharpeRatio: number | null;
  maxDrawdownPct: number | null;
  rangePositionPct: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
  rsi14: number | null;
  ma20DistancePct: number | null;
  ma50DistancePct: number | null;
  benchmarkTicker: string | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  beta: number | null;
  sampleSize: number;
  methodology: {
    returnBasis: 'price';
    adjustment: KlineAdjustment;
    riskFreeRatePct: number;
    annualizationFactor: 252;
    rsiMethod: 'wilder';
    betaSampleSize: number;
  };
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Price-only metrics. Total return must not be inferred without cash distributions. */
function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
}

function simpleReturns(closes: number[]): number[] {
  return closes.slice(1).map((close, index) => (close / closes[index]) - 1);
}

function movingAverageDistance(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const average = mean(closes.slice(-period));
  return average > 0 ? ((closes.at(-1)! / average) - 1) * 100 : null;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  const deltas = closes.slice(1).map((close, index) => close - closes[index]);
  let averageGain = mean(deltas.slice(0, period).map((value) => Math.max(value, 0)));
  let averageLoss = mean(deltas.slice(0, period).map((value) => Math.max(-value, 0)));
  for (const delta of deltas.slice(period)) {
    averageGain = ((averageGain * (period - 1)) + Math.max(delta, 0)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(-delta, 0)) / period;
  }
  if (averageGain === 0 && averageLoss === 0) return null;
  if (averageLoss === 0) return 100;
  return 100 - (100 / (1 + averageGain / averageLoss));
}

function tradingDateKey(value: string | number): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) {
    // Unit tests and imported legacy series may use monotonic session ordinals.
    if (Math.abs(numeric) < 100_000_000) return String(numeric);
    const milliseconds = Math.abs(numeric) < 10_000_000_000 ? numeric * 1_000 : numeric;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
}

function benchmarkMetrics(
  bars: HistoricalPriceBar[],
  benchmarkBars: HistoricalPriceBar[],
  benchmarkTicker: string | null,
) {
  if (!benchmarkTicker || benchmarkBars.length < 2) {
    return { benchmarkTicker, benchmarkReturnPct: null, excessReturnPct: null, beta: null, betaSampleSize: 0 };
  }
  const benchmarkByTime = new Map(benchmarkBars.map((bar) => [tradingDateKey(bar.time), bar.close]));
  const aligned = bars.flatMap((bar) => {
    const benchmarkClose = benchmarkByTime.get(tradingDateKey(bar.time));
    return benchmarkClose && finitePositive(benchmarkClose) ? [{ asset: bar.close, benchmark: benchmarkClose }] : [];
  });
  if (aligned.length < 2) {
    return { benchmarkTicker, benchmarkReturnPct: null, excessReturnPct: null, beta: null, betaSampleSize: 0 };
  }
  const assetCloses = aligned.map((row) => row.asset);
  const benchmarkCloses = aligned.map((row) => row.benchmark);
  const assetReturnPct = ((assetCloses.at(-1)! / assetCloses[0]) - 1) * 100;
  const benchmarkReturnPct = ((benchmarkCloses.at(-1)! / benchmarkCloses[0]) - 1) * 100;
  const assetReturns = simpleReturns(assetCloses);
  const benchmarkReturns = simpleReturns(benchmarkCloses);
  const benchmarkVariance = sampleVariance(benchmarkReturns);
  let beta: number | null = null;
  if (benchmarkVariance && benchmarkVariance > 0 && assetReturns.length >= 20) {
    const assetMean = mean(assetReturns);
    const benchmarkMean = mean(benchmarkReturns);
    const covariance = assetReturns.reduce(
      (sum, value, index) => sum + (value - assetMean) * (benchmarkReturns[index] - benchmarkMean),
      0,
    ) / (assetReturns.length - 1);
    beta = covariance / benchmarkVariance;
  }
  return {
    benchmarkTicker,
    benchmarkReturnPct,
    excessReturnPct: assetReturnPct - benchmarkReturnPct,
    beta,
    betaSampleSize: assetReturns.length,
  };
}

export function calculateHistoricalWatchlistMetrics(
  bars: HistoricalPriceBar[],
  options: {
    benchmarkBars?: HistoricalPriceBar[];
    benchmarkTicker?: string | null;
    adjustment?: KlineAdjustment;
    riskFreeRatePct?: number;
  } = {},
): HistoricalWatchlistMetrics {
  const riskFreeRatePct = Number.isFinite(options.riskFreeRatePct) ? options.riskFreeRatePct! : 0;
  const methodologyBase = {
    returnBasis: 'price' as const,
    adjustment: (options.adjustment ?? 'none') as KlineAdjustment,
    riskFreeRatePct,
    annualizationFactor: 252 as const,
    rsiMethod: 'wilder' as const,
  };
  const usable = bars.filter((bar) => finitePositive(bar.close) && finitePositive(bar.high) && finitePositive(bar.low));
  if (usable.length === 0) {
    return {
      periodReturnPct: null,
      annualizedVolatilityPct: null,
      downsideVolatilityPct: null,
      sharpeRatio: null,
      maxDrawdownPct: null,
      rangePositionPct: null,
      rangeHigh: null,
      rangeLow: null,
      rsi14: null,
      ma20DistancePct: null,
      ma50DistancePct: null,
      benchmarkTicker: options.benchmarkTicker ?? null,
      benchmarkReturnPct: null,
      excessReturnPct: null,
      beta: null,
      sampleSize: 0,
      methodology: { ...methodologyBase, betaSampleSize: 0 },
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

  const returns = simpleReturns(closes);
  let annualizedVolatilityPct: number | null = null;
  let downsideVolatilityPct: number | null = null;
  let sharpeRatio: number | null = null;
  if (returns.length >= 2) {
    const average = mean(returns);
    const variance = sampleVariance(returns)!;
    annualizedVolatilityPct = Math.sqrt(variance) * Math.sqrt(252) * 100;
    const dailyRiskFree = ((1 + riskFreeRatePct / 100) ** (1 / 252)) - 1;
    const downside = returns.map((value) => Math.min(value - dailyRiskFree, 0));
    downsideVolatilityPct = Math.sqrt(mean(downside.map((value) => value ** 2))) * Math.sqrt(252) * 100;
    if (variance > 0) sharpeRatio = ((average - dailyRiskFree) / Math.sqrt(variance)) * Math.sqrt(252);
  }

  const relative = benchmarkMetrics(
    usable,
    (options.benchmarkBars ?? []).filter((bar) => finitePositive(bar.close)),
    options.benchmarkTicker ?? null,
  );

  return {
    periodReturnPct,
    annualizedVolatilityPct,
    downsideVolatilityPct,
    sharpeRatio,
    maxDrawdownPct: maxDrawdown * 100,
    rangePositionPct,
    rangeHigh,
    rangeLow,
    rsi14: rsi(closes),
    ma20DistancePct: movingAverageDistance(closes, 20),
    ma50DistancePct: movingAverageDistance(closes, 50),
    ...relative,
    sampleSize: usable.length,
    methodology: { ...methodologyBase, betaSampleSize: relative.betaSampleSize },
  };
}
