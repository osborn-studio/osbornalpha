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
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bollingerPositionPct: number | null;
  atr14Pct: number | null;
  benchmarkTicker: string | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  beta: number | null;
  observations: number;
  usableObservations: number;
  coverageRatio: number;
  coverageStart: string | null;
  coverageEnd: string | null;
  benchmarkObservations: number;
  benchmarkAlignedObservations: number;
  benchmarkAlignmentRatio: number | null;
  sampleSize: number;
  methodology: {
    returnBasis: 'price';
    adjustment: KlineAdjustment;
    riskFreeRatePct: number;
    annualizationFactor: number;
    rsiMethod: 'wilder';
    betaSampleSize: number;
  };
}

/**
 * Trading-session counts used when annualising daily observations. These are
 * intentionally conservative long-run values rather than calendar-day
 * counts. Callers can still provide an explicit factor for a custom market
 * calendar (for example, a backtest over a holiday-adjusted window).
 */
const TRADING_DAYS_PER_YEAR: Record<Market, number> = {
  A: 244,
  HK: 245,
  US: 252,
  JP: 245,
  KR: 245,
  TW: 245,
};

export function tradingDaysPerYear(market: Market): number {
  return TRADING_DAYS_PER_YEAR[market];
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

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let value = mean(values.slice(0, period));
  const multiplier = 2 / (period + 1);
  for (const next of values.slice(period)) value = (next - value) * multiplier + value;
  return value;
}

function macd(closes: number[]): { value: number | null; signal: number | null; histogram: number | null } {
  if (closes.length < 26) return { value: null, signal: null, histogram: null };
  const values: number[] = [];
  for (let index = 26; index <= closes.length; index += 1) {
    const fast = ema(closes.slice(0, index), 12);
    const slow = ema(closes.slice(0, index), 26);
    if (fast != null && slow != null) values.push(fast - slow);
  }
  const value = values.at(-1) ?? null;
  const signal = ema(values, 9);
  return { value, signal, histogram: value != null && signal != null ? value - signal : null };
}

function bollingerPosition(closes: number[], period = 20): number | null {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  const average = mean(window);
  const deviation = Math.sqrt(mean(window.map((value) => (value - average) ** 2)));
  const lower = average - deviation * 2;
  const upper = average + deviation * 2;
  return upper > lower ? Math.min(100, Math.max(0, ((closes.at(-1)! - lower) / (upper - lower)) * 100)) : null;
}

