import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { permanentlyDeleteWatchlistTrash } from '@/lib/watchlist/trash-repository';

interface Context { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Context) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const { id } = await params;
  const { error } = await permanentlyDeleteWatchlistTrash(client, user.id, id);
  if (error) return watchlistApiError('watchlist_trash_delete_failed', 503);
  return NextResponse.json({ ok: true });
}
