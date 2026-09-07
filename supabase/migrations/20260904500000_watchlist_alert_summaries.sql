create index if not exists watchlist_alerts_item_enabled_idx
  on public.watchlist_alerts (watchlist_item_id, enabled);

create index if not exists watchlist_alert_events_item_triggered_idx
  on public.watchlist_alert_events (watchlist_item_id, triggered_at desc);

create or replace function public.get_watchlist_alert_summaries(p_item_ids uuid[])
returns table (
  item_id uuid,
  enabled_count bigint,
  unread_count bigint,
  failed_delivery_count bigint,
  latest_triggered_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_items as (
    select wi.id
    from public.watchlist_items wi
    where wi.user_id = auth.uid()
      and wi.id = any(coalesce(p_item_ids, array[]::uuid[]))
  ),
  rule_counts as (
    select wa.watchlist_item_id,
      count(*) filter (where wa.enabled) as enabled_count
    from public.watchlist_alerts wa
    join requested_items ri on ri.id = wa.watchlist_item_id
    group by wa.watchlist_item_id
  ),
  event_counts as (
    select event.watchlist_item_id,
      count(*) filter (where event.read_at is null) as unread_count,
      count(*) filter (where event.delivery_status in ('failed', 'dead_letter')) as failed_delivery_count,
      max(event.triggered_at) as latest_triggered_at
    from public.watchlist_alert_events event
    join requested_items ri on ri.id = event.watchlist_item_id
    group by event.watchlist_item_id
  )
  select ri.id,
    coalesce(rules.enabled_count, 0),
    coalesce(events.unread_count, 0),
    coalesce(events.failed_delivery_count, 0),
    events.latest_triggered_at
  from requested_items ri
  left join rule_counts rules on rules.watchlist_item_id = ri.id
  left join event_counts events on events.watchlist_item_id = ri.id;
$$;

revoke all on function public.get_watchlist_alert_summaries(uuid[]) from public;
grant execute on function public.get_watchlist_alert_summaries(uuid[]) to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_alert_summaries')
on conflict (marker) do nothing;
