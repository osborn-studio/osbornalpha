export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { getStripe, isStripeConfigured, getOrCreateCustomer } from '@/lib/billing/stripe';
import type Stripe from 'stripe';

type CheckoutMode = 'pass' | 'subscription';

function isCheckoutMode(v: unknown): v is CheckoutMode {
  return v === 'pass' || v === 'subscription';
}

// POST /api/stripe/checkout — create a Stripe Checkout Session for either the
// one-time 30-day pass ('pass', alipay/wechat_pay/card) or the monthly
// recurring subscription ('subscription', card-only — required for
// auto-renewal). Requires an authenticated user (401 otherwise).
export async function POST(req: Request) {
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments not configured' }, { status: 503 });
  }

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode;
  if (!isCheckoutMode(mode)) {
    return NextResponse.json({ error: "mode must be 'pass' or 'subscription'" }, { status: 400 });
  }

  const passPrice = process.env.STRIPE_PRICE_PASS_30D;
  const subPrice = process.env.STRIPE_PRICE_SUB_MONTHLY;
  const priceId = mode === 'pass' ? passPrice : subPrice;
  if (!priceId) {
    return NextResponse.json({ error: 'payments not configured' }, { status: 503 });
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: 'payments not configured' }, { status: 503 });
  }

  const origin = req.headers.get('origin') || new URL(req.url).origin;

  try {
    const customerId = await getOrCreateCustomer(supabase, user.id, user.email ?? null);

    const baseParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?upgraded=1`,
      cancel_url: `${origin}/settings`,
      client_reference_id: user.id,
      metadata: { user_id: user.id },
    };

    let session: Stripe.Checkout.Session;
    if (mode === 'pass') {
      try {
        session = await stripe.checkout.sessions.create({
          ...baseParams,
          mode: 'payment',
          payment_method_types: ['alipay', 'wechat_pay', 'card'],
          payment_method_options: { wechat_pay: { client: 'web' } },
        });
      } catch (err) {
        // Coordinator confirmed Alipay/WeChat Pay are not yet activated on the
        // Stripe account (card-only for now). Retry once with card-only so
        // the checkout flow stays usable until the Dashboard toggles are
        // flipped, instead of hard-failing every pass purchase.
        console.warn(
          'Stripe checkout: alipay/wechat_pay rejected, retrying with card only:',
          err instanceof Error ? err.message : err
        );
        session = await stripe.checkout.sessions.create({
          ...baseParams,
          mode: 'payment',
          payment_method_types: ['card'],
        });
      }
    } else {
      session = await stripe.checkout.sessions.create({
        ...baseParams,
        mode: 'subscription',
        payment_method_types: ['card'],
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'checkout failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
