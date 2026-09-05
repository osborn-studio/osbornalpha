-- Derived review queue for Watchlist decisions. Review state remains sourced
-- from watchlist_items.review_at and status; no parallel workflow state exists.

create index if not exists watchlist_items_active_review_idx
  on public.watchlist_items (user_id, review_at, id)
  where status not in ('paused', 'invalidated');

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
        case
          when wi.review_at is null then 'unscheduled'
          when (wi.review_at at time zone v_timezone)::date < v_today then 'overdue'
          when (wi.review_at at time zone v_timezone)::date = v_today then 'due_today'
          when (wi.review_at at time zone v_timezone)::date <= v_today + v_horizon_days then 'upcoming'
          else 'scheduled'
        end as review_bucket
      from public.watchlist_items wi
      join public.watchlists wl on wl.id = wi.watchlist_id and wl.user_id = v_user_id
      left join public.stocks_universe stock on stock.ticker = wi.ticker
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
          'review_bucket', row.review_bucket
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
values ('watchlist_review_workflow')
on conflict (marker) do nothing;
