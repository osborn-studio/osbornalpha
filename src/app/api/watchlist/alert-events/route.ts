import { parseWatchlistAlertEventQuery } from '@/lib/watchlist/alert-events';
import { listWatchlistAlertEvents } from '@/lib/watchlist/alert-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest } from '@/lib/watchlist/request-guards';

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_alert_events', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const options = parseWatchlistAlertEventQuery(new URL(request.url));
  try {
    const { data, error } = await reporter.step('load_events', () => (
      listWatchlistAlertEvents(auth.client, auth.user.id, options)
    ));
    if (error) throw new Error(error.message);
    const events = data ?? [];
    return reporter.json({ events }, { fields: { event_count: events.length } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_alert_events_unavailable');
  }
}
