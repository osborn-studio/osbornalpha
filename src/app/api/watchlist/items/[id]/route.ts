import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { parseWatchlistDecisionCommand } from '@/lib/watchlist/decision';
import {
  loadWatchlistItem,
  loadWatchlistItemDecisionHistory,
} from '@/lib/watchlist/server-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { executeWatchlistDecision } from '@/lib/watchlist/decision-service';

interface Context { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const { id } = await params;
  const [itemResult, historyResult] = await Promise.all([
    loadWatchlistItem(client, user.id, id),
    loadWatchlistItemDecisionHistory(client, user.id, id),
  ]);
  if (itemResult.error) return watchlistApiError('watchlist_item_load_failed', 503);
  if (!itemResult.data) return watchlistApiError('watchlist_item_not_found', 404);
  if (historyResult.error) return watchlistApiError('watchlist_history_load_failed', 503);
  return NextResponse.json({ item: itemResult.data, history: historyResult.data ?? [] });
}

export async function PATCH(request: Request, { params }: Context) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const command = parseWatchlistDecisionCommand(await request.json().catch(() => null));
  if (!command) return watchlistApiError('invalid_decision_patch', 400);
  const { id } = await params;

  const result = await executeWatchlistDecision(client, user.id, id, command);
  if (result.status === 'conflict') {
    return watchlistApiError('watchlist_decision_conflict', 409, { details: { currentItem: result.currentItem } });
  }
  if (result.status === 'not_found') return watchlistApiError('watchlist_item_not_found', 404);
  if (result.status === 'failed') return watchlistApiError('watchlist_decision_update_failed', 503);
  return NextResponse.json({ item: result.item });
}
