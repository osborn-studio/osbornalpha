import { watchlistResearchJobView } from '@/lib/watchlist/research-job-contract';
import { cancelWatchlistResearchJob, loadWatchlistResearchJob } from '@/lib/watchlist/research-job-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

export const dynamic = 'force-dynamic';
interface Context { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_research_job', request);
  const { id } = await params;
  if (!UUID.test(id)) return reporter.reject('invalid_watchlist_research_job_id', 400);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const job = await reporter.step('load_job', () => loadWatchlistResearchJob(auth.client, id));
    if (!job) return reporter.reject('watchlist_research_job_not_found', 404);
    return reporter.json({ job: watchlistResearchJobView(job) }, { fields: { status: job.status } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_research_job_unavailable');
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_research_cancel', request);
  const { id } = await params;
  if (!UUID.test(id)) return reporter.reject('invalid_watchlist_research_job_id', 400);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  try {
    const job = await reporter.step('cancel_research', () => cancelWatchlistResearchJob(auth.client, id));
    if (!job) return reporter.reject('watchlist_research_job_not_found', 404);
    return reporter.json({ job: watchlistResearchJobView(job) });
  } catch (error) {
    return reporter.fail(error, 'watchlist_research_job_cancel_failed');
  }
}
