-- M3 Stripe billing: lazy plan-expiry column + webhook idempotency ledger.
-- plan_expires_at powers effectivePlan() (src/lib/billing/plan.ts) — null means
-- "no expiry" (active subscription); a past timestamp means a lapsed 30-day pass.
-- stripe_events is a service-role-only dedup table: the webhook route inserts
-- the Stripe event id before processing and treats a unique-violation as
-- "already handled" (200 'duplicate'), so no RLS policies are needed — only
-- the service-role client (src/lib/supabase/admin.ts) ever touches this table.

alter table public.profiles add column if not exists plan_expires_at timestamptz;

create table if not exists public.stripe_events (
  id         text primary key,
  created_at timestamptz not null default now()
);
-- No RLS: this table is never queried from client/user sessions, only written
-- by the webhook route via the service-role admin client.
