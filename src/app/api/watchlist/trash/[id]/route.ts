import { permanentlyDeleteWatchlistTrash } from '@/lib/watchlist/trash-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Context { params: Promise<{ id: string }> }

export async function DELETE(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_trash_delete', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  const { id } = await params;
  const { error } = await reporter.step('delete_trash', () => (
    permanentlyDeleteWatchlistTrash(auth.client, auth.user.id, id)
  ));
  if (error) return reporter.fail(error, 'watchlist_trash_delete_failed');
  return reporter.json({ ok: true });
}
