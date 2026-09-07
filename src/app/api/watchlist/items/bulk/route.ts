import { parseBulkTagCommand } from '@/lib/watchlist/bulk-tags';
import { applyBulkTagCommand } from '@/lib/watchlist/bulk-tags-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

export async function PATCH(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_bulk_tag_update', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client } = auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, client, 'bulk');
  if (rateLimitResponse) return rateLimitResponse;
  const command = parseBulkTagCommand(await request.json().catch(() => null));
  if (!command) return reporter.reject('invalid_bulk_tag_command', 400);

  const { data, error } = await reporter.step('apply_bulk_tag', () => applyBulkTagCommand(client, command));
  if (error?.code === '40001' || error?.message === 'watchlist_decision_conflict') {
    return reporter.reject('watchlist_decision_conflict', 409);
  }
  if (error?.code === 'P0002' || error?.message === 'watchlist_item_not_found') {
    return reporter.reject('watchlist_item_not_found', 404);
  }
  if (error) return reporter.fail(error, 'watchlist_bulk_tag_update_failed');
  return reporter.json({ items: data ?? [] }, { fields: { item_count: data?.length ?? 0 } });
}
