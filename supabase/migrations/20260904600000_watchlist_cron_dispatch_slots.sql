-- Durable scheduler slots let the dispatcher recover bounded windows missed by Vercel cron.
create table if not exists public.watchlist_cron_dispatch_slots (
  scheduled_for timestamptz primary key,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 32),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 100),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watchlist_cron_dispatch_slots_claim_idx
  on public.watchlist_cron_dispatch_slots (status, scheduled_for)
  where status in ('pending', 'running', 'failed');

alter table public.watchlist_cron_dispatch_slots enable row level security;
revoke all on table public.watchlist_cron_dispatch_slots from anon, authenticated;
grant select, insert, update, delete on table public.watchlist_cron_dispatch_slots to service_role;

create or replace function public.claim_watchlist_cron_dispatch_slots(
  p_now timestamptz default now(),
  p_lookback_minutes integer default 120,
  p_limit integer default 8,
  p_lease_minutes integer default 5
)
returns setof public.watchlist_cron_dispatch_slots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_slot timestamptz := date_bin('15 minutes', coalesce(p_now, now()), timestamptz '2000-01-01 00:00:00+00');
  v_lookback integer := least(greatest(coalesce(p_lookback_minutes, 120), 0), 1440);
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 96);
  v_lease integer := least(greatest(coalesce(p_lease_minutes, 5), 1), 15);
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;

  insert into public.watchlist_cron_dispatch_slots (scheduled_for)
  select slot
  from generate_series(
    v_current_slot - make_interval(mins => v_lookback),
    v_current_slot,
    interval '15 minutes'
  ) as slot
  on conflict (scheduled_for) do nothing;

  return query
  with candidates as (
    select dispatch.scheduled_for
    from public.watchlist_cron_dispatch_slots dispatch
    where dispatch.scheduled_for <= v_current_slot
      and dispatch.attempt_count < dispatch.max_attempts
      and (
        dispatch.status in ('pending', 'failed')
        or (dispatch.status = 'running' and (dispatch.lease_expires_at is null or dispatch.lease_expires_at <= now()))
      )
    order by dispatch.scheduled_for
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.watchlist_cron_dispatch_slots dispatch
    set status = 'running',
        attempt_count = dispatch.attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(mins => v_lease),
        last_error_code = null,
        started_at = now(),
        finished_at = null,
        updated_at = now()
    from candidates
    where dispatch.scheduled_for = candidates.scheduled_for
    returning dispatch.*
  )
  select * from claimed order by scheduled_for;
end;
$$;

revoke all on function public.claim_watchlist_cron_dispatch_slots(timestamptz, integer, integer, integer) from public;
grant execute on function public.claim_watchlist_cron_dispatch_slots(timestamptz, integer, integer, integer) to service_role;

create or replace function public.finish_watchlist_cron_dispatch_slot(
  p_scheduled_for timestamptz,
  p_lease_token uuid,
  p_succeeded boolean,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  update public.watchlist_cron_dispatch_slots
  set status = case
        when p_succeeded then 'succeeded'
        when attempt_count >= max_attempts then 'dead_letter'
        else 'failed'
      end,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = case when p_succeeded then null else left(coalesce(p_error_code, 'watchlist_dispatch_failed'), 100) end,
      finished_at = now(),
      updated_at = now()
  where scheduled_for = p_scheduled_for
    and status = 'running'
    and lease_token = p_lease_token;
  return found;
end;
$$;

revoke all on function public.finish_watchlist_cron_dispatch_slot(timestamptz, uuid, boolean, text) from public;
grant execute on function public.finish_watchlist_cron_dispatch_slot(timestamptz, uuid, boolean, text) to service_role;

create or replace function public.cleanup_watchlist_cron_dispatch_slots(
  p_retention_days integer default 30,
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_retention_days, 30), 7), 365);
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 0), 5000);
  v_deleted integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if v_limit = 0 then return 0; end if;
  with candidates as (
    select scheduled_for from public.watchlist_cron_dispatch_slots
    where status in ('succeeded', 'dead_letter')
      and updated_at < now() - make_interval(days => v_days)
    order by updated_at, scheduled_for
    limit v_limit
  ), deleted as (
    delete from public.watchlist_cron_dispatch_slots dispatch
    using candidates
    where dispatch.scheduled_for = candidates.scheduled_for
    returning dispatch.scheduled_for
  ) select count(*) into v_deleted from deleted;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_watchlist_cron_dispatch_slots(integer, integer) from public;
grant execute on function public.cleanup_watchlist_cron_dispatch_slots(integer, integer) to service_role;

create or replace function public.get_watchlist_cron_dispatch_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  return jsonb_build_object(
    'pending', (select count(*) from public.watchlist_cron_dispatch_slots where status = 'pending'),
    'running', (select count(*) from public.watchlist_cron_dispatch_slots where status = 'running'),
    'failed', (select count(*) from public.watchlist_cron_dispatch_slots where status = 'failed'),
    'dead_letter', (select count(*) from public.watchlist_cron_dispatch_slots where status = 'dead_letter'),
    'oldest_unsucceeded_at', (
      select min(scheduled_for) from public.watchlist_cron_dispatch_slots where status <> 'succeeded'
    ),
    'latest_succeeded_at', (
      select max(scheduled_for) from public.watchlist_cron_dispatch_slots where status = 'succeeded'
    )
  );
end;
$$;

revoke all on function public.get_watchlist_cron_dispatch_health() from public;
grant execute on function public.get_watchlist_cron_dispatch_health() to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_cron_dispatch_slots')
on conflict (marker) do nothing;
