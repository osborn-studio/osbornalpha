import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { watchlistApiError } from '@/lib/watchlist/api-error';
import { perspectiveGenerationJobView } from '@/lib/stocks/perspective-job-contract';
import {
  cancelPerspectiveGenerationJob,
  loadPerspectiveGenerationJob,
} from '@/lib/stocks/perspective-job-repository';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticatedDatabase() {
  const db = await getServerSupabase();
  const { data, error } = await db.auth.getUser();
  return error || !data.user ? null : db;
}

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return watchlistApiError('invalid_perspective_job_id', 400);
  const db = await authenticatedDatabase();
  if (!db) return watchlistApiError('not_authenticated', 401);
  try {
    const job = await loadPerspectiveGenerationJob(db, id);
    if (!job) return watchlistApiError('perspective_job_not_found', 404);
    return NextResponse.json({ job: perspectiveGenerationJobView(job) });
  } catch {
    return watchlistApiError('perspective_job_unavailable', 503);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return watchlistApiError('invalid_perspective_job_id', 400);
  const db = await authenticatedDatabase();
  if (!db) return watchlistApiError('not_authenticated', 401);
  try {
    const job = await cancelPerspectiveGenerationJob(db, id);
    if (!job) return watchlistApiError('perspective_job_not_found', 404);
    return NextResponse.json({ job: perspectiveGenerationJobView(job) });
  } catch {
    return watchlistApiError('perspective_job_cancel_failed', 503);
  }
}
