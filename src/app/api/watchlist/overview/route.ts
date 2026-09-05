import { NextResponse } from 'next/server';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import type { StockUniverse, WatchlistMetricSnapshot } from '@/lib/supabase/database.types';
import { buildComputedWatchlistOverview } from '@/lib/watchlist/overview';
import type { DataEnvelope, WatchlistOverviewResponse } from '@/lib/watchlist/overview-contract';
import { encodeWatchlistOverviewCursor, parseWatchlistOverviewPage } from '@/lib/watchlist/overview-pagination';
import {
  encodeWatchlistOverviewQueryCursor,
  parseWatchlistOverviewQuery,
} from '@/lib/watchlist/overview-query';
import { loadWatchlistResearchSummaries } from '@/lib/watchlist/research-repository';
import type { WatchlistResearchSummary } from '@/lib/watchlist/research-summary';
import {
  loadWatchlistOverviewPage,
  loadWatchlistOverviewQuery,
  loadWatchlistVersion,
} from '@/lib/watchlist/server-repository';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { watchlistTimestampFreshness } from '@/lib/watchlist/freshness';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { WATCHLIST_RESEARCH_WINDOW_DAYS } from '@/lib/watchlist/research-window';
import { validateWatchlistBenchmark } from '@/lib/watchlist/benchmark-validation';
import { parseWatchlistHistoryRange } from '@/lib/market-returns/range';
import { metricSnapshotEnvelope } from '@/lib/watchlist/metric-snapshot';
import { loadWatchlistMetricSnapshots } from '@/lib/watchlist/metric-snapshot-repository';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function researchEnvelope(summary: WatchlistResearchSummary): DataEnvelope<WatchlistResearchSummary> {
  const asOf = [summary.latestNewsAt, summary.latestReportAt, summary.latestPerspectiveAt]
    .filter((value): value is string => !!value)
    .sort()
    .at(-1) ?? null;
  const status = watchlistTimestampFreshness(asOf);
  return {
    value: summary,
    asOf,
    source: 'stored-research',
    status,
    warnings: status === 'stale' ? ['stored_research_stale']
      : status === 'unavailable' ? ['stored_research_expired']
        : [],
  };
}

