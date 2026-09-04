-- Paused and invalidated items remain in the watchlist for history, but they
-- should not trigger external research refreshes or alert evaluation work.
create table if not exists public.watchlist_release_markers (
  marker text primary key,
  applied_at timestamptz not null default now()
);
alter table public.watchlist_release_markers enable row level security;
revoke all on table public.watchlist_release_markers from anon, authenticated;
grant select on table public.watchlist_release_markers to service_role;
insert into public.watchlist_release_markers (marker)
values ('watchlist_monitoring_status')
on conflict (marker) do nothing;

create index if not exists watchlist_items_ticker_status_idx
  on public.watchlist_items (ticker, status);

create or replace function public.claim_watchlist_research_ticker_refresh(
  p_limit integer default 10,
  p_lease_minutes integer default 10
)
returns setof public.watchlist_research_ticker_refresh_state
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.watchlist_research_ticker_refresh_state (ticker)
  select distinct wi.ticker
  from public.watchlist_items wi
  where wi.status not in ('paused', 'invalidated')
  on conflict (ticker) do nothing;

  return query
  with candidates as (
    select state.ticker
    from public.watchlist_research_ticker_refresh_state state
    where state.next_refresh_at <= now()
      and (state.status <> 'running' or state.lease_expires_at is null or state.lease_expires_at < now())
      and exists (
        select 1
        from public.watchlist_items wi
        where wi.ticker = state.ticker
          and wi.status not in ('paused', 'invalidated')
      )
    order by exists (
      select 1
      from public.watchlist_alerts alert
      join public.watchlist_items item on item.id = alert.watchlist_item_id
      where item.ticker = state.ticker
        and item.status not in ('paused', 'invalidated')
        and alert.alert_type = 'rating'
        and alert.enabled = true
    ) desc, state.next_refresh_at, state.ticker
    for update of state skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 25)
  )
  update public.watchlist_research_ticker_refresh_state state
  set status = 'running',
      last_attempt_at = now(),
      lease_expires_at = now() + make_interval(mins => least(greatest(coalesce(p_lease_minutes, 10), 1), 30)),
      updated_at = now()
  from candidates
  where state.ticker = candidates.ticker
  returning state.*;
end;
$$;

revoke all on function public.claim_watchlist_research_ticker_refresh(integer, integer) from public;
grant execute on function public.claim_watchlist_research_ticker_refresh(integer, integer) to service_role;
