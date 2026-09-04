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
export type { DataEnvelope, WatchlistMarketSnapshot } from './overview-contract';

const loadMarket = unstable_cache(async (ticker: string, locale: AppLocale) => {
  const radar = await buildRadar(ticker, locale);
  const state = marketPhase(classifyMarket(ticker), new Date());
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
    asOf: radar.as_of,
    source: radar.sections.price.source || null,
    status: radar.sections.price.value == null ? 'unavailable' : 'fresh',
    warnings: [],
  } satisfies DataEnvelope<WatchlistMarketSnapshot>;
}, ['watchlist-overview-market-v1'], { revalidate: 60 });

const loadHistorySeries = unstable_cache(async (ticker: string) => {
  return resolveKline({ ticker, range: '1y' });
}, ['watchlist-overview-history-v1'], { revalidate: 3600 });

type HistorySeries = Awaited<ReturnType<typeof loadHistorySeries>>;

function historyEnvelope(
  ticker: string,
  result: HistorySeries,
  benchmark: HistorySeries | null,
): DataEnvelope<HistoricalWatchlistMetrics> {
  const benchmarkTicker = watchlistBenchmarkTicker(classifyMarket(ticker));
  return {
    value: calculateHistoricalWatchlistMetrics(result.bars, {
      benchmarkBars: benchmark?.bars ?? [],
      benchmarkTicker,
      adjustment: result.adjustment,
      riskFreeRatePct: 0,
    }),
    asOf: result.fetchedAt,
    source: result.source,
    status: result.freshness === 'stale' ? 'stale' : 'fresh',
    warnings: [...result.warnings, ...(!benchmark ? ['benchmark_unavailable'] : [])],
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
  options: { includeMarket?: boolean } = {},
): Promise<Record<string, WatchlistComputedOverview>> {
  const unique = Array.from(new Set(tickers));
  const benchmarkTickers = Array.from(new Set(unique.map((ticker) => (
    watchlistBenchmarkTicker(classifyMarket(ticker))
  ))));
  const benchmarkSettled = await boundedMap(benchmarkTickers, 3, (ticker) => loadHistorySeries(ticker));
  const benchmarkByTicker = new Map<string, HistorySeries>();
  benchmarkSettled.forEach((result, index) => {
    if (result.status === 'fulfilled') benchmarkByTicker.set(benchmarkTickers[index], result.value);
  });
  const settled = await boundedMap(unique, 5, async (ticker) => {
    const [market, history] = await Promise.allSettled([
      options.includeMarket ? loadMarket(ticker, locale) : Promise.resolve(null),
      loadHistorySeries(ticker),
    ]);
    const benchmarkTicker = watchlistBenchmarkTicker(classifyMarket(ticker));
    return {
      ticker,
      market: market.status === 'fulfilled'
        ? market.value
        : options.includeMarket ? unavailable<WatchlistMarketSnapshot>('market_unavailable') : null,
      history: history.status === 'fulfilled'
        ? historyEnvelope(ticker, history.value, benchmarkByTicker.get(benchmarkTicker) ?? null)
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
