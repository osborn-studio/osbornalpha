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
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

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

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_snapshot_load', request);
  if (!serverIsSupabaseConfigured()) {
    return reporter.json({ mode: 'local', groups: null });
  }
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const snapshot = await reporter.step('load_snapshot', () => loadSnapshot(auth.client, auth.user.id));
    return reporter.json(snapshot, { fields: { group_count: snapshot.groups.length } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_sync_load_failed');
  }
}

export async function PUT(req: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_snapshot_sync', req);
  const auth = await authorizeWatchlistRequest(reporter, req);
  if (auth instanceof Response) return auth;
  const sb = auth.client;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, sb, 'bulk');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json().catch(() => null);
  const request = parseWatchlistSyncRequest(body);
  if (!request) return reporter.reject('invalid_sync_request', 400);

  const requestedTickers = Array.from(new Set(request.groups.flatMap((group) => group.tickers)));
  const validation = await reporter.step('validate_securities', () => (
    validateSelectableSecuritiesWithClient(sb, requestedTickers)
  ));
  if (!validation.valid) {
    return reporter.reject('security_not_selectable', 422, { details: { tickers: validation.rejected } });
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
    const { error } = await reporter.step('replace_snapshot', () => callAtomicReplace('replace_watchlist_snapshot', {
      p_expected_version: request.expectedVersion,
      p_mutation_id: request.mutationId,
      p_groups: groups,
    }));
    if (error) {
      if (isWatchlistVersionConflict(error)) {
        return reporter.reject('watchlist_version_conflict', 409, {
          details: await loadSnapshot(sb, auth.user.id),
        });
      }
      if (error.message === 'security_not_selectable' || error.code === '23503') {
        return reporter.reject('security_not_selectable', 422);
      }
      throw new Error(error.message);
    }
    return reporter.json(await loadSnapshot(sb, auth.user.id), {
      fields: { group_count: groups.length, ticker_count: requestedTickers.length },
    });
  } catch (error) {
    return reporter.fail(error, 'watchlist_sync_write_failed');
  }
}
