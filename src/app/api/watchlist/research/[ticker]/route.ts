import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { loadWatchlistResearchBundle } from '@/lib/watchlist/research-service';
import { userOwnsWatchlistTicker } from '@/lib/watchlist/server-repository';
import {
  WatchlistResearchJobRepositoryError,
} from '@/lib/watchlist/research-job-repository';
import { watchlistResearchJobView } from '@/lib/watchlist/research-job-contract';
import { enqueueWatchlistResearchRefresh } from '@/lib/watchlist/research-command-service';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Context { params: Promise<{ ticker: string }> }

function responseBody(bundle: Awaited<ReturnType<typeof loadWatchlistResearchBundle>>) {
  return {
    ...bundle,
    // Keep the original stored-perspectives response contract additive.
    source: bundle.perspectiveSource,
    generatedAt: bundle.perspectivesGeneratedAt,
    provenance: bundle.perspectiveProvenance,
  };
}

export async function GET(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_research', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const ticker = normalizeEvidenceTickerParam((await params).ticker);
  if (!ticker) return reporter.reject('invalid_ticker', 400);
  try {
    if (!await reporter.step('verify_item', () => userOwnsWatchlistTicker(auth.client, auth.user.id, ticker))) {
      return reporter.reject('watchlist_item_not_found', 404, { details: { ticker } });
    }
  } catch (error) {
    return reporter.fail(error, 'watchlist_item_lookup_failed');
  }
  try {
    const body = responseBody(await reporter.step('load_research', () => loadWatchlistResearchBundle(
      auth.client, auth.user.id, ticker,
    )));
    return reporter.json(body, { fields: { ticker } });
  } catch (error) {
    return reporter.fail(error, 'research_unavailable', 502, { details: { ticker } });
  }
}

export async function POST(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_research_enqueue', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'bulk');
  if (rateLimitResponse) return rateLimitResponse;
  const ticker = normalizeEvidenceTickerParam((await params).ticker);
  if (!ticker) return reporter.reject('invalid_ticker', 400);
  try {
    const job = await reporter.step('enqueue_research', () => enqueueWatchlistResearchRefresh(
      auth.client,
      auth.user.id,
      ticker,
    ));
    return reporter.json({ job: watchlistResearchJobView(job) }, {
      status: job.status === 'succeeded' ? 200 : 202,
      headers: { location: `/api/watchlist/research/jobs/${job.id}` },
      fields: { status: job.status },
    });
  } catch (error) {
    if (error instanceof WatchlistResearchJobRepositoryError) {
      if (error.code === 'watchlist_research_plan_limit') {
        return reporter.reject(error.code, 429, { details: error.quota ?? {} });
      }
      if (error.code === 'watchlist_research_rate_limit') {
        return reporter.reject('rate_limited', 429, {
          retryAfterSeconds: 3600, details: { ticker, ...(error.quota ?? {}) },
        });
      }
      if (error.code === 'watchlist_item_not_found') return reporter.reject(error.code, 404);
    }
    return reporter.fail(error, 'research_refresh_failed', 502, { details: { ticker } });
  }
}
