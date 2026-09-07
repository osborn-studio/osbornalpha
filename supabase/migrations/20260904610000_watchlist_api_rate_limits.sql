-- Atomic per-user burst protection for authenticated Watchlist mutations.
create table if not exists public.watchlist_api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('write', 'bulk', 'import', 'alert', 'feedback')),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action)
);

create index if not exists watchlist_api_rate_limits_updated_idx
  on public.watchlist_api_rate_limits (updated_at);

alter table public.watchlist_api_rate_limits enable row level security;
revoke all on table public.watchlist_api_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.watchlist_api_rate_limits to service_role;

create or replace function public.consume_watchlist_api_rate_limit(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_window_seconds integer;
  v_row public.watchlist_api_rate_limits;
  v_now timestamptz := now();
  v_allowed boolean;
  v_retry_after integer;
begin
  if v_user_id is null then raise exception 'watchlist_auth_required'; end if;
  case p_action
    when 'write' then v_limit := 120; v_window_seconds := 60;
    when 'bulk' then v_limit := 20; v_window_seconds := 60;
    when 'import' then v_limit := 6; v_window_seconds := 600;
    when 'alert' then v_limit := 30; v_window_seconds := 60;
    when 'feedback' then v_limit := 60; v_window_seconds := 60;
    else raise exception 'invalid_watchlist_rate_limit_action';
  end case;

  insert into public.watchlist_api_rate_limits (
    user_id, action, window_started_at, attempts, updated_at
  ) values (
    v_user_id, p_action, v_now, 1, v_now
  )
  on conflict (user_id, action) do update
  set window_started_at = case
        when public.watchlist_api_rate_limits.window_started_at
          <= v_now - make_interval(secs => v_window_seconds)
        then v_now
        else public.watchlist_api_rate_limits.window_started_at
      end,
      attempts = case
        when public.watchlist_api_rate_limits.window_started_at
          <= v_now - make_interval(secs => v_window_seconds)
        then 1
        else public.watchlist_api_rate_limits.attempts + 1
      end,
      updated_at = v_now
  returning * into v_row;

  v_allowed := v_row.attempts <= v_limit;
  v_retry_after := case when v_allowed then 0 else greatest(
    1,
    ceil(extract(epoch from (
      v_row.window_started_at + make_interval(secs => v_window_seconds) - v_now
    )))::integer
  ) end;
  return jsonb_build_object(
    'allowed', v_allowed,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_row.attempts, 0),
    'retryAfterSeconds', v_retry_after
  );
end;
$$;

revoke all on function public.consume_watchlist_api_rate_limit(text) from public;
grant execute on function public.consume_watchlist_api_rate_limit(text) to authenticated;

create or replace function public.cleanup_watchlist_api_rate_limits(
  p_retention_days integer default 7,
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_retention_days, 7), 1), 30);
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 0), 5000);
  v_deleted integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if v_limit = 0 then return 0; end if;
  with candidates as (
    select user_id, action from public.watchlist_api_rate_limits
    where updated_at < now() - make_interval(days => v_days)
    order by updated_at, user_id, action
    limit v_limit
  ), deleted as (
    delete from public.watchlist_api_rate_limits limits
    using candidates
    where limits.user_id = candidates.user_id and limits.action = candidates.action
    returning limits.user_id
  ) select count(*) into v_deleted from deleted;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_watchlist_api_rate_limits(integer, integer) from public;
grant execute on function public.cleanup_watchlist_api_rate_limits(integer, integer) to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_api_rate_limits')
on conflict (marker) do nothing;
