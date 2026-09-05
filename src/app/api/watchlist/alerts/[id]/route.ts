import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { parseUpdateWatchlistAlert, validateWatchlistAlertUpdate } from '@/lib/watchlist/alerts';
import { deleteWatchlistAlert, getWatchlistAlert, updateWatchlistAlert } from '@/lib/watchlist/alert-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { isWatchlistPlanLimitError } from '@/lib/watchlist/plan-limits';

interface Context { params: Promise<{ id: string }> }

async function authorizedClient() {
  if (!serverIsSupabaseConfigured()) return null;
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await authorizedClient();
  if (!auth) return watchlistApiError('not_authenticated', 401);
  const patch = parseUpdateWatchlistAlert(await request.json().catch(() => null));
  if (!patch) return watchlistApiError('invalid_alert_patch', 400);
  const { id } = await params;
  const existing = await getWatchlistAlert(auth.client, auth.user.id, id);
  if (existing.error) return watchlistApiError('watchlist_alert_load_failed', 503);
  if (!existing.data) return watchlistApiError('alert_not_found', 404);
  const validated = validateWatchlistAlertUpdate(existing.data, patch);
  if (!validated) return watchlistApiError('invalid_alert_patch', 400);
  const { data, error } = await updateWatchlistAlert(auth.client, auth.user.id, id, validated);
  if (error?.code === '23505') return watchlistApiError('alert_already_exists', 409);
  if (isWatchlistPlanLimitError(error, 'alert')) return watchlistApiError('watchlist_alert_plan_limit', 403);
  if (error) return watchlistApiError('watchlist_alert_update_failed', 503);
  if (!data) return watchlistApiError('alert_not_found', 404);
  return NextResponse.json({ alert: data });
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await authorizedClient();
  if (!auth) return watchlistApiError('not_authenticated', 401);
  const { id } = await params;
  const { error } = await deleteWatchlistAlert(auth.client, auth.user.id, id);
  if (error) return watchlistApiError('watchlist_alert_delete_failed', 503);
  return NextResponse.json({ ok: true });
}
