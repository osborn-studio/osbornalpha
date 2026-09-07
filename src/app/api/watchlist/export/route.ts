import { listWatchlistAlerts } from '@/lib/watchlist/alert-repository';
import {
  buildPortableWatchlistBundle,
  portableWatchlistCsv,
  portableWatchlistYaml,
} from '@/lib/watchlist/export';
import { loadWatchlistOverviewRows } from '@/lib/watchlist/server-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest } from '@/lib/watchlist/request-guards';

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_export', request);
  const format = new URL(request.url).searchParams.get('format') ?? 'yaml';
  if (format !== 'yaml' && format !== 'csv') return reporter.reject('invalid_export_format', 400);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const [groups, alertsResult] = await reporter.step('load_export', () => Promise.all([
      loadWatchlistOverviewRows(auth.client),
      listWatchlistAlerts(auth.client, auth.user.id),
    ]));
    if (alertsResult.error) throw new Error(alertsResult.error.message);
    const bundle = buildPortableWatchlistBundle(groups, alertsResult.data ?? []);
    const content = format === 'csv' ? portableWatchlistCsv(bundle) : portableWatchlistYaml(bundle);
    const extension = format === 'csv' ? 'csv' : 'yml';
    return reporter.response(format === 'csv' ? `\uFEFF${content}` : content, {
      headers: {
        'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'text/yaml; charset=utf-8',
        'content-disposition': `attachment; filename="watchlist-${new Date().toISOString().slice(0, 10)}.${extension}"`,
        'cache-control': 'private, no-store',
      },
    }, { format, item_count: bundle.groups.reduce((sum, group) => sum + group.items.length, 0) });
  } catch (error) {
    return reporter.fail(error, 'watchlist_export_failed');
  }
}
