import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { executeWatchlistDecision } from '@/lib/watchlist/decision-service';
import { parseWatchlistReviewAction } from '@/lib/watchlist/review-workflow';

interface Context { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Context) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const command = parseWatchlistReviewAction(await request.json().catch(() => null));
  if (!command) return watchlistApiError('invalid_review_action', 400);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const { id } = await params;
  const result = await executeWatchlistDecision(client, user.id, id, {
    expectedVersion: command.expectedVersion,
    patch: { review_at: command.reviewAt },
  });
  if (result.status === 'conflict') {
    return watchlistApiError('watchlist_decision_conflict', 409, { details: { currentItem: result.currentItem } });
  }
  if (result.status === 'not_found') return watchlistApiError('watchlist_item_not_found', 404);
  if (result.status === 'failed') return watchlistApiError('watchlist_review_update_failed', 503);
  return NextResponse.json({ action: command.action, item: result.item });
}
