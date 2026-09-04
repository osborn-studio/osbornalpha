import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { parseWatchlistAlertPreferencesCommand } from '@/lib/watchlist/alert-preferences';
import {
  loadWatchlistAlertPreferences,
  updateWatchlistAlertPreferences,
} from '@/lib/watchlist/alert-preferences-repository';
import { parseWatchlistAlertDeliveryPreferences } from '@/lib/watchlist/alert-delivery-preferences';

async function context() {
  if (!serverIsSupabaseConfigured()) return null;
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

export async function GET() {
  const auth = await context();
  if (!auth) return watchlistApiError('not_authenticated', 401);
  const result = await loadWatchlistAlertPreferences(auth.client, auth.user.id);
  if (result.error) return watchlistApiError('watchlist_alert_preferences_unavailable', 503);
  return NextResponse.json({ preferences: parseWatchlistAlertDeliveryPreferences(result.data) });
}

export async function PUT(request: Request) {
  const auth = await context();
  if (!auth) return watchlistApiError('not_authenticated', 401);
  const command = parseWatchlistAlertPreferencesCommand(await request.json().catch(() => null));
  if (!command) return watchlistApiError('invalid_watchlist_alert_preferences', 400);
  const result = await updateWatchlistAlertPreferences(auth.client, auth.user.id, command);
  if (result.error || !result.data) return watchlistApiError('watchlist_alert_preferences_update_failed', 503);
  return NextResponse.json({ preferences: parseWatchlistAlertDeliveryPreferences(result.data) });
}
