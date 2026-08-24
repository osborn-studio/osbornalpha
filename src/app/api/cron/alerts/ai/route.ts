import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { evaluateAiDaily, previousBeijingDayWindow, type AiRunSample } from '@/lib/observability/evaluators';
import { recordAndDeliverCheck } from '@/lib/observability/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron unavailable' }, { status: 503 });
  if (!authorizedCronRequest(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const window = previousBeijingDayWindow(now);
    const staleCutoff = new Date(new Date(window.to).getTime() - 10 * 60_000).toISOString();
    const admin = getAdminSupabase();
    const [terminalResult, staleResult] = await Promise.all([
      admin.from('ai_runs')
        .select('status,duration_ms,error_code,created_at')
        .in('status', ['completed', 'failed'])
        .gte('created_at', window.from)
        .lt('created_at', window.to)
        .limit(10_000),
      admin.from('ai_runs')
        .select('status,duration_ms,error_code,created_at')
        .eq('status', 'running')
        .lt('created_at', staleCutoff)
        .limit(10_000),
    ]);
    if (terminalResult.error || staleResult.error) throw new Error('AI alert source unavailable');
    const evaluation = evaluateAiDaily(
      [...(terminalResult.data ?? []), ...(staleResult.data ?? [])] as AiRunSample[],
      new Date(window.to),
    );
    return NextResponse.json(await recordAndDeliverCheck(admin, {
      checkName: 'ai_daily',
      window,
      ...evaluation,
    }));
  } catch {
    console.error('AI daily alert check failed');
    return NextResponse.json({ error: 'AI alert check unavailable' }, { status: 500 });
  }
}
