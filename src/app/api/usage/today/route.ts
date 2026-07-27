import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { dayWindowUtc8, limitFor, type QuotaFeature } from '@/lib/billing/quota';
import { effectivePlan } from '@/lib/billing/plan';

export const dynamic = 'force-dynamic';

const FEATURES: QuotaFeature[] = ['copilot', 'perspectives', 'brief_preview'];

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
  const { startIso, endIso } = dayWindowUtc8(new Date());

  const usage: Record<QuotaFeature, { used: number; limit: number }> = {
    copilot: { used: 0, limit: 0 },
    perspectives: { used: 0, limit: 0 },
    brief_preview: { used: 0, limit: 0 },
  };

  for (const feature of FEATURES) {
    const limit = limitFor(feature, plan, role);
    if (limit === -1) {
      usage[feature] = { used: 0, limit: -1 };
      continue;
    }
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

  // BYO is informational rather than a quota. Include both completed and
  // failed audit rows so the settings summary reflects all personal-key use.
  const { count: byoCalls, error: byoErr } = await supabase
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('byo', true)
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (byoErr) return NextResponse.json({ error: byoErr.message }, { status: 500 });

  return NextResponse.json({
    plan,
    plan_effective: plan,
    plan_expires_at: planExpiresAt,
    usage,
    byoCalls: byoCalls ?? 0,
  });
}
