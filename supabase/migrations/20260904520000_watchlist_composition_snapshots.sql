-- Move pairwise Watchlist composition work off the interactive Overview path.
create table if not exists public.watchlist_composition_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  history_range text not null check (history_range in ('1m', '6m', 'ytd', '1y', '5y', 'all')),
  watchlist_version bigint not null check (watchlist_version >= 0),
  composition jsonb not null,
  observed_at timestamptz,
  generated_at timestamptz not null default now(),
  valid_until timestamptz not null,
  primary key (user_id, history_range)
);

create index if not exists watchlist_composition_snapshots_refresh_idx
  on public.watchlist_composition_snapshots (valid_until, generated_at);
alter table public.watchlist_composition_snapshots enable row level security;
drop policy if exists "watchlist composition snapshots user read" on public.watchlist_composition_snapshots;
create policy "watchlist composition snapshots user read" on public.watchlist_composition_snapshots
  for select using (auth.uid() = user_id);
revoke all on table public.watchlist_composition_snapshots from anon, authenticated;
grant select on table public.watchlist_composition_snapshots to authenticated;
grant all on table public.watchlist_composition_snapshots to service_role;

create or replace function public.calculate_watchlist_composition_metrics(
  p_user_id uuid,
  p_history_range text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'watchlist_composition_service_role_required';
  end if;
  if p_user_id is null or p_history_range not in ('1m', '6m', 'ytd', '1y', '5y', 'all') then
    raise exception 'invalid_watchlist_composition_request';
  end if;

  with watched as materialized (
    select distinct
      item.ticker,
      stock.market::text as market,
      coalesce(nullif(trim(stock.currency), ''), 'Unknown') as currency,
      coalesce(nullif(trim(stock.industry), ''), 'Unclassified') as industry
    from public.watchlist_items item
    join public.stocks_universe stock on stock.ticker = item.ticker
    where item.user_id = p_user_id
  ),
  market_groups as (
    select market as key, count(*)::integer as count from watched group by market
  ),
  industry_groups as (
    select industry as key, count(*)::integer as count from watched group by industry
  ),
  currency_groups as (
    select currency as key, count(*)::integer as count from watched group by currency
  ),
  pairs as materialized (
    select
      left_item.ticker as left_ticker,
      right_item.ticker as right_ticker,
      left_metric.metrics as left_metrics,
      right_metric.metrics as right_metrics
    from watched left_item
    join watched right_item
      on left_item.ticker < right_item.ticker
      and left_item.market = right_item.market
      and left_item.currency = right_item.currency
    join public.watchlist_metric_snapshots left_metric
      on left_metric.ticker = left_item.ticker
      and left_metric.history_range = p_history_range
      and left_metric.benchmark_ticker = public.watchlist_default_benchmark(left_item.market)
      and left_metric.valid_until > now()
    join public.watchlist_metric_snapshots right_metric
      on right_metric.ticker = right_item.ticker
      and right_metric.history_range = p_history_range
      and right_metric.benchmark_ticker = public.watchlist_default_benchmark(right_item.market)
      and right_metric.valid_until > now()
  ),
  aligned as (
    select
      pairs.left_ticker,
      pairs.right_ticker,
      (left_return ->> 'returnPct')::double precision as left_return,
      (right_return ->> 'returnPct')::double precision as right_return
    from pairs
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(pairs.left_metrics -> 'correlationSeries') = 'array'
        then pairs.left_metrics -> 'correlationSeries' else '[]'::jsonb end
    ) left_return
    join lateral jsonb_array_elements(
      case when jsonb_typeof(pairs.right_metrics -> 'correlationSeries') = 'array'
        then pairs.right_metrics -> 'correlationSeries' else '[]'::jsonb end
    ) right_return on right_return ->> 'date' = left_return ->> 'date'
    where jsonb_typeof(left_return -> 'returnPct') = 'number'
      and jsonb_typeof(right_return -> 'returnPct') = 'number'
  ),
  correlation_values as (
    select left_ticker, right_ticker, corr(left_return, right_return) as correlation,
      count(*)::integer as observations
    from aligned
    group by left_ticker, right_ticker
    having count(*) >= 20
  ),
  snapshot_time as (
    select max(metric.observed_at) as as_of
    from watched
    join public.watchlist_metric_snapshots metric
      on metric.ticker = watched.ticker
      and metric.history_range = p_history_range
      and metric.benchmark_ticker = public.watchlist_default_benchmark(watched.market)
  )
  select jsonb_build_object(
    'totalSecurities', (select count(*) from watched),
    'markets', coalesce((select jsonb_agg(jsonb_build_object(
      'key', key, 'count', count,
      'sharePct', count::numeric / nullif((select count(*) from watched), 0) * 100
    ) order by count desc, key) from market_groups), '[]'::jsonb),
    'industries', coalesce((select jsonb_agg(jsonb_build_object(
      'key', key, 'count', count,
      'sharePct', count::numeric / nullif((select count(*) from watched), 0) * 100
    ) order by count desc, key) from industry_groups), '[]'::jsonb),
    'currencies', coalesce((select jsonb_agg(jsonb_build_object(
      'key', key, 'count', count,
      'sharePct', count::numeric / nullif((select count(*) from watched), 0) * 100
    ) order by count desc, key) from currency_groups), '[]'::jsonb),
    'correlations', coalesce((select jsonb_agg(value order by abs((value ->> 'correlation')::numeric) desc)
      from (select jsonb_build_object(
        'leftTicker', left_ticker, 'rightTicker', right_ticker,
        'correlation', correlation, 'observations', observations
      ) as value from correlation_values where correlation is not null
      order by abs(correlation) desc limit 50) ranked), '[]'::jsonb),
    'asOf', (select as_of from snapshot_time)
  ) into result;

  return coalesce(result, jsonb_build_object(
    'totalSecurities', 0, 'markets', '[]'::jsonb, 'industries', '[]'::jsonb,
    'currencies', '[]'::jsonb, 'correlations', '[]'::jsonb, 'asOf', null
  ));
