import { listWatchlistTrash } from '@/lib/watchlist/trash-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest } from '@/lib/watchlist/request-guards';

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_trash', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const { data, error } = await reporter.step('load_trash', () => (
      listWatchlistTrash(auth.client, auth.user.id)
    ));
    if (error) throw new Error(error.message);
    const entries = data ?? [];
    return reporter.json({ entries }, { fields: { entry_count: entries.length } });
  } catch (error) {
    return reporter.fail(error, 'watchlist_trash_unavailable');
  }
}
