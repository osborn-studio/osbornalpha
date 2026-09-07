-- AI Perspective claims may propose alert drafts, but the database always
-- creates them disabled. Triggered claim-derived alerts enqueue an explicit
-- decision-review reason without mutating the decision itself.

create table if not exists public.watchlist_alert_origins (
  alert_id uuid primary key references public.watchlist_alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  perspective_id uuid references public.perspectives(id) on delete set null,
  claim_id text not null check (claim_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  claim_text text not null check (char_length(claim_text) between 1 and 240),
  invalidation_text text not null check (char_length(invalidation_text) between 1 and 240),
  created_at timestamptz not null default now()
);

create index if not exists watchlist_alert_origins_user_idx
  on public.watchlist_alert_origins (user_id, created_at desc);

alter table public.watchlist_alert_origins enable row level security;
create policy "watchlist_alert_origins user read" on public.watchlist_alert_origins
  for select using (auth.uid() = user_id);
grant select on public.watchlist_alert_origins to authenticated;
revoke insert, update, delete on public.watchlist_alert_origins from anon, authenticated;

create table if not exists public.watchlist_review_reasons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watchlist_item_id uuid not null references public.watchlist_items(id) on delete cascade,
  alert_event_id uuid not null references public.watchlist_alert_events(id) on delete cascade,
  reason_type text not null default 'claim_alert_triggered'
    check (reason_type = 'claim_alert_triggered'),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16000),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (alert_event_id)
);

create index if not exists watchlist_review_reasons_user_open_idx
  on public.watchlist_review_reasons (user_id, watchlist_item_id, snoozed_until, created_at desc)
  where resolved_at is null;

alter table public.watchlist_review_reasons enable row level security;
create policy "watchlist_review_reasons user read" on public.watchlist_review_reasons
  for select using (auth.uid() = user_id);
grant select on public.watchlist_review_reasons to authenticated;
revoke insert, update, delete on public.watchlist_review_reasons from anon, authenticated;

