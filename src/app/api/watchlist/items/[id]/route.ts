import { parseWatchlistDecisionCommand } from '@/lib/watchlist/decision';
import {
  loadWatchlistItem,
  loadWatchlistItemDecisionHistory,
} from '@/lib/watchlist/server-repository';
import { executeWatchlistDecision } from '@/lib/watchlist/decision-service';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Context { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_item', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const [itemResult, historyResult] = await reporter.step('load_item', () => Promise.all([
      loadWatchlistItem(auth.client, auth.user.id, id),
      loadWatchlistItemDecisionHistory(auth.client, auth.user.id, id),
    ]));
    if (itemResult.error) return reporter.fail(itemResult.error, 'watchlist_item_load_failed');
    if (!itemResult.data) return reporter.reject('watchlist_item_not_found', 404);
    if (historyResult.error) return reporter.fail(historyResult.error, 'watchlist_history_load_failed');
    const history = historyResult.data ?? [];
    return reporter.json({ item: itemResult.data, history }, { fields: { history_count: history.length } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_item_load_failed');
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_decision_update', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  const command = parseWatchlistDecisionCommand(await request.json().catch(() => null));
  if (!command) return reporter.reject('invalid_decision_patch', 400);
  const { id } = await params;

  const result = await reporter.step('store_decision', () => (
    executeWatchlistDecision(auth.client, auth.user.id, id, command)
  ));
  if (result.status === 'conflict') {
    return reporter.reject('watchlist_decision_conflict', 409, { details: { currentItem: result.currentItem } });
  }
  if (result.status === 'not_found') return reporter.reject('watchlist_item_not_found', 404);
  if (result.status === 'failed') return reporter.fail(new Error('watchlist_decision_update_failed'), 'watchlist_decision_update_failed');
  return reporter.json({ item: result.item });
}
