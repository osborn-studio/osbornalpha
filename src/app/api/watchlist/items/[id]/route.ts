import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { parseWatchlistDecisionCommand } from '@/lib/watchlist/decision';
import {
  loadWatchlistItem,
  loadWatchlistItemDecisionHistory,
  updateWatchlistItemDecision,
} from '@/lib/watchlist/server-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';

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

  const { data, error } = await updateWatchlistItemDecision(client, id, command.patch, command.expectedVersion);
  if (error?.code === '40001' || error?.message === 'watchlist_decision_conflict') {
    const current = await loadWatchlistItem(client, user.id, id);
    return watchlistApiError('watchlist_decision_conflict', 409, { details: { currentItem: current.data ?? null } });
  }
  if (error?.code === 'P0002' || error?.message === 'watchlist_item_not_found') {
    return watchlistApiError('watchlist_item_not_found', 404);
  }
  if (error) return watchlistApiError('watchlist_decision_update_failed', 503);
  if (!data) return watchlistApiError('watchlist_item_not_found', 404);
  return NextResponse.json({ item: data });
}
