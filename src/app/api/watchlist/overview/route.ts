import { NextResponse } from 'next/server';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import type { StockUniverse } from '@/lib/supabase/database.types';
import { buildComputedWatchlistOverview } from '@/lib/watchlist/overview';
import type { DataEnvelope, WatchlistOverviewResponse } from '@/lib/watchlist/overview-contract';
import { parseWatchlistOverviewPage } from '@/lib/watchlist/overview-pagination';
import { loadWatchlistResearchSummaries } from '@/lib/watchlist/research-repository';
import type { WatchlistResearchSummary } from '@/lib/watchlist/research-summary';
import { loadWatchlistOverviewPage, loadWatchlistVersion } from '@/lib/watchlist/server-repository';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { watchlistTimestampFreshness } from '@/lib/watchlist/freshness';
import { watchlistApiError } from '@/lib/watchlist/api-error';

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
    const page = parseWatchlistOverviewPage(url);
    const databasePage = await loadWatchlistOverviewPage(client, { ...page, ticker });
    const pageTickers = Array.from(new Set(databasePage.rows.map(({ item }) => item.ticker)));
    const locale = await getRequestLocale();
    const [version, computed, identitiesResult, researchByTicker] = await Promise.all([
      loadWatchlistVersion(client),
      buildComputedWatchlistOverview(pageTickers, locale, { includeMarket: ticker !== null }),
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
          perspectiveCounts: { bullish: 0, neutral: 0, bearish: 0 },
          perspectiveDivergence: false,
          latestPerspectiveAt: null,
        };
        return {
          group: { id: group.id, name: group.name, sortOrder: group.sort_order },
          item,
          identity: identityByTicker[item.ticker] ?? null,
          market: computed[item.ticker]?.market ?? null,
          history: computed[item.ticker]?.history ?? null,
          research: researchEnvelope(research),
        };
      });

    const response: WatchlistOverviewResponse = {
      generatedAt: new Date().toISOString(),
      ownerId: user.id,
      version,
      partial: page.offset + databasePage.rows.length < databasePage.total,
      total: databasePage.total,
      page: { ...page, hasMore: page.offset + databasePage.rows.length < databasePage.total },
      rows,
    };
    return NextResponse.json(response);
  } catch {
    return watchlistApiError('watchlist_overview_unavailable', 503);
  }
}
