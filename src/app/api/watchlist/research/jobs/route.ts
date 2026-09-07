import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { watchlistResearchJobView } from '@/lib/watchlist/research-job-contract';
import { loadActiveWatchlistResearchJob } from '@/lib/watchlist/research-job-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest } from '@/lib/watchlist/request-guards';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_research_job', request);
  const ticker = normalizeEvidenceTickerParam(new URL(request.url).searchParams.get('ticker') ?? '');
  if (!ticker) return reporter.reject('invalid_ticker', 400);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const job = await reporter.step('load_job', () => loadActiveWatchlistResearchJob(auth.client, ticker));
    return reporter.json({ job: job ? watchlistResearchJobView(job) : null }, { fields: { ticker, active: !!job } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_research_job_unavailable');
  }
}
