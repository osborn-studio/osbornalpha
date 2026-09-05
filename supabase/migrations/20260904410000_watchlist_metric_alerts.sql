-- Add snapshot-backed technical and risk alerts without recomputing market history.

alter table public.watchlist_alerts
  drop constraint if exists watchlist_alerts_alert_type_check,
  drop constraint if exists watchlist_alerts_rule_shape_check;

alter table public.watchlist_alerts
  add constraint watchlist_alerts_alert_type_check check (alert_type in (
    'price', 'change_pct', 'volume_ratio', 'valuation', 'metric', 'event', 'rating', 'perspective'
  )),
  add constraint watchlist_alerts_rule_shape_check check (
    jsonb_typeof(config) = 'object'
    and (
      (
        alert_type in ('price', 'change_pct', 'volume_ratio', 'valuation', 'metric')
        and operator is not null
        and threshold_numeric is not null
        and abs(threshold_numeric) <= 1000000000000000
        and (alert_type not in ('price', 'volume_ratio', 'valuation') or threshold_numeric >= 0)
        and (alert_type <> 'metric' or (
          (config ->> 'metric' not in ('annualized_volatility_pct', 'downside_volatility_pct', 'max_drawdown_pct', 'rsi14', 'bollinger_position_pct', 'atr14_pct') or threshold_numeric >= 0)
          and (config ->> 'metric' not in ('max_drawdown_pct', 'rsi14', 'bollinger_position_pct') or threshold_numeric <= 100)
        ))
      )
      or (
        alert_type in ('event', 'rating', 'perspective')
        and operator is null
        and threshold_numeric is null
      )
    )
    and (
      (alert_type in ('price', 'change_pct', 'volume_ratio') and config = '{}'::jsonb)
      or (
        alert_type = 'valuation'
        and config ? 'metric'
        and config - 'metric' = '{}'::jsonb
        and config ->> 'metric' in ('pe_ttm', 'pb')
      )
      or (
        alert_type = 'metric'
        and config ? 'metric'
        and config - 'metric' = '{}'::jsonb
        and config ->> 'metric' in (
          'annualized_volatility_pct', 'downside_volatility_pct', 'sharpe_ratio',
          'max_drawdown_pct', 'rsi14', 'ma20_distance_pct', 'ma50_distance_pct',
          'macd_histogram', 'bollinger_position_pct', 'atr14_pct'
        )
      )
      or (
        alert_type = 'event'
        and config - 'kinds' = '{}'::jsonb
        and (not (config ? 'kinds') or (
          jsonb_typeof(config -> 'kinds') = 'array'
          and jsonb_array_length(config -> 'kinds') <= 20
          and (config -> 'kinds') <@ '["earnings_announce","earnings_guidance","dividend_ex_date","dividend_record","share_unlock"]'::jsonb
        ))
      )
      or (
        alert_type = 'rating'
        and config - 'values' = '{}'::jsonb
        and (not (config ? 'values') or (
          jsonb_typeof(config -> 'values') = 'array'
          and jsonb_array_length(config -> 'values') <= 20
          and (config -> 'values') <@ '["buy","hold","sell"]'::jsonb
        ))
      )
      or (
        alert_type = 'perspective'
        and config - 'values' = '{}'::jsonb
        and (not (config ? 'values') or (
          jsonb_typeof(config -> 'values') = 'array'
          and jsonb_array_length(config -> 'values') <= 20
          and (config -> 'values') <@ '["bullish","neutral","bearish"]'::jsonb
        ))
      )
    )
  );

alter table public.watchlist_alert_runs
  drop constraint if exists watchlist_alert_runs_scope_check;
alter table public.watchlist_alert_runs
  add constraint watchlist_alert_runs_scope_check check (scope in ('all', 'quote', 'metric', 'research'));

