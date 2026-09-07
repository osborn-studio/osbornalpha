import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { loadWatchlistActivityBundle } from '@/lib/watchlist/activity-service';
import { markWatchlistActivitySeen } from '@/lib/watchlist/activity-repository';
import { userOwnsWatchlistTicker } from '@/lib/watchlist/server-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Context { params: Promise<{ ticker: string }> }

export async function GET(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_activity', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const ticker = normalizeEvidenceTickerParam((await params).ticker);
  if (!ticker) return reporter.reject('invalid_ticker', 400);
  try {
    const bundle = await reporter.step('load_activity', () => (
      loadWatchlistActivityBundle(auth.client, auth.user.id, ticker)
    ));
    return reporter.json(bundle, { fields: { ticker, timeline_count: bundle.timeline.length } });
  } catch (error) {
    if (error instanceof Error && error.message === 'watchlist_item_not_found') {
      return reporter.reject('watchlist_item_not_found', 404);
    }
    return reporter.fail(error, 'watchlist_activity_unavailable', 503, { details: { ticker } });
  }
}

export async function POST(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_activity_seen', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  const ticker = normalizeEvidenceTickerParam((await params).ticker);
  if (!ticker) return reporter.reject('invalid_ticker', 400);
  try {
    if (!await reporter.step('verify_item', () => userOwnsWatchlistTicker(auth.client, auth.user.id, ticker))) {
      return reporter.reject('watchlist_item_not_found', 404);
    }
    const state = await reporter.step('store_seen', () => (
      markWatchlistActivitySeen(auth.client, auth.user.id, ticker)
    ));
    return reporter.json({ lastSeenAt: state.last_seen_at });
  } catch (error) {
    return reporter.fail(error, 'watchlist_activity_seen_failed', 503, { details: { ticker } });
  }
}
