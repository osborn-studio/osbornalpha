import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import {
  deletePerspectiveFeedback,
  loadPerspectiveAssessments,
  parsePerspectiveFeedback,
  savePerspectiveFeedback,
} from '@/lib/watchlist/perspective-feedback';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export async function POST(request: Request) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const input = parsePerspectiveFeedback(await request.json().catch(() => null));
  if (!input) return watchlistApiError('invalid_perspective_feedback', 400);
  try {
    return NextResponse.json({ feedback: await savePerspectiveFeedback(client, user.id, input) });
  } catch (error) {
    if (error instanceof Error && error.message === 'perspective_not_found') {
      return watchlistApiError('perspective_not_found', 404);
    }
    return watchlistApiError('perspective_feedback_unavailable', 503);
  }
}

function perspectiveId(request: Request): string | null {
  const value = new URL(request.url).searchParams.get('perspectiveId')?.trim() ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function GET(request: Request) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const id = perspectiveId(request);
  if (!id) return watchlistApiError('invalid_perspective_id', 400);
  try {
    const assessment = (await loadPerspectiveAssessments(client, user.id, [id]))[id];
    return NextResponse.json({ feedback: assessment?.feedback ?? null, outcomes: assessment?.outcomes ?? [] });
  } catch {
    return watchlistApiError('perspective_feedback_unavailable', 503);
  }
}

export async function DELETE(request: Request) {
  if (!serverIsSupabaseConfigured()) return watchlistApiError('supabase_unavailable', 503);
  const client = await getServerSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return watchlistApiError('not_authenticated', 401);
  const id = perspectiveId(request);
  if (!id) return watchlistApiError('invalid_perspective_id', 400);
  try {
    await deletePerspectiveFeedback(client, user.id, id);
    return NextResponse.json({ ok: true });
  } catch {
    return watchlistApiError('perspective_feedback_unavailable', 503);
  }
}