end;
$$;

revoke all on function public.calculate_watchlist_composition_metrics(uuid, text) from public;
grant execute on function public.calculate_watchlist_composition_metrics(uuid, text) to service_role;

create or replace function public.refresh_watchlist_composition_snapshots(p_limit integer default 10)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  calculated jsonb;
  refreshed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'watchlist_composition_service_role_required';
  end if;
  if p_limit is null or p_limit < 0 or p_limit > 50 then
    raise exception 'invalid_watchlist_composition_refresh_limit';
  end if;

  for candidate in
    with ranges(history_range) as (
      values ('1y'), ('6m'), ('1m'), ('ytd'), ('5y'), ('all')
    ), users as (
      select item.user_id, coalesce(state.version, 0) as watchlist_version
      from (select distinct user_id from public.watchlist_items) item
      left join public.watchlist_sync_state state on state.user_id = item.user_id
    )
    select users.user_id, users.watchlist_version, ranges.history_range
    from users cross join ranges
    left join public.watchlist_composition_snapshots snapshot
      on snapshot.user_id = users.user_id and snapshot.history_range = ranges.history_range
    where snapshot.user_id is null
      or snapshot.watchlist_version <> users.watchlist_version
      or snapshot.valid_until <= now()
    order by
      case ranges.history_range when '1y' then 0 when '6m' then 1 when '1m' then 2 else 3 end,
      snapshot.generated_at nulls first,
      users.user_id
    limit least(greatest(p_limit, 0), 50)
  loop
    calculated := public.calculate_watchlist_composition_metrics(candidate.user_id, candidate.history_range);
    insert into public.watchlist_composition_snapshots (
      user_id, history_range, watchlist_version, composition, observed_at, generated_at, valid_until
    ) values (
      candidate.user_id,
      candidate.history_range,
      candidate.watchlist_version,
      calculated,
      case when calculated ->> 'asOf' is null then null else (calculated ->> 'asOf')::timestamptz end,
      now(),
      now() + interval '6 hours'
    )
    on conflict (user_id, history_range) do update set
      watchlist_version = excluded.watchlist_version,
      composition = excluded.composition,
      observed_at = excluded.observed_at,
      generated_at = excluded.generated_at,
      valid_until = excluded.valid_until;
    refreshed := refreshed + 1;
  end loop;
  return refreshed;
end;
$$;

revoke all on function public.refresh_watchlist_composition_snapshots(integer) from public;
grant execute on function public.refresh_watchlist_composition_snapshots(integer) to service_role;

-- Preserve the existing application RPC name while changing it to a snapshot read.
create or replace function public.get_watchlist_composition_metrics(p_history_range text default '1y')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  current_version bigint;
begin
  if auth.uid() is null then raise exception 'watchlist_auth_required'; end if;
  if p_history_range not in ('1m', '6m', 'ytd', '1y', '5y', 'all') then
    raise exception 'invalid_watchlist_history_range';
  end if;
  select coalesce(state.version, 0) into current_version
  from (select auth.uid() as user_id) owner
  left join public.watchlist_sync_state state on state.user_id = owner.user_id;
  select snapshot.composition into result
  from public.watchlist_composition_snapshots snapshot
  where snapshot.user_id = auth.uid()
    and snapshot.history_range = p_history_range
    and snapshot.watchlist_version = current_version;
  return result;
end;
$$;

revoke all on function public.get_watchlist_composition_metrics(text) from public;
grant execute on function public.get_watchlist_composition_metrics(text) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_composition_snapshots')
on conflict (marker) do nothing;
