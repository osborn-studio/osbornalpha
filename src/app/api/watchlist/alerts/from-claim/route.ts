import {
  createPerspectiveAlertDraft,
  parsePerspectiveAlertDraft,
} from '@/lib/watchlist/perspective-alert-draft';
import { isWatchlistPlanLimitError } from '@/lib/watchlist/plan-limits';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

export async function POST(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_claim_alert_create', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client } = auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, client, 'alert');
  if (rateLimitResponse) return rateLimitResponse;
  const command = parsePerspectiveAlertDraft(await request.json().catch(() => null));
  if (!command) return reporter.reject('invalid_claim_alert_draft', 400);
  const { alert, error } = await reporter.step('store_alert', () => createPerspectiveAlertDraft(client, command));
  if (error?.code === '23505') return reporter.reject('alert_already_exists', 409);
  if (error?.code === 'P0002' && error.message === 'watchlist_item_not_found') {
    return reporter.reject('watchlist_item_not_found', 404);
  }
  if (error?.code === 'P0002' || error?.message === 'perspective_claim_not_found') {
    return reporter.reject('perspective_claim_not_found', 404);
  }
  if (isWatchlistPlanLimitError(error, 'alert')) return reporter.reject('watchlist_alert_plan_limit', 403);
  if (error || !alert) return reporter.fail(error, 'claim_alert_draft_create_failed');
  return reporter.json({ alert }, { status: 201, fields: { alert_type: alert.alert_type } });
}
