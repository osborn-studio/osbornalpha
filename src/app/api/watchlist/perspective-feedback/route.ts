import {
  deletePerspectiveFeedback,
  loadPerspectiveAssessments,
  parsePerspectiveFeedback,
  savePerspectiveFeedback,
} from '@/lib/watchlist/perspective-feedback';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

export async function POST(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_perspective_feedback_save', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, client, 'feedback');
  if (rateLimitResponse) return rateLimitResponse;
  const input = parsePerspectiveFeedback(await request.json().catch(() => null));
  if (!input) return reporter.reject('invalid_perspective_feedback', 400);
  try {
    const feedback = await reporter.step('store_feedback', () => savePerspectiveFeedback(client, user.id, input));
    return reporter.json({ feedback });
  } catch (error) {
    if (error instanceof Error && error.message === 'perspective_not_found') {
      return reporter.reject('perspective_not_found', 404);
    }
    return reporter.fail(error, 'perspective_feedback_unavailable');
  }
}

function perspectiveId(request: Request): string | null {
  const value = new URL(request.url).searchParams.get('perspectiveId')?.trim() ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_perspective_feedback', request);
  const id = perspectiveId(request);
  if (!id) return reporter.reject('invalid_perspective_id', 400);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const assessment = (await reporter.step('load_feedback', () => (
      loadPerspectiveAssessments(auth.client, auth.user.id, [id])
    )))[id];
    return reporter.json({ feedback: assessment?.feedback ?? null, outcomes: assessment?.outcomes ?? [] });
  } catch (error) {
    return reporter.fail(error, 'perspective_feedback_unavailable');
  }
}

export async function DELETE(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_perspective_feedback_delete', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, client, 'feedback');
  if (rateLimitResponse) return rateLimitResponse;
  const id = perspectiveId(request);
  if (!id) return reporter.reject('invalid_perspective_id', 400);
  try {
    await reporter.step('delete_feedback', () => deletePerspectiveFeedback(client, user.id, id));
    return reporter.json({ ok: true });
  } catch (error) {
    return reporter.fail(error, 'perspective_feedback_unavailable');
  }
}
