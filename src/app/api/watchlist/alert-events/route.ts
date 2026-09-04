import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { parseWatchlistAlertEventQuery } from '@/lib/watchlist/alert-events';
import { listWatchlistAlertEvents } from '@/lib/watchlist/alert-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export async function GET(request: Request) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const options = parseWatchlistAlertEventQuery(new URL(request.url));
  const { data, error } = await listWatchlistAlertEvents(client, user.id, options);
  if (error) return watchlistApiError('watchlist_alert_events_unavailable', 503);
  return NextResponse.json({ events: data ?? [] });
}
