import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { parseBulkTagCommand } from '@/lib/watchlist/bulk-tags';
import { applyBulkTagCommand } from '@/lib/watchlist/bulk-tags-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export async function PATCH(request: Request) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const command = parseBulkTagCommand(await request.json().catch(() => null));
  if (!command) return watchlistApiError('invalid_bulk_tag_command', 400);

  const { data, error } = await applyBulkTagCommand(client, command);
  if (error?.code === '40001' || error?.message === 'watchlist_decision_conflict') {
    return watchlistApiError('watchlist_decision_conflict', 409);
  }
  if (error?.code === 'P0002' || error?.message === 'watchlist_item_not_found') {
    return watchlistApiError('watchlist_item_not_found', 404);
  }
  if (error) return watchlistApiError('watchlist_bulk_tag_update_failed', 503);
  return NextResponse.json({ items: data ?? [] });
}
