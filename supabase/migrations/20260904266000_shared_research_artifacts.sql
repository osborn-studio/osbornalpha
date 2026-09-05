-- Store market-wide research once and keep only user access links. The legacy
-- per-user tables remain available for rollback, but all new reads and writes
-- use this shared artifact layer.
create table if not exists public.shared_research_artifacts (
  id uuid primary key,
  kind text not null check (kind in ('news', 'report')),
  ticker text not null,
  source_key text not null,
  title text not null,
  source text,
  url text,
  published_at timestamptz,
  fetched_at timestamptz not null,
  event_cluster_id text not null,
  quality_score numeric not null check (quality_score between 0 and 1),
  content_hash text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  unique (kind, ticker, source_key)
);

create table if not exists public.user_research_artifact_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.shared_research_artifacts(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (user_id, artifact_id)
);

create index if not exists shared_research_artifacts_ticker_kind_fetched_idx
  on public.shared_research_artifacts (ticker, kind, fetched_at desc);
create index if not exists user_research_artifact_links_artifact_idx
  on public.user_research_artifact_links (artifact_id, user_id);

alter table public.shared_research_artifacts enable row level security;
alter table public.user_research_artifact_links enable row level security;
drop policy if exists "shared research linked read" on public.shared_research_artifacts;
create policy "shared research linked read" on public.shared_research_artifacts
  for select using (exists (
    select 1 from public.user_research_artifact_links link
    where link.artifact_id = id and link.user_id = auth.uid()
  ));
drop policy if exists "research links self read" on public.user_research_artifact_links;
create policy "research links self read" on public.user_research_artifact_links
  for select using (user_id = auth.uid());

revoke all on table public.shared_research_artifacts from anon, authenticated;
revoke all on table public.user_research_artifact_links from anon, authenticated;
grant select on table public.shared_research_artifacts to authenticated;
grant select on table public.user_research_artifact_links to authenticated;
grant all on table public.shared_research_artifacts to service_role;
grant all on table public.user_research_artifact_links to service_role;

-- Preserve already collected research while collapsing duplicate user copies.
insert into public.shared_research_artifacts (
  id, kind, ticker, source_key, title, source, url, published_at, fetched_at,
  event_cluster_id, quality_score, content_hash, payload
)
select distinct on (n.ticker, n.source_key)
  n.id, 'news', n.ticker, n.source_key, n.title, n.source, n.url,
  n.published_at, coalesce(n.fetched_at, now()),
  n.event_cluster_id, coalesce(n.quality_score, n.trust_score, 0),
  md5(concat_ws('|', n.ticker, n.source_key, n.title, n.url, n.fetched_at::text)),
  jsonb_build_object(
    'snippet', n.snippet,
    'sentiment', n.sentiment,
    'sentiment_confidence', 0,
    'sentiment_language', 'unknown',
    'sentiment_aspects', '{}'::jsonb,
    'trust_score', n.trust_score,
    'relevance_score', n.relevance_score,
    'quality_flags', to_jsonb(coalesce(n.quality_flags, '{}'::text[])),
    'corroboration_count', n.corroboration_count,
    'corroborating_sources', n.corroborating_sources,
    'source_type', n.source_type
  )
from public.news_items n
order by n.ticker, n.source_key, n.fetched_at desc
on conflict (kind, ticker, source_key) do nothing;

insert into public.shared_research_artifacts (
  id, kind, ticker, source_key, title, source, url, published_at, fetched_at,
  event_cluster_id, quality_score, content_hash, payload
)
select distinct on (r.ticker, r.source_key)
  r.id, 'report', r.ticker, r.source_key, coalesce(r.title, r.ticker || ' research update'),
  r.source, r.pdf_url, r.published_at::timestamptz, coalesce(r.fetched_at, now()),
  r.event_cluster_id, coalesce(r.quality_score, r.trust_score, 0),
  md5(concat_ws('|', r.ticker, r.source_key, r.title, r.pdf_url, r.fetched_at::text)),
  jsonb_build_object(
    'broker', r.broker,
    'rating', r.rating,
    'target_price', r.target_price,
    'target_change_pct', r.target_change_pct,
    'ai_summary', r.ai_summary,
    'trust_score', r.trust_score,
    'relevance_score', r.relevance_score,
    'quality_flags', to_jsonb(coalesce(r.quality_flags, '{}'::text[])),
    'corroboration_count', r.corroboration_count,
    'corroborating_sources', r.corroborating_sources
  )
