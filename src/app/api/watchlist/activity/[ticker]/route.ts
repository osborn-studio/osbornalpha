import { NextResponse } from 'next/server';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { loadWatchlistActivityBundle } from '@/lib/watchlist/activity-service';
import { markWatchlistActivitySeen } from '@/lib/watchlist/activity-repository';
import { userOwnsWatchlistTicker } from '@/lib/watchlist/server-repository';

interface Context { params: Promise<{ ticker: string }> }

async function context(params: Context['params']) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const ticker = normalizeEvidenceTickerParam((await params).ticker);
  if (!ticker) return watchlistApiError('invalid_ticker', 400);
  return { client, user, ticker };
}

export async function GET(_request: Request, { params }: Context) {
  const value = await context(params);
  if (value instanceof NextResponse) return value;
  try {
    return NextResponse.json(await loadWatchlistActivityBundle(value.client, value.user.id, value.ticker));
  } catch (error) {
    if (error instanceof Error && error.message === 'watchlist_item_not_found') {
      return watchlistApiError('watchlist_item_not_found', 404);
    }
    return watchlistApiError('watchlist_activity_unavailable', 503, { details: { ticker: value.ticker } });
  }
}

export async function POST(_request: Request, { params }: Context) {
  const value = await context(params);
  if (value instanceof NextResponse) return value;
  try {
    if (!await userOwnsWatchlistTicker(value.client, value.user.id, value.ticker)) {
      return watchlistApiError('watchlist_item_not_found', 404);
    }
    const state = await markWatchlistActivitySeen(value.client, value.user.id, value.ticker);
    return NextResponse.json({ lastSeenAt: state.last_seen_at });
  } catch {
    return watchlistApiError('watchlist_activity_seen_failed', 503, { details: { ticker: value.ticker } });
  }
}
