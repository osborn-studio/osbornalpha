-- Make Watchlist headline sentiment explicit about sample size and source
-- quality. The function signature is kept stable for existing clients.
drop function if exists public.watchlist_research_summaries(text[]);

create function public.watchlist_research_summaries(p_tickers text[])
returns table (
  ticker text,
  recent_news_count bigint,
  latest_news_at timestamptz,
  average_sentiment numeric,
  sentiment_sample_size bigint,
  sentiment_coverage_ratio numeric,
  latest_report_at timestamptz,
  bullish_count bigint,
  neutral_count bigint,
  bearish_count bigint,
  latest_perspective_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested as (
    select distinct upper(trim(value)) as requested_ticker
    from unnest(coalesce(p_tickers, '{}'::text[])) as value
    where trim(value) <> ''
    limit 50
  ),
  news as (
    select n.ticker,
      count(*) filter (where n.published_at >= now() - interval '14 days') as recent_news_count,
      max(n.published_at) as latest_news_at,
      count(*) filter (
        where n.published_at >= now() - interval '14 days'
          and n.sentiment is not null
      ) as sentiment_sample_size,
      coalesce(
        sum(
          n.sentiment * greatest(coalesce(nullif(n.quality_score, 0), 0.25), 0.1)
        ) filter (
          where n.published_at >= now() - interval '14 days'
            and n.sentiment is not null
        )
        / nullif(
          sum(greatest(coalesce(nullif(n.quality_score, 0), 0.25), 0.1)) filter (
            where n.published_at >= now() - interval '14 days'
              and n.sentiment is not null
          ),
          0
        ),
        null
      ) as average_sentiment,
      coalesce(
        count(*) filter (
          where n.published_at >= now() - interval '14 days'
            and n.sentiment is not null
        )::numeric
        / nullif(count(*) filter (where n.published_at >= now() - interval '14 days'), 0),
        0
      ) as sentiment_coverage_ratio
    from public.news_items n
    join requested r on r.requested_ticker = n.ticker
    where n.user_id = auth.uid()
    group by n.ticker
  ),
  reports as (
    select br.ticker, max(br.published_at)::timestamptz as latest_report_at
    from public.broker_reports br
    join requested r on r.requested_ticker = br.ticker
    where br.user_id = auth.uid()
    group by br.ticker
  ),
  latest_perspective_origin as (
    select distinct on (p.ticker)
      p.ticker, p.brief_id, p.generation_id
    from public.perspectives p
    join requested r on r.requested_ticker = p.ticker
    where p.user_id = auth.uid()
    order by p.ticker, p.created_at desc
  ),
  perspective_totals as (
    select p.ticker,
      count(*) filter (where p.stance = 'bullish') as bullish_count,
      count(*) filter (where p.stance = 'neutral') as neutral_count,
      count(*) filter (where p.stance = 'bearish') as bearish_count,
      max(p.created_at) as latest_perspective_at
    from public.perspectives p
    join latest_perspective_origin latest
      on latest.ticker = p.ticker
      and p.brief_id is not distinct from latest.brief_id
      and p.generation_id is not distinct from latest.generation_id
    where p.user_id = auth.uid()
    group by p.ticker
  )
  select r.requested_ticker,
    coalesce(n.recent_news_count, 0),
    n.latest_news_at,
    n.average_sentiment,
    coalesce(n.sentiment_sample_size, 0),
    coalesce(n.sentiment_coverage_ratio, 0),
    br.latest_report_at,
    coalesce(p.bullish_count, 0),
    coalesce(p.neutral_count, 0),
    coalesce(p.bearish_count, 0),
    p.latest_perspective_at
  from requested r
  left join news n on n.ticker = r.requested_ticker
  left join reports br on br.ticker = r.requested_ticker
  left join perspective_totals p on p.ticker = r.requested_ticker;
$$;

revoke all on function public.watchlist_research_summaries(text[]) from public;
grant execute on function public.watchlist_research_summaries(text[]) to authenticated;
