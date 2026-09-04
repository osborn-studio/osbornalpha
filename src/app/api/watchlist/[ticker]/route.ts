import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { parseWatchlistDeleteScope } from '@/lib/watchlist/commands';
import { watchlistApiError } from '@/lib/watchlist/api-error';

interface Ctx { params: Promise<{ ticker: string }> }

export async function DELETE(request: Request, { params }: Ctx) {
  if (!serverIsSupabaseConfigured()) {
    return watchlistApiError('supabase_unavailable', 503);
  }
  const { ticker } = await params;
  const scope = parseWatchlistDeleteScope(request);
  if (!scope) {
    return watchlistApiError('watchlist_id_required', 400);
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);

  let query = sb
    .from('watchlist_items')
    .delete()
    .eq('ticker', decodeURIComponent(ticker))
    .eq('user_id', user.id);
  if (scope.kind === 'group') query = query.eq('watchlist_id', scope.watchlistId);
  const { error } = await query;

  if (error) return watchlistApiError('watchlist_item_delete_failed', 503);
  return NextResponse.json({ ok: true });
}
