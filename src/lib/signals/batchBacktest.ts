/**
 * Batch backtest engine — runs runBacktest over a watchlist in parallel,
 * aggregates per-ticker stats, and ranks.
 *
 * Use case: "Which stocks in my watchlist have the most reliable Sentinel
 * signals over the past 60 days?"
 */

import { runBacktest, type SignalEvent } from './backtest';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';

export interface RankedTicker {
  ticker: string;
  name: string;
  market: 'A' | 'HK' | 'US';
  currency: string;
  price: number | null;
  change_pct: number | null;
  // Backtest stats (copied from BacktestResult.stats with renamed fields)
  total_signals: number;
  bull_signals: number;
  bear_signals: number;
  neutral_signals: number;
  hits_5d: number;
  misses_5d: number;
  flats_5d: number;
  hit_rate_5d: number;          // 0..1
  avg_forward_5d_pct: number;
  avg_forward_20d_pct: number;
  // Composite quality score 0..100 (combines signal count + hit rate)
  quality_score: number;
  best_signal?: { date: string; forward_5d_pct: number; triggers: string[] };
  worst_signal?: { date: string; forward_5d_pct: number; triggers: string[] };
  // Hit-rate confidence interval (Wilson 95%) lower bound — robust to small N
  hit_rate_ci_lower: number;
  // Most recent signal date (so users can see if stock has activity)
  latest_signal_date: string | null;
}

export interface BatchBacktestResult {
  source: string;
  tickers_attempted: number;
  tickers_succeeded: number;
  days: number;
  rankings: RankedTicker[];
  // Aggregate stats across the whole watchlist
  aggregate: {
    total_signals: number;
    avg_hit_rate_5d: number;
    avg_forward_5d_pct: number;
    best_overall: { ticker: string; name: string; hit_rate_5d: number; total_signals: number } | null;
    worst_overall: { ticker: string; name: string; hit_rate_5d: number; total_signals: number } | null;
    most_active: { ticker: string; name: string; total_signals: number } | null;
  };
  duration_ms: number;
}

/**
 * Wilson 95% confidence interval lower bound — robust hit-rate scoring
 * when sample sizes are small (e.g., 1/2 ≠ 50% practical reliability).
 */
function wilsonLower(hits: number, total: number, z = 1.96): number {
  if (total === 0) return 0;
  const p = hits / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return Math.max(0, (center - margin) / denom);
}

/**
 * Composite quality score 0..100:
 *   - Rewards hit rate (heavy weight on Wilson lower bound)
 *   - Rewards more signals (log-scale to avoid overweighting noisy stocks)
 *   - Rewards positive average return
 *   - Caps at 100, floors at 0
 */
function qualityScore(r: {
  hit_rate_ci_lower: number;
  total_signals: number;
  avg_forward_5d_pct: number;
}): number {
  if (r.total_signals === 0) return 0;
  const baseWilson = r.hit_rate_ci_lower * 60;           // 0..60
  const activityBonus = Math.min(20, Math.log10(1 + r.total_signals) * 12);  // 0..20
  const returnBonus = Math.min(20, Math.max(0, r.avg_forward_5d_pct * 5));    // 0..20
  return Math.round(baseWilson + activityBonus + returnBonus);
}

interface MinimalQuote { name: string; market: 'A' | 'HK' | 'US'; currency: string; price: number; change_pct: number }

async function fetchMeta(ticker: string): Promise<MinimalQuote | null> {
  try {
    const q = await fetchEastmoneyQuote(ticker);
    if (!q) return null;
    return { name: q.name, market: q.market, currency: q.currency, price: q.price, change_pct: q.change_pct };
  } catch {
    return null;
  }
}

