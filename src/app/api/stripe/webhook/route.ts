export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, isStripeConfigured } from '@/lib/billing/stripe';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  handleCheckoutCompleted,
  handleSubscriptionEnded,
  isSubscriptionEndedStatus,
  type CurrentProfile,
} from '@/lib/billing/webhook-handlers';

// POST /api/stripe/webhook — public path, Stripe signature is the only
// authentication (no user session exists in this context). Verifies the
// signature against the raw body, de-dupes by event id (stripe_events table),
// then dispatches to the pure webhook-handlers functions and writes the
// result via the service-role admin client (webhook writes cross user
// boundaries by design: it acts on whichever user metadata/customer id
// points to, not "the current session").
export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'payments not configured' }, { status: 503 });
  }

  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) {
    return NextResponse.json({ error: 'payments not configured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing stripe-signature' }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // Idempotency: insert the event id first: a unique-violation means we've
  // already processed this event (Stripe retries on timeout/5xx), so return
  // 200 immediately without re-applying the side effect.
  const { error: insertErr } = await (admin as any)
    .from('stripe_events')
    .insert({ id: event.id });
  if (insertErr) {
    // Postgres unique_violation is SQLSTATE 23505.
    if ((insertErr as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Trust boundary: this user_id is trusted because forging a session
        // with arbitrary metadata requires possession of STRIPE_SECRET_KEY
        // (= account compromise); the signature check above already proved
        // the event came from Stripe. Acceptable.
        const userId = session.metadata?.user_id || session.client_reference_id;
        if (!userId) {
          console.warn('checkout.session.completed with no user_id metadata; skipping', session.id);
          break;
        }
        const current = await fetchProfile(admin, userId);
        const update = handleCheckoutCompleted({ mode: session.mode }, current, new Date());
        await writeProfile(admin, userId, update);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        if (isSubscriptionEndedStatus(sub.status)) {
          await downgradeByCustomerId(admin, sub.customer as string);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await downgradeByCustomerId(admin, sub.customer as string);
        break;
      }

      case 'invoice.payment_failed': {
        console.warn('Stripe invoice.payment_failed', event.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.warn('Stripe webhook handler error:', err instanceof Error ? err.message : err);
    // The dedup row was inserted BEFORE dispatch (extendPass stacking makes
    // replay-after-partial-apply dangerous the other way), so on a dispatch
    // failure we must clear it — otherwise Stripe's retry of this same event
    // would hit the 23505 dedup path, return 200 'duplicate', and the paid
    // upgrade would be permanently lost while Stripe believes it succeeded.
    try {
      const { error: delErr } = await (admin as any)
        .from('stripe_events')
        .delete()
        .eq('id', event.id);
      if (delErr) throw new Error(delErr.message);
    } catch (delErr) {
      // Both the dispatch AND the cleanup failed: the retry will now be
      // swallowed as a duplicate. Log loudly with the event id so the grant
      // can be applied manually (Stripe Dashboard has the full event).
      console.error(
        `Stripe webhook CRITICAL: dispatch failed AND dedup-row cleanup failed for event ${event.id} — ` +
        'retries will be treated as duplicates; apply this event manually.',
        delErr instanceof Error ? delErr.message : delErr
      );
    }
    return NextResponse.json({ error: 'handler error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function fetchProfile(admin: ReturnType<typeof getAdminSupabase>, userId: string): Promise<CurrentProfile> {
  const { data, error } = await admin
    .from('profiles')
    .select('plan, plan_expires_at')
    .eq('id', userId)
    .maybeSingle<CurrentProfile>();
  if (error) throw new Error(error.message);
  return data ?? { plan: 'free', plan_expires_at: null };
}

async function writeProfile(
  admin: ReturnType<typeof getAdminSupabase>,
  userId: string,
  update: { plan: string; plan_expires_at: string | null }
): Promise<void> {
  const { error } = await (admin as any)
    .from('profiles')
    .update(update)
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

async function downgradeByCustomerId(admin: ReturnType<typeof getAdminSupabase>, customerId: string): Promise<void> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, plan, plan_expires_at')
    .eq('stripe_customer_id', customerId)
    .maybeSingle<CurrentProfile & { id: string }>();
  if (error) throw new Error(error.message);
  if (!data) {
    console.warn('subscription event for unknown stripe_customer_id', customerId);
    return;
  }
  const update = handleSubscriptionEnded({ plan: data.plan, plan_expires_at: data.plan_expires_at }, new Date());
  await writeProfile(admin, data.id, update);
}
