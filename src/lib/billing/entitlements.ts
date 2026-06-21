// Billing-hook stub (Phase 1: read-only, no enforcement, no payment).
// Reads profiles.plan and maps it to capability flags. Phase 2 will add Stripe
// (checkout, webhook -> set profiles.plan/stripe_customer_id) and enforce limits.
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

export type Plan = 'free' | 'pro';

export interface Entitlements {
  plan: Plan;
  // Reserved capability flags — Phase 1 returns generous free-tier values; not
  // yet enforced anywhere. Wire enforcement in Phase 2 alongside Stripe.
  maxWatchlistItems: number;   // -1 = unlimited
  aiCommitteePerDay: number;   // -1 = unlimited
  canExport: boolean;
}

const PLANS: Record<Plan, Entitlements> = {
  free: { plan: 'free', maxWatchlistItems: 50, aiCommitteePerDay: 20, canExport: true },
  pro:  { plan: 'pro',  maxWatchlistItems: -1, aiCommitteePerDay: -1, canExport: true },
};

export function entitlementsForPlan(plan: string | null | undefined): Entitlements {
  return PLANS[(plan as Plan)] ?? PLANS.free;
}

// Server-side: resolve the current user's entitlements from their profile.
// Defaults to free for guests / unconfigured / missing profile.
export async function getEntitlements(): Promise<Entitlements> {
  if (!serverIsSupabaseConfigured()) return PLANS.free;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return PLANS.free;
  const { data } = await sb.from('profiles').select('plan').eq('id', user.id).maybeSingle<{ plan: string }>();
  return entitlementsForPlan(data?.plan);
}
