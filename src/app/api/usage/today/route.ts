import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { dayWindowUtc8, limitFor, type QuotaFeature } from '@/lib/billing/quota';
import { effectivePlan } from '@/lib/billing/plan';
import { getBudgetConfig } from '@/lib/billing/cost-budget';

export const dynamic = 'force-dynamic';

const FEATURES: QuotaFeature[] = ['copilot', 'perspectives', 'brief_preview'];

interface CostReservationRow {
  status: string;
  reserved_micrormb: number;
  settled_micrormb: number | null;
  cap_exempt: boolean;
  expires_at: string | null;
}

export interface DailyPlatformCost {
  usedMicrormb: number;
  /** Spend counted by the non-exempt daily cap. */
  capUsedMicrormb: number;
  limitMicrormb: number;
  currency: 'CNY';
}

function validMicrormb(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function activeReservation(row: CostReservationRow, nowMs: number): boolean {
  if (row.status !== 'reserved') return false;
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

/**
 * Cost rows are the authoritative ledger. Settled rows use the actual amount;
 * incurred and still-active reservations use their conservative reservation.
 * Cap-exempt rows remain visible as actual platform spend, but never affect
 * `capUsedMicrormb`, which mirrors budget enforcement.
 */
function dailyPlatformCost(
  rows: CostReservationRow[],
  now: Date,
  limitMicrormb: number,
): DailyPlatformCost {
  let usedMicrormb = 0;
  let capUsedMicrormb = 0;
  for (const row of rows) {
    let amount = 0;
    if (row.status === 'settled') amount = validMicrormb(row.settled_micrormb);
    else if (row.status === 'incurred' || activeReservation(row, now.getTime())) {
      amount = validMicrormb(row.reserved_micrormb);
    }
    if (amount === 0) continue;
    usedMicrormb += amount;
    if (!row.cap_exempt) capUsedMicrormb += amount;
  }
  return { usedMicrormb, capUsedMicrormb, limitMicrormb, currency: 'CNY' };
}

// GET /api/usage/today — today's (Asia/Shanghai calendar day) quota usage for
// the three metered features, plus a BYO-key call count (informational only —
// BYO calls never count against quota). Powers the settings page's 今日用量
// section and can be reused by any future usage-panel UI.
export async function GET() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('plan, role, plan_expires_at')
    .eq('id', user.id)
    .maybeSingle<{ plan: string | null; role: string | null; plan_expires_at: string | null }>();
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const planExpiresAt = prof?.plan_expires_at ?? null;
  const plan = effectivePlan(prof?.plan ?? null, planExpiresAt, new Date());
  const role = prof?.role ?? null;
  const now = new Date();
  const { startIso, endIso } = dayWindowUtc8(now);

  const usage: Record<QuotaFeature, { used: number; limit: number }> = {
    copilot: { used: 0, limit: 0 },
    perspectives: { used: 0, limit: 0 },
    brief_preview: { used: 0, limit: 0 },
  };

  for (const feature of FEATURES) {
    const limit = limitFor(feature, plan, role);
    const { count, error: countErr } = await supabase
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('feature', feature)
      .eq('byo', false)
      .eq('status', 'completed')
      .gte('created_at', startIso)
      .lt('created_at', endIso);
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
    usage[feature] = { used: count ?? 0, limit };
  }

  // BYO is informational rather than a quota. Include completed and failed
  // terminal runs, but never in-flight pending rows.
  const { count: byoCalls, error: byoErr } = await supabase
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('byo', true)
    .in('status', ['completed', 'failed'])
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (byoErr) return NextResponse.json({ error: byoErr.message }, { status: 500 });

  // The reservation ledger is service-role only. Authentication and the
  // user_id predicate above are the authorization boundary; never return rows
  // or model/provider identifiers to the browser.
  let costRows: CostReservationRow[];
  try {
    const { data, error: costErr } = await (getAdminSupabase() as any)
      .from('llm_cost_reservations')
      .select('status,reserved_micrormb,settled_micrormb,cap_exempt,expires_at')
      .eq('user_id', user.id)
      .gte('created_at', startIso)
      .lt('created_at', endIso);
    if (costErr) return NextResponse.json({ error: 'Usage cost unavailable' }, { status: 503 });
    costRows = Array.isArray(data) ? data as CostReservationRow[] : [];
  } catch {
    return NextResponse.json({ error: 'Usage cost unavailable' }, { status: 503 });
  }
  const budget = getBudgetConfig();
  const cost = dailyPlatformCost(
    costRows,
    now,
    role === 'admin' ? -1 : budget.dailyLimitMicrormb,
  );

  return NextResponse.json({
    plan,
    plan_effective: plan,
    plan_expires_at: planExpiresAt,
    isAdmin: role === 'admin',
    usage,
    byoCalls: byoCalls ?? 0,
    cost,
  });
}
