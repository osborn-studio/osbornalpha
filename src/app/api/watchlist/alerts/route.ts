import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { parseCreateWatchlistAlert } from '@/lib/watchlist/alerts';
import { createWatchlistAlert, listWatchlistAlerts } from '@/lib/watchlist/alert-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { WATCHLIST_ALERT_CATALOG } from '@/lib/watchlist/alert-catalog';

async function authorizedClient() {
  if (!serverIsSupabaseConfigured()) return null;
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

export async function GET(request: Request) {
  const auth = await authorizedClient();
  if (!auth) return watchlistApiError('not_authenticated', 401);
  const itemId = new URL(request.url).searchParams.get('itemId')?.trim() || null;
  const { data, error } = await listWatchlistAlerts(auth.client, auth.user.id, itemId);
  if (error) return watchlistApiError('watchlist_alerts_unavailable', 503);
  return NextResponse.json({ alerts: data ?? [], catalog: WATCHLIST_ALERT_CATALOG });
}

export async function POST(request: Request) {
  const auth = await authorizedClient();
  if (!auth) return watchlistApiError('not_authenticated', 401);
  const input = parseCreateWatchlistAlert(await request.json().catch(() => null));
  if (!input) return watchlistApiError('invalid_alert', 400);
  const { data, error } = await createWatchlistAlert(auth.client, auth.user.id, input);
  if (error?.code === '23505') return watchlistApiError('alert_already_exists', 409);
  if (error) return watchlistApiError('watchlist_alert_create_failed', 503);
  return NextResponse.json({ alert: data }, { status: 201 });
}
