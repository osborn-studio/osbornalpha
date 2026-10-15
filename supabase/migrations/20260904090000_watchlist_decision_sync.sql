-- Watchlist decision metadata, user alerts, and conflict-safe atomic snapshot sync.

alter table public.watchlist_items
  add column if not exists thesis text,
  add column if not exists target_price numeric,
  add column if not exists invalidation_conditions text,
  add column if not exists confidence smallint check (confidence between 0 and 100),
  add column if not exists review_at timestamptz,
  add column if not exists tags text[] not null default '{}',
  add column if not exists status text not null default 'watching'
    check (status in ('inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated')),
  add column if not exists decision_version integer not null default 0 check (decision_version >= 0),
  add column if not exists updated_at timestamptz not null default now();

-- Normalize on-demand research into the existing domain tables. External
-- evidence keeps raw provenance; these columns make summaries and alerts read
-- the same artifacts that the API returned to the user.
alter table public.news_items
  alter column published_at drop not null,
  add column if not exists source_key text,
  add column if not exists snippet text,
  add column if not exists trust_score numeric,
  add column if not exists source_type text;
update public.news_items set source_key = id::text where source_key is null;
alter table public.news_items alter column source_key set not null;
create unique index if not exists news_items_user_ticker_source_key_idx
  on public.news_items (user_id, ticker, source_key);

alter table public.broker_reports
  add column if not exists source_key text,
  add column if not exists title text,
  add column if not exists source text,
  add column if not exists trust_score numeric;
update public.broker_reports set source_key = id::text where source_key is null;
alter table public.broker_reports alter column source_key set not null;
create unique index if not exists broker_reports_user_ticker_source_key_idx
  on public.broker_reports (user_id, ticker, source_key);

alter table public.perspectives
  alter column brief_id drop not null,
  add column if not exists generation_id uuid,
  add column if not exists citations jsonb not null default '[]'::jsonb,
  add column if not exists source text,
  add column if not exists updated_at timestamptz not null default now();
alter table public.perspectives drop constraint if exists perspectives_origin_check;
alter table public.perspectives add constraint perspectives_origin_check
  check (brief_id is not null or generation_id is not null);
create unique index if not exists perspectives_generation_persona_idx
  on public.perspectives (user_id, generation_id, ticker, persona)
  where generation_id is not null;

create table if not exists public.watchlist_item_decision_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watchlist_item_id uuid not null references public.watchlist_items(id) on delete cascade,
  version integer not null check (version > 0),
  before_value jsonb not null,
  after_value jsonb not null,
  changed_at timestamptz not null default now(),
  unique (watchlist_item_id, version)
);

create index if not exists watchlist_item_decision_history_user_item_idx
  on public.watchlist_item_decision_history (user_id, watchlist_item_id, changed_at desc);
create index if not exists perspectives_user_ticker_created_idx
  on public.perspectives (user_id, ticker, created_at desc);

alter table public.watchlist_item_decision_history enable row level security;
create policy "watchlist_item_decision_history user read" on public.watchlist_item_decision_history
  for select using (auth.uid() = user_id);

