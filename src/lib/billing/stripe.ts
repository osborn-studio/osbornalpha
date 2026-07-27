// Stripe SDK singleton + customer resolution. Degrades cleanly when
// STRIPE_SECRET_KEY is missing (local dev / preview deploys without secrets):
// getStripe() throws a clear Error on first use rather than crashing at
// import/module-init time, so routes can catch it and return 503.
import Stripe from 'stripe';
import type { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

// Typed against getServerSupabase()'s exact return type (rather than the
// generic SupabaseClient<Database> from @supabase/supabase-js) — @supabase/ssr
// and @supabase/supabase-js have drifted generic-parameter arity across
// versions, which makes cross-package generic annotations brittle.
type ServerSupabase = Awaited<ReturnType<typeof getServerSupabase>>;

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY not configured — payments not available');
  }
  cached = new Stripe(key);
  return cached;
}

// Resolve (or lazily create) the Stripe customer for a user, persisting the
// id back onto profiles.stripe_customer_id so subsequent checkouts reuse it.
export async function getOrCreateCustomer(
  supabase: ServerSupabase,
  userId: string,
  email: string | null
): Promise<string> {
  const stripe = getStripe();

  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (profErr) throw new Error(profErr.message);

  if (prof?.stripe_customer_id) return prof.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { user_id: userId },
  });

  const { error: updateErr } = await (getAdminSupabase() as any)
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);
  if (updateErr) throw new Error(updateErr.message);

  return customer.id;
}
