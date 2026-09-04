import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { isWatchlistAlertRetryPatch, parseWatchlistAlertReadPatch } from '@/lib/watchlist/alert-events';
import { retryWatchlistAlertEvent, updateWatchlistAlertEventReadState } from '@/lib/watchlist/alert-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';

interface Context { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Context) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const body = await request.json().catch(() => null);
  const patch = parseWatchlistAlertReadPatch(body);
  const retry = isWatchlistAlertRetryPatch(body);
  if (!patch && !retry) return watchlistApiError('invalid_alert_event_patch', 400);
  const { id } = await params;
  const { data, error } = retry
    ? await retryWatchlistAlertEvent(client, id)
    : await updateWatchlistAlertEventReadState(client, id, patch!.read);
  if (error) return watchlistApiError('watchlist_alert_event_update_failed', 503);
  if (!data) return watchlistApiError('alert_event_not_found', 404);
  return NextResponse.json({ event: data });
}
