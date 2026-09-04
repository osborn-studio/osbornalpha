import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { listWatchlistAlerts } from '@/lib/watchlist/alert-repository';
import {
  buildPortableWatchlistBundle,
  portableWatchlistCsv,
  portableWatchlistYaml,
} from '@/lib/watchlist/export';
import { loadWatchlistOverviewRows } from '@/lib/watchlist/server-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export async function GET(request: Request) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const format = new URL(request.url).searchParams.get('format') ?? 'yaml';
  if (format !== 'yaml' && format !== 'csv') return watchlistApiError('invalid_export_format', 400);
  try {
    const [groups, alertsResult] = await Promise.all([
      loadWatchlistOverviewRows(client),
      listWatchlistAlerts(client, user.id),
    ]);
    if (alertsResult.error) throw new Error(alertsResult.error.message);
    const bundle = buildPortableWatchlistBundle(groups, alertsResult.data ?? []);
    const content = format === 'csv' ? portableWatchlistCsv(bundle) : portableWatchlistYaml(bundle);
    const extension = format === 'csv' ? 'csv' : 'yml';
    return new NextResponse(format === 'csv' ? `\uFEFF${content}` : content, {
      headers: {
        'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'text/yaml; charset=utf-8',
        'content-disposition': `attachment; filename="watchlist-${new Date().toISOString().slice(0, 10)}.${extension}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch {
    return watchlistApiError('watchlist_export_failed', 503);
  }
}
