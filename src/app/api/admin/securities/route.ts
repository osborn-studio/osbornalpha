import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import {
  aggregateSecuritiesHealth,
  type HealthCanaryInput,
  type HealthEventInput,
  type HealthMembershipInput,
  type HealthRunInput,
} from '@/lib/admin/securities-health';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const CANARIES = ['002463.SZ', '113001.SH', '00700.HK', 'AAPL', 'BABA'];

export async function GET() {
  try {
    await requireAdminUser();
    const admin = getAdminSupabase() as any;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [memberships, runs, candidates, events, canaries] = await Promise.all([
      admin.from('security_universe_memberships')
        .select('ticker,universe,is_active,as_of_date')
        .eq('is_active', true)
        .limit(20_000),
      admin.from('security_sync_runs')
        .select('scope,status,completed_at,source_as_of,inserted_count,updated_count,deactivated_count,error_code')
        .order('started_at', { ascending: false })
        .limit(200),
      admin.from('security_discovery_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      admin.from('user_events')
        .select('event_name,metadata')
        .gte('created_at', since)
        .in('event_name', [
          'stock_search_completed', 'security_resolve_started', 'security_resolve_completed',
          'stock_force_added', 'watchlist_stock_added',
        ])
        .limit(10_000),
      admin.from('stocks_universe')
        .select('ticker,is_active,list_status')
        .in('ticker', CANARIES),
    ]);
    if (memberships.error || runs.error || candidates.error || events.error || canaries.error) {
      throw new Error('Securities health source unavailable.');
    }

    return NextResponse.json(aggregateSecuritiesHealth({
      now: new Date().toISOString(),
      memberships: (memberships.data ?? []) as HealthMembershipInput[],
      runs: (runs.data ?? []) as HealthRunInput[],
      pendingCandidates: candidates.count ?? 0,
      events: (events.data ?? []) as HealthEventInput[],
      canaries: (canaries.data ?? []) as HealthCanaryInput[],
    }));
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('admin securities health failed');
    return NextResponse.json({ error: 'securities health unavailable' }, { status: 500 });
  }
}
