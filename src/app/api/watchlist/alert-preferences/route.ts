import { parseWatchlistAlertPreferencesCommand } from '@/lib/watchlist/alert-preferences';
import {
  loadWatchlistAlertPreferences,
  updateWatchlistAlertPreferences,
} from '@/lib/watchlist/alert-preferences-repository';
import { parseWatchlistAlertDeliveryPreferences } from '@/lib/watchlist/alert-delivery-preferences';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_alert_preferences', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const result = await reporter.step('load_preferences', () => (
      loadWatchlistAlertPreferences(auth.client, auth.user.id)
    ));
    if (result.error) throw new Error(result.error.message);
    return reporter.json({ preferences: parseWatchlistAlertDeliveryPreferences(result.data) });
  } catch (error) {
    return reporter.fail(error, 'watchlist_alert_preferences_unavailable');
  }
}

export async function PUT(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_alert_preferences_update', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  const command = parseWatchlistAlertPreferencesCommand(await request.json().catch(() => null));
  if (!command) return reporter.reject('invalid_watchlist_alert_preferences', 400);
  const result = await reporter.step('store_preferences', () => (
    updateWatchlistAlertPreferences(auth.client, auth.user.id, command)
  ));
  if (result.error || !result.data) return reporter.fail(result.error, 'watchlist_alert_preferences_update_failed');
  return reporter.json({ preferences: parseWatchlistAlertDeliveryPreferences(result.data) });
}
