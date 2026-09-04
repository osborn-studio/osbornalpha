-- Fetch public market research once per ticker, then distribute the same
-- normalized snapshot to every user who follows that ticker.
create table if not exists public.watchlist_research_ticker_refresh_state (
  ticker text primary key,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'partial', 'failed')),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_refresh_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create index if not exists watchlist_research_ticker_refresh_due_idx
  on public.watchlist_research_ticker_refresh_state (next_refresh_at, status);
alter table public.watchlist_research_ticker_refresh_state enable row level security;
revoke all on table public.watchlist_research_ticker_refresh_state from anon, authenticated;

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
  select distinct wi.ticker from public.watchlist_items wi
  on conflict (ticker) do nothing;

  return query
  with candidates as (
    select state.ticker
    from public.watchlist_research_ticker_refresh_state state
    where state.next_refresh_at <= now()
      and (state.status <> 'running' or state.lease_expires_at is null or state.lease_expires_at < now())
      and exists (select 1 from public.watchlist_items wi where wi.ticker = state.ticker)
    order by exists (
      select 1
      from public.watchlist_alerts alert
      join public.watchlist_items item on item.id = alert.watchlist_item_id
      where item.ticker = state.ticker
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