create or replace function public.update_watchlist_item_decision(
  p_item_id uuid,
  p_expected_version integer,
  p_patch jsonb
)
returns setof public.watchlist_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_before public.watchlist_items%rowtype;
  v_after public.watchlist_items%rowtype;
  v_unknown_key text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'invalid_decision_patch';
  end if;
  select key into v_unknown_key
  from jsonb_object_keys(p_patch) as key
  where key not in (
    'conviction', 'notes', 'thesis', 'target_price', 'invalidation_conditions',
    'confidence', 'review_at', 'tags', 'status'
  )
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023', message = 'invalid_decision_field', detail = v_unknown_key;
  end if;

  select * into v_before
  from public.watchlist_items
  where id = p_item_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'watchlist_item_not_found';
  end if;
  if p_expected_version is null or p_expected_version <> v_before.decision_version then
    raise exception using errcode = '40001', message = 'watchlist_decision_conflict', detail = v_before.decision_version::text;
  end if;

  update public.watchlist_items wi
  set conviction = case when p_patch ? 'conviction' then (p_patch->>'conviction')::integer else wi.conviction end,
      notes = case when p_patch ? 'notes' then p_patch->>'notes' else wi.notes end,
      thesis = case when p_patch ? 'thesis' then p_patch->>'thesis' else wi.thesis end,
      target_price = case when p_patch ? 'target_price' then (p_patch->>'target_price')::numeric else wi.target_price end,
      invalidation_conditions = case when p_patch ? 'invalidation_conditions' then p_patch->>'invalidation_conditions' else wi.invalidation_conditions end,
      confidence = case when p_patch ? 'confidence' then (p_patch->>'confidence')::smallint else wi.confidence end,
      review_at = case when p_patch ? 'review_at' then (p_patch->>'review_at')::timestamptz else wi.review_at end,
      tags = case when p_patch ? 'tags' then array(select jsonb_array_elements_text(p_patch->'tags')) else wi.tags end,
      status = case when p_patch ? 'status' then p_patch->>'status' else wi.status end,
      decision_version = wi.decision_version + 1,
      updated_at = now()
  where wi.id = p_item_id and wi.user_id = v_user_id
  returning * into v_after;

  insert into public.watchlist_item_decision_history (
    user_id, watchlist_item_id, version, before_value, after_value
  ) values (
    v_user_id,
    p_item_id,
    v_after.decision_version,
    to_jsonb(v_before) - array['id', 'user_id', 'watchlist_id', 'ticker', 'added_at', 'sort_order'],
    to_jsonb(v_after) - array['id', 'user_id', 'watchlist_id', 'ticker', 'added_at', 'sort_order']
  );

  return next v_after;
end;
$$;

revoke all on function public.update_watchlist_item_decision(uuid, integer, jsonb) from public;
grant execute on function public.update_watchlist_item_decision(uuid, integer, jsonb) to authenticated;

create or replace function public.bulk_update_watchlist_item_tags(
  p_items jsonb,
  p_tag text,
  p_mode text default 'add'
)
returns setof public.watchlist_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_input record;
  v_before public.watchlist_items%rowtype;
  v_after public.watchlist_items%rowtype;
  v_tag text := trim(coalesce(p_tag, ''));
  v_next_tags text[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 200 then
    raise exception using errcode = '22023', message = 'invalid_bulk_tag_items';
  end if;
  if v_tag = '' or length(v_tag) > 32 or p_mode not in ('add', 'remove') then
    raise exception using errcode = '22023', message = 'invalid_bulk_tag_command';
  end if;

  for v_input in
    select *
    from jsonb_to_recordset(p_items) as input(id uuid, expected_version integer)
    order by id
  loop
    select * into v_before
    from public.watchlist_items wi
    where wi.id = v_input.id and wi.user_id = v_user_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'watchlist_item_not_found';
    end if;
    if v_input.expected_version is null or v_input.expected_version <> v_before.decision_version then
      raise exception using errcode = '40001', message = 'watchlist_decision_conflict', detail = v_before.decision_version::text;
    end if;

    v_next_tags := case
      when p_mode = 'add' and not (v_tag = any(v_before.tags)) then array_append(v_before.tags, v_tag)
      when p_mode = 'remove' then array_remove(v_before.tags, v_tag)
      else v_before.tags
    end;
    if v_next_tags = v_before.tags then
      continue;
    end if;

    update public.watchlist_items wi
    set tags = v_next_tags,
        decision_version = wi.decision_version + 1,
        updated_at = now()
    where wi.id = v_input.id and wi.user_id = v_user_id
    returning * into v_after;

    insert into public.watchlist_item_decision_history (
      user_id, watchlist_item_id, version, before_value, after_value
    ) values (
      v_user_id,
      v_after.id,
      v_after.decision_version,
      to_jsonb(v_before) - array['id', 'user_id', 'watchlist_id', 'ticker', 'added_at', 'sort_order'],
      to_jsonb(v_after) - array['id', 'user_id', 'watchlist_id', 'ticker', 'added_at', 'sort_order']
    );
    return next v_after;
  end loop;
end;
$$;

revoke all on function public.bulk_update_watchlist_item_tags(jsonb, text, text) from public;
grant execute on function public.bulk_update_watchlist_item_tags(jsonb, text, text) to authenticated;

create table if not exists public.watchlist_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  last_mutation_id text,
  updated_at timestamptz not null default now()
);

