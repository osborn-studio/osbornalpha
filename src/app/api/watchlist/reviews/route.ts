import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { parseWatchlistReviewQuery } from '@/lib/watchlist/review-workflow';
import { loadWatchlistReviewQueue } from '@/lib/watchlist/server-repository';

export async function GET(request: Request) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const query = parseWatchlistReviewQuery(new URL(request.url));
  if (!query) return watchlistApiError('invalid_review_query', 400);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  try {
    return NextResponse.json(await loadWatchlistReviewQueue(client, query));
  } catch {
    return watchlistApiError('watchlist_review_queue_unavailable', 503);
  }
}
