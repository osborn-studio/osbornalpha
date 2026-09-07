import {
  deletePerspectiveClaimFeedback,
  parsePerspectiveClaimFeedback,
  savePerspectiveClaimFeedback,
} from '@/lib/watchlist/perspective-claim-feedback';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

export async function POST(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_claim_feedback_save', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, client, 'feedback');
  if (rateLimitResponse) return rateLimitResponse;
  const input = parsePerspectiveClaimFeedback(await request.json().catch(() => null));
  if (!input) return reporter.reject('invalid_perspective_claim_feedback', 400);
  try {
    const feedback = await reporter.step('store_feedback', () => savePerspectiveClaimFeedback(client, user.id, input));
    return reporter.json({ feedback });
  } catch (error) {
    if (error instanceof Error && error.message === 'perspective_not_found') {
      return reporter.reject('perspective_not_found', 404);
    }
    if (error instanceof Error && error.message === 'perspective_claim_not_found') {
      return reporter.reject('perspective_claim_not_found', 404);
    }
    return reporter.fail(error, 'perspective_claim_feedback_unavailable');
  }
}

function identifiers(request: Request): { perspectiveId: string; claimId: string } | null {
  const url = new URL(request.url);
  return parsePerspectiveClaimFeedback({
    perspectiveId: url.searchParams.get('perspectiveId'),
    claimId: url.searchParams.get('claimId'),
    verdict: 'helpful',
  });
}

export async function DELETE(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_claim_feedback_delete', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, client, 'feedback');
  if (rateLimitResponse) return rateLimitResponse;
  const input = identifiers(request);
  if (!input) return reporter.reject('invalid_perspective_claim_feedback', 400);
  try {
    await reporter.step('delete_feedback', () => (
      deletePerspectiveClaimFeedback(client, user.id, input.perspectiveId, input.claimId)
    ));
    return reporter.json({ ok: true });
  } catch (error) {
    return reporter.fail(error, 'perspective_claim_feedback_unavailable');
  }
}
