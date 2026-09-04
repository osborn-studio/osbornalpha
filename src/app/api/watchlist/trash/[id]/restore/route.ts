import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { isWatchlistVersionConflict } from '@/lib/watchlist/sync';
import { loadVersionedWatchlistSnapshot } from '@/lib/watchlist/server-repository';
import { parseRestoreWatchlistTrashCommand } from '@/lib/watchlist/trash';
import { restoreWatchlistTrash } from '@/lib/watchlist/trash-repository';

interface Context { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Context) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const command = parseRestoreWatchlistTrashCommand(await request.json().catch(() => null));
  if (!command) return watchlistApiError('invalid_watchlist_restore', 400);
  const { id } = await params;
  const { data, error } = await restoreWatchlistTrash(client, id, command);
  if (isWatchlistVersionConflict(error)) {
    return watchlistApiError('watchlist_version_conflict', 409, {
      details: { snapshot: await loadVersionedWatchlistSnapshot(client, user.id) },
    });
  }
  if (error?.code === 'P0002') return watchlistApiError('watchlist_trash_not_found', 404);
  if (error || !data) return watchlistApiError('watchlist_restore_failed', 503);
  return NextResponse.json({
    result: data,
    snapshot: await loadVersionedWatchlistSnapshot(client, user.id),
  });
}
