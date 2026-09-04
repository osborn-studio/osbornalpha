import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { listWatchlistTrash } from '@/lib/watchlist/trash-repository';

export async function GET() {
  if (!serverIsSupabaseConfigured()) return NextResponse.json({ entries: [] });
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const { data, error } = await listWatchlistTrash(client, user.id);
  if (error) return watchlistApiError('watchlist_trash_unavailable', 503);
  return NextResponse.json({ entries: data ?? [] });
}