from public.broker_reports r
order by r.ticker, r.source_key, r.fetched_at desc
on conflict (kind, ticker, source_key) do nothing;

insert into public.user_research_artifact_links (user_id, artifact_id, linked_at)
select distinct n.user_id, artifact.id, coalesce(n.fetched_at, now())
from public.news_items n
join public.shared_research_artifacts artifact
  on artifact.kind = 'news' and artifact.ticker = n.ticker and artifact.source_key = n.source_key
on conflict (user_id, artifact_id) do update set linked_at = greatest(excluded.linked_at, user_research_artifact_links.linked_at);

insert into public.user_research_artifact_links (user_id, artifact_id, linked_at)
select distinct r.user_id, artifact.id, coalesce(r.fetched_at, now())
from public.broker_reports r
join public.shared_research_artifacts artifact
  on artifact.kind = 'report' and artifact.ticker = r.ticker and artifact.source_key = r.source_key
on conflict (user_id, artifact_id) do update set linked_at = greatest(excluded.linked_at, user_research_artifact_links.linked_at);

create or replace function public.persist_shared_research_artifacts(
  p_user_id uuid,
  p_ticker text,
  p_kind text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'shared_research_service_role_required';
  end if;
  if p_user_id is null or nullif(upper(trim(p_ticker)), '') is null
    or p_kind not in ('news', 'report')
    or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'invalid_shared_research_artifacts';
  end if;
  if not exists (
    select 1 from public.watchlist_items item
    where item.user_id = p_user_id and item.ticker = upper(trim(p_ticker))
  ) then
    raise exception 'watchlist_item_not_found';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row(
      id uuid, kind text, ticker text, source_key text, title text, source text,
      url text, published_at timestamptz, fetched_at timestamptz,
      event_cluster_id text, quality_score numeric, content_hash text, payload jsonb
    )
    where row.id is null or row.kind <> p_kind or row.ticker <> upper(trim(p_ticker))
      or nullif(trim(row.source_key), '') is null or nullif(trim(row.title), '') is null
      or row.fetched_at is null or nullif(trim(row.event_cluster_id), '') is null
      or row.quality_score not between 0 and 1 or nullif(trim(row.content_hash), '') is null
      or jsonb_typeof(row.payload) <> 'object'
  ) then
    raise exception 'invalid_shared_research_artifact_row';
  end if;

  insert into public.shared_research_artifacts (
    id, kind, ticker, source_key, title, source, url, published_at, fetched_at,
    event_cluster_id, quality_score, content_hash, payload, updated_at
  )
  select row.id, row.kind, row.ticker, row.source_key, row.title, row.source,
    row.url, row.published_at, row.fetched_at, row.event_cluster_id,
    row.quality_score, row.content_hash, row.payload, now()
  from jsonb_to_recordset(p_rows) as row(
    id uuid, kind text, ticker text, source_key text, title text, source text,
    url text, published_at timestamptz, fetched_at timestamptz,
    event_cluster_id text, quality_score numeric, content_hash text, payload jsonb
  )
  on conflict (kind, ticker, source_key) do update set
    title = excluded.title,
    source = excluded.source,
    url = excluded.url,
    published_at = excluded.published_at,
    fetched_at = greatest(shared_research_artifacts.fetched_at, excluded.fetched_at),
    event_cluster_id = excluded.event_cluster_id,
    quality_score = excluded.quality_score,
    content_hash = excluded.content_hash,
    payload = excluded.payload,
    updated_at = now()
  where excluded.fetched_at >= shared_research_artifacts.fetched_at;

  insert into public.user_research_artifact_links (user_id, artifact_id, linked_at)
  select p_user_id, artifact.id, now()
  from jsonb_to_recordset(p_rows) as row(kind text, ticker text, source_key text)
  join public.shared_research_artifacts artifact
    on artifact.kind = row.kind and artifact.ticker = row.ticker and artifact.source_key = row.source_key
  on conflict (user_id, artifact_id) do update set linked_at = excluded.linked_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.persist_shared_research_artifacts(uuid, text, text, jsonb) from public;
