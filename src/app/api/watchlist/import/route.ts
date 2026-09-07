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
import { isWatchlistPlanLimitError } from '@/lib/watchlist/plan-limits';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

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
  const reporter = createWatchlistRequestReporter('watchlist_import', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const { client, user } = auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, client, 'import');
  if (rateLimitResponse) return rateLimitResponse;
  const command = parseImportRequest(await request.json().catch(() => null));
  if (!command) return reporter.reject('invalid_watchlist_import_request', 400);
  const parsed = parsePortableWatchlistSource(command.content, command.format);
  if (!parsed.ok) return reporter.reject(parsed.error, 400);

  try {
    const tickers = parsed.bundle.groups.flatMap((group) => group.items.map((item) => item.ticker));
    const selectable = await reporter.step('validate_securities', () => (
      validateSelectableSecuritiesWithClient(client, tickers)
    ));
    if (!selectable.valid) {
      return reporter.reject('security_not_selectable', 422, { details: { tickers: selectable.rejected } });
    }
    const [groups, alertsResult] = await Promise.all([
      loadWatchlistOverviewRows(client),
      listWatchlistAlerts(client, user.id),
    ]);
    if (alertsResult.error) throw new Error('watchlist_alert_load_failed');
    const preview = buildWatchlistImportPreview(parsed.bundle, groups, alertsResult.data ?? [], command.mode);
    if (command.dryRun) return reporter.json({ preview }, { fields: { dry_run: true, ticker_count: tickers.length } });

    const imported = await reporter.step('apply_import', () => importPortableWatchlist(
      client,
      parsed.bundle,
      command.mode,
      command.mutationId!,
    ));
    if (imported.error) {
      if (isWatchlistPlanLimitError(imported.error, 'item')) {
        return reporter.reject('watchlist_item_plan_limit', 403);
      }
      if (imported.error.code === '22023') {
        return reporter.reject('invalid_portable_watchlist', 400);
      }
      if (imported.error.code === '23503' || imported.error.message === 'security_not_selectable') {
        return reporter.reject('security_not_selectable', 422);
      }
      throw new Error('watchlist_import_failed');
    }
    const snapshot = await loadVersionedWatchlistSnapshot(client, user.id);
    return reporter.json({ preview, result: imported.data, snapshot }, {
      fields: { dry_run: false, ticker_count: tickers.length, mode: command.mode },
    });
  } catch (error) {
    return reporter.fail(error, 'watchlist_import_failed');
  }
}
