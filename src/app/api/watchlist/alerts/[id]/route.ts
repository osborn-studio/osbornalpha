import { parseUpdateWatchlistAlert, validateWatchlistAlertUpdate } from '@/lib/watchlist/alerts';
import { deleteWatchlistAlert, getWatchlistAlert, updateWatchlistAlert } from '@/lib/watchlist/alert-repository';
import { isWatchlistPlanLimitError } from '@/lib/watchlist/plan-limits';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Context { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_alert_update', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'alert');
  if (rateLimitResponse) return rateLimitResponse;
  const patch = parseUpdateWatchlistAlert(await request.json().catch(() => null));
  if (!patch) return reporter.reject('invalid_alert_patch', 400);
  const { id } = await params;
  const existing = await reporter.step('load_alert', () => getWatchlistAlert(auth.client, auth.user.id, id));
  if (existing.error) return reporter.fail(existing.error, 'watchlist_alert_load_failed');
  if (!existing.data) return reporter.reject('alert_not_found', 404);
  const validated = validateWatchlistAlertUpdate(existing.data, patch);
  if (!validated) return reporter.reject('invalid_alert_patch', 400);
  const { data, error } = await reporter.step('store_alert', () => (
    updateWatchlistAlert(auth.client, auth.user.id, id, validated)
  ));
  if (error?.code === '23505') return reporter.reject('alert_already_exists', 409);
  if (isWatchlistPlanLimitError(error, 'alert')) return reporter.reject('watchlist_alert_plan_limit', 403);
  if (error) return reporter.fail(error, 'watchlist_alert_update_failed');
  if (!data) return reporter.reject('alert_not_found', 404);
  return reporter.json({ alert: data });
}

export async function DELETE(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_alert_delete', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'alert');
  if (rateLimitResponse) return rateLimitResponse;
  const { id } = await params;
  const { error } = await reporter.step('delete_alert', () => (
    deleteWatchlistAlert(auth.client, auth.user.id, id)
  ));
  if (error) return reporter.fail(error, 'watchlist_alert_delete_failed');
  return reporter.json({ ok: true });
}