alter table public.watchlist_sync_state enable row level security;
create policy "watchlist_sync_state user read" on public.watchlist_sync_state
  for select using (auth.uid() = user_id);
create policy "watchlist_sync_state user insert" on public.watchlist_sync_state
  for insert with check (auth.uid() = user_id);
create policy "watchlist_sync_state user update" on public.watchlist_sync_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.watchlist_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watchlist_item_id uuid not null references public.watchlist_items(id) on delete cascade,
  alert_type text not null check (alert_type in (
    'price', 'change_pct', 'volume_ratio', 'valuation', 'event', 'rating', 'perspective'
  )),
  operator text check (operator in ('gt', 'gte', 'lt', 'lte', 'crosses_above', 'crosses_below')),
  threshold_numeric numeric,
  config jsonb not null default '{}',
  enabled boolean not null default true,
  cooldown_minutes integer not null default 1440 check (cooldown_minutes between 1 and 10080),
  last_observed_value numeric,
  last_observed_key text,
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watchlist_alerts_user_enabled_idx
  on public.watchlist_alerts (user_id, enabled);
create unique index if not exists watchlist_alerts_item_rule_idx
  on public.watchlist_alerts (
    watchlist_item_id,
    alert_type,
    coalesce(operator, ''),
    coalesce(threshold_numeric, '-999999999999999999'::numeric),
    md5(config::text)
  );

alter table public.watchlist_alerts enable row level security;
create policy "watchlist_alerts user read" on public.watchlist_alerts
  for select using (auth.uid() = user_id);
create policy "watchlist_alerts user insert" on public.watchlist_alerts
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.watchlist_items wi
      where wi.id = watchlist_item_id and wi.user_id = auth.uid()
    )
  );
create policy "watchlist_alerts user update" on public.watchlist_alerts
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.watchlist_items wi
      where wi.id = watchlist_item_id and wi.user_id = auth.uid()
    )
  );
create policy "watchlist_alerts user delete" on public.watchlist_alerts
  for delete using (auth.uid() = user_id);

create table if not exists public.watchlist_alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_id uuid not null references public.watchlist_alerts(id) on delete cascade,
  watchlist_item_id uuid not null references public.watchlist_items(id) on delete cascade,
  ticker text not null,
  alert_type text not null,
  event_key text not null,
  observed_value numeric,
  threshold_numeric numeric,
  payload jsonb not null default '{}',
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'processing', 'delivered', 'failed', 'dead_letter', 'skipped')),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_delivery_error text,
  claimed_at timestamptz,
  next_delivery_at timestamptz not null default now(),
  dead_lettered_at timestamptz,
  provider_message_id text,
  delivered_at timestamptz,
  read_at timestamptz,
  triggered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (alert_id, event_key)
);

create index if not exists watchlist_alert_events_user_triggered_idx
  on public.watchlist_alert_events (user_id, triggered_at desc);
create index if not exists watchlist_alert_events_delivery_idx
  on public.watchlist_alert_events (delivery_status, triggered_at)
  where delivery_status in ('pending', 'failed');

alter table public.watchlist_alert_events enable row level security;
create policy "watchlist_alert_events user read" on public.watchlist_alert_events
  for select using (auth.uid() = user_id);

