import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import {
  isWatchlistVersionConflict,
  parseWatchlistSyncRequest,
} from '@/lib/watchlist/sync';
import { loadVersionedWatchlistSnapshot } from '@/lib/watchlist/server-repository';
import {
  canonicalizeSecurityTicker,
  validateSelectableSecuritiesWithClient,
} from '@/lib/watchlist/security-validation';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export const dynamic = 'force-dynamic';

/**
 * Full-snapshot watchlist sync (W1 data-loss fix).
 *
 * GET  → { mode: 'server', ownerId, version, groups } for the signed-in user;
 *        { mode: 'local', groups: null } when Supabase isn't configured
 *        (guest/localStorage mode keeps working).
 * PUT  → atomically replace structure when expectedVersion matches. Existing
 *        item decision metadata survives moves and reordering.
 */

async function loadSnapshot(sb: Awaited<ReturnType<typeof getServerSupabase>>, ownerId: string) {
  return { mode: 'server' as const, ...await loadVersionedWatchlistSnapshot(sb, ownerId) };
}

export async function GET() {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ mode: 'local', groups: null });
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);

  try {
    return NextResponse.json(await loadSnapshot(sb, user.id));
  } catch {
    return watchlistApiError('watchlist_sync_load_failed', 503);
  }
}

export async function PUT(req: Request) {
  if (!serverIsSupabaseConfigured()) {
    return watchlistApiError('supabase_unavailable', 503);
  }
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);

  const body = await req.json().catch(() => null);
  const request = parseWatchlistSyncRequest(body);
  if (!request) return watchlistApiError('invalid_sync_request', 400);

  const requestedTickers = Array.from(new Set(request.groups.flatMap((group) => group.tickers)));
  const validation = await validateSelectableSecuritiesWithClient(sb, requestedTickers);
  if (!validation.valid) {
    return watchlistApiError('security_not_selectable', 422, { details: { tickers: validation.rejected } });
  }
  const groups = request.groups.map((group) => ({
    ...group,
    tickers: group.tickers.map((ticker) => canonicalizeSecurityTicker(ticker)!),
  }));

  try {
    const callAtomicReplace = sb.rpc.bind(sb) as unknown as (
      name: 'replace_watchlist_snapshot',
      args: { p_expected_version: number; p_mutation_id: string; p_groups: Array<Record<string, unknown>> },
    ) => Promise<{ error: { code?: string; message: string } | null }>;
    const { error } = await callAtomicReplace('replace_watchlist_snapshot', {
      p_expected_version: request.expectedVersion,
      p_mutation_id: request.mutationId,
      p_groups: groups,
    });
    if (error) {
      if (isWatchlistVersionConflict(error)) {
        return watchlistApiError('watchlist_version_conflict', 409, {
          details: await loadSnapshot(sb, user.id),
        });
      }
      if (error.message === 'security_not_selectable' || error.code === '23503') {
        return watchlistApiError('security_not_selectable', 422);
      }
      throw new Error(error.message);
    }
    return NextResponse.json(await loadSnapshot(sb, user.id));
  } catch {
    return watchlistApiError('watchlist_sync_write_failed', 503);
  }
}
