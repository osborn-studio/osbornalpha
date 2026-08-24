-- Multi-tenant auth Phase 1: profiles table + billing hooks (plan/role/usage)
-- Extends the signup trigger to auto-create a profile row alongside the default
-- watchlist + user_preferences. RLS: a user can only see/update their own profile.
-- No payment integration yet — plan/role/usage/stripe_customer_id are reserved
-- hooks consumed read-only by src/lib/billing/entitlements.ts (Phase 2 adds Stripe).

-- ── profiles (1:1 with auth.users) ─────────────────────────────────────────
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  display_name       text,
  plan               text not null default 'free',   -- free | pro (Phase 2)
  role               text not null default 'user',    -- user | admin
  usage              jsonb not null default '{}'::jsonb,  -- reserved: counters/limits
  stripe_customer_id text,                              -- reserved for Phase 2
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read and update only their own profile. No insert/delete from the
-- client — rows are created by the signup trigger (security definer) and removed
-- via auth.users cascade. plan/role are NOT client-writable in Phase 2 (enforce
-- via a column grant or trigger then); for Phase 1 update policy is self-scoped.
create policy "profiles self read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

-- ── extend signup trigger to also create the profile ───────────────────────
create or replace function public.handle_new_user()
returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  insert into public.watchlists (user_id, name, description, is_default)
  values (new.id, '我的股票池', '默认股票池', true);
  insert into public.user_preferences (user_id) values (new.id);
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- trigger on_auth_user_created already points at handle_new_user() (initial migration);
-- replacing the function body above is sufficient. Recreate defensively in case
-- this migration is applied to a fresh DB out of order.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── backfill profiles for any pre-existing users ───────────────────────────
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;
