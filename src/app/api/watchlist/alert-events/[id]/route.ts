import { isWatchlistAlertRetryPatch, parseWatchlistAlertReadPatch } from '@/lib/watchlist/alert-events';
import { retryWatchlistAlertEvent, updateWatchlistAlertEventReadState } from '@/lib/watchlist/alert-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

interface Context { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Context) {
  const reporter = createWatchlistRequestReporter('watchlist_alert_event_update', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'alert');
  if (rateLimitResponse) return rateLimitResponse;
  const body = await request.json().catch(() => null);
  const patch = parseWatchlistAlertReadPatch(body);
  const retry = isWatchlistAlertRetryPatch(body);
  if (!patch && !retry) return reporter.reject('invalid_alert_event_patch', 400);
  const { id } = await params;
  const { data, error } = await reporter.step('update_alert_event', () => retry
    ? retryWatchlistAlertEvent(auth.client, id)
    : updateWatchlistAlertEventReadState(auth.client, id, patch!.read));
  if (error) return reporter.fail(error, 'watchlist_alert_event_update_failed');
  if (!data) return reporter.reject('alert_event_not_found', 404);
  return reporter.json({ event: data }, { fields: { operation: retry ? 'retry' : 'read_state' } });
}
