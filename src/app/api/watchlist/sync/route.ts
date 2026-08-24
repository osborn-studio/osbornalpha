import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { parseWatchlistGroups } from '@/lib/watchlist/store';
import { groupsToMutations, serverToGroups, type ServerWatchlistRow } from '@/lib/watchlist/sync';
import {
  canonicalizeSecurityTicker,
  validateSelectableSecuritiesWithClient,
} from '@/lib/watchlist/security-validation';

export const dynamic = 'force-dynamic';

/**
 * Full-snapshot watchlist sync (W1 data-loss fix).
 *
 * GET  → { mode: 'server', ownerId, groups } for the signed-in user;
 *        { mode: 'local', groups: null } when Supabase isn't configured
 *        (guest/localStorage mode keeps working).
 * PUT  → replace-all: body { groups: WatchlistGroup[] } becomes the user's
 *        server state (delete absent groups, upsert the rest, rewrite items).
 *        Returns the canonical server snapshot (uuids as group ids).
 */

const SELECT = 'id, name, sort_order, watchlist_items (ticker, sort_order)';

async function loadRows(sb: Awaited<ReturnType<typeof getServerSupabase>>): Promise<ServerWatchlistRow[]> {
  const { data, error } = await sb.from('watchlists').select(SELECT).order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ServerWatchlistRow[];
}

export async function GET() {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ mode: 'local', groups: null });
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });

  try {
    const rows = await loadRows(sb);
    return NextResponse.json({ mode: 'server', ownerId: user.id, groups: serverToGroups(rows) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.groups)) {
    return NextResponse.json({ error: 'groups array required' }, { status: 400 });
  }
  // Reuse the salvage parser for shape/normalization; explicit [] means wipe,
  // but a non-empty payload that parses to nothing is malformed — reject it
  // rather than misreading it as a wipe request.
  const parsed = body.groups.length === 0 ? [] : parseWatchlistGroups(JSON.stringify(body.groups));
  if (parsed === null) {
    return NextResponse.json({ error: 'groups payload malformed' }, { status: 400 });
  }
  const requestedTickers = Array.from(new Set(parsed.flatMap((group) => group.tickers)));
  const validation = await validateSelectableSecuritiesWithClient(sb as any, requestedTickers);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'security_not_selectable', tickers: validation.rejected },
      { status: 422 },
    );
  }
  const groups = parsed.map((group) => ({
    ...group,
    tickers: group.tickers.map((ticker) => canonicalizeSecurityTicker(ticker)!),
  }));

  try {
    const current = await loadRows(sb);
    const { deleteIds, upserts, itemsByGroup } = groupsToMutations(current, groups);

    if (deleteIds.length) {
      const { error } = await (sb as any).from('watchlists').delete().in('id', deleteIds).eq('user_id', user.id);
      if (error) throw new Error(error.message);
    }

    for (let i = 0; i < upserts.length; i++) {
      const u = upserts[i];
      let groupId = u.serverId;
      if (groupId) {
        const { error } = await (sb as any).from('watchlists')
          .update({ name: u.name, sort_order: u.sort_order })
          .eq('id', groupId).eq('user_id', user.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await (sb as any).from('watchlists')
          .insert({ user_id: user.id, name: u.name, sort_order: u.sort_order })
          .select('id').single();
        if (error) throw new Error(error.message);
        groupId = data.id as string;
      }
      // Replace items wholesale (unique(watchlist_id,ticker) makes delete+insert simplest).
      const { error: delErr } = await (sb as any).from('watchlist_items')
        .delete().eq('watchlist_id', groupId).eq('user_id', user.id);
      if (delErr) throw new Error(delErr.message);
      const tickers = itemsByGroup[i]?.tickers ?? [];
      if (tickers.length) {
        const { error: insErr } = await (sb as any).from('watchlist_items').insert(
          tickers.map((ticker, idx) => ({ watchlist_id: groupId, user_id: user.id, ticker, sort_order: idx })),
        );
        if (insErr) throw new Error(insErr.message);
      }
    }

    const rows = await loadRows(sb);
    return NextResponse.json({ mode: 'server', ownerId: user.id, groups: serverToGroups(rows) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
