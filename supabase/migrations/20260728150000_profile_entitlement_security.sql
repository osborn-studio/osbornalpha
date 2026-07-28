-- Profile rows are self-readable, but billing and authorization state is
-- backend-managed. Column grants are the primary boundary; the trigger keeps
-- the same invariant if broad UPDATE privileges are accidentally restored.
create or replace function public.protect_profile_entitlements()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() = 'authenticated'
     and (
       new.role is distinct from old.role
       or new.plan is distinct from old.plan
       or new.plan_expires_at is distinct from old.plan_expires_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.usage is distinct from old.usage
     ) then
    raise exception using
      errcode = '42501',
      message = 'profile entitlement fields are backend-managed';
  end if;

  return new;
end;
$$;

alter function public.protect_profile_entitlements() owner to postgres;
revoke execute on function public.protect_profile_entitlements()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_profile_entitlements_before_update
  on public.profiles;
create trigger protect_profile_entitlements_before_update
  before update on public.profiles
  for each row execute function public.protect_profile_entitlements();

-- Make the intended self-service surface explicit. Profile reads remain
-- self-scoped by RLS; only display_name is client-writable.
grant select on table public.profiles to authenticated, service_role;
revoke update on table public.profiles from authenticated;
revoke update (
  id,
  email,
  display_name,
  plan,
  role,
  usage,
  stripe_customer_id,
  created_at,
  updated_at,
  plan_expires_at
) on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update on table public.profiles to service_role;

-- All live AI accounting uses the durable begin/finalize lifecycle. Remove the
-- terminal-only aggregate writer so service-role callers cannot bypass pending
-- run creation, immutable identity, or exact finalization validation.
drop function if exists public.record_usage_event(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  text,
  bigint,
  boolean,
  boolean,
  text
);
