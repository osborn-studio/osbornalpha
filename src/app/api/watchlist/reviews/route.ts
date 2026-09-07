import { parseWatchlistReviewQuery } from '@/lib/watchlist/review-workflow';
import { loadWatchlistReviewQueue } from '@/lib/watchlist/server-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest } from '@/lib/watchlist/request-guards';

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_reviews', request);
  const query = parseWatchlistReviewQuery(new URL(request.url));
  if (!query) return reporter.reject('invalid_review_query', 400);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const body = await reporter.step('load_reviews', () => loadWatchlistReviewQueue(auth.client, query));
    return reporter.json(body, { fields: { row_count: body.rows.length } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_review_queue_unavailable');
  }
}
