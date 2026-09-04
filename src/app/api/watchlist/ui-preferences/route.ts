import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
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

async function context() {
  if (!serverIsSupabaseConfigured()) return null;
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

function payload(row: UserPreferences | null) {
  return {
    preferences: row
      ? normalizeWatchlistUiPreferences(row.watchlist_ui_preferences)
      : normalizeWatchlistUiPreferences(DEFAULT_WATCHLIST_UI_PREFERENCES),
    version: row?.watchlist_ui_preferences_version ?? 0,
    updatedAt: row?.watchlist_ui_preferences_updated_at ?? null,
  };
}

export async function GET() {
  const auth = await context();
  if (!auth) return watchlistApiError('not_authenticated', 401);
  const result = await loadWatchlistUiPreferences(auth.client, auth.user.id);
  if (result.error) return watchlistApiError('watchlist_ui_preferences_unavailable', 503);
  return NextResponse.json(payload(result.data));
}

export async function PUT(request: Request) {
  const auth = await context();
  if (!auth) return watchlistApiError('not_authenticated', 401);
  const command = parseWatchlistUiPreferencesCommand(await request.json().catch(() => null));
  if (!command) return watchlistApiError('invalid_watchlist_ui_preferences', 400);
  const result = await updateWatchlistUiPreferences(auth.client, auth.user.id, command);
  if (result.error) return watchlistApiError('watchlist_ui_preferences_update_failed', 503);
  if (result.data) return NextResponse.json(payload(result.data));

  const current = await loadWatchlistUiPreferences(auth.client, auth.user.id);
  if (current.error) return watchlistApiError('watchlist_ui_preferences_unavailable', 503);
  return NextResponse.json(
    { error: 'watchlist_ui_preferences_conflict', ...payload(current.data) },
    { status: 409 },
  );
}