export async function GET(request: Request) {
  if (!serverIsSupabaseConfigured()) {
    return watchlistApiError('supabase_unavailable', 503);
  }
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);

  try {
    const url = new URL(request.url);
    const tickerParam = url.searchParams.get('ticker');
    const ticker = tickerParam ? normalizeEvidenceTickerParam(tickerParam) : null;
    if (tickerParam && !ticker) return watchlistApiError('invalid_ticker', 400);
    const benchmarkParam = url.searchParams.get('benchmark');
    const benchmark = benchmarkParam ? normalizeEvidenceTickerParam(benchmarkParam) : null;
    if (benchmarkParam && !benchmark) return watchlistApiError('invalid_benchmark', 400);
    if (benchmark && !ticker) return watchlistApiError('benchmark_requires_ticker', 400);
    if (benchmark && ticker) {
      const validation = validateWatchlistBenchmark(ticker, benchmark);
      if (!validation.valid) return watchlistApiError(`benchmark_${validation.issue}`, 400);
    }
    const rangeParam = url.searchParams.get('range');
    const historyRange = rangeParam ? parseWatchlistHistoryRange(rangeParam) : '1y';
    if (!historyRange) return watchlistApiError('invalid_history_range', 400);
    if (rangeParam && !ticker) return watchlistApiError('history_range_requires_ticker', 400);
    const queryRequest = parseWatchlistOverviewQuery(url);
    const queryActive = queryRequest.active && !ticker;
    if (queryRequest.invalid && queryRequest.active) return watchlistApiError('invalid_watchlist_query', 400);
    if (ticker && queryRequest.active) return watchlistApiError('query_requires_bulk_overview', 400);
    const page = queryActive ? null : parseWatchlistOverviewPage(url);
    if (page?.invalidCursor) return watchlistApiError('invalid_cursor', 400);
    const databasePage = queryActive
      ? await loadWatchlistOverviewQuery(client, queryRequest)
      : await loadWatchlistOverviewPage(client, {
          offset: page!.offset,
          cursor: page!.cursor,
          limit: page!.limit,
          ticker,
        });
    const responseHistoryRange = queryActive ? queryRequest.historyRange : historyRange;
    const pageTickers = Array.from(new Set(databasePage.rows.map(({ item }) => item.ticker)));
    const locale = await getRequestLocale();
    const [version, computed, metricSnapshots, identitiesResult, researchByTicker] = await Promise.all([
      loadWatchlistVersion(client),
      ticker
        ? buildComputedWatchlistOverview(pageTickers, locale, {
            includeMarket: true,
            benchmarkTicker: benchmark,
            historyRange,
            includeTotalReturn: true,
          })
        : Promise.resolve({} as Awaited<ReturnType<typeof buildComputedWatchlistOverview>>),
      ticker
        ? Promise.resolve({} as Record<string, WatchlistMetricSnapshot>)
        : loadWatchlistMetricSnapshots(client, pageTickers, responseHistoryRange),
      pageTickers.length
        ? client.from('stocks_universe').select('*').in('ticker', pageTickers)
        : Promise.resolve({ data: [], error: null }),
      loadWatchlistResearchSummaries(client, pageTickers),
    ]);

    if (identitiesResult.error) throw new Error(`watchlist_identity_load_failed:${identitiesResult.error.message}`);
    const identities = (identitiesResult.data ?? []) as unknown as StockUniverse[];
    const identityByTicker = Object.fromEntries(identities.map((identity) => [identity.ticker, identity]));

    const rows = databasePage.rows.map(({ group, item }) => {
        const research = researchByTicker[item.ticker] ?? {
          recentNewsCount: 0,
          latestNewsAt: null,
          latestReportAt: null,
          averageSentiment: null,
          sentimentSampleSize: 0,
          sentimentCoverageRatio: 0,
          perspectiveCounts: { bullish: 0, neutral: 0, bearish: 0 },
          perspectiveDivergence: false,
          latestPerspectiveAt: null,
          researchWindowDays: WATCHLIST_RESEARCH_WINDOW_DAYS,
        };
        return {
          group: { id: group.id, name: group.name, sortOrder: group.sort_order },
          item,
          identity: identityByTicker[item.ticker] ?? null,
          market: computed[item.ticker]?.market ?? null,
          history: ticker
            ? computed[item.ticker]?.history ?? metricSnapshotEnvelope(null)
            : metricSnapshotEnvelope(metricSnapshots[item.ticker] ?? null),
          research: researchEnvelope(research),
        };
      });

    const hasMore = databasePage.hasMore ?? (!queryActive && page!.offset !== null
      ? page!.offset + databasePage.rows.length < databasePage.total
      : false);
    const currentCursor = queryActive
      ? queryRequest.cursor ? encodeWatchlistOverviewQueryCursor(queryRequest.cursor) : null
      : page!.cursor ? encodeWatchlistOverviewCursor(page!.cursor) : null;
    const nextCursor = databasePage.nextCursor
      ? 'mode' in databasePage.nextCursor
        ? encodeWatchlistOverviewQueryCursor(databasePage.nextCursor)
        : encodeWatchlistOverviewCursor(databasePage.nextCursor)
      : null;
    const response: WatchlistOverviewResponse = {
      generatedAt: new Date().toISOString(),
      ownerId: user.id,
      version,
      partial: hasMore,
      total: databasePage.total,
      page: {
        offset: queryActive ? null : page!.offset,
        limit: queryActive ? queryRequest.limit : page!.limit,
        cursor: currentCursor,
        nextCursor,
        hasMore,
      },
      rows,
    };
    return NextResponse.json(response);
  } catch {
    return watchlistApiError('watchlist_overview_unavailable', 503);
  }
}
