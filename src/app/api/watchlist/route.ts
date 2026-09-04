import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { validateSelectableSecuritiesWithClient } from '@/lib/watchlist/security-validation';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { upsertWatchlistItem } from '@/lib/watchlist/server-repository';

// GET /api/watchlist — list all watchlists with items for current user
export async function GET() {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured (guest mode uses localStorage)' }, { status: 200 });
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);

  const { data, error } = await sb
    .from('watchlists')
    .select('id, name, description, weight, sort_order, watchlist_items (id, ticker, conviction, sort_order)')
    .order('sort_order');
  if (error) return watchlistApiError('watchlist_load_failed', 503);

  return NextResponse.json({ watchlists: data || [] });
}

// POST /api/watchlist — add ticker to a watchlist
export async function POST(request: Request) {
  if (!serverIsSupabaseConfigured()) {
    return watchlistApiError('supabase_unavailable', 503);
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);

  const body = await request.json().catch(() => ({}));
  const { watchlist_id, ticker, conviction = 5, sort_order = 0 } = body;
  if (!watchlist_id || typeof ticker !== 'string') return watchlistApiError('missing_fields', 400);

  const validation = await validateSelectableSecuritiesWithClient(sb, [ticker]);
  if (!validation.valid) {
    return watchlistApiError('security_not_selectable', 422, { details: { tickers: validation.rejected } });
  }
  const canonicalTicker = validation.canonicalTickers[0];

  const { data, error } = await upsertWatchlistItem(sb, {
    watchlist_id,
    ticker: canonicalTicker,
    conviction,
    sort_order,
    user_id: user.id,
  });
  if (error) return watchlistApiError('watchlist_item_create_failed', 503);
  return NextResponse.json({ item: data });
}