-- Alert event delivery fields are an append-only operational record. Users may
-- only change read state or explicitly requeue their own failed delivery via
-- the narrow RPCs below; direct UPDATE would allow forged delivery outcomes.
drop policy if exists "watchlist_alert_events user update" on public.watchlist_alert_events;
revoke update on table public.watchlist_alert_events from anon, authenticated;

create or replace function public.set_watchlist_alert_event_read(
  p_event_id uuid,
  p_read boolean
)
returns setof public.watchlist_alert_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_event_id is null or p_read is null then
    raise exception using errcode = '22023', message = 'invalid_alert_event_read_command';
  end if;

  return query
  update public.watchlist_alert_events event
  set read_at = case when p_read then now() else null end
  where event.id = p_event_id and event.user_id = v_user_id
  returning event.*;
end;
$$;

create or replace function public.retry_watchlist_alert_event_delivery(p_event_id uuid)
returns setof public.watchlist_alert_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_event_id is null then
    raise exception using errcode = '22023', message = 'invalid_alert_event_retry_command';
  end if;

  return query
  update public.watchlist_alert_events event
  set delivery_status = 'pending',
      delivery_attempts = 0,
      next_delivery_at = now(),
      dead_lettered_at = null,
      last_delivery_error = null,
      claimed_at = null
  where event.id = p_event_id
    and event.user_id = v_user_id
    and event.delivery_status in ('failed', 'dead_letter')
  returning event.*;
end;
$$;

revoke all on function public.set_watchlist_alert_event_read(uuid, boolean) from public;
revoke all on function public.retry_watchlist_alert_event_delivery(uuid) from public;
grant execute on function public.set_watchlist_alert_event_read(uuid, boolean) to authenticated;
grant execute on function public.retry_watchlist_alert_event_delivery(uuid) to authenticated;

create table if not exists public.watchlist_alert_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  evaluated integer not null default 0,
  triggered integer not null default 0,
  unavailable integer not null default 0,
  delivery_claimed integer not null default 0,
  delivery_delivered integer not null default 0,
  delivery_failed integer not null default 0,
  delivery_dead_letter integer not null default 0,
  delivery_skipped integer not null default 0,
  saturated boolean not null default false,
  error text,
  duration_ms integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists watchlist_alert_runs_started_idx
  on public.watchlist_alert_runs (started_at desc);
alter table public.watchlist_alert_runs enable row level security;
revoke all on table public.watchlist_alert_runs from anon, authenticated;

create or replace function public.start_watchlist_alert_run(p_started_at timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('watchlist-alert-runner'));
  if exists (
    select 1
    from public.watchlist_alert_runs
    where status = 'running'
      and started_at > coalesce(p_started_at, now()) - interval '10 minutes'
  ) then
    return null;
  end if;

  update public.watchlist_alert_runs
  set status = 'failed',
      error = coalesce(error, 'runner_lease_expired'),
      finished_at = coalesce(finished_at, coalesce(p_started_at, now()))
  where status = 'running';

  insert into public.watchlist_alert_runs (status, started_at)
  values ('running', coalesce(p_started_at, now()))
  returning id into v_run_id;
  return v_run_id;
end;
$$;

revoke all on function public.start_watchlist_alert_run(timestamptz) from public;
grant execute on function public.start_watchlist_alert_run(timestamptz) to service_role;

create or replace function public.claim_watchlist_alert_events(p_limit integer default 200)
returns setof public.watchlist_alert_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select e.id
    from public.watchlist_alert_events e
    where (
      e.delivery_status in ('pending', 'failed')
      or (e.delivery_status = 'processing' and e.claimed_at < now() - interval '15 minutes')
    )
      and e.next_delivery_at <= now()
      and e.delivery_attempts < 3
    order by e.triggered_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  )
  update public.watchlist_alert_events e
  set delivery_status = 'processing',
      delivery_attempts = e.delivery_attempts + 1,
      claimed_at = now()
  from claimed
  where e.id = claimed.id
  returning e.*;
