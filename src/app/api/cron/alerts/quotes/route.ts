import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';
import { evaluateQuoteWindow, previousQuarterHourWindow, type QuoteEventSample } from '@/lib/observability/evaluators';
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
    const window = previousQuarterHourWindow(new Date());
    const admin = getAdminSupabase();
    const result = await admin.from('user_events')
      .select('event_name,metadata', { count: 'exact' })
      .in('event_name', ['quote_batch_loaded', 'quote_batch_degraded', 'quote_batch_failed'])
      .gte('created_at', window.from)
      .lt('created_at', window.to)
      .limit(10_001); // One sentinel row detects truncation; do not label partial evidence healthy.
    if (result.error || !Array.isArray(result.data) || result.data.length > 10_000
      || typeof result.count !== 'number' || !Number.isSafeInteger(result.count)
      || result.count < 0 || result.count > 10_000 || result.count !== result.data.length) {
      throw new Error('quote alert source unavailable');
    }
    const evaluation = evaluateQuoteWindow(result.data as QuoteEventSample[]);
    return NextResponse.json(await recordAndDeliverCheck(admin, {
      checkName: 'quote_15m',
      window,
      ...evaluation,
    }));
  } catch {
    console.error('quote 15-minute alert check failed');
    return NextResponse.json({ error: 'quote alert check unavailable' }, { status: 500 });
  }
}
