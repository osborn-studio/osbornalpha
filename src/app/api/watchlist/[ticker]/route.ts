import { parseWatchlistDeleteScope } from '@/lib/watchlist/commands';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Ctx { params: Promise<{ ticker: string }> }

export async function DELETE(request: Request, { params }: Ctx) {
  const reporter = createWatchlistRequestReporter('watchlist_item_delete', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  const { ticker } = await params;
  const scope = parseWatchlistDeleteScope(request);
  if (!scope) {
    return reporter.reject('watchlist_id_required', 400);
  }

  let query = auth.client
    .from('watchlist_items')
    .delete()
    .eq('ticker', decodeURIComponent(ticker))
    .eq('user_id', auth.user.id);
  if (scope.kind === 'group') query = query.eq('watchlist_id', scope.watchlistId);
  const { error } = await reporter.step('delete_item', async () => await query);

  if (error) return reporter.fail(error, 'watchlist_item_delete_failed');
  return reporter.json({ ok: true });
}
