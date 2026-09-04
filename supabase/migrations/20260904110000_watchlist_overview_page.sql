-- Page watchlist decision rows in PostgreSQL so the overview endpoint never
-- materializes the user's complete item set before applying limit/offset.
create or replace function public.get_watchlist_overview_page(
  p_offset integer default 0,
  p_limit integer default 50,
  p_ticker text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as materialized (
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
  ), paged as (
    select *
    from filtered
    order by group_sort, item_sort, item_id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object('group', group_data, 'item', item_data)
        order by group_sort, item_sort, item_id
      )
      from paged
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_watchlist_overview_page(integer, integer, text) from public;
grant execute on function public.get_watchlist_overview_page(integer, integer, text) to authenticated;
