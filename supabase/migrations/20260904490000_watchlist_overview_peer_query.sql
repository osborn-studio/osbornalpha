-- Add complete-dataset peer sorting and filtering to the existing Overview RPC.
-- Peer values stay centralized in get_watchlist_peer_metrics().
create or replace function public.get_watchlist_overview_query(
  p_limit integer default 50,
  p_sort text default 'position',
  p_direction text default 'asc',
  p_query text default null,
  p_group_id uuid default null,
  p_market text default null,
  p_quote_status text default null,
  p_decision_status text default null,
  p_tag text default null,
  p_history_range text default '1y',
  p_metric text default null,
  p_metric_min numeric default null,
  p_metric_max numeric default null,
  p_cursor jsonb default null,
  p_fingerprint text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  page_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  sort_key text := coalesce(p_sort, 'position');
  sort_direction text := coalesce(p_direction, 'asc');
  metric_key text := nullif(trim(coalesce(p_metric, '')), '');
begin
  if auth.uid() is null then raise exception 'watchlist_auth_required'; end if;
  if sort_key not in (
    'position', 'ticker', 'name', 'group', 'price', 'change', 'open',
    'prevClose', 'dayRange', 'volume', 'amount', 'marketCap', 'pe', 'pb',
    'turnover', 'volumeRatio', 'amplitude', 'dayPosition', 'periodReturn', 'oneYearReturn', 'volatility',
    'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram',
    'bollingerPosition', 'atr14', 'excessReturn', 'beta', 'volumeZScore20',
    'relativeStrengthRank', 'pePercentile', 'pbPercentile', 'liquidityPercentile',
    'averageTradedAmount20', 'marketCapShare',
    'research', 'decision', 'freshness'
  ) then raise exception 'invalid_watchlist_sort'; end if;
  if sort_direction not in ('asc', 'desc') then raise exception 'invalid_watchlist_direction'; end if;
  if p_market is not null and p_market not in ('A', 'HK', 'US', 'JP', 'KR', 'TW') then
    raise exception 'invalid_watchlist_market';
  end if;
  if p_market is null and sort_key in (
    'price', 'open', 'prevClose', 'amount', 'marketCap',
    'macdHistogram', 'averageTradedAmount20'
  ) then raise exception 'watchlist_single_market_required'; end if;
  if p_quote_status is not null and p_quote_status not in ('live', 'delayed', 'stale', 'unavailable') then
    raise exception 'invalid_watchlist_quote_status';
  end if;
  if p_decision_status is not null and p_decision_status not in (
    'inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated'
  ) then raise exception 'invalid_watchlist_decision_status'; end if;
  if p_history_range not in ('1m', '6m', 'ytd', '1y', '5y', 'all') then
    raise exception 'invalid_watchlist_history_range';
  end if;
  if metric_key is not null and metric_key not in (
    'price', 'change', 'marketCap', 'pe', 'pb', 'turnover', 'volumeRatio',
    'amplitude', 'periodReturn', 'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition',
    'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'excessReturn',
    'beta', 'volumeZScore20', 'relativeStrengthRank', 'pePercentile',
    'pbPercentile', 'liquidityPercentile', 'averageTradedAmount20',
    'marketCapShare', 'research'
  ) then raise exception 'invalid_watchlist_metric'; end if;
  if metric_key is null and (p_metric_min is not null or p_metric_max is not null) then
    raise exception 'watchlist_metric_required';
  end if;
  if p_market is null and metric_key in (
    'price', 'marketCap', 'macdHistogram', 'averageTradedAmount20'
  ) then raise exception 'watchlist_single_market_required'; end if;
  if p_metric_min is not null and p_metric_max is not null and p_metric_min > p_metric_max then
    raise exception 'invalid_watchlist_metric_range';
  end if;
  if p_cursor is not null and coalesce(p_cursor ->> 'fingerprint', '') <> coalesce(p_fingerprint, '') then
    raise exception 'watchlist_cursor_fingerprint_mismatch';
  end if;

  return (
    with peer as materialized (
      select * from public.get_watchlist_peer_metrics(p_history_range)
    ),
    source as materialized (
      select
        wl.sort_order as group_sort,
        wi.sort_order as item_sort,
        wi.id as item_id,
        jsonb_build_object(
          'id', wl.id,
          'name', wl.name,
          'description', wl.description,
          'sort_order', wl.sort_order
        ) as group_value,
        jsonb_build_object(
          'id', wi.id,
          'ticker', wi.ticker,
          'conviction', wi.conviction,
          'notes', wi.notes,
          'sort_order', wi.sort_order,
          'added_at', wi.added_at,
          'thesis', wi.thesis,
          'target_price', wi.target_price,
          'invalidation_conditions', wi.invalidation_conditions,
          'confidence', wi.confidence,
          'review_at', wi.review_at,
          'tags', wi.tags,
          'status', wi.status,
          'decision_version', wi.decision_version,
          'updated_at', wi.updated_at
        ) as item_value,
        lower(wi.ticker) as ticker_sort,
        lower(coalesce(stock.name, wi.ticker)) as name_sort,
        lower(wl.name) as group_name_sort,
        wi.status::text as decision_sort,
        wi.updated_at as item_updated_at,
        coalesce(nullif(trim(stock.currency), ''), peer.currency) as snapshot_currency,
        quote.observed_at as quote_as_of,
        metric.observed_at as metric_as_of,
        peer.as_of as peer_as_of,
        research.as_of as research_as_of,
        case
          when quote.ticker is null or coalesce(quote.price, 0) <= 0 then 'unavailable'
          when quote.valid_until <= now() then 'stale'
          when coalesce(quote.quote ->> 'delayed', 'false') = 'true' then 'delayed'
          else 'live'
        end as quote_status,
        jsonb_build_object(
          'position', (wl.sort_order::numeric * 1000000) + wi.sort_order,
          'price', quote.price,
          'change', quote.change_pct,
          'open', quote.open_price,
          'prevClose', quote.previous_close,
          'dayRange', case
            when quote.high_price >= quote.low_price
              then ((quote.high_price - quote.low_price) / nullif(coalesce(quote.previous_close, quote.price), 0)) * 100
            else null
          end,
          'volume', quote.volume,
          'amount', quote.amount,
          'marketCap', quote.market_cap,
          'pe', quote.pe_ttm,
          'pb', quote.pb,
          'turnover', quote.turnover,
          'volumeRatio', quote.volume_ratio,
          'amplitude', quote.amplitude,
          'dayPosition', case
            when quote.high_price > quote.low_price and quote.price > 0
              then least(100, greatest(0, ((quote.price - quote.low_price) / nullif(quote.high_price - quote.low_price, 0)) * 100))
            else null
          end,
          'periodReturn', metric.period_return_pct,
          'oneYearReturn', metric.period_return_pct,
          'volatility', metric.annualized_volatility_pct,
          'maxDrawdown', metric.max_drawdown_pct,
          'rangePosition', (metric.metrics ->> 'rangePositionPct')::numeric,
          'rsi14', metric.rsi14,
          'macdHistogram', metric.macd_histogram,
          'bollingerPosition', metric.bollinger_position_pct,
          'atr14', metric.atr14_pct,
          'excessReturn', metric.excess_return_pct,
          'beta', metric.beta,
          'volumeZScore20', metric.volume_zscore_20,
          'relativeStrengthRank', case when peer.market_relative_strength_sample_size >= 5
            then peer.market_relative_strength_percentile else null end,
          'pePercentile', case when peer.industry_pe_sample_size >= 5
            then peer.industry_pe_percentile else null end,
          'pbPercentile', case when peer.industry_pb_sample_size >= 5
            then peer.industry_pb_percentile else null end,
          'liquidityPercentile', case when peer.market_liquidity_sample_size >= 5
            then peer.market_liquidity_percentile else null end,
          'averageTradedAmount20', peer.average_traded_amount_20,
          'marketCapShare', peer.watchlist_market_cap_share_pct,
          'research', research.recent_news_count::numeric,
          'freshness', extract(epoch from coalesce(quote.observed_at, metric.observed_at))
        ) as numeric_values
      from public.watchlist_items wi
      join public.watchlists wl on wl.id = wi.watchlist_id and wl.user_id = auth.uid()
      left join public.stocks_universe stock on stock.ticker = wi.ticker
      left join public.market_quote_snapshots quote
        on quote.ticker = wi.ticker
        and quote.stale_until > now()
      left join public.watchlist_metric_snapshots metric
        on metric.ticker = wi.ticker
        and metric.history_range = p_history_range
        and metric.benchmark_ticker = public.watchlist_default_benchmark(stock.market::text)
      left join peer on peer.ticker = wi.ticker
      left join lateral (
        select
          count(distinct coalesce(nullif(artifact.event_cluster_id, ''), artifact.source_key)) filter (
          where artifact.published_at >= now() - interval '14 days'
          ) as recent_news_count,
          max(artifact.published_at) as as_of
        from public.user_research_artifact_links research_link
        join public.shared_research_artifacts artifact on artifact.id = research_link.artifact_id
        where research_link.user_id = auth.uid()
          and artifact.kind = 'news'
          and artifact.ticker = wi.ticker
      ) research on true
      where wi.user_id = auth.uid()
        and (p_group_id is null or wl.id = p_group_id)
        and (p_market is null or stock.market::text = p_market)
        and (p_decision_status is null or wi.status::text = p_decision_status)
        and (p_tag is null or exists (
          select 1 from unnest(wi.tags) as item_tag where lower(item_tag) = lower(p_tag)
        ))
        and (
          nullif(trim(coalesce(p_query, '')), '') is null
          or position(lower(trim(p_query)) in lower(concat_ws(' ', wi.ticker, stock.name, stock.name_en, wl.name))) > 0
        )
    ),
    base as materialized (
      select
        source.*,
        (source.numeric_values ->> sort_key)::numeric as sort_num,
        case when metric_key is null then null else (source.numeric_values ->> metric_key)::numeric end as metric_num,
        case
          when sort_key in ('price', 'change', 'open', 'prevClose', 'dayRange', 'volume', 'amount', 'marketCap', 'pe', 'pb', 'turnover', 'volumeRatio', 'amplitude', 'dayPosition', 'freshness') then source.quote_as_of
          when sort_key in ('periodReturn', 'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'excessReturn', 'beta', 'volumeZScore20') then source.metric_as_of
          when sort_key in ('relativeStrengthRank', 'pePercentile', 'pbPercentile', 'liquidityPercentile', 'averageTradedAmount20', 'marketCapShare') then source.peer_as_of
          when sort_key = 'research' then source.research_as_of
          when sort_key = 'decision' then source.item_updated_at
          else null
        end as sort_as_of,
        case
          when metric_key in ('price', 'change', 'marketCap', 'pe', 'pb', 'turnover', 'volumeRatio', 'amplitude') then source.quote_as_of
          when metric_key in ('periodReturn', 'oneYearReturn', 'volatility', 'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'excessReturn', 'beta', 'volumeZScore20') then source.metric_as_of
          when metric_key in ('relativeStrengthRank', 'pePercentile', 'pbPercentile', 'liquidityPercentile', 'averageTradedAmount20', 'marketCapShare') then source.peer_as_of
          when metric_key = 'research' then source.research_as_of
          else null
        end as metric_as_of_value,
        case sort_key
          when 'ticker' then source.ticker_sort
          when 'name' then source.name_sort
          when 'group' then source.group_name_sort
          when 'decision' then source.decision_sort
          else null
        end as sort_text
      from source
    ),
    filtered as materialized (
      select base.*,
        case when base.sort_num is null and base.sort_text is null then 1 else 0 end as null_rank
      from base
      where (p_quote_status is null or base.quote_status = p_quote_status)
        and (p_metric_min is null or base.metric_num >= p_metric_min)
        and (p_metric_max is null or base.metric_num <= p_metric_max)
    ),
    after_cursor as (
      select filtered.*
      from filtered
      where p_cursor is null
        or filtered.null_rank > coalesce((p_cursor ->> 'nullRank')::integer, 0)
        or (
          filtered.null_rank = coalesce((p_cursor ->> 'nullRank')::integer, 0)
          and (
            (filtered.null_rank = 1 and filtered.item_id > (p_cursor ->> 'itemId')::uuid)
            or (filtered.sort_num is not null and (
              (sort_direction = 'asc' and (
                filtered.sort_num > (p_cursor ->> 'sortNumber')::numeric
                or (filtered.sort_num = (p_cursor ->> 'sortNumber')::numeric and filtered.item_id > (p_cursor ->> 'itemId')::uuid)
              ))
              or (sort_direction = 'desc' and (
                filtered.sort_num < (p_cursor ->> 'sortNumber')::numeric
                or (filtered.sort_num = (p_cursor ->> 'sortNumber')::numeric and filtered.item_id > (p_cursor ->> 'itemId')::uuid)
              ))
            ))
            or (filtered.sort_text is not null and (
              (sort_direction = 'asc' and (
                filtered.sort_text > (p_cursor ->> 'sortText')
                or (filtered.sort_text = (p_cursor ->> 'sortText') and filtered.item_id > (p_cursor ->> 'itemId')::uuid)
              ))
              or (sort_direction = 'desc' and (
                filtered.sort_text < (p_cursor ->> 'sortText')
                or (filtered.sort_text = (p_cursor ->> 'sortText') and filtered.item_id > (p_cursor ->> 'itemId')::uuid)
              ))
            ))
          )
        )
    ),
    ordered as materialized (
      select after_cursor.*
      from after_cursor
      order by
        null_rank,
        case when sort_direction = 'asc' then sort_num end asc,
        case when sort_direction = 'desc' then sort_num end desc,
        case when sort_direction = 'asc' then sort_text end asc,
        case when sort_direction = 'desc' then sort_text end desc,
        item_id
      limit page_limit + 1
    ),
    page as materialized (
      select * from ordered
      order by
        null_rank,
        case when sort_direction = 'asc' then sort_num end asc,
        case when sort_direction = 'desc' then sort_num end desc,
        case when sort_direction = 'asc' then sort_text end asc,
        case when sort_direction = 'desc' then sort_text end desc,
        item_id
      limit page_limit
    ),
    cursor_row as (
      select * from page
      order by
        null_rank desc,
        case when sort_direction = 'asc' then sort_num end desc,
        case when sort_direction = 'desc' then sort_num end asc,
        case when sort_direction = 'asc' then sort_text end desc,
        case when sort_direction = 'desc' then sort_text end asc,
        item_id desc
      limit 1
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'has_more', (select count(*) > page_limit from ordered),
      'next_cursor', case when (select count(*) > page_limit from ordered) then (
        select jsonb_build_object(
          'mode', 'query',
          'fingerprint', p_fingerprint,
          'nullRank', null_rank,
          'sortNumber', sort_num,
          'sortText', sort_text,
          'itemId', item_id
        ) from cursor_row
      ) else null end,
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'group', group_value,
          'item', item_value,
          'querySnapshot', jsonb_build_object(
            'sortKey', sort_key,
            'sortNumber', sort_num,
            'sortText', sort_text,
            'sortAsOf', sort_as_of,
            'metricKey', metric_key,
            'metricNumber', metric_num,
            'metricAsOf', metric_as_of_value,
            'currency', snapshot_currency
          )
        ) order by
          null_rank,
          case when sort_direction = 'asc' then sort_num end asc,
          case when sort_direction = 'desc' then sort_num end desc,
          case when sort_direction = 'asc' then sort_text end asc,
          case when sort_direction = 'desc' then sort_text end desc,
          item_id
        ) from page
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.get_watchlist_overview_query(
  integer, text, text, text, uuid, text, text, text, text, text, text, numeric, numeric, jsonb, text
) from public;
grant execute on function public.get_watchlist_overview_query(
  integer, text, text, text, uuid, text, text, text, text, text, text, numeric, numeric, jsonb, text
) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_overview_peer_query')
on conflict (marker) do nothing;
