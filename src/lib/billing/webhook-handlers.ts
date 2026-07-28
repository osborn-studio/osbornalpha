// Pure business logic for the Stripe webhook (src/app/api/stripe/webhook/route.ts).
// Kept side-effect-free and Supabase-client-free so it's trivially unit-testable:
// each function takes plain data in and returns a plain "what to write" action
// out. The route is responsible for actually calling the admin Supabase client.
import { effectivePlan, extendPass } from '@/lib/billing/plan';
import type Stripe from 'stripe';

export interface ProfileUpdate {
  plan: string;
  plan_expires_at: string | null;
}

export interface CurrentProfile {
  plan: string | null;
  plan_expires_at: string | null;
}

// checkout.session.completed — grants Pro. A one-time 'payment' (the 30-day
// pass) stacks onto any remaining unexpired balance via extendPass(); a
// 'subscription' checkout grants Pro with no expiry (the subscription itself
// is the source of truth going forward, until it ends).
export function handleCheckoutCompleted(
  session: Pick<Stripe.Checkout.Session, 'mode'>,
  current: CurrentProfile,
  now: Date
): ProfileUpdate {
  if (session.mode === 'subscription') {
    return { plan: 'pro', plan_expires_at: null };
  }
  // mode === 'payment' (the 30-day pass)
  return { plan: 'pro', plan_expires_at: extendPass(current.plan_expires_at, now) };
}

// customer.subscription.updated (status outside active/trialing) and
// customer.subscription.deleted — a subscription lapsing. Downgrades to free
// UNLESS the user still has an unexpired time-boxed pass balance (spec §3:
// "时长卡余量保护") — in that case plan stays 'pro' with the existing expiry,
// and the (now-ended) subscription simply stops renewing it further.
export function handleSubscriptionEnded(current: CurrentProfile, now: Date): ProfileUpdate {
  const stillHasPassBalance = effectivePlan('pro', current.plan_expires_at, now) === 'pro'
    && current.plan_expires_at !== null;
  if (stillHasPassBalance) {
    return { plan: 'pro', plan_expires_at: current.plan_expires_at };
  }
  return { plan: 'free', plan_expires_at: null };
}

// Whether a subscription status update event represents the subscription
// ending (vs. e.g. transitioning between active/trialing, which is a no-op
// for our purposes).
export function isSubscriptionEndedStatus(status: Stripe.Subscription.Status): boolean {
  return status !== 'active' && status !== 'trialing';
}
