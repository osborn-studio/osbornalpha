// Lazy plan-expiry resolution (spec §2). No cron: every read of a profile's
// plan is resolved against `now` at call time via effectivePlan(). A 'pro'
// plan with a null plan_expires_at means an active recurring subscription
// (never lapses on its own — only customer.subscription.deleted/updated
// downgrades it). A 'pro' plan with a past plan_expires_at means a lapsed
// time-boxed pass and reads back as 'free' without any write to the row.
export function effectivePlan(
  plan: string | null,
  expiresAt: string | null,
  now: Date
): string {
  const p = plan ?? 'free';
  if (p !== 'pro') return p;
  if (expiresAt === null) return 'pro';
  // Strict comparison: expiresAt === now is already expired.
  return new Date(expiresAt).getTime() > now.getTime() ? 'pro' : 'free';
}

// Extends (or starts) a 30-day pass. Stacks on top of any remaining unexpired
// balance instead of discarding it: new expiry = max(now, current) + days.
export function extendPass(current: string | null, now: Date, days = 30): string {
  const currentMs = current ? new Date(current).getTime() : -Infinity;
  const baseMs = Math.max(now.getTime(), currentMs);
  return new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
}
