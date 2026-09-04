import { unstable_cache } from 'next/cache';
import { boundedMap } from '@/lib/async/bounded-map';
import { buildRadar } from '@/lib/brief/radar';
import { resolveKline } from '@/lib/data/kline/reliability';
import type { AppLocale } from '@/lib/i18n/locale';
import {
  calculateHistoricalWatchlistMetrics,
  watchlistBenchmarkTicker,
  type HistoricalWatchlistMetrics,
} from './analytics';
import { classifyMarket } from '@/lib/utils';
import { marketPhase } from '@/lib/today/clock';
import type { DataEnvelope, WatchlistMarketSnapshot } from './overview-contract';
import { watchlistMarketFreshness } from './freshness';
import { watchlistRiskFreeRatePct } from './risk';
import { loadMarketReturnSnapshot } from '@/lib/market-returns/service';
import type { MarketReturnSnapshot, WatchlistHistoryRange } from '@/lib/market-returns/types';
export type { DataEnvelope, WatchlistMarketSnapshot } from './overview-contract';

const loadMarket = unstable_cache(async (ticker: string, locale: AppLocale) => {
  const radar = await buildRadar(ticker, locale);
  const state = marketPhase(classifyMarket(ticker), new Date());
  // Radar's as_of is the composition time, not the market observation time.
  // Do not use it as a freshness surrogate when a provider omits updated_at.
  const asOf = radar.sections.price.updated_at ?? null;
  const freshness = watchlistMarketFreshness(asOf, new Date(), classifyMarket(ticker));
  const hasPrice = radar.sections.price.value != null && radar.sections.price.value > 0;
  const delayed = radar.sections.price.delayed === true;
  const status = !hasPrice || freshness === 'unavailable'
    ? 'unavailable' as const
    : delayed
      ? 'delayed' as const
      : freshness === 'stale' ? 'stale' as const : 'fresh' as const;
  return {
    value: {
      quote: {
        price: radar.sections.price.value,
        changePct: radar.sections.price.change_pct,
        peTtm: radar.sections.price.pe_ttm,
        pb: radar.sections.price.pb,
        marketCapLabel: radar.sections.price.market_cap_label,
      },
      fundamentals: {
        roe: radar.sections.fundamentals.roe,
        grossMargin: radar.sections.fundamentals.gross_margin,
        netMargin: radar.sections.fundamentals.net_margin,
        dividendYield: radar.sections.fundamentals.dividend_yield,
      },
      marketState: state,
      radar: { level: radar.radar_level, score: radar.score, headline: radar.headline },
      events: radar.sections.calendar.upcoming.map((event) => ({
        kind: event.kind,
        date: event.date,
        daysUntil: event.days_until,
        title: event.title,
      })),
    },
    asOf,
    source: radar.sections.price.source || null,
    status,
    warnings: [
      ...(delayed ? ['quote_delayed'] : []),
      ...(freshness === 'stale' ? ['quote_stale'] : []),
      ...(freshness === 'unavailable' ? ['quote_timestamp_unavailable'] : []),
    ],
  } satisfies DataEnvelope<WatchlistMarketSnapshot>;
}, ['watchlist-overview-market-v1'], { revalidate: 60 });

const loadHistorySeries = unstable_cache(async (ticker: string, range: WatchlistHistoryRange) => {
  return resolveKline({ ticker, range });
}, ['watchlist-overview-history-v2'], { revalidate: 3600 });

type HistorySeries = Awaited<ReturnType<typeof loadHistorySeries>>;

