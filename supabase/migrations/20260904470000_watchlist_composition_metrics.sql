-- Watchlist composition describes list makeup, never portfolio exposure.
-- Pairwise correlations are limited to comparable market/currency calendars
-- and require at least 20 aligned return observations.
create or replace function public.get_watchlist_composition_metrics(
  p_history_range text default '1y'
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
  if auth.uid() is null then raise exception 'watchlist_auth_required'; end if;
  if p_history_range not in ('1m', '6m', 'ytd', '1y', '5y', 'all') then
    raise exception 'invalid_watchlist_history_range';
  end if;

  with watched as materialized (
    select distinct
      item.ticker,
      stock.market::text as market,
      coalesce(nullif(trim(stock.currency), ''), 'Unknown') as currency,
      coalesce(nullif(trim(stock.industry), ''), 'Unclassified') as industry
    from public.watchlist_items item
    join public.stocks_universe stock on stock.ticker = item.ticker
    where item.user_id = auth.uid()
  ),
  market_groups as (
    select market as key, count(*)::integer as count
    from watched group by market
  ),
  industry_groups as (
    select industry as key, count(*)::integer as count
    from watched group by industry
  ),
  currency_groups as (
    select currency as key, count(*)::integer as count
    from watched group by currency
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
    select
      left_ticker,
      right_ticker,
      corr(left_return, right_return) as correlation,
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
        'leftTicker', left_ticker,
        'rightTicker', right_ticker,
        'correlation', correlation,
        'observations', observations
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

revoke all on function public.get_watchlist_composition_metrics(text) from public;
grant execute on function public.get_watchlist_composition_metrics(text) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_composition_metrics')
on conflict (marker) do nothing;