create or replace function public.create_watchlist_alert_draft_from_claim(
  p_item_id uuid,
  p_perspective_id uuid,
  p_claim_id text,
  p_cooldown_minutes integer default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_ticker text;
  v_perspective_ticker text;
  v_claim jsonb;
  v_invalidation jsonb;
  v_alert public.watchlist_alerts%rowtype;
  v_origin public.watchlist_alert_origins%rowtype;
  v_operator text;
  v_threshold numeric;
  v_config jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_claim_id is null or p_claim_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
    or p_cooldown_minutes not between 1 and 10080 then
    raise exception using errcode = '22023', message = 'invalid_claim_alert_draft';
  end if;

  select ticker into v_item_ticker
  from public.watchlist_items
  where id = p_item_id and user_id = v_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'watchlist_item_not_found';
  end if;

  select perspective.ticker, claim.value
  into v_perspective_ticker, v_claim
  from public.perspectives perspective
  cross join lateral jsonb_array_elements(coalesce(perspective.claims, '[]'::jsonb)) claim(value)
  where perspective.id = p_perspective_id
    and perspective.user_id = v_user_id
    and claim.value->>'id' = p_claim_id
  limit 1;
  if v_claim is null then
    raise exception using errcode = 'P0002', message = 'perspective_claim_not_found';
  end if;
  if v_perspective_ticker <> v_item_ticker then
    raise exception using errcode = '22023', message = 'perspective_claim_ticker_mismatch';
  end if;

  v_invalidation := v_claim->'invalidation';
  if jsonb_typeof(v_invalidation) <> 'object'
    or char_length(btrim(coalesce(v_invalidation->>'condition', ''))) not between 1 and 240
    or jsonb_typeof(coalesce(v_invalidation->'config', '{}'::jsonb)) <> 'object'
    or (v_invalidation ? 'threshold' and jsonb_typeof(v_invalidation->'threshold') not in ('number', 'null')) then
    raise exception using errcode = '22023', message = 'invalid_claim_invalidation';
  end if;

  v_operator := nullif(v_invalidation->>'operator', '');
  v_threshold := case when jsonb_typeof(v_invalidation->'threshold') = 'number'
    then (v_invalidation->>'threshold')::numeric else null end;
  v_config := coalesce(v_invalidation->'config', '{}'::jsonb);

  insert into public.watchlist_alerts (
    user_id, watchlist_item_id, alert_type, operator, threshold_numeric,
    config, enabled, cooldown_minutes
  ) values (
    v_user_id, p_item_id, v_invalidation->>'alertType', v_operator, v_threshold,
    v_config, false, p_cooldown_minutes
  ) returning * into v_alert;

  insert into public.watchlist_alert_origins (
    alert_id, user_id, perspective_id, claim_id, claim_text, invalidation_text
  ) values (
    v_alert.id, v_user_id, p_perspective_id, p_claim_id,
    left(btrim(v_claim->>'text'), 240), left(btrim(v_invalidation->>'condition'), 240)
  ) returning * into v_origin;

  return jsonb_build_object('alert', to_jsonb(v_alert), 'origin', to_jsonb(v_origin));
end;
$$;

revoke all on function public.create_watchlist_alert_draft_from_claim(uuid, uuid, text, integer) from public;
grant execute on function public.create_watchlist_alert_draft_from_claim(uuid, uuid, text, integer) to authenticated;

create or replace function public.enqueue_watchlist_claim_alert_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.delivery_status <> 'pending' or new.alert_id is null then return new; end if;
  insert into public.watchlist_review_reasons (
    user_id, watchlist_item_id, alert_event_id, payload
  )
  select
    new.user_id,
    new.watchlist_item_id,
    new.id,
    jsonb_build_object(
      'ticker', new.ticker,
      'alert_id', new.alert_id,
      'alert_type', new.alert_type,
      'claim_id', origin.claim_id,
      'claim_text', origin.claim_text,
      'invalidation_text', origin.invalidation_text,
      'observed_value', new.observed_value,
      'threshold', new.threshold_numeric,
      'triggered_at', new.triggered_at,
      'evidence', new.payload
    )
  from public.watchlist_alert_origins origin
  where origin.alert_id = new.alert_id and origin.user_id = new.user_id
  on conflict (alert_event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists enqueue_watchlist_claim_alert_review_after_insert on public.watchlist_alert_events;
create trigger enqueue_watchlist_claim_alert_review_after_insert
  after insert on public.watchlist_alert_events
  for each row execute function public.enqueue_watchlist_claim_alert_review();

create or replace function public.act_watchlist_review(
  p_item_id uuid,
  p_expected_version integer,
  p_action text,
  p_review_at timestamptz default null
)
returns setof public.watchlist_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.watchlist_items%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_action not in ('complete', 'snooze')
    or (p_action = 'snooze' and (p_review_at is null or p_review_at <= now())) then
    raise exception using errcode = '22023', message = 'invalid_review_action';
  end if;

  select * into v_item
  from public.update_watchlist_item_decision(
    p_item_id,
    p_expected_version,
    jsonb_build_object('review_at', case when p_action = 'complete' then null else p_review_at end)
  );

  if p_action = 'complete' then
    update public.watchlist_review_reasons
    set resolved_at = now()
    where user_id = v_user_id and watchlist_item_id = p_item_id and resolved_at is null;
  else
    update public.watchlist_review_reasons
    set snoozed_until = p_review_at
    where user_id = v_user_id and watchlist_item_id = p_item_id and resolved_at is null;
  end if;

  return next v_item;
end;
$$;

revoke all on function public.act_watchlist_review(uuid, integer, text, timestamptz) from public;
grant execute on function public.act_watchlist_review(uuid, integer, text, timestamptz) to authenticated;

create or replace function public.get_watchlist_review_queue(
  p_scope text default 'due',
  p_horizon_days integer default 7,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_scope text := coalesce(p_scope, 'due');
  v_horizon_days integer := least(greatest(coalesce(p_horizon_days, 7), 1), 30);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_timezone text := 'UTC';
  v_today date;
begin
  if v_user_id is null then raise exception 'watchlist_auth_required'; end if;
  if v_scope not in ('due', 'upcoming', 'unscheduled', 'all') then
    raise exception 'invalid_watchlist_review_scope';
  end if;

  select tz.name into v_timezone
  from public.user_preferences pref
  join pg_timezone_names tz on tz.name = pref.timezone
  where pref.user_id = v_user_id;
  v_timezone := coalesce(v_timezone, 'UTC');
  v_today := (now() at time zone v_timezone)::date;

  return (
    with active as materialized (
      select
        wl.id as group_id,
        wl.name as group_name,
        wl.description as group_description,
        wl.sort_order as group_sort,
        wi.*,
        stock.name as stock_name,
        stock.name_en,
        stock.pinyin,
        stock.market,
        stock.asset_type,
        stock.exchange,
        stock.list_status,
        stock.is_active,
        coalesce(reason.review_reasons, '[]'::jsonb) as review_reasons,
        case
          when coalesce(reason.reason_count, 0) > 0 then 'due_today'
          when wi.review_at is null then 'unscheduled'
          when (wi.review_at at time zone v_timezone)::date < v_today then 'overdue'
          when (wi.review_at at time zone v_timezone)::date = v_today then 'due_today'
          when (wi.review_at at time zone v_timezone)::date <= v_today + v_horizon_days then 'upcoming'
          else 'scheduled'
        end as review_bucket
      from public.watchlist_items wi
      join public.watchlists wl on wl.id = wi.watchlist_id and wl.user_id = v_user_id
      left join public.stocks_universe stock on stock.ticker = wi.ticker
      left join lateral (
        select count(*) as reason_count,
          jsonb_agg(jsonb_build_object(
            'id', reason.id,
            'type', reason.reason_type,
            'payload', reason.payload,
            'created_at', reason.created_at
          ) order by reason.created_at desc) as review_reasons
        from public.watchlist_review_reasons reason
        where reason.user_id = v_user_id
          and reason.watchlist_item_id = wi.id
          and reason.resolved_at is null
          and (reason.snoozed_until is null or reason.snoozed_until <= now())
      ) reason on true
      where wi.user_id = v_user_id
        and wi.status not in ('paused', 'invalidated')
    ), filtered as (
      select * from active
      where v_scope = 'all'
        or (v_scope = 'due' and review_bucket in ('overdue', 'due_today'))
        or (v_scope = 'upcoming' and review_bucket = 'upcoming')
        or (v_scope = 'unscheduled' and review_bucket = 'unscheduled')
      order by review_at asc nulls last, group_sort, sort_order, id
      limit v_limit
    )
    select jsonb_build_object(
      'generated_at', now(),
      'timezone', v_timezone,
      'horizon_days', v_horizon_days,
      'summary', jsonb_build_object(
        'overdue', count(*) filter (where review_bucket = 'overdue'),
        'due_today', count(*) filter (where review_bucket = 'due_today'),
        'upcoming', count(*) filter (where review_bucket = 'upcoming'),
        'unscheduled', count(*) filter (where review_bucket = 'unscheduled')
      ),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'group', jsonb_build_object(
            'id', row.group_id,
            'name', row.group_name,
            'description', row.group_description,
            'sort_order', row.group_sort
          ),
          'item', jsonb_build_object(
            'id', row.id,
            'ticker', row.ticker,
            'conviction', row.conviction,
            'notes', row.notes,
            'sort_order', row.sort_order,
            'added_at', row.added_at,
            'thesis', row.thesis,
            'target_price', row.target_price,
            'invalidation_conditions', row.invalidation_conditions,
            'confidence', row.confidence,
            'review_at', row.review_at,
            'tags', row.tags,
            'status', row.status,
            'decision_version', row.decision_version,
            'updated_at', row.updated_at
          ),
          'identity', case when row.stock_name is null then null else jsonb_build_object(
            'ticker', row.ticker,
            'name', row.stock_name,
            'name_en', row.name_en,
            'pinyin', row.pinyin,
            'market', row.market,
            'asset_type', row.asset_type,
            'exchange', row.exchange,
            'list_status', row.list_status,
            'is_active', row.is_active
          ) end,
          'review_bucket', row.review_bucket,
          'review_reasons', row.review_reasons
        ) order by row.review_at asc nulls last, row.group_sort, row.sort_order, row.id)
        from filtered row
      ), '[]'::jsonb)
    )
    from active
  );
end;
$$;

revoke all on function public.get_watchlist_review_queue(text, integer, integer) from public;
grant execute on function public.get_watchlist_review_queue(text, integer, integer) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_perspective_alert_reviews')
on conflict (marker) do nothing;
