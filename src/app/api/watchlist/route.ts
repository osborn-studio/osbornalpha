import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { validateSelectableSecuritiesWithClient } from '@/lib/watchlist/security-validation';

// GET /api/watchlist — list all watchlists with items for current user
export async function GET() {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured (guest mode uses localStorage)' }, { status: 200 });
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await sb
    .from('watchlists')
    .select('id, name, description, weight, sort_order, watchlist_items (id, ticker, conviction, sort_order)')
    .order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ watchlists: data || [] });
}

// POST /api/watchlist — add ticker to a watchlist
export async function POST(request: Request) {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { watchlist_id, ticker, conviction = 5, sort_order = 0 } = body;
  if (!watchlist_id || typeof ticker !== 'string') return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const validation = await validateSelectableSecuritiesWithClient(sb as any, [ticker]);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'security_not_selectable', tickers: validation.rejected },
      { status: 422 },
    );
  }
  const canonicalTicker = validation.canonicalTickers[0];

  // Cast to any: typed schema regen via `npm run supabase:types` fixes this later
  const { data, error } = await (sb.from('watchlist_items') as any)
    .upsert(
      { watchlist_id, ticker: canonicalTicker, conviction, sort_order, user_id: user.id },
      { onConflict: 'watchlist_id,ticker' },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