end;
$$;

revoke all on function public.claim_watchlist_alert_events(integer) from public;
grant execute on function public.claim_watchlist_alert_events(integer) to service_role;

create or replace function public.watchlist_alert_research_candidates(
  p_pairs jsonb,
  p_limit_per_kind integer default 50
)
returns table (owner_id uuid, ticker text, reports jsonb, perspectives jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with pairs as (
    select distinct input.user_id as pair_user_id, upper(trim(input.ticker)) as pair_ticker
    from jsonb_to_recordset(coalesce(p_pairs, '[]'::jsonb)) as input(user_id uuid, ticker text)
    where trim(input.ticker) <> ''
    limit 500
  )
  select pair.pair_user_id,
    pair.pair_ticker,
    coalesce((
      select jsonb_agg(to_jsonb(report_row) order by report_row.published_at desc nulls last, report_row.fetched_at desc)
      from (
        select br.*
        from public.broker_reports br
        where br.user_id = pair.pair_user_id and br.ticker = pair.pair_ticker
        order by br.published_at desc nulls last, br.fetched_at desc
        limit least(greatest(coalesce(p_limit_per_kind, 50), 1), 100)
      ) report_row
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(to_jsonb(perspective_row) order by perspective_row.created_at desc)
      from (
        select p.*
        from public.perspectives p
        where p.user_id = pair.pair_user_id and p.ticker = pair.pair_ticker
        order by p.created_at desc
        limit least(greatest(coalesce(p_limit_per_kind, 50), 1), 100)
      ) perspective_row
    ), '[]'::jsonb)
  from pairs pair;
$$;

revoke all on function public.watchlist_alert_research_candidates(jsonb, integer) from public;
grant execute on function public.watchlist_alert_research_candidates(jsonb, integer) to service_role;

create or replace function public.watchlist_research_summaries(p_tickers text[])
returns table (
  ticker text,
  recent_news_count bigint,
  latest_news_at timestamptz,
  average_sentiment numeric,
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
      avg(n.sentiment) filter (where n.published_at >= now() - interval '14 days') as average_sentiment
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

create or replace function public.replace_watchlist_snapshot(
  p_expected_version bigint,
  p_mutation_id text,
  p_groups jsonb
)
returns table(version bigint, applied boolean)
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_version bigint;
  v_last_mutation_id text;
  v_group jsonb;
  v_group_order integer;
  v_client_id text;
  v_group_name text;
  v_group_id uuid;
  v_keep_group_ids uuid[] := '{}';
  v_ticker text;
  v_ticker_order integer;
  v_tickers text[];
  v_prior_item public.watchlist_items%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_mutation_id is null or length(trim(p_mutation_id)) < 8 or length(p_mutation_id) > 128 then
    raise exception using errcode = '22023', message = 'invalid_mutation_id';
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 50 then
    raise exception using errcode = '22023', message = 'invalid_watchlist_groups';
  end if;

  insert into public.watchlist_sync_state (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select s.version, s.last_mutation_id
    into v_current_version, v_last_mutation_id
  from public.watchlist_sync_state s
  where s.user_id = v_user_id
  for update;

  if v_last_mutation_id = p_mutation_id then
    return query select v_current_version, false;
    return;
  end if;
  if p_expected_version is null or p_expected_version <> v_current_version then
    raise exception using
      errcode = '40001',
      message = 'watchlist_version_conflict',
      detail = v_current_version::text;
  end if;

  for v_group, v_group_order in
    select value, (ordinality - 1)::integer
    from jsonb_array_elements(p_groups) with ordinality
  loop
    if jsonb_typeof(v_group) <> 'object'
       or jsonb_typeof(v_group->'tickers') <> 'array'
       or jsonb_array_length(v_group->'tickers') > 200 then
      raise exception using errcode = '22023', message = 'invalid_watchlist_group';
    end if;

    v_client_id := trim(coalesce(v_group->>'id', ''));
    v_group_name := trim(coalesce(v_group->>'name', ''));
    if v_group_name = '' or length(v_group_name) > 80 then
      raise exception using errcode = '22023', message = 'invalid_watchlist_group_name';
    end if;

    v_group_id := null;
    if v_client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select w.id into v_group_id
      from public.watchlists w
      where w.id = v_client_id::uuid and w.user_id = v_user_id;
    end if;
    if v_group_id is null then
      select w.id into v_group_id
      from public.watchlists w
      where w.user_id = v_user_id and w.name = v_group_name
      order by w.created_at
      limit 1;
    end if;

    if v_group_id is null then
      insert into public.watchlists (user_id, name, sort_order)
      values (v_user_id, v_group_name, v_group_order)
      returning id into v_group_id;
    else
      update public.watchlists
      set name = v_group_name, sort_order = v_group_order, updated_at = now()
      where id = v_group_id and user_id = v_user_id;
    end if;
    v_keep_group_ids := array_append(v_keep_group_ids, v_group_id);

    v_tickers := '{}';
    for v_ticker, v_ticker_order in
      select upper(trim(value)), (ordinality - 1)::integer
      from jsonb_array_elements_text(v_group->'tickers') with ordinality
    loop
      if v_ticker = '' or v_ticker = any(v_tickers) then
        continue;
      end if;
      if not exists (
        select 1 from public.stocks_universe su
        where su.ticker = v_ticker
          and su.is_active = true
          and su.list_status = 'listed'
          and su.source is distinct from 'legacy-watchlist'
      ) then
        raise exception using errcode = '23503', message = 'security_not_selectable', detail = v_ticker;
      end if;
      v_tickers := array_append(v_tickers, v_ticker);
      v_prior_item := null;
      select wi.* into v_prior_item
      from public.watchlist_items wi
      where wi.user_id = v_user_id and wi.ticker = v_ticker
      order by wi.added_at
      limit 1;
      if v_prior_item.id is not null
         and v_prior_item.watchlist_id <> v_group_id
         and not exists (
           select 1 from public.watchlist_items wi
           where wi.watchlist_id = v_group_id and wi.ticker = v_ticker
         ) then
        update public.watchlist_items
        set watchlist_id = v_group_id,
            sort_order = v_ticker_order,
            updated_at = now()
        where id = v_prior_item.id and user_id = v_user_id;
        v_prior_item.watchlist_id := v_group_id;
      end if;
      insert into public.watchlist_items (
        watchlist_id, user_id, ticker, conviction, notes, sort_order, added_at,
        thesis, target_price, invalidation_conditions, confidence, review_at,
        tags, status, decision_version, updated_at
      )
      values (
        v_group_id,
        v_user_id,
        v_ticker,
        coalesce(v_prior_item.conviction, 5),
        v_prior_item.notes,
        v_ticker_order,
        coalesce(v_prior_item.added_at, now()),
        v_prior_item.thesis,
        v_prior_item.target_price,
        v_prior_item.invalidation_conditions,
        v_prior_item.confidence,
        v_prior_item.review_at,
        coalesce(v_prior_item.tags, '{}'),
        coalesce(v_prior_item.status, 'watching'),
        coalesce(v_prior_item.decision_version, 0),
        now()
      )
      on conflict (watchlist_id, ticker) do update
        set sort_order = excluded.sort_order,
            updated_at = now();
    end loop;

    delete from public.watchlist_items wi
    where wi.watchlist_id = v_group_id
      and wi.user_id = v_user_id
      and not (wi.ticker = any(v_tickers));
  end loop;

  delete from public.watchlists w
  where w.user_id = v_user_id
    and not (w.id = any(v_keep_group_ids));

  update public.watchlist_sync_state s
  set version = s.version + 1,
      last_mutation_id = p_mutation_id,
      updated_at = now()
  where s.user_id = v_user_id
  returning s.version into v_current_version;

  return query select v_current_version, true;
end;
$$;

revoke all on function public.replace_watchlist_snapshot(bigint, text, jsonb) from public;
grant execute on function public.replace_watchlist_snapshot(bigint, text, jsonb) to authenticated;

-- Stored research is refreshed independently from page views. The lease keeps
-- overlapping cron invocations from spending twice for the same user/ticker.
create table if not exists public.watchlist_research_refresh_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'partial', 'failed')),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_refresh_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create index if not exists watchlist_research_refresh_due_idx
  on public.watchlist_research_refresh_state (next_refresh_at, status);
alter table public.watchlist_research_refresh_state enable row level security;
create policy "watchlist_research_refresh user read" on public.watchlist_research_refresh_state
  for select using (auth.uid() = user_id);

create or replace function public.claim_watchlist_research_refresh(
  p_limit integer default 10,
  p_lease_minutes integer default 10
)
returns setof public.watchlist_research_refresh_state
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.watchlist_research_refresh_state (user_id, ticker)
  select distinct wi.user_id, wi.ticker
  from public.watchlist_items wi
  on conflict (user_id, ticker) do nothing;

  return query
  with candidates as (
    select state.user_id, state.ticker
    from public.watchlist_research_refresh_state state
    where state.next_refresh_at <= now()
      and (
        state.status <> 'running'
        or state.lease_expires_at is null
        or state.lease_expires_at < now()
      )
      and exists (
        select 1 from public.watchlist_items wi
        where wi.user_id = state.user_id and wi.ticker = state.ticker
      )
    order by exists (
      select 1
      from public.watchlist_alerts alert
      join public.watchlist_items item on item.id = alert.watchlist_item_id
      where alert.user_id = state.user_id
        and item.ticker = state.ticker
        and alert.alert_type = 'rating'
        and alert.enabled = true
    ) desc,
    state.next_refresh_at,
    state.user_id,
    state.ticker
    for update of state skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 25)
  )
  update public.watchlist_research_refresh_state state
  set status = 'running',
      last_attempt_at = now(),
      lease_expires_at = now() + make_interval(mins => least(greatest(coalesce(p_lease_minutes, 10), 1), 30)),
      updated_at = now()
  from candidates
  where state.user_id = candidates.user_id and state.ticker = candidates.ticker
  returning state.*;
