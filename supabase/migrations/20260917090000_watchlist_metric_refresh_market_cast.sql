-- ============================================================================
-- Fix: claim_watchlist_metric_refresh() passed the market_t enum column
-- straight into public.watchlist_default_benchmark(text). PostgreSQL does not
-- implicitly cast an enum to text for function arguments, so the metric
-- refresh claim raised:
--   function public.watchlist_default_benchmark(market_t) does not exist
-- every other call site in the repo already casts with ::text.
-- ============================================================================
create or replace function public.claim_watchlist_metric_refresh(
  p_limit integer default 10,
  p_lease_minutes integer default 10
)
returns setof public.watchlist_metric_refresh_state
language plpgsql
security definer
set search_path = public
as $$
begin
  -- p_limit=0 is a side-effect-free production schema probe.
  if coalesce(p_limit, 10) = 0 then return; end if;

  insert into public.watchlist_metric_refresh_state (
    ticker, market, history_range, benchmark_ticker
  )
  select distinct
    item.ticker,
    stock.market::text,
    '1y',
    public.watchlist_default_benchmark(stock.market::text)
  from public.watchlist_items item
  join public.stocks_universe stock on stock.ticker = item.ticker
  where public.watchlist_default_benchmark(stock.market::text) is not null
    and item.status not in ('paused', 'invalidated')
  on conflict (ticker, history_range, benchmark_ticker) do nothing;

  return query
  with candidates as (
    select state.ticker, state.history_range, state.benchmark_ticker
    from public.watchlist_metric_refresh_state state
    where state.next_refresh_at <= now()
      and (state.status <> 'running' or state.lease_expires_at is null or state.lease_expires_at < now())
      and exists (
        select 1 from public.watchlist_items item
        where item.ticker = state.ticker and item.status not in ('paused', 'invalidated')
      )
    order by state.next_refresh_at, state.failure_count, state.ticker
    for update of state skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 25)
  )
  update public.watchlist_metric_refresh_state state
  set status = 'running',
      last_attempt_at = now(),
      lease_expires_at = now() + make_interval(mins => least(greatest(coalesce(p_lease_minutes, 10), 1), 30)),
      updated_at = now()
  from candidates
  where state.ticker = candidates.ticker
    and state.history_range = candidates.history_range
    and state.benchmark_ticker = candidates.benchmark_ticker
  returning state.*;
end;
$$;

revoke all on function public.claim_watchlist_metric_refresh(integer, integer) from public;
grant execute on function public.claim_watchlist_metric_refresh(integer, integer) to service_role;
