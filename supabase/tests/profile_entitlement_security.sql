begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(28);

insert into auth.users (id, email)
values (
  '50000000-0000-0000-0000-000000000001',
  'profile-security@example.test'
);

select has_trigger(
  'public',
  'profiles',
  'protect_profile_entitlements_before_update',
  'profiles has an entitlement-protection trigger'
);
select is(
  (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'protect_profile_entitlements'
  ),
  true,
  'the entitlement trigger function runs with trusted definer privileges'
);

select is(
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  false,
  'authenticated has no broad profile update privilege'
);
select is(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  true,
  'authenticated can update the ordinary display-name preference'
);
select is(
  has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
  false,
  'authenticated cannot update role'
);
select is(
  has_column_privilege('authenticated', 'public.profiles', 'plan', 'UPDATE'),
  false,
  'authenticated cannot update plan'
);
select is(
  has_column_privilege('authenticated', 'public.profiles', 'plan_expires_at', 'UPDATE'),
  false,
  'authenticated cannot update plan expiry'
);
select is(
  has_column_privilege('authenticated', 'public.profiles', 'stripe_customer_id', 'UPDATE'),
  false,
  'authenticated cannot update Stripe customer identity'
);
select is(
  has_column_privilege('authenticated', 'public.profiles', 'usage', 'UPDATE'),
  false,
  'authenticated cannot update reserved usage entitlements'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $sql$
    update public.profiles
    set display_name = 'Allowed Preference'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  'an authenticated user can update an allowed profile preference'
);
select is(
  (
    select display_name
    from public.profiles
    where id = '50000000-0000-0000-0000-000000000001'
  ),
  'Allowed Preference',
  'the allowed preference update persists'
);
select throws_ok(
  $sql$
    update public.profiles set role = 'admin'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'permission denied for table profiles',
  'authenticated cannot self-promote through direct table privileges'
);
select throws_ok(
  $sql$
    update public.profiles set plan = 'pro'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'permission denied for table profiles',
  'authenticated cannot change plan through direct table privileges'
);
select throws_ok(
  $sql$
    update public.profiles set plan_expires_at = '2030-01-01T00:00:00Z'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'permission denied for table profiles',
  'authenticated cannot extend plan expiry through direct table privileges'
);
select throws_ok(
  $sql$
    update public.profiles set stripe_customer_id = 'cus_attacker'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'permission denied for table profiles',
  'authenticated cannot replace the billing customer identity'
);
select throws_ok(
  $sql$
    update public.profiles set usage = '{"limit":-1}'::jsonb
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'permission denied for table profiles',
  'authenticated cannot rewrite reserved usage entitlements'
);

reset role;
grant update on table public.profiles to authenticated;
set local role authenticated;

select throws_ok(
  $sql$
    update public.profiles set role = 'admin'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'profile entitlement fields are backend-managed',
  'the trigger still blocks role escalation if broad grants regress'
);
select throws_ok(
  $sql$
    update public.profiles set plan = 'pro'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'profile entitlement fields are backend-managed',
  'the trigger still blocks plan changes if broad grants regress'
);
select throws_ok(
  $sql$
    update public.profiles set plan_expires_at = '2030-01-01T00:00:00Z'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'profile entitlement fields are backend-managed',
  'the trigger still blocks plan-expiry changes if broad grants regress'
);
select throws_ok(
  $sql$
    update public.profiles set stripe_customer_id = 'cus_attacker'
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'profile entitlement fields are backend-managed',
  'the trigger still blocks billing identity changes if broad grants regress'
);
select throws_ok(
  $sql$
    update public.profiles set usage = '{"limit":-1}'::jsonb
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'profile entitlement fields are backend-managed',
  'the trigger still blocks reserved entitlement changes if broad grants regress'
);

reset role;
revoke update on table public.profiles from authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"service_role"}',
  true
);

select is(
  has_table_privilege('service_role', 'public.profiles', 'UPDATE'),
  true,
  'the service role retains backend profile update authority'
);
set local role service_role;
select lives_ok(
  $sql$
    update public.profiles
    set
      role = 'admin',
      plan = 'pro',
      plan_expires_at = '2030-01-01T00:00:00Z',
      stripe_customer_id = 'cus_backend',
      usage = '{"source":"backend"}'::jsonb
    where id = '50000000-0000-0000-0000-000000000001'
  $sql$,
  'the trusted billing backend can update protected fields'
);
select is(
  (select role from public.profiles where id = '50000000-0000-0000-0000-000000000001'),
  'admin',
  'the backend role update persists'
);
select is(
  (select plan from public.profiles where id = '50000000-0000-0000-0000-000000000001'),
  'pro',
  'the backend plan update persists'
);
select is(
  (
    select plan_expires_at
    from public.profiles
    where id = '50000000-0000-0000-0000-000000000001'
  ),
  '2030-01-01T00:00:00Z'::timestamptz,
  'the backend plan expiry update persists'
);
select is(
  (
    select stripe_customer_id
    from public.profiles
    where id = '50000000-0000-0000-0000-000000000001'
  ),
  'cus_backend',
  'the backend billing identity update persists'
);
select is(
  (select usage from public.profiles where id = '50000000-0000-0000-0000-000000000001'),
  '{"source":"backend"}'::jsonb,
  'the backend reserved entitlement update persists'
);

reset role;
select * from finish();
rollback;
