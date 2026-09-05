-- Durable Watchlist analytics. Successful snapshots are immutable between
-- refreshes; refresh failures live in the queue table and never erase the
-- last-known-good metrics shown to users.
create table if not exists public.watchlist_metric_snapshots (
  ticker text not null references public.stocks_universe(ticker) on update cascade on delete cascade,
  market text not null check (market in ('A', 'HK', 'US', 'JP', 'KR', 'TW')),
  history_range text not null check (history_range in ('1m', '6m', 'ytd', '1y', '5y', 'all')),
  benchmark_ticker text not null,
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  source text,
  source_bundle jsonb not null default '{}'::jsonb check (jsonb_typeof(source_bundle) = 'object'),
  warnings text[] not null default '{}',
  calculator_version text not null,
  observed_at timestamptz,
  generated_at timestamptz not null,
  valid_until timestamptz not null,
  period_return_pct numeric,
  total_return_pct numeric,
  annualized_volatility_pct numeric,
  downside_volatility_pct numeric,
  sharpe_ratio numeric,
  max_drawdown_pct numeric,
  rsi14 numeric,
  ma20_distance_pct numeric,
  ma50_distance_pct numeric,
  macd_histogram numeric,
  bollinger_position_pct numeric,
  atr14_pct numeric,
  excess_return_pct numeric,
  beta numeric,
  volume_zscore_20 numeric,
  coverage_ratio numeric check (coverage_ratio is null or coverage_ratio between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (ticker, history_range, benchmark_ticker)
);

create index if not exists watchlist_metric_snapshots_freshness_idx
  on public.watchlist_metric_snapshots (history_range, valid_until, ticker);
create index if not exists watchlist_metric_snapshots_return_idx
  on public.watchlist_metric_snapshots (history_range, period_return_pct, ticker);
create index if not exists watchlist_metric_snapshots_risk_idx
  on public.watchlist_metric_snapshots (history_range, annualized_volatility_pct, max_drawdown_pct, ticker);
create index if not exists watchlist_metric_snapshots_technical_idx
  on public.watchlist_metric_snapshots (history_range, rsi14, ticker);

alter table public.watchlist_metric_snapshots enable row level security;
revoke all on table public.watchlist_metric_snapshots from anon;
grant select on table public.watchlist_metric_snapshots to authenticated;
grant select, insert, update, delete on table public.watchlist_metric_snapshots to service_role;

drop policy if exists watchlist_metric_snapshots_followed_select on public.watchlist_metric_snapshots;
create policy watchlist_metric_snapshots_followed_select
  on public.watchlist_metric_snapshots for select to authenticated
  using (exists (
    select 1 from public.watchlist_items item
    where item.user_id = auth.uid() and item.ticker = watchlist_metric_snapshots.ticker
  ));

create table if not exists public.watchlist_metric_refresh_state (
  ticker text not null references public.stocks_universe(ticker) on update cascade on delete cascade,
  market text not null check (market in ('A', 'HK', 'US', 'JP', 'KR', 'TW')),
  history_range text not null default '1y' check (history_range in ('1m', '6m', 'ytd', '1y', '5y', 'all')),
  benchmark_ticker text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_refresh_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (ticker, history_range, benchmark_ticker)
);

create index if not exists watchlist_metric_refresh_due_idx
  on public.watchlist_metric_refresh_state (next_refresh_at, status);
alter table public.watchlist_metric_refresh_state enable row level security;
revoke all on table public.watchlist_metric_refresh_state from anon, authenticated;
grant select, insert, update, delete on table public.watchlist_metric_refresh_state to service_role;

create or replace function public.watchlist_default_benchmark(p_market text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_market
    when 'A' then '510300.SH'
    when 'HK' then '02800.HK'
    when 'US' then 'SPY'
    when 'JP' then '1306.T'
    when 'KR' then '069500.KS'
    when 'TW' then '0050.TW'
  end
$$;

revoke all on function public.watchlist_default_benchmark(text) from public;
grant execute on function public.watchlist_default_benchmark(text) to service_role;

create or replace function public.enqueue_watchlist_metric_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market text;
  v_benchmark text;
begin
  select market into v_market from public.stocks_universe where ticker = new.ticker;
  v_benchmark := public.watchlist_default_benchmark(v_market);
  if new.status not in ('paused', 'invalidated') and v_market is not null and v_benchmark is not null then
    insert into public.watchlist_metric_refresh_state (
      ticker, market, history_range, benchmark_ticker, status, next_refresh_at
    ) values (new.ticker, v_market, '1y', v_benchmark, 'pending', now())
    on conflict (ticker, history_range, benchmark_ticker) do update
      set next_refresh_at = least(watchlist_metric_refresh_state.next_refresh_at, excluded.next_refresh_at),
          status = case when watchlist_metric_refresh_state.status = 'running'
            then watchlist_metric_refresh_state.status else 'pending' end,
          updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_watchlist_metric_refresh() from public;

drop trigger if exists watchlist_metric_refresh_on_item_insert on public.watchlist_items;
create trigger watchlist_metric_refresh_on_item_insert
after insert or update of ticker on public.watchlist_items
for each row execute function public.enqueue_watchlist_metric_refresh();

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
  select distinct item.ticker, stock.market, '1y', public.watchlist_default_benchmark(stock.market)
  from public.watchlist_items item
  join public.stocks_universe stock on stock.ticker = item.ticker
  where public.watchlist_default_benchmark(stock.market) is not null
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

insert into public.watchlist_release_markers (marker)
values ('watchlist_metric_snapshots')
on conflict (marker) do nothing;