export async function runBatchBacktest(
  tickers: string[],
  days = 60
): Promise<BatchBacktestResult> {
  const startedAt = Date.now();
  if (tickers.length === 0) {
    return {
      source: 'eastmoney+backtest',
      tickers_attempted: 0,
      tickers_succeeded: 0,
      days,
      rankings: [],
      aggregate: {
        total_signals: 0, avg_hit_rate_5d: 0, avg_forward_5d_pct: 0,
        best_overall: null, worst_overall: null, most_active: null,
      },
      duration_ms: Date.now() - startedAt,
    };
  }

  // Parallel: backtest + quote per ticker
  const settled = await Promise.allSettled(
    tickers.map(async (ticker): Promise<RankedTicker | null> => {
      const [backtest, meta] = await Promise.all([
        runBacktest(ticker, days),
        fetchMeta(ticker),
      ]);
      if (!meta) return null;

      const stats = backtest.stats;
      const decided = stats.hits_5d + stats.misses_5d;
      const ciLower = wilsonLower(stats.hits_5d, decided);
      const latest = backtest.events.length > 0
        ? backtest.events[backtest.events.length - 1].date
        : null;

      const ranked: RankedTicker = {
        ticker,
        name: meta.name,
        market: meta.market,
        currency: meta.currency,
        price: meta.price,
        change_pct: meta.change_pct,
        total_signals: stats.total_signals,
        bull_signals: stats.bull_signals,
        bear_signals: stats.bear_signals,
        neutral_signals: stats.neutral_signals,
        hits_5d: stats.hits_5d,
        misses_5d: stats.misses_5d,
        flats_5d: stats.flats_5d,
        hit_rate_5d: stats.hit_rate_5d,
        avg_forward_5d_pct: stats.avg_forward_5d_pct,
        avg_forward_20d_pct: stats.avg_forward_20d_pct,
        hit_rate_ci_lower: ciLower,
        quality_score: 0,  // filled below
        best_signal: stats.best,
        worst_signal: stats.worst,
        latest_signal_date: latest,
      };
      ranked.quality_score = qualityScore(ranked);
      return ranked;
    })
  );

  const rankings = settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((r): r is RankedTicker => r !== null)
    .sort((a, b) => b.quality_score - a.quality_score);

  // Aggregate stats (only over stocks that had at least 1 signal)
  const withSignals = rankings.filter((r) => r.total_signals > 0);
  const totalSignals = withSignals.reduce((s, r) => s + r.total_signals, 0);
  const avgHitRate = withSignals.length === 0
    ? 0
    : withSignals.reduce((s, r) => s + r.hit_rate_5d, 0) / withSignals.length;
  const avgFwd5 = withSignals.length === 0
    ? 0
    : withSignals.reduce((s, r) => s + r.avg_forward_5d_pct, 0) / withSignals.length;

  // Best/worst by hit rate (with reasonable minimum signal count)
  const eligible = withSignals.filter((r) => r.hits_5d + r.misses_5d >= 2);
  const bestRanked = eligible.slice().sort((a, b) => b.hit_rate_5d - a.hit_rate_5d)[0];
  const worstRanked = eligible.slice().sort((a, b) => a.hit_rate_5d - b.hit_rate_5d)[0];
  const mostActive = withSignals.slice().sort((a, b) => b.total_signals - a.total_signals)[0];

  return {
    source: 'eastmoney+backtest',
    tickers_attempted: tickers.length,
    tickers_succeeded: rankings.length,
    days,
    rankings,
    aggregate: {
      total_signals: totalSignals,
      avg_hit_rate_5d: avgHitRate,
      avg_forward_5d_pct: avgFwd5,
      best_overall: bestRanked
        ? { ticker: bestRanked.ticker, name: bestRanked.name, hit_rate_5d: bestRanked.hit_rate_5d, total_signals: bestRanked.total_signals }
        : null,
      worst_overall: worstRanked
        ? { ticker: worstRanked.ticker, name: worstRanked.name, hit_rate_5d: worstRanked.hit_rate_5d, total_signals: worstRanked.total_signals }
        : null,
      most_active: mostActive
        ? { ticker: mostActive.ticker, name: mostActive.name, total_signals: mostActive.total_signals }
        : null,
    },
    duration_ms: Date.now() - startedAt,
  };
}
