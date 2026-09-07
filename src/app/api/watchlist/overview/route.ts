import { NextResponse } from 'next/server';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import type { WatchlistOverviewResponse } from '@/lib/watchlist/overview-contract';
import { encodeWatchlistOverviewCursor, parseWatchlistOverviewPage } from '@/lib/watchlist/overview-pagination';
import {
  encodeWatchlistOverviewQueryCursor,
  parseWatchlistOverviewQuery,
} from '@/lib/watchlist/overview-query';
import {
  loadWatchlistOverviewPage,
  loadWatchlistOverviewQuery,
  loadWatchlistVersion,
} from '@/lib/watchlist/server-repository';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { validateWatchlistBenchmark } from '@/lib/watchlist/benchmark-validation';
import { parseWatchlistHistoryRange } from '@/lib/market-returns/range';
import {
  buildWatchlistOverviewRows,
  loadWatchlistOverviewSupplementalData,
} from '@/lib/watchlist/overview-supplemental-service';
import { watchlistDataCapabilities } from '@/lib/watchlist/data-capability';
import { classifyMarket } from '@/lib/utils';
import {
  logRequestEvent,
  requestErrorCode,
  requestRunDuration,
  runRequestStep,
  startRequestRun,
} from '@/lib/observability/request-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const run = startRequestRun('watchlist_overview', 'GET');
  const apiError = (
    code: string,
    status: number,
    options: Parameters<typeof watchlistApiError>[2] = {},
  ) => watchlistApiError(code, status, { ...options, requestId: run.requestId });
  if (!serverIsSupabaseConfigured()) {
    return apiError('supabase_unavailable', 503);
  }

  try {
    const client = await getServerSupabase(request);
    const { data: { user } } = await runRequestStep(run, 'authenticate', () => client.auth.getUser());
    if (!user) return apiError('not_authenticated', 401);
    const url = new URL(request.url);
    const tickerParam = url.searchParams.get('ticker');
    const ticker = tickerParam ? normalizeEvidenceTickerParam(tickerParam) : null;
    if (tickerParam && !ticker) return apiError('invalid_ticker', 400);
    const benchmarkParam = url.searchParams.get('benchmark');
    const benchmark = benchmarkParam ? normalizeEvidenceTickerParam(benchmarkParam) : null;
    if (benchmarkParam && !benchmark) return apiError('invalid_benchmark', 400);
    if (benchmark && !ticker) return apiError('benchmark_requires_ticker', 400);
    if (benchmark && ticker) {
      const validation = validateWatchlistBenchmark(ticker, benchmark);
      if (!validation.valid) return apiError(`benchmark_${validation.issue}`, 400);
    }
    const rangeParam = url.searchParams.get('range');
    const historyRange = rangeParam ? parseWatchlistHistoryRange(rangeParam) : '1y';
    if (!historyRange) return apiError('invalid_history_range', 400);
    if (rangeParam && !ticker) return apiError('history_range_requires_ticker', 400);
    const queryRequest = parseWatchlistOverviewQuery(url);
    const queryActive = queryRequest.active && !ticker;
    if (queryRequest.invalid && queryRequest.active) return apiError('invalid_watchlist_query', 400);
    if (ticker && queryRequest.active) return apiError('query_requires_bulk_overview', 400);
    const page = queryActive ? null : parseWatchlistOverviewPage(url);
    if (page?.invalidCursor) return apiError('invalid_cursor', 400);
    const databasePage = await runRequestStep(run, 'database_page', () => queryActive
      ? loadWatchlistOverviewQuery(client, queryRequest)
      : loadWatchlistOverviewPage(client, {
          offset: page!.offset,
          cursor: page!.cursor,
          limit: page!.limit,
          ticker,
        }));
    const responseHistoryRange = queryActive ? queryRequest.historyRange : historyRange;
    const pageTickers = Array.from(new Set(databasePage.rows.map(({ item }) => item.ticker)));
    const locale = await getRequestLocale();
    const pageItemIds = databasePage.rows.map(({ item }) => item.id);
    const [version, supplemental] = await Promise.all([
      runRequestStep(run, 'watchlist_version', () => loadWatchlistVersion(client)),
      runRequestStep(run, 'supplemental_data', () => loadWatchlistOverviewSupplementalData({
        client,
        tickers: pageTickers,
        itemIds: pageItemIds,
        locale,
        historyRange: responseHistoryRange,
        target: ticker ? { benchmark } : null,
        onSourceResult: (result) => logRequestEvent(
          result.status === 'complete' ? 'info' : 'warn',
          'watchlist_overview_source',
          run,
          {
            step: result.source,
            status: result.status,
            duration_ms: result.durationMs,
            ...(result.errorCode ? { error_code: result.errorCode } : {}),
          },
        ),
      })),
    ]);
    const generatedAt = new Date().toISOString();
    const rows = buildWatchlistOverviewRows(databasePage.rows, supplemental, !!ticker, generatedAt);

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
      generatedAt,
      ownerId: user.id,
      version,
      dataStatus: supplemental.warnings.length > 0 ? 'partial' : 'complete',
      warnings: supplemental.warnings,
      capabilities: watchlistDataCapabilities(pageTickers.map(classifyMarket), process.env, supplemental.providerHealth),
      partial: hasMore,
      total: databasePage.total,
      composition: supplemental.composition,
      page: {
        offset: queryActive ? null : page!.offset,
        limit: queryActive ? queryRequest.limit : page!.limit,
        cursor: currentCursor,
        nextCursor,
        hasMore,
      },
      rows,
    };
    logRequestEvent('info', 'request_complete', run, {
      status: 200,
      duration_ms: requestRunDuration(run),
      row_count: rows.length,
      data_status: response.dataStatus,
    });
    return NextResponse.json(response, { headers: { 'x-request-id': run.requestId } });
  } catch (error) {
    const errorCode = requestErrorCode(error, 'watchlist_overview_unavailable');
    logRequestEvent('error', 'request_failed', run, {
      status: 503,
      duration_ms: requestRunDuration(run),
      error_code: errorCode,
    });
    return apiError('watchlist_overview_unavailable', 503);
  }
}