grant execute on function public.persist_shared_research_artifacts(uuid, text, text, jsonb) to service_role;

create or replace function public.load_watchlist_research_artifacts(
  p_user_id uuid,
  p_ticker text,
  p_limit integer default 50
)
returns setof public.shared_research_artifacts
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null or (auth.uid() is distinct from p_user_id and coalesce(auth.role(), '') <> 'service_role') then
    raise exception 'watchlist_auth_required';
  end if;
  return query
    with ranked as (
      select artifact.*, row_number() over (
        partition by artifact.kind order by artifact.fetched_at desc, artifact.id
      ) as rank
      from public.user_research_artifact_links link
      join public.shared_research_artifacts artifact on artifact.id = link.artifact_id
      where link.user_id = p_user_id and artifact.ticker = upper(trim(p_ticker))
    )
    select ranked.id, ranked.kind, ranked.ticker, ranked.source_key, ranked.title,
      ranked.source, ranked.url, ranked.published_at, ranked.fetched_at,
      ranked.event_cluster_id, ranked.quality_score, ranked.content_hash,
      ranked.payload, ranked.updated_at
    from ranked
    where ranked.rank <= least(greatest(coalesce(p_limit, 50), 1), 100)
    order by ranked.fetched_at desc, ranked.id;
end;
$$;

revoke all on function public.load_watchlist_research_artifacts(uuid, text, integer) from public;
grant execute on function public.load_watchlist_research_artifacts(uuid, text, integer) to authenticated, service_role;

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
security definer
set search_path = public
as $$
  with requested as (
    select distinct upper(trim(value)) as requested_ticker
    from unnest(coalesce(p_tickers, '{}'::text[])) as value
    where trim(value) <> ''
    limit 50
  ),
  linked_artifacts as (
    select artifact.*
    from public.user_research_artifact_links link
    join public.shared_research_artifacts artifact on artifact.id = link.artifact_id
    join requested r on r.requested_ticker = artifact.ticker
    where link.user_id = auth.uid()
  ),
  news as (
    select n.ticker,
      count(*) filter (where n.published_at >= now() - interval '14 days') as recent_news_count,
      max(n.published_at) as latest_news_at,
      count(*) filter (
        where n.published_at >= now() - interval '14 days' and n.payload ->> 'sentiment' is not null
      ) as sentiment_sample_size,
      coalesce(
        sum((n.payload ->> 'sentiment')::numeric * greatest(coalesce(nullif(n.quality_score, 0), 0.25), 0.1)) filter (
          where n.published_at >= now() - interval '14 days' and n.payload ->> 'sentiment' is not null
        ) / nullif(sum(greatest(coalesce(nullif(n.quality_score, 0), 0.25), 0.1)) filter (
          where n.published_at >= now() - interval '14 days' and n.payload ->> 'sentiment' is not null
        ), 0),
        null
      ) as average_sentiment,
      coalesce(
        count(*) filter (
          where n.published_at >= now() - interval '14 days' and n.payload ->> 'sentiment' is not null
        )::numeric / nullif(count(*) filter (where n.published_at >= now() - interval '14 days'), 0),
        0
      ) as sentiment_coverage_ratio
    from linked_artifacts n
    where n.kind = 'news'
    group by n.ticker
  ),
  reports as (
    select r.ticker, max(r.published_at) as latest_report_at
    from linked_artifacts r where r.kind = 'report' group by r.ticker
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
    report.latest_report_at,
    coalesce(p.bullish_count, 0), coalesce(p.neutral_count, 0),
    coalesce(p.bearish_count, 0), p.latest_perspective_at
  from requested r
  left join news n on n.ticker = r.requested_ticker
  left join reports report on report.ticker = r.requested_ticker
  left join perspective_totals p on p.ticker = r.requested_ticker;
$$;

revoke all on function public.watchlist_research_summaries(text[]) from public;
grant execute on function public.watchlist_research_summaries(text[]) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('shared_research_artifacts')
on conflict (marker) do nothing;