create or replace function public.start_watchlist_alert_run(
  p_started_at timestamptz default now(),
  p_scope text default 'all'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_scope text := coalesce(p_scope, 'all');
begin
  if v_scope not in ('all', 'quote', 'metric', 'research') then
    raise exception 'invalid_watchlist_alert_scope';
  end if;
  perform pg_advisory_xact_lock(hashtext('watchlist-alert-runner:' || v_scope));
  if exists (
    select 1 from public.watchlist_alert_runs
    where status = 'running'
      and scope = v_scope
      and started_at > coalesce(p_started_at, now()) - interval '10 minutes'
  ) then return null; end if;

  update public.watchlist_alert_runs
  set status = 'failed',
      error = coalesce(error, 'runner_lease_expired'),
      finished_at = coalesce(finished_at, coalesce(p_started_at, now()))
  where status = 'running' and scope = v_scope;

  insert into public.watchlist_alert_runs (status, scope, started_at)
  values ('running', v_scope, coalesce(p_started_at, now()))
  returning id into v_run_id;
  return v_run_id;
end;
$$;

revoke all on function public.start_watchlist_alert_run(timestamptz, text) from public;
grant execute on function public.start_watchlist_alert_run(timestamptz, text) to service_role;

-- Transactional restore for the versioned portable Watchlist bundle.

create or replace function public.import_watchlist_bundle(
  p_bundle jsonb,
  p_mode text,
  p_mutation_id text
)
returns table (
  version bigint,
  groups_created integer,
  groups_updated integer,
  items_created integer,
  items_updated integer,
  alerts_created integer,
  alerts_updated integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_version bigint;
  v_last_mutation_id text;
  v_group jsonb;
  v_group_index integer;
  v_group_id uuid;
  v_group_name text;
  v_group_description text;
  v_item jsonb;
  v_item_index integer;
  v_item_id uuid;
  v_item_tickers text[];
  v_before public.watchlist_items%rowtype;
  v_after public.watchlist_items%rowtype;
  v_import record;
  v_alert jsonb;
  v_alert_import record;
  v_alert_rows integer;
  v_groups_created integer := 0;
  v_groups_updated integer := 0;
  v_items_created integer := 0;
  v_items_updated integer := 0;
  v_alerts_created integer := 0;
  v_alerts_updated integer := 0;
  v_imported_group_names text[] := '{}';
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_mode not in ('merge', 'replace') then
    raise exception using errcode = '22023', message = 'invalid_watchlist_import_mode';
  end if;
  if p_mutation_id is null or length(trim(p_mutation_id)) < 8 or length(p_mutation_id) > 128 then
    raise exception using errcode = '22023', message = 'invalid_mutation_id';
  end if;
  if p_bundle is null
    or jsonb_typeof(p_bundle) <> 'object'
    or p_bundle->>'format_version' <> '3'
    or jsonb_typeof(p_bundle->'groups') <> 'array'
    or jsonb_array_length(p_bundle->'groups') < 1
    or jsonb_array_length(p_bundle->'groups') > 50 then
    raise exception using errcode = '22023', message = 'invalid_portable_watchlist';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_bundle->'groups') as source_group
    where jsonb_typeof(source_group) <> 'object'
      or jsonb_typeof(source_group->'items') <> 'array'
      or jsonb_array_length(source_group->'items') > 200
      or trim(coalesce(source_group->>'name', '')) = ''
      or length(trim(source_group->>'name')) > 80
      or length(coalesce(source_group->>'description', '')) > 500
  ) then
    raise exception using errcode = '22023', message = 'invalid_portable_watchlist_group';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_bundle->'groups') as source_group
  ) <> (
    select count(distinct trim(source_group->>'name'))
    from jsonb_array_elements(p_bundle->'groups') as source_group
  ) then
    raise exception using errcode = '22023', message = 'duplicate_portable_watchlist_group';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_bundle->'groups') as source_group
    cross join lateral jsonb_array_elements(source_group->'items') as source_item
    where jsonb_typeof(source_item) <> 'object'
      or trim(coalesce(source_item->>'ticker', '')) = ''
      or jsonb_typeof(source_item->'alerts') <> 'array'
      or jsonb_array_length(source_item->'alerts') > 100
      or jsonb_typeof(source_item->'tags') <> 'array'
      or source_item->>'status' not in ('inbox', 'researching', 'watching', 'ready', 'paused', 'invalidated')
  ) then
    raise exception using errcode = '22023', message = 'invalid_portable_watchlist_item';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_bundle->'groups') as source_group
    cross join lateral jsonb_array_elements(source_group->'items') as source_item
  ) <> (
    select count(distinct upper(trim(source_item->>'ticker')))
    from jsonb_array_elements(p_bundle->'groups') as source_group
    cross join lateral jsonb_array_elements(source_group->'items') as source_item
  ) then
    raise exception using errcode = '22023', message = 'duplicate_portable_watchlist_ticker';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_bundle->'groups') as source_group
    cross join lateral jsonb_array_elements(source_group->'items') as source_item
    where not exists (
      select 1
      from public.stocks_universe security
      where security.ticker = upper(trim(source_item->>'ticker'))
        and security.is_active = true
        and security.list_status = 'listed'
        and security.source is distinct from 'legacy-watchlist'
    )
  ) then
    raise exception using errcode = '23503', message = 'security_not_selectable';
  end if;

  insert into public.watchlist_sync_state (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
  select state.version, state.last_mutation_id
    into v_version, v_last_mutation_id
  from public.watchlist_sync_state state
  where state.user_id = v_user_id
  for update;

  if v_last_mutation_id = p_mutation_id then
    return query select v_version, 0, 0, 0, 0, 0, 0;
    return;
  end if;

  if p_mode = 'replace' then
    delete from public.watchlists where user_id = v_user_id;
  end if;

  for v_group, v_group_index in
    select value, (ordinality - 1)::integer
    from jsonb_array_elements(p_bundle->'groups') with ordinality
  loop
    v_group_name := trim(v_group->>'name');
    v_group_description := nullif(trim(coalesce(v_group->>'description', '')), '');
    v_imported_group_names := array_append(v_imported_group_names, v_group_name);
    v_group_id := null;
    if p_mode = 'merge' then
      select list.id into v_group_id
      from public.watchlists list
      where list.user_id = v_user_id and list.name = v_group_name
      order by list.created_at
      limit 1
      for update;
    end if;
    if v_group_id is null then
      insert into public.watchlists (user_id, name, description, sort_order, is_default)
      values (v_user_id, v_group_name, v_group_description, v_group_index, v_group_index = 0)
      returning id into v_group_id;
      v_groups_created := v_groups_created + 1;
    else
      update public.watchlists
      set description = v_group_description, sort_order = v_group_index, updated_at = now()
      where id = v_group_id;
      v_groups_updated := v_groups_updated + 1;
    end if;

    v_item_tickers := '{}';
    for v_item, v_item_index in
      select value, (ordinality - 1)::integer
      from jsonb_array_elements(v_group->'items') with ordinality
    loop
      select * into v_import
      from jsonb_to_record(v_item) as imported(
        ticker text,
        conviction integer,
        notes text,
        thesis text,
        target_price numeric,
        invalidation_conditions text,
        confidence smallint,
        review_at timestamptz,
        tags text[],
        status text,
        decision_version integer
      );
      v_import.ticker := upper(trim(v_import.ticker));
      if v_import.conviction not between 0 and 10
        or v_import.confidence is not null and v_import.confidence not between 0 and 100
        or v_import.target_price is not null and v_import.target_price <= 0
        or v_import.decision_version < 0
        or length(coalesce(v_import.notes, '')) > 2000
        or length(coalesce(v_import.thesis, '')) > 4000
        or length(coalesce(v_import.invalidation_conditions, '')) > 2000
        or cardinality(coalesce(v_import.tags, '{}')) > 20
        or exists (select 1 from unnest(coalesce(v_import.tags, '{}')) tag where trim(tag) = '' or length(tag) > 32) then
        raise exception using errcode = '22023', message = 'invalid_portable_watchlist_item';
      end if;
      v_item_tickers := array_append(v_item_tickers, v_import.ticker);

      v_before := null;
      if p_mode = 'merge' then
        select item.* into v_before
        from public.watchlist_items item
        where item.user_id = v_user_id and item.ticker = v_import.ticker
        order by (item.watchlist_id = v_group_id) desc, item.added_at
        limit 1
        for update;
      end if;

      if v_before.id is null then
        insert into public.watchlist_items (
          watchlist_id, user_id, ticker, conviction, notes, sort_order, thesis,
          target_price, invalidation_conditions, confidence, review_at, tags,
          status, decision_version, updated_at
        ) values (
          v_group_id, v_user_id, v_import.ticker, v_import.conviction,
          nullif(v_import.notes, ''), v_item_index, nullif(v_import.thesis, ''),
          v_import.target_price, nullif(v_import.invalidation_conditions, ''),
          v_import.confidence, v_import.review_at, coalesce(v_import.tags, '{}'),
          v_import.status, v_import.decision_version, now()
        ) returning id into v_item_id;
        v_items_created := v_items_created + 1;
      else
        update public.watchlist_items item
        set watchlist_id = v_group_id,
            sort_order = v_item_index,
            conviction = v_import.conviction,
            notes = nullif(v_import.notes, ''),
            thesis = nullif(v_import.thesis, ''),
            target_price = v_import.target_price,
            invalidation_conditions = nullif(v_import.invalidation_conditions, ''),
            confidence = v_import.confidence,
            review_at = v_import.review_at,
            tags = coalesce(v_import.tags, '{}'),
            status = v_import.status,
            decision_version = case
              when row(
                item.conviction, item.notes, item.thesis, item.target_price,
                item.invalidation_conditions, item.confidence, item.review_at,
                item.tags, item.status
              ) is distinct from row(
                v_import.conviction, nullif(v_import.notes, ''), nullif(v_import.thesis, ''),
                v_import.target_price, nullif(v_import.invalidation_conditions, ''),
                v_import.confidence, v_import.review_at, coalesce(v_import.tags, '{}'), v_import.status
              ) then greatest(item.decision_version + 1, v_import.decision_version)
              else greatest(item.decision_version, v_import.decision_version)
            end,
            updated_at = now()
        where item.id = v_before.id and item.user_id = v_user_id
        returning * into v_after;
        v_item_id := v_after.id;
        v_items_updated := v_items_updated + 1;

        if row(
          v_before.conviction, v_before.notes, v_before.thesis, v_before.target_price,
          v_before.invalidation_conditions, v_before.confidence, v_before.review_at,
          v_before.tags, v_before.status
        ) is distinct from row(
          v_after.conviction, v_after.notes, v_after.thesis, v_after.target_price,
          v_after.invalidation_conditions, v_after.confidence, v_after.review_at,
          v_after.tags, v_after.status
        ) then
          insert into public.watchlist_item_decision_history (
            user_id, watchlist_item_id, version, before_value, after_value
          ) values (
            v_user_id,
            v_after.id,
            v_after.decision_version,
            to_jsonb(v_before) - array['id', 'user_id', 'watchlist_id', 'ticker', 'added_at', 'sort_order'],
            to_jsonb(v_after) - array['id', 'user_id', 'watchlist_id', 'ticker', 'added_at', 'sort_order']
          );
        end if;
      end if;

      for v_alert in select value from jsonb_array_elements(v_item->'alerts')
      loop
        select * into v_alert_import
        from jsonb_to_record(v_alert) as imported_alert(
          alert_type text,
          operator text,
          threshold_numeric numeric,
          config jsonb,
          enabled boolean,
          cooldown_minutes integer
        );
        if v_alert_import.alert_type not in ('price', 'change_pct', 'volume_ratio', 'valuation', 'metric', 'event', 'rating', 'perspective')
          or v_alert_import.cooldown_minutes not between 1 and 10080
          or jsonb_typeof(coalesce(v_alert_import.config, '{}'::jsonb)) <> 'object'
          or length(coalesce(v_alert_import.config, '{}'::jsonb)::text) > 4000
          or (
            v_alert_import.alert_type in ('price', 'change_pct', 'volume_ratio', 'valuation', 'metric')
            and (v_alert_import.operator not in ('gt', 'gte', 'lt', 'lte', 'crosses_above', 'crosses_below')
              or v_alert_import.threshold_numeric is null)
          )
          or (
            v_alert_import.alert_type in ('event', 'rating', 'perspective')
            and (v_alert_import.operator is not null or v_alert_import.threshold_numeric is not null)
          ) then
          raise exception using errcode = '22023', message = 'invalid_portable_watchlist_alert';
        end if;

        update public.watchlist_alerts alert
        set enabled = v_alert_import.enabled,
            cooldown_minutes = v_alert_import.cooldown_minutes,
            updated_at = now()
        where alert.user_id = v_user_id
          and alert.watchlist_item_id = v_item_id
          and alert.alert_type = v_alert_import.alert_type
          and alert.operator is not distinct from v_alert_import.operator
          and alert.threshold_numeric is not distinct from v_alert_import.threshold_numeric
          and alert.config = coalesce(v_alert_import.config, '{}'::jsonb);
        get diagnostics v_alert_rows = row_count;
        if v_alert_rows > 0 then
          v_alerts_updated := v_alerts_updated + 1;
        else
          insert into public.watchlist_alerts (
            user_id, watchlist_item_id, alert_type, operator, threshold_numeric,
            config, enabled, cooldown_minutes
          ) values (
            v_user_id, v_item_id, v_alert_import.alert_type, v_alert_import.operator,
            v_alert_import.threshold_numeric, coalesce(v_alert_import.config, '{}'::jsonb),
            v_alert_import.enabled, v_alert_import.cooldown_minutes
          );
          v_alerts_created := v_alerts_created + 1;
        end if;
      end loop;
    end loop;

    if p_mode = 'merge' then
      with extras as (
        select item.id, row_number() over (order by item.sort_order, item.added_at, item.id) - 1 as offset
        from public.watchlist_items item
        where item.watchlist_id = v_group_id
          and item.user_id = v_user_id
          and not (item.ticker = any(v_item_tickers))
      )
      update public.watchlist_items item
      set sort_order = jsonb_array_length(v_group->'items') + extras.offset
      from extras
      where item.id = extras.id;
    end if;
  end loop;

  if p_mode = 'merge' then
    with extras as (
      select list.id, row_number() over (order by list.sort_order, list.created_at, list.id) - 1 as offset
      from public.watchlists list
      where list.user_id = v_user_id and not (list.name = any(v_imported_group_names))
    )
    update public.watchlists list
    set sort_order = jsonb_array_length(p_bundle->'groups') + extras.offset,
        updated_at = now()
    from extras
    where list.id = extras.id;
  end if;

  update public.watchlist_sync_state state
  set version = state.version + 1,
      last_mutation_id = p_mutation_id,
      updated_at = now()
  where state.user_id = v_user_id
  returning state.version into v_version;

  return query select v_version, v_groups_created, v_groups_updated,
    v_items_created, v_items_updated, v_alerts_created, v_alerts_updated;
end;
$$;

revoke all on function public.import_watchlist_bundle(jsonb, text, text) from public;
grant execute on function public.import_watchlist_bundle(jsonb, text, text) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_metric_alerts')
on conflict (marker) do nothing;
