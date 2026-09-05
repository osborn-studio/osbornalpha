import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { listWatchlistAlerts } from '@/lib/watchlist/alert-repository';
import { importPortableWatchlist } from '@/lib/watchlist/import-repository';
import {
  buildWatchlistImportPreview,
  parsePortableWatchlistSource,
  type PortableWatchlistFormat,
  type WatchlistImportMode,
} from '@/lib/watchlist/portable-import';
import {
  loadVersionedWatchlistSnapshot,
  loadWatchlistOverviewRows,
} from '@/lib/watchlist/server-repository';
import { validateSelectableSecuritiesWithClient } from '@/lib/watchlist/security-validation';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { isWatchlistPlanLimitError } from '@/lib/watchlist/plan-limits';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ImportRequest {
  content: string;
  format: PortableWatchlistFormat;
  mode: WatchlistImportMode;
  dryRun: boolean;
  mutationId: string | null;
}

function parseImportRequest(body: unknown): ImportRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.content !== 'string'
    || (input.format !== 'yaml' && input.format !== 'csv')
    || (input.mode !== 'merge' && input.mode !== 'replace')
    || (input.dryRun !== undefined && typeof input.dryRun !== 'boolean')) return null;
  const dryRun = input.dryRun === true;
  const mutationId = typeof input.mutationId === 'string' ? input.mutationId.trim() : null;
  if (!dryRun && (!mutationId || mutationId.length < 8 || mutationId.length > 128)) return null;
  return { content: input.content, format: input.format, mode: input.mode, dryRun, mutationId };
}

export async function POST(request: Request) {
  if (!serverIsSupabaseConfigured()) {
    return watchlistApiError('supabase_unavailable', 503);
  }
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const command = parseImportRequest(await request.json().catch(() => null));
  if (!command) return watchlistApiError('invalid_watchlist_import_request', 400);
  const parsed = parsePortableWatchlistSource(command.content, command.format);
  if (!parsed.ok) return watchlistApiError(parsed.error, 400);

  try {
    const tickers = parsed.bundle.groups.flatMap((group) => group.items.map((item) => item.ticker));
    const selectable = await validateSelectableSecuritiesWithClient(client, tickers);
    if (!selectable.valid) {
      return watchlistApiError('security_not_selectable', 422, { details: { tickers: selectable.rejected } });
    }
    const [groups, alertsResult] = await Promise.all([
      loadWatchlistOverviewRows(client),
      listWatchlistAlerts(client, user.id),
    ]);
    if (alertsResult.error) throw new Error('watchlist_alert_load_failed');
    const preview = buildWatchlistImportPreview(parsed.bundle, groups, alertsResult.data ?? [], command.mode);
    if (command.dryRun) return NextResponse.json({ preview });

    const imported = await importPortableWatchlist(
      client,
      parsed.bundle,
      command.mode,
      command.mutationId!,
    );
    if (imported.error) {
      if (isWatchlistPlanLimitError(imported.error, 'item')) {
        return watchlistApiError('watchlist_item_plan_limit', 403);
      }
      if (imported.error.code === '22023') {
        return watchlistApiError('invalid_portable_watchlist', 400);
      }
      if (imported.error.code === '23503' || imported.error.message === 'security_not_selectable') {
        return watchlistApiError('security_not_selectable', 422);
      }
      throw new Error('watchlist_import_failed');
    }
    const snapshot = await loadVersionedWatchlistSnapshot(client, user.id);
    return NextResponse.json({ preview, result: imported.data, snapshot });
  } catch {
    return watchlistApiError('watchlist_import_failed', 503);
  }
}
