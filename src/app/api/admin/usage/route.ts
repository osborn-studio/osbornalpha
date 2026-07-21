import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import {
  aggregateUsage,
  type AuthEmailProbeInput,
  type AiRunInput,
  type ServiceAlertRunInput,
  type UsageEventInput,
  type UsageWindowKey,
} from '@/lib/admin/usage';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const WINDOWS = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 } as const;

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('range');
  const windowKey: UsageWindowKey = requested && Object.prototype.hasOwnProperty.call(WINDOWS, requested)
    ? requested as UsageWindowKey
    : '7d';
  const to = new Date();
  const from = new Date(to.getTime() - WINDOWS[windowKey] * 60 * 60 * 1000);

  try {
    await requireAdminUser();

    // This client bypasses RLS, so it is intentionally constructed only after
    // the session and admin-role checks above have succeeded.
    const admin = getAdminSupabase();
    const [eventsResult, runsResult, usersResult, alertsResult, probesResult] = await Promise.all([
      admin
        .from('user_events')
        .select('event_name,user_id,anonymous_id,metadata,created_at')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .order('created_at', { ascending: false })
        .limit(10_000),
      admin
        .from('ai_runs')
        .select('status,user_id,ticker,duration_ms,method_id,error_code,created_at')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .order('created_at', { ascending: false })
        .limit(10_000),
      admin.auth.admin.listUsers({ page: 1, perPage: 1_000 }),
      (admin.from('service_alert_runs') as any)
        .select('check_name,status,window_start,window_end,violations,created_at')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .order('created_at', { ascending: false })
        .limit(100),
      (admin.from('auth_email_probe_runs') as any)
        .select('recipient_hash,domain,probe_date,signup_delivery,recovery_delivery')
        .gte('probe_date', from.toISOString().slice(0, 10))
        .order('probe_date', { ascending: false })
        .limit(100),
    ]);

    if (eventsResult.error || runsResult.error || usersResult.error || alertsResult.error || probesResult.error) {
      throw new Error('aggregate source unavailable');
    }

    const confirmedUsers = usersResult.data.users
      .filter((user) => {
        const confirmedAt = user.email_confirmed_at ?? user.confirmed_at;
        if (!confirmedAt) return false;
        const registeredAt = new Date(user.created_at).getTime();
        return registeredAt >= from.getTime() && registeredAt <= to.getTime();
      })
      .map((user) => ({ id: user.id }));

    return NextResponse.json(aggregateUsage({
      confirmedUsers,
      events: (eventsResult.data ?? []) as UsageEventInput[],
      aiRuns: (runsResult.data ?? []) as AiRunInput[],
      serviceAlertRuns: (alertsResult.data ?? []) as ServiceAlertRunInput[],
      authEmailProbes: (probesResult.data ?? []) as AuthEmailProbeInput[],
      window: { key: windowKey, from: from.toISOString(), to: to.toISOString() },
    }));
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('admin usage aggregate failed');
    return NextResponse.json({ error: 'usage aggregate unavailable' }, { status: 500 });
  }
}
