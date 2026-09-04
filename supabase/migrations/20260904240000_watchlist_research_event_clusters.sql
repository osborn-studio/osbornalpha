-- Preserve cross-source corroboration while counting repeated coverage as one event.
alter table public.external_evidence
  add column if not exists event_cluster_id text,
  add column if not exists corroboration_count integer not null default 1,
  add column if not exists corroborating_sources jsonb not null default '[]'::jsonb;

alter table public.news_items
  add column if not exists event_cluster_id text,
  add column if not exists corroboration_count integer not null default 1,
  add column if not exists corroborating_sources jsonb not null default '[]'::jsonb;

alter table public.broker_reports
  add column if not exists event_cluster_id text,
  add column if not exists corroboration_count integer not null default 1,
  add column if not exists corroborating_sources jsonb not null default '[]'::jsonb;

update public.external_evidence
set event_cluster_id = citation_id
where event_cluster_id is null or event_cluster_id = '';

update public.news_items
set event_cluster_id = source_key
where event_cluster_id is null or event_cluster_id = '';

update public.broker_reports
set event_cluster_id = source_key
where event_cluster_id is null or event_cluster_id = '';

alter table public.external_evidence alter column event_cluster_id set not null;
alter table public.news_items alter column event_cluster_id set not null;
alter table public.broker_reports alter column event_cluster_id set not null;

alter table public.external_evidence
  drop constraint if exists external_evidence_corroboration_count_check;
alter table public.external_evidence
  add constraint external_evidence_corroboration_count_check check (corroboration_count >= 1);
alter table public.news_items
  drop constraint if exists news_items_corroboration_count_check;
alter table public.news_items
  add constraint news_items_corroboration_count_check check (corroboration_count >= 1);
alter table public.broker_reports
  drop constraint if exists broker_reports_corroboration_count_check;
alter table public.broker_reports
  add constraint broker_reports_corroboration_count_check check (corroboration_count >= 1);

create index if not exists news_items_user_ticker_event_cluster_idx
  on public.news_items (user_id, ticker, event_cluster_id, published_at desc);

create or replace function public.watchlist_research_summaries(p_tickers text[])
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
      count(distinct coalesce(nullif(n.event_cluster_id, ''), n.source_key)) filter (
        where n.published_at >= now() - interval '14 days'
      ) as recent_news_count,
      max(n.published_at) as latest_news_at,
      count(*) filter (
        where n.published_at >= now() - interval '14 days' and n.sentiment is not null
      ) as sentiment_sample_size,
      coalesce(
        sum(n.sentiment * greatest(coalesce(nullif(n.quality_score, 0), 0.25), 0.1)) filter (
          where n.published_at >= now() - interval '14 days' and n.sentiment is not null
        ) / nullif(
          sum(greatest(coalesce(nullif(n.quality_score, 0), 0.25), 0.1)) filter (
            where n.published_at >= now() - interval '14 days' and n.sentiment is not null
          ), 0
        ), null
      ) as average_sentiment,
      coalesce(
        count(*) filter (
          where n.published_at >= now() - interval '14 days' and n.sentiment is not null
        )::numeric / nullif(count(*) filter (
          where n.published_at >= now() - interval '14 days'
        ), 0), 0
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
    select distinct on (p.ticker) p.ticker, p.brief_id, p.generation_id
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
    coalesce(n.recent_news_count, 0), n.latest_news_at, n.average_sentiment,
    coalesce(n.sentiment_sample_size, 0), coalesce(n.sentiment_coverage_ratio, 0),
    br.latest_report_at, coalesce(p.bullish_count, 0), coalesce(p.neutral_count, 0),
    coalesce(p.bearish_count, 0), p.latest_perspective_at
  from requested r
  left join news n on n.ticker = r.requested_ticker
  left join reports br on br.ticker = r.requested_ticker
  left join perspective_totals p on p.ticker = r.requested_ticker;
$$;

revoke all on function public.watchlist_research_summaries(text[]) from public;
grant execute on function public.watchlist_research_summaries(text[]) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_research_event_clusters')
on conflict (marker) do nothing;