end;
$$;

revoke all on table public.watchlist_research_refresh_state from anon, authenticated;
grant select on table public.watchlist_research_refresh_state to authenticated;
revoke all on function public.claim_watchlist_research_refresh(integer, integer) from public;
grant execute on function public.claim_watchlist_research_refresh(integer, integer) to service_role;

create table if not exists public.external_evidence_user_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.external_evidence_user_limits enable row level security;
revoke all on table public.external_evidence_user_limits from anon, authenticated;

create or replace function public.consume_external_evidence_user_quota(
  p_limit integer default 30,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.external_evidence_user_limits%rowtype;
  v_now timestamptz := now();
  v_window_seconds integer := least(greatest(coalesce(p_window_seconds, 3600), 60), 86400);
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 200);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  insert into public.external_evidence_user_limits (user_id, window_started_at, request_count)
  values (v_user_id, v_now, 0)
  on conflict (user_id) do nothing;
  select * into v_row
  from public.external_evidence_user_limits
  where user_id = v_user_id
  for update;
  if v_row.window_started_at <= v_now - make_interval(secs => v_window_seconds) then
    update public.external_evidence_user_limits
    set window_started_at = v_now, request_count = 1, updated_at = v_now
    where user_id = v_user_id;
    return true;
  end if;
  if v_row.request_count >= v_limit then return false; end if;
  update public.external_evidence_user_limits
  set request_count = request_count + 1, updated_at = v_now
  where user_id = v_user_id;
  return true;
end;
$$;

revoke all on function public.consume_external_evidence_user_quota(integer, integer) from public;
grant execute on function public.consume_external_evidence_user_quota(integer, integer) to authenticated;
