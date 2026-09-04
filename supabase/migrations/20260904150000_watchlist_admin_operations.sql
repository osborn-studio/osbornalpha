create table if not exists public.watchlist_operation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'retry_failed_delivery', 'retry_dead_letter', 'release_stale_processing', 'retry_failed_research'
  )),
  arguments jsonb not null default '{}'::jsonb check (jsonb_typeof(arguments) = 'object'),
  affected_count integer not null check (affected_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists watchlist_operation_actions_created_idx
  on public.watchlist_operation_actions (created_at desc);
alter table public.watchlist_operation_actions enable row level security;
revoke all on table public.watchlist_operation_actions from anon, authenticated;

create or replace function public.run_watchlist_admin_operation(
  p_actor_id uuid,
  p_action text,
  p_limit integer default 100,
  p_older_than_minutes integer default 30,
  p_tickers text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_older_than integer := least(greatest(coalesce(p_older_than_minutes, 30), 15), 1440);
  v_affected integer := 0;
begin
  if p_actor_id is null or p_action not in (
    'retry_failed_delivery', 'retry_dead_letter', 'release_stale_processing', 'retry_failed_research'
  ) then
    raise exception using errcode = '22023', message = 'invalid_watchlist_admin_operation';
  end if;

  if p_action in ('retry_failed_delivery', 'retry_dead_letter') then
    with candidates as (
      select event.id
      from public.watchlist_alert_events event
      where event.delivery_status = case when p_action = 'retry_dead_letter' then 'dead_letter' else 'failed' end
      order by event.triggered_at, event.id
      for update skip locked
      limit v_limit
    ), updated as (
      update public.watchlist_alert_events event
      set delivery_status = 'pending',
          delivery_attempts = 0,
          next_delivery_at = now(),
          dead_lettered_at = null,
          last_delivery_error = null,
          claimed_at = null
      from candidates
      where event.id = candidates.id
      returning event.id
    )
    select count(*) into v_affected from updated;
  elsif p_action = 'release_stale_processing' then
    with candidates as (
      select event.id
      from public.watchlist_alert_events event
      where event.delivery_status = 'processing'
        and event.claimed_at < now() - make_interval(mins => v_older_than)
      order by event.claimed_at, event.id
      for update skip locked
      limit v_limit
    ), updated as (
      update public.watchlist_alert_events event
      set delivery_status = 'failed',
          delivery_attempts = greatest(event.delivery_attempts - 1, 0),
          next_delivery_at = now(),
          last_delivery_error = 'processing_lease_released_by_admin',
          claimed_at = null
      from candidates
      where event.id = candidates.id
      returning event.id
    )
    select count(*) into v_affected from updated;
  else
    with candidates as (
      select state.ticker
      from public.watchlist_research_ticker_refresh_state state
      where (
        (coalesce(cardinality(p_tickers), 0) > 0 and state.ticker = any(p_tickers))
        or (coalesce(cardinality(p_tickers), 0) = 0 and state.status = 'failed')
      )
      order by state.next_refresh_at, state.ticker
      for update skip locked
      limit v_limit
    ), updated as (
      update public.watchlist_research_ticker_refresh_state state
      set status = 'pending',
          next_refresh_at = now(),
          lease_expires_at = null,
          last_error = null,
          updated_at = now()
      from candidates
      where state.ticker = candidates.ticker
      returning state.ticker
    )
    select count(*) into v_affected from updated;
  end if;

  insert into public.watchlist_operation_actions (actor_id, action, arguments, affected_count)
  values (
    p_actor_id,
    p_action,
    jsonb_build_object(
      'limit', v_limit,
      'olderThanMinutes', v_older_than,
      'tickers', coalesce(to_jsonb(p_tickers), '[]'::jsonb)
    ),
    v_affected
  );

  return jsonb_build_object('action', p_action, 'affected', v_affected);
end;
$$;

revoke all on function public.run_watchlist_admin_operation(uuid, text, integer, integer, text[]) from public;
grant execute on function public.run_watchlist_admin_operation(uuid, text, integer, integer, text[]) to service_role;
