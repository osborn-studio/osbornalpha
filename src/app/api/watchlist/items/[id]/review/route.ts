import { executeWatchlistReview } from '@/lib/watchlist/decision-service';
import { parseWatchlistReviewAction } from '@/lib/watchlist/review-workflow';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Context { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_review_update', request);
  const command = parseWatchlistReviewAction(await request.json().catch(() => null));
  if (!command) return reporter.reject('invalid_review_action', 400);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  const { id } = await params;
  const result = await reporter.step('store_review', () => (
    executeWatchlistReview(auth.client, auth.user.id, id, command)
  ));
  if (result.status === 'conflict') {
    return reporter.reject('watchlist_decision_conflict', 409, { details: { currentItem: result.currentItem } });
  }
  if (result.status === 'not_found') return reporter.reject('watchlist_item_not_found', 404);
  if (result.status === 'failed') return reporter.fail(new Error('watchlist_review_update_failed'), 'watchlist_review_update_failed');
  return reporter.json({ action: command.action, item: result.item }, { fields: { action: command.action } });
}
