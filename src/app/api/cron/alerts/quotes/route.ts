import { NextResponse } from 'next/server';
import { getQuoteAlertSupabase } from '@/lib/supabase/admin';
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
    const admin = getQuoteAlertSupabase();
    const result = await admin.rpc('quote_alert_window_samples', { p_from: window.from, p_to: window.to });
    if (result.error || !Array.isArray(result.data) || result.data.length > 10_000
      || result.data.some(row => !row || typeof row !== 'object'
        || !['quote_batch_loaded', 'quote_batch_degraded', 'quote_batch_failed'].includes(row.event_name)
        || !row.metadata || typeof row.metadata !== 'object'
        || !['count', 'stale'].every(key => {
          const value = (row.metadata as Record<string, unknown>)[key];
          return value === null || (typeof value === 'number' && Number.isFinite(value));
        }))) {
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
