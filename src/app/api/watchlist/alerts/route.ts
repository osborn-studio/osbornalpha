import { parseCreateWatchlistAlert } from '@/lib/watchlist/alerts';
import { createWatchlistAlert, listWatchlistAlerts } from '@/lib/watchlist/alert-repository';
import { WATCHLIST_ALERT_CATALOG } from '@/lib/watchlist/alert-catalog';
import { isWatchlistPlanLimitError } from '@/lib/watchlist/plan-limits';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_alerts', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const itemId = new URL(request.url).searchParams.get('itemId')?.trim() || null;
  try {
    const { data, error } = await reporter.step('load_alerts', () => (
      listWatchlistAlerts(auth.client, auth.user.id, itemId)
    ));
    if (error) throw new Error(error.message);
    const alerts = data ?? [];
    return reporter.json({ alerts, catalog: WATCHLIST_ALERT_CATALOG }, { fields: { alert_count: alerts.length } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_alerts_unavailable');
  }
}

export async function POST(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_alert_create', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, client, 'alert');
  if (rateLimitResponse) return rateLimitResponse;
  const input = parseCreateWatchlistAlert(await request.json().catch(() => null));
  if (!input) return reporter.reject('invalid_alert', 400);
  const { data, error } = await reporter.step('store_alert', () => createWatchlistAlert(client, user.id, input));
  if (error?.code === '23505') return reporter.reject('alert_already_exists', 409);
  if (isWatchlistPlanLimitError(error, 'alert')) return reporter.reject('watchlist_alert_plan_limit', 403);
  if (error) return reporter.fail(error, 'watchlist_alert_create_failed');
  return reporter.json({ alert: data }, { status: 201, fields: { alert_type: input.alert_type } });
}
