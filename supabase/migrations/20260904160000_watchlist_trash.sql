create table if not exists public.watchlist_trash (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('group', 'item')),
  source_id uuid not null,
  label text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  restored_at timestamptz
);

create index if not exists watchlist_trash_user_active_idx
  on public.watchlist_trash (user_id, deleted_at desc)
  where restored_at is null;
alter table public.watchlist_trash enable row level security;
create policy "watchlist_trash user read" on public.watchlist_trash
  for select using (auth.uid() = user_id);
create policy "watchlist_trash user delete" on public.watchlist_trash
  for delete using (auth.uid() = user_id);
grant select, delete on public.watchlist_trash to authenticated;

create or replace function public.capture_watchlist_item_trash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group jsonb;
  v_alerts jsonb;
  v_history jsonb;
begin
  -- During ON DELETE CASCADE the parent group is already gone. Its trigger
  -- captured one complete group bundle, so do not create duplicate item rows.
  select to_jsonb(w) into v_group
  from public.watchlists w
  where w.id = old.watchlist_id and w.user_id = old.user_id;
  if v_group is null then return old; end if;

  select coalesce(jsonb_agg(to_jsonb(alert) order by alert.created_at), '[]'::jsonb)
    into v_alerts
  from public.watchlist_alerts alert
  where alert.watchlist_item_id = old.id and alert.user_id = old.user_id;
  select coalesce(jsonb_agg(to_jsonb(history) order by history.version), '[]'::jsonb)
    into v_history
  from public.watchlist_item_decision_history history
  where history.watchlist_item_id = old.id and history.user_id = old.user_id;

  insert into public.watchlist_trash (user_id, entity_type, source_id, label, payload)
  values (
    old.user_id,
    'item',
    old.id,
    old.ticker,
    jsonb_build_object(
      'group', v_group,
      'items', jsonb_build_array(jsonb_build_object(
        'item', to_jsonb(old), 'alerts', v_alerts, 'history', v_history
      ))
    )
  );
  return old;
end;
$$;

create or replace function public.capture_watchlist_group_trash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item', to_jsonb(item),
      'alerts', coalesce((
        select jsonb_agg(to_jsonb(alert) order by alert.created_at)
        from public.watchlist_alerts alert
        where alert.watchlist_item_id = item.id and alert.user_id = old.user_id
      ), '[]'::jsonb),
      'history', coalesce((
        select jsonb_agg(to_jsonb(history) order by history.version)
        from public.watchlist_item_decision_history history
        where history.watchlist_item_id = item.id and history.user_id = old.user_id
      ), '[]'::jsonb)
    ) order by item.sort_order, item.id
  ), '[]'::jsonb) into v_items
  from public.watchlist_items item
  where item.watchlist_id = old.id and item.user_id = old.user_id;

  insert into public.watchlist_trash (user_id, entity_type, source_id, label, payload)
  values (
    old.user_id,
    'group',
    old.id,
    old.name,
    jsonb_build_object('group', to_jsonb(old), 'items', v_items)
  );
  return old;
end;
$$;

drop trigger if exists capture_watchlist_item_trash_before_delete on public.watchlist_items;
create trigger capture_watchlist_item_trash_before_delete
  before delete on public.watchlist_items
  for each row execute function public.capture_watchlist_item_trash();

drop trigger if exists capture_watchlist_group_trash_before_delete on public.watchlists;
create trigger capture_watchlist_group_trash_before_delete
  before delete on public.watchlists
  for each row execute function public.capture_watchlist_group_trash();

