import { isWatchlistVersionConflict } from '@/lib/watchlist/sync';
import { loadVersionedWatchlistSnapshot } from '@/lib/watchlist/server-repository';
import { parseRestoreWatchlistTrashCommand } from '@/lib/watchlist/trash';
import { restoreWatchlistTrash } from '@/lib/watchlist/trash-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Context { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_trash_restore', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  const command = parseRestoreWatchlistTrashCommand(await request.json().catch(() => null));
  if (!command) return reporter.reject('invalid_watchlist_restore', 400);
  const { id } = await params;
  const { data, error } = await reporter.step('restore_item', () => (
    restoreWatchlistTrash(auth.client, id, command)
  ));
  if (isWatchlistVersionConflict(error)) {
    return reporter.reject('watchlist_version_conflict', 409, {
      details: { snapshot: await loadVersionedWatchlistSnapshot(auth.client, auth.user.id) },
    });
  }
  if (error?.code === 'P0002') return reporter.reject('watchlist_trash_not_found', 404);
  if (error || !data) return reporter.fail(error, 'watchlist_restore_failed');
  return reporter.json({
    result: data,
    snapshot: await loadVersionedWatchlistSnapshot(auth.client, auth.user.id),
  });
}
