-- Peer analytics uses complete shared snapshot pools while returning only the
-- authenticated user's Watchlist tickers. Percentiles are hidden by the API
-- when fewer than five valid peers exist.
alter table public.watchlist_metric_snapshots
  add column if not exists average_traded_amount_20 numeric;

create index if not exists watchlist_metric_snapshots_liquidity_idx
  on public.watchlist_metric_snapshots (market, history_range, average_traded_amount_20, ticker);

create or replace function public.get_watchlist_peer_metrics_for_user(
  p_user_id uuid,
  p_history_range text default '1y'
)
returns table (
  ticker text,
  market text,
  currency text,
  industry text,
  market_relative_strength_percentile numeric,
  market_relative_strength_sample_size bigint,
  industry_pe_percentile numeric,
  industry_pe_sample_size bigint,
  industry_pb_percentile numeric,
  industry_pb_sample_size bigint,
  market_liquidity_percentile numeric,
  market_liquidity_sample_size bigint,
  average_traded_amount_20 numeric,
  watchlist_market_cap_share_pct numeric,
  watchlist_market_cap_sample_size bigint,
  as_of timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null then raise exception 'watchlist_user_required'; end if;
  if p_history_range not in ('1m', '6m', 'ytd', '1y', '5y', 'all') then
    raise exception 'invalid_watchlist_history_range';
  end if;

  return query
  with universe as materialized (
    select
      stock.ticker,
      stock.market::text as market,
      nullif(trim(stock.currency), '') as currency,
      nullif(trim(stock.industry), '') as industry,
      quote.market_cap,
      quote.pe_ttm,
      quote.pb,
      quote.observed_at as quote_observed_at,
      metric.period_return_pct,
      metric.average_traded_amount_20,
      metric.observed_at as metric_observed_at
    from public.stocks_universe stock
    left join public.market_quote_snapshots quote
      on quote.ticker = stock.ticker
      and quote.valid_until > now()
    left join public.watchlist_metric_snapshots metric
      on metric.ticker = stock.ticker
      and metric.history_range = p_history_range
      and metric.benchmark_ticker = public.watchlist_default_benchmark(stock.market::text)
      and metric.valid_until > now()
    where stock.is_active = true
  ),
  relative_rank as (
    select
      u.ticker,
      cume_dist() over (partition by u.market order by u.period_return_pct) * 100 as percentile,
      count(*) over (partition by u.market) as sample_size
    from universe u
    where u.period_return_pct is not null
  ),
  pe_rank as (
    select
      u.ticker,
      cume_dist() over (partition by u.market, u.industry order by u.pe_ttm) * 100 as percentile,
      count(*) over (partition by u.market, u.industry) as sample_size
    from universe u
    where u.industry is not null and u.pe_ttm > 0
  ),
  pb_rank as (
    select
      u.ticker,
      cume_dist() over (partition by u.market, u.industry order by u.pb) * 100 as percentile,
      count(*) over (partition by u.market, u.industry) as sample_size
    from universe u
    where u.industry is not null and u.pb > 0
  ),
  liquidity_rank as (
    select
      u.ticker,
      cume_dist() over (partition by u.market order by u.average_traded_amount_20) * 100 as percentile,
      count(*) over (partition by u.market) as sample_size
    from universe u
    where u.average_traded_amount_20 is not null and u.average_traded_amount_20 >= 0
  ),
  watched as materialized (
    select distinct u.*
    from public.watchlist_items item
    join universe u on u.ticker = item.ticker
    where item.user_id = p_user_id
  ),
  composition as (
    select
      watched.ticker,
      case
        when watched.market_cap > 0 then watched.market_cap
          / nullif(sum(watched.market_cap) filter (where watched.market_cap > 0)
            over (partition by watched.market, watched.currency), 0) * 100
        else null
      end as market_cap_share_pct,
      count(*) filter (where watched.market_cap > 0)
        over (partition by watched.market, watched.currency) as market_cap_sample_size
    from watched
  )
  select
    watched.ticker,
    watched.market,
    watched.currency,
    watched.industry,
    relative_rank.percentile,
    coalesce(relative_rank.sample_size, 0),
    pe_rank.percentile,
    coalesce(pe_rank.sample_size, 0),
    pb_rank.percentile,
    coalesce(pb_rank.sample_size, 0),
    liquidity_rank.percentile,
    coalesce(liquidity_rank.sample_size, 0),
    watched.average_traded_amount_20,
    composition.market_cap_share_pct,
    coalesce(composition.market_cap_sample_size, 0),
    greatest(watched.quote_observed_at, watched.metric_observed_at)
  from watched
  left join relative_rank on relative_rank.ticker = watched.ticker
  left join pe_rank on pe_rank.ticker = watched.ticker
  left join pb_rank on pb_rank.ticker = watched.ticker
  left join liquidity_rank on liquidity_rank.ticker = watched.ticker
  left join composition on composition.ticker = watched.ticker
  order by watched.ticker;
end;
$$;

revoke all on function public.get_watchlist_peer_metrics_for_user(uuid, text) from public;
grant execute on function public.get_watchlist_peer_metrics_for_user(uuid, text) to service_role;

create or replace function public.get_watchlist_peer_metrics(
  p_history_range text default '1y'
)
returns table (
  ticker text,
  market text,
  currency text,
  industry text,
  market_relative_strength_percentile numeric,
  market_relative_strength_sample_size bigint,
  industry_pe_percentile numeric,
  industry_pe_sample_size bigint,
  industry_pb_percentile numeric,
  industry_pb_sample_size bigint,
  market_liquidity_percentile numeric,
  market_liquidity_sample_size bigint,
  average_traded_amount_20 numeric,
  watchlist_market_cap_share_pct numeric,
  watchlist_market_cap_sample_size bigint,
  as_of timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'watchlist_auth_required'; end if;
  return query select * from public.get_watchlist_peer_metrics_for_user(auth.uid(), p_history_range);
end;
$$;

revoke all on function public.get_watchlist_peer_metrics(text) from public;
grant execute on function public.get_watchlist_peer_metrics(text) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_peer_metrics')
on conflict (marker) do nothing;