function atrPercent(bars: HistoricalPriceBar[], period = 14): number | null {
  if (bars.length <= period) return null;
  const trueRanges = bars.slice(1).map((bar, index) => {
    const previousClose = bars[index].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
  if (trueRanges.length < period) return null;
  const atr = mean(trueRanges.slice(-period));
  const close = bars.at(-1)?.close;
  return close && close > 0 ? (atr / close) * 100 : null;
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

function coverageDateKey(value: string | number): string | null {
  const key = tradingDateKey(value);
  return key && key !== 'undefined' ? key : null;
}

function benchmarkMetrics(
  bars: HistoricalPriceBar[],
  benchmarkBars: HistoricalPriceBar[],
  benchmarkTicker: string | null,
) {
  if (!benchmarkTicker || benchmarkBars.length < 2) {
    return {
      benchmarkTicker, benchmarkReturnPct: null, excessReturnPct: null, beta: null,
      betaSampleSize: 0, benchmarkObservations: benchmarkBars.length,
      benchmarkAlignedObservations: 0, benchmarkAlignmentRatio: null,
    };
  }
  const benchmarkByTime = new Map(benchmarkBars.map((bar) => [tradingDateKey(bar.time), bar.close]));
  const aligned = bars.flatMap((bar) => {
    const benchmarkClose = benchmarkByTime.get(tradingDateKey(bar.time));
    return benchmarkClose && finitePositive(benchmarkClose) ? [{ asset: bar.close, benchmark: benchmarkClose }] : [];
  });
  if (aligned.length < 2) {
    return {
      benchmarkTicker, benchmarkReturnPct: null, excessReturnPct: null, beta: null,
      betaSampleSize: 0, benchmarkObservations: benchmarkBars.length,
      benchmarkAlignedObservations: aligned.length,
      benchmarkAlignmentRatio: aligned.length / Math.max(1, bars.length),
    };
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
    benchmarkObservations: benchmarkBars.length,
    benchmarkAlignedObservations: aligned.length,
    benchmarkAlignmentRatio: aligned.length / Math.max(1, bars.length),
  };
}

export function calculateHistoricalWatchlistMetrics(
  bars: HistoricalPriceBar[],
  options: {
    benchmarkBars?: HistoricalPriceBar[];
    benchmarkTicker?: string | null;
    market?: Market;
    tradingDaysPerYear?: number;
    adjustment?: KlineAdjustment;
    riskFreeRatePct?: number;
  } = {},
): HistoricalWatchlistMetrics {
  const riskFreeRatePct = Number.isFinite(options.riskFreeRatePct) ? options.riskFreeRatePct! : 0;
  const annualizationFactor = Number.isFinite(options.tradingDaysPerYear)
    && options.tradingDaysPerYear! >= 1
    ? Math.round(options.tradingDaysPerYear!)
    : options.market ? tradingDaysPerYear(options.market) : 252;
  const methodologyBase = {
    returnBasis: 'price' as const,
    adjustment: (options.adjustment ?? 'none') as KlineAdjustment,
    riskFreeRatePct,
    annualizationFactor,
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
      macd: null,
      macdSignal: null,
      macdHistogram: null,
      bollingerPositionPct: null,
      atr14Pct: null,
      benchmarkTicker: options.benchmarkTicker ?? null,
      benchmarkReturnPct: null,
      excessReturnPct: null,
      beta: null,
      observations: bars.length,
      usableObservations: 0,
      coverageRatio: 0,
      coverageStart: bars[0] ? coverageDateKey(bars[0].time) : null,
      coverageEnd: bars.at(-1) ? coverageDateKey(bars.at(-1)!.time) : null,
      benchmarkObservations: options.benchmarkBars?.length ?? 0,
      benchmarkAlignedObservations: 0,
      benchmarkAlignmentRatio: null,
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
    annualizedVolatilityPct = Math.sqrt(variance) * Math.sqrt(annualizationFactor) * 100;
    const dailyRiskFree = ((1 + riskFreeRatePct / 100) ** (1 / annualizationFactor)) - 1;
    const downside = returns.map((value) => Math.min(value - dailyRiskFree, 0));
    downsideVolatilityPct = Math.sqrt(mean(downside.map((value) => value ** 2))) * Math.sqrt(annualizationFactor) * 100;
    if (variance > 0) sharpeRatio = ((average - dailyRiskFree) / Math.sqrt(variance)) * Math.sqrt(annualizationFactor);
  }

  const relative = benchmarkMetrics(
    usable,
    (options.benchmarkBars ?? []).filter((bar) => finitePositive(bar.close)),
    options.benchmarkTicker ?? null,
  );
  const macdMetrics = macd(closes);

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
    macd: macdMetrics.value,
    macdSignal: macdMetrics.signal,
    macdHistogram: macdMetrics.histogram,
    bollingerPositionPct: bollingerPosition(closes),
    atr14Pct: atrPercent(usable),
    ...relative,
    observations: bars.length,
    usableObservations: usable.length,
    coverageRatio: usable.length / Math.max(1, bars.length),
    coverageStart: coverageDateKey(usable[0].time),
    coverageEnd: coverageDateKey(usable.at(-1)!.time),
    sampleSize: usable.length,
    methodology: { ...methodologyBase, betaSampleSize: relative.betaSampleSize },
  };
}