function historyEnvelope(
  ticker: string,
  result: HistorySeries,
  benchmark: HistorySeries | null,
  benchmarkTicker: string,
  historyRange: WatchlistHistoryRange,
  returnSnapshot: MarketReturnSnapshot | null,
  benchmarkReturnSnapshot: MarketReturnSnapshot | null,
): DataEnvelope<HistoricalWatchlistMetrics> {
  const market = classifyMarket(ticker);
  const metrics = calculateHistoricalWatchlistMetrics(result.bars, {
    benchmarkBars: benchmark?.bars ?? [],
    benchmarkTicker,
    market,
    adjustment: result.adjustment,
    riskFreeRatePct: watchlistRiskFreeRatePct(market),
    historyRange,
    returnSnapshot,
    benchmarkReturnSnapshot,
  });
  const totalReturnAvailable = returnSnapshot?.totalReturnPct != null;
  return {
    value: metrics,
    asOf: returnSnapshot?.asOf ?? result.fetchedAt,
    source: returnSnapshot ? `${result.source}+${returnSnapshot.source}` : result.source,
    status: result.freshness === 'stale' ? 'stale' : 'fresh',
    warnings: [
      ...result.warnings,
      ...(metrics.coverageRatio < 1 ? ['history_partial_coverage'] : []),
      ...(metrics.benchmarkAlignmentRatio != null && metrics.benchmarkAlignmentRatio < 0.9 ? ['benchmark_partial_alignment'] : []),
      ...(returnSnapshot?.warnings ?? []),
      ...(benchmarkReturnSnapshot?.warnings.map((warning) => `benchmark_${warning}`) ?? []),
      totalReturnAvailable ? 'total_return_adjusted_close' : 'total_return_unavailable',
      ...(!benchmark ? ['benchmark_unavailable'] : []),
    ],
  };
}

function unavailable<T>(reason: string): DataEnvelope<T> {
  return { value: null, asOf: null, source: null, status: 'unavailable', warnings: [reason] };
}

export interface WatchlistComputedOverview {
  ticker: string;
  market: DataEnvelope<WatchlistMarketSnapshot> | null;
  history: DataEnvelope<HistoricalWatchlistMetrics>;
}

export async function buildComputedWatchlistOverview(
  tickers: string[],
  locale: AppLocale,
  options: {
    includeMarket?: boolean;
    benchmarkTicker?: string | null;
    historyRange?: WatchlistHistoryRange;
    includeTotalReturn?: boolean;
  } = {},
): Promise<Record<string, WatchlistComputedOverview>> {
  const unique = Array.from(new Set(tickers));
  const historyRange = options.historyRange ?? '1y';
  const benchmarkTickers = Array.from(new Set(unique.map((ticker) => (
    options.benchmarkTicker ?? watchlistBenchmarkTicker(classifyMarket(ticker))
  ))));
  const [benchmarkSettled, benchmarkReturnSettled] = await Promise.all([
    boundedMap(benchmarkTickers, 3, (ticker) => loadHistorySeries(ticker, historyRange)),
    options.includeTotalReturn
      ? boundedMap(benchmarkTickers, 3, (ticker) => loadMarketReturnSnapshot(ticker, historyRange))
      : Promise.resolve([]),
  ]);
  const benchmarkByTicker = new Map<string, HistorySeries>();
  benchmarkSettled.forEach((result, index) => {
    if (result.status === 'fulfilled') benchmarkByTicker.set(benchmarkTickers[index], result.value);
  });
  const benchmarkReturnByTicker = new Map<string, MarketReturnSnapshot>();
  benchmarkReturnSettled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) benchmarkReturnByTicker.set(benchmarkTickers[index], result.value);
  });
  const settled = await boundedMap(unique, 5, async (ticker) => {
    const [market, history, returnSnapshot] = await Promise.allSettled([
      options.includeMarket ? loadMarket(ticker, locale) : Promise.resolve(null),
      loadHistorySeries(ticker, historyRange),
      options.includeTotalReturn ? loadMarketReturnSnapshot(ticker, historyRange) : Promise.resolve(null),
    ]);
    const benchmarkTicker = options.benchmarkTicker ?? watchlistBenchmarkTicker(classifyMarket(ticker));
    return {
      ticker,
      market: market.status === 'fulfilled'
        ? market.value
        : options.includeMarket ? unavailable<WatchlistMarketSnapshot>('market_unavailable') : null,
      history: history.status === 'fulfilled'
        ? historyEnvelope(
            ticker,
            history.value,
            benchmarkByTicker.get(benchmarkTicker) ?? null,
            benchmarkTicker,
            historyRange,
            returnSnapshot.status === 'fulfilled' ? returnSnapshot.value : null,
            benchmarkReturnByTicker.get(benchmarkTicker) ?? null,
          )
        : unavailable<HistoricalWatchlistMetrics>('history_unavailable'),
    };
  });

  const rows: Record<string, WatchlistComputedOverview> = {};
  settled.forEach((result, index) => {
    const ticker = unique[index];
    rows[ticker] = result.status === 'fulfilled'
      ? result.value
      : {
          ticker,
          market: options.includeMarket ? unavailable('overview_unavailable') : null,
          history: unavailable('overview_unavailable'),
        };
  });
  return rows;
}
