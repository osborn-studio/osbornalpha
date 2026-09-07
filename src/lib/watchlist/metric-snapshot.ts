import type { Market, WatchlistMetricSnapshot } from '@/lib/supabase/database.types';
import type { DataEnvelope } from './overview-contract';
import type { HistoricalWatchlistMetrics } from './analytics';
import { builtInMarketCalendar, type MarketCalendarProvider } from '@/lib/market/calendar';
import { marketPhase } from '@/lib/today/clock';
import { WATCHLIST_METRIC_DEFINITION_VERSION } from './metric-registry';

export const WATCHLIST_METRIC_CALCULATOR_VERSION = 'watchlist-analytics-v4';

export function watchlistMetricValidUntil(
  market: Market,
  generatedAt: Date,
  calendar: MarketCalendarProvider = builtInMarketCalendar,
): string {
  let sawTradingSession = ['open', 'lunch'].includes(marketPhase(market, generatedAt, calendar).phase);
  let previousWasTrading = sawTradingSession;
  for (let step = 1; step <= 14 * 24 * 4; step += 1) {
    const candidate = new Date(generatedAt.getTime() + step * 15 * 60_000);
    const phase = marketPhase(market, candidate, calendar).phase;
    const trading = phase === 'open' || phase === 'lunch';
    if (trading) sawTradingSession = true;
    if (sawTradingSession && previousWasTrading && !trading) return candidate.toISOString();
    previousWasTrading = trading;
  }
  return new Date(generatedAt.getTime() + 24 * 60 * 60_000).toISOString();
}

export function nextWatchlistMetricRefresh(
  market: Market,
  now: Date,
  outcome: 'succeeded' | 'failed',
  failureCount: number,
  calendar: MarketCalendarProvider = builtInMarketCalendar,
): string {
  if (outcome === 'succeeded') return watchlistMetricValidUntil(market, now, calendar);
  const minutes = Math.min(360, 15 * (2 ** Math.min(Math.max(failureCount, 0), 5)));
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function isHistoricalMetrics(value: unknown): value is HistoricalWatchlistMetrics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Number.isFinite(Number(row.observations))
    && Number.isFinite(Number(row.coverageRatio))
    && !!row.methodology
    && typeof row.methodology === 'object'
    && !Array.isArray(row.methodology);
}

function withSparklineCompatibility(metrics: HistoricalWatchlistMetrics): HistoricalWatchlistMetrics {
  return Array.isArray(metrics.sparkline)
    ? metrics
    : { ...metrics, sparkline: [] };
}

export function metricSnapshotEnvelope(
  snapshot: WatchlistMetricSnapshot | null,
  now = new Date(),
): DataEnvelope<HistoricalWatchlistMetrics> {
  if (!snapshot || !isHistoricalMetrics(snapshot.metrics)) {
    return {
      value: null,
      asOf: null,
      source: null,
      status: 'unavailable',
      warnings: ['metric_snapshot_pending'],
    };
  }
  const stale = new Date(snapshot.valid_until).getTime() <= now.getTime();
  return {
    value: withSparklineCompatibility(snapshot.metrics),
    asOf: snapshot.observed_at ?? snapshot.generated_at,
    source: snapshot.source,
    status: stale ? 'stale' : 'fresh',
    warnings: [...new Set([...snapshot.warnings, ...(stale ? ['metric_snapshot_stale'] : [])])],
  };
}

export function metricSnapshotInsert(
  ticker: string,
  market: Market,
  historyRange: WatchlistMetricSnapshot['history_range'],
  benchmarkTicker: string,
  envelope: DataEnvelope<HistoricalWatchlistMetrics>,
  generatedAt = new Date(),
  calendar: MarketCalendarProvider = builtInMarketCalendar,
): WatchlistMetricSnapshot {
  if (!envelope.value) throw new Error('watchlist_metric_snapshot_unavailable');
  const metrics = envelope.value;
  return {
    ticker,
    market,
    history_range: historyRange,
    benchmark_ticker: benchmarkTicker,
    metrics: metrics as unknown as Record<string, unknown>,
    source: envelope.source,
    source_bundle: {
      source: envelope.source,
      benchmarkTicker,
      historyRange,
      definitionVersion: WATCHLIST_METRIC_DEFINITION_VERSION,
      calculatorVersion: WATCHLIST_METRIC_CALCULATOR_VERSION,
      coverageStart: metrics.coverageStart,
      coverageEnd: metrics.coverageEnd,
    },
    warnings: envelope.warnings,
    calculator_version: WATCHLIST_METRIC_CALCULATOR_VERSION,
    observed_at: envelope.asOf,
    generated_at: generatedAt.toISOString(),
    valid_until: watchlistMetricValidUntil(market, generatedAt, calendar),
    period_return_pct: metrics.periodReturnPct,
    total_return_pct: metrics.totalReturnPct,
    annualized_volatility_pct: metrics.annualizedVolatilityPct,
    downside_volatility_pct: metrics.downsideVolatilityPct,
    sharpe_ratio: metrics.sharpeRatio,
    max_drawdown_pct: metrics.maxDrawdownPct,
    rsi14: metrics.rsi14,
    ma20_distance_pct: metrics.ma20DistancePct,
    ma50_distance_pct: metrics.ma50DistancePct,
    macd_histogram: metrics.macdHistogram,
    bollinger_position_pct: metrics.bollingerPositionPct,
    atr14_pct: metrics.atr14Pct,
    excess_return_pct: metrics.excessReturnPct,
    beta: metrics.beta,
    volume_zscore_20: metrics.volumeZScore20,
    average_traded_amount_20: metrics.averageTradedAmount20,
    coverage_ratio: metrics.coverageRatio,
    updated_at: generatedAt.toISOString(),
  };
}
