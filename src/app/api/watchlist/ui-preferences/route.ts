import type { UserPreferences } from '@/lib/supabase/database.types';
import {
  DEFAULT_WATCHLIST_UI_PREFERENCES,
  normalizeWatchlistUiPreferences,
  parseWatchlistUiPreferencesCommand,
} from '@/lib/watchlist/ui-preferences';
import {
  loadWatchlistUiPreferences,
  updateWatchlistUiPreferences,
} from '@/lib/watchlist/ui-preferences-repository';
import { createWatchlistRequestReporter } from '@/lib/watchlist/request-reporter';
import { authorizeWatchlistRequest, enforceReportedWatchlistRateLimit } from '@/lib/watchlist/request-guards';

function payload(row: UserPreferences | null) {
  return {
    preferences: row
      ? normalizeWatchlistUiPreferences(row.watchlist_ui_preferences)
      : normalizeWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES),
    version: row?.watchlist_ui_preferences_version ?? 0,
    updatedAt: row?.watchlist_ui_preferences_updated_at ?? null,
  };
}

export async function GET(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_ui_preferences', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  try {
    const result = await reporter.step('load_preferences', () => (
      loadWatchlistUiPreferences(auth.client, auth.user.id)
    ));
    if (result.error) throw new Error(result.error.message);
    return reporter.json(payload(result.data));
  } catch (error) {
    return reporter.fail(error, 'watchlist_ui_preferences_unavailable');
  }
}

export async function PUT(request: Request) {
  const reporter = createWatchlistRequestReporter('watchlist_ui_preferences_update', request);
  const auth = await authorizeWatchlistRequest(reporter, request);
  if (auth instanceof Response) return auth;
  const rateLimitResponse = await enforceReportedWatchlistRateLimit(reporter, auth.client, 'write');
  if (rateLimitResponse) return rateLimitResponse;
  const command = parseWatchlistUiPreferencesCommand(await request.json().catch(() => null));
  if (!command) return reporter.reject('invalid_watchlist_ui_preferences', 400);
  const result = await reporter.step('store_preferences', () => (
    updateWatchlistUiPreferences(auth.client, auth.user.id, command)
  ));
  if (result.error) return reporter.fail(result.error, 'watchlist_ui_preferences_update_failed');
  if (result.data) return reporter.json(payload(result.data));

  const current = await reporter.step('load_conflict', () => (
    loadWatchlistUiPreferences(auth.client, auth.user.id)
  ));
  if (current.error) return reporter.fail(current.error, 'watchlist_ui_preferences_unavailable');
  return reporter.json(
    { error: 'watchlist_ui_preferences_conflict', ...payload(current.data) },
    { status: 409, fields: { error_code: 'watchlist_ui_preferences_conflict' } },
  );
}
