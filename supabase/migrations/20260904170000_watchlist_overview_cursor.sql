-- Keyset-paginate the watchlist overview without scanning past large offsets.
-- The legacy get_watchlist_overview_page function remains available for old
-- clients; new clients pass the last (group_sort, item_sort, item_id) tuple.
create or replace function public.get_watchlist_overview_cursor(
  p_group_sort integer default null,
  p_item_sort integer default null,
  p_item_id uuid default null,
  p_limit integer default 50,
  p_ticker text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with settings as (
    select least(greatest(coalesce(p_limit, 50), 1), 50) as page_limit
  ),
  all_rows as materialized (
    select
      wl.sort_order as group_sort,
      wi.sort_order as item_sort,
      wi.id as item_id,
      jsonb_build_object(
        'id', wl.id,
        'name', wl.name,
        'description', wl.description,
        'sort_order', wl.sort_order
      ) as group_data,
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
        'updated_at', wi.updated_at,
        'decision_version', wi.decision_version
      ) as item_data
    from public.watchlist_items wi
    join public.watchlists wl on wl.id = wi.watchlist_id
    where auth.uid() is not null
      and wi.user_id = auth.uid()
      and wl.user_id = auth.uid()
      and (p_ticker is null or wi.ticker = upper(trim(p_ticker)))
  ),
  filtered as (
    select *
    from all_rows
    where (
        p_group_sort is null
        or p_item_sort is null
        or p_item_id is null
        or (group_sort, item_sort, item_id) > (p_group_sort, p_item_sort, p_item_id)
      )
  ),
  paged as (
    select filtered.*
    from filtered
    order by group_sort, item_sort, item_id
    limit (select page_limit + 1 from settings)
  ),
  visible as (
    select paged.*
    from paged
    order by group_sort, item_sort, item_id
    limit (select page_limit from settings)
  ),
  last_visible as (
    select group_sort, item_sort, item_id
    from visible
    order by group_sort desc, item_sort desc, item_id desc
    limit 1
  )
  select jsonb_build_object(
    'total', (select count(*) from all_rows),
    'has_more', (select count(*) > (select page_limit from settings) from paged),
    'next_cursor', case
      when (select count(*) > (select page_limit from settings) from paged)
        then (select jsonb_build_object(
          'group_sort', group_sort,
          'item_sort', item_sort,
          'item_id', item_id
        ) from last_visible)
      else null
    end,
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object('group', group_data, 'item', item_data)
        order by group_sort, item_sort, item_id
      )
      from visible
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_watchlist_overview_cursor(integer, integer, uuid, integer, text) from public;
grant execute on function public.get_watchlist_overview_cursor(integer, integer, uuid, integer, text) to authenticated;
