import { NextResponse } from 'next/server';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { getServerSupabase } from '@/lib/supabase/server';
import { perspectiveGenerationJobView } from '@/lib/stocks/perspective-job-contract';
import { loadActivePerspectiveGenerationJob } from '@/lib/stocks/perspective-job-repository';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ticker = normalizeEvidenceTickerParam(new URL(request.url).searchParams.get('ticker') ?? '');
  if (!ticker) return watchlistApiError('invalid_ticker', 400);

  const db = await getServerSupabase();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return watchlistApiError('not_authenticated', 401);

  try {
    const job = await loadActivePerspectiveGenerationJob(db, ticker);
    return NextResponse.json({ job: job ? perspectiveGenerationJobView(job) : null });
  } catch {
    return watchlistApiError('perspective_job_unavailable', 503);
  }
}
