import { NextResponse } from 'next/server';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { loadWatchlistResearchBundle, refreshWatchlistResearch } from '@/lib/watchlist/research-service';
import { consumeExternalEvidenceQuota } from '@/lib/external-evidence/quota';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { userOwnsWatchlistTicker } from '@/lib/watchlist/server-repository';

interface Context { params: Promise<{ ticker: string }> }

async function authenticatedContext(params: Context['params']) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const ticker = normalizeEvidenceTickerParam((await params).ticker);
  if (!ticker) return watchlistApiError('invalid_ticker', 400);
  try {
    if (!await userOwnsWatchlistTicker(client, user.id, ticker)) {
      return watchlistApiError('watchlist_item_not_found', 404, { details: { ticker } });
    }
  } catch {
    return watchlistApiError('watchlist_item_lookup_failed', 503);
  }
  return { client, user, ticker };
}

function responseBody(bundle: Awaited<ReturnType<typeof loadWatchlistResearchBundle>>) {
  return {
    ...bundle,
    // Keep the original stored-perspectives response contract additive.
    source: bundle.perspectiveSource,
    generatedAt: bundle.perspectivesGeneratedAt,
    provenance: bundle.perspectiveProvenance,
  };
}

export async function GET(_request: Request, { params }: Context) {
  const context = await authenticatedContext(params);
  if (context instanceof NextResponse) return context;
  try {
    return NextResponse.json(responseBody(await loadWatchlistResearchBundle(
      context.client,
      context.user.id,
      context.ticker,
    )));
  } catch {
    return watchlistApiError('research_unavailable', 502, { details: { ticker: context.ticker } });
  }
}

export async function POST(_request: Request, { params }: Context) {
  const context = await authenticatedContext(params);
  if (context instanceof NextResponse) return context;
  try {
    if (!await consumeExternalEvidenceQuota(context.client)) {
      return watchlistApiError('rate_limited', 429, {
        retryAfterSeconds: 3600,
        details: { ticker: context.ticker },
      });
    }
    const refresh = await refreshWatchlistResearch(context.client, context.user.id, context.ticker);
    const bundle = await loadWatchlistResearchBundle(context.client, context.user.id, context.ticker);
    return NextResponse.json(responseBody({ ...bundle, refresh: {
      status: refresh.status,
      refreshedAt: refresh.refreshedAt,
      warnings: refresh.warnings,
    } }));
  } catch {
    return watchlistApiError('research_refresh_failed', 502, { details: { ticker: context.ticker } });
  }
}