create or replace function public.restore_watchlist_trash(
  p_trash_id uuid,
  p_expected_version bigint,
  p_mutation_id text
)
returns table(version bigint, applied boolean, restored_items integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trash public.watchlist_trash%rowtype;
  v_group jsonb;
  v_entry jsonb;
  v_item jsonb;
  v_alert jsonb;
  v_history jsonb;
  v_group_id uuid;
  v_item_id uuid;
  v_current_version bigint;
  v_last_mutation_id text;
  v_restored integer := 0;
  v_inserted boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_trash_id is null or p_mutation_id is null or length(trim(p_mutation_id)) < 8 or length(p_mutation_id) > 128 then
    raise exception using errcode = '22023', message = 'invalid_watchlist_restore';
  end if;

  insert into public.watchlist_sync_state (user_id) values (v_user_id)
  on conflict (user_id) do nothing;
  select state.version, state.last_mutation_id into v_current_version, v_last_mutation_id
  from public.watchlist_sync_state state
  where state.user_id = v_user_id
  for update;
  if v_last_mutation_id = p_mutation_id then
    return query select v_current_version, false, 0;
    return;
  end if;
  if p_expected_version is null or p_expected_version <> v_current_version then
    raise exception using errcode = '40001', message = 'watchlist_version_conflict', detail = v_current_version::text;
  end if;

  select * into v_trash from public.watchlist_trash trash
  where trash.id = p_trash_id and trash.user_id = v_user_id
  for update;
  if not found or v_trash.restored_at is not null or v_trash.expires_at <= now() then
    raise exception using errcode = 'P0002', message = 'watchlist_trash_not_found';
  end if;
  v_group := v_trash.payload -> 'group';
  if jsonb_typeof(v_group) <> 'object' or jsonb_typeof(v_trash.payload -> 'items') <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_watchlist_trash_payload';
  end if;

  select list.id into v_group_id from public.watchlists list
  where list.id = (v_group ->> 'id')::uuid and list.user_id = v_user_id;
  if v_group_id is null then
    select list.id into v_group_id from public.watchlists list
    where list.user_id = v_user_id and list.name = v_group ->> 'name'
    order by list.created_at limit 1;
  end if;
  if v_group_id is null then
    begin
      insert into public.watchlists (
        id, user_id, name, description, weight, sort_order, is_default, created_at, updated_at
      ) values (
        (v_group ->> 'id')::uuid, v_user_id, v_group ->> 'name', v_group ->> 'description',
        coalesce((v_group ->> 'weight')::numeric, 1), coalesce((v_group ->> 'sort_order')::integer, 0),
        coalesce((v_group ->> 'is_default')::boolean, false),
        coalesce((v_group ->> 'created_at')::timestamptz, now()), now()
      ) returning id into v_group_id;
    exception when unique_violation then
      insert into public.watchlists (user_id, name, description, weight, sort_order, is_default)
      values (
        v_user_id, v_group ->> 'name', v_group ->> 'description',
        coalesce((v_group ->> 'weight')::numeric, 1), coalesce((v_group ->> 'sort_order')::integer, 0), false
      ) returning id into v_group_id;
    end;
  end if;

  for v_entry in select value from jsonb_array_elements(v_trash.payload -> 'items')
  loop
    v_item := v_entry -> 'item';
    if jsonb_typeof(v_item) <> 'object' then continue; end if;
    v_item_id := null;
    v_inserted := false;
    insert into public.watchlist_items (
      id, watchlist_id, user_id, ticker, conviction, notes, sort_order, added_at,
      thesis, target_price, invalidation_conditions, confidence, review_at,
      tags, status, decision_version, updated_at
    ) values (
      (v_item ->> 'id')::uuid, v_group_id, v_user_id, v_item ->> 'ticker',
      coalesce((v_item ->> 'conviction')::integer, 5), v_item ->> 'notes',
      coalesce((v_item ->> 'sort_order')::integer, 0), coalesce((v_item ->> 'added_at')::timestamptz, now()),
      v_item ->> 'thesis', (v_item ->> 'target_price')::numeric, v_item ->> 'invalidation_conditions',
      (v_item ->> 'confidence')::smallint, (v_item ->> 'review_at')::timestamptz,
      coalesce(array(select jsonb_array_elements_text(v_item -> 'tags')), '{}'),
      coalesce(v_item ->> 'status', 'watching'), coalesce((v_item ->> 'decision_version')::integer, 0), now()
    ) on conflict (watchlist_id, ticker) do nothing
    returning id into v_item_id;
    if v_item_id is not null then
      v_inserted := true;
      v_restored := v_restored + 1;
    else
      select item.id into v_item_id from public.watchlist_items item
      where item.watchlist_id = v_group_id and item.ticker = v_item ->> 'ticker';
    end if;

    if v_inserted then
      for v_history in select value from jsonb_array_elements(coalesce(v_entry -> 'history', '[]'::jsonb))
      loop
        insert into public.watchlist_item_decision_history (
          user_id, watchlist_item_id, version, before_value, after_value, changed_at
        ) values (
          v_user_id, v_item_id, (v_history ->> 'version')::integer,
          v_history -> 'before_value', v_history -> 'after_value',
          coalesce((v_history ->> 'changed_at')::timestamptz, now())
        ) on conflict (watchlist_item_id, version) do nothing;
      end loop;
      for v_alert in select value from jsonb_array_elements(coalesce(v_entry -> 'alerts', '[]'::jsonb))
      loop
        insert into public.watchlist_alerts (
          user_id, watchlist_item_id, alert_type, operator, threshold_numeric,
          config, enabled, cooldown_minutes, created_at, updated_at
        ) values (
          v_user_id, v_item_id, v_alert ->> 'alert_type', nullif(v_alert ->> 'operator', ''),
          (v_alert ->> 'threshold_numeric')::numeric, coalesce(v_alert -> 'config', '{}'::jsonb),
          coalesce((v_alert ->> 'enabled')::boolean, true),
          coalesce((v_alert ->> 'cooldown_minutes')::integer, 1440),
          coalesce((v_alert ->> 'created_at')::timestamptz, now()), now()
        ) on conflict do nothing;
      end loop;
    end if;
  end loop;

  update public.watchlist_trash set restored_at = now() where id = v_trash.id;
  update public.watchlist_sync_state state
  set version = state.version + 1, last_mutation_id = p_mutation_id, updated_at = now()
  where state.user_id = v_user_id
  returning state.version into v_current_version;
  return query select v_current_version, true, v_restored;
end;
$$;

revoke all on function public.restore_watchlist_trash(uuid, bigint, text) from public;
grant execute on function public.restore_watchlist_trash(uuid, bigint, text) to authenticated;
