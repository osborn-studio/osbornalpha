-- Reuse the existing alert-event delivery pipeline for automatic review-date
-- reminders. System events have no user-authored alert rule.

alter table public.watchlist_alert_events
  alter column alert_id drop not null;

create unique index if not exists watchlist_alert_events_system_key_idx
  on public.watchlist_alert_events (watchlist_item_id, alert_type, event_key)
  where alert_id is null;

create or replace function public.enqueue_watchlist_review_reminders(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if coalesce(p_limit, 0) <= 0 then return 0; end if;

  with due as materialized (
    select
      item.id,
      item.user_id,
      item.ticker,
      item.review_at,
      coalesce(pref.timezone, 'UTC') as timezone,
      (item.review_at at time zone coalesce(pref.timezone, 'UTC'))::date as review_date
    from public.watchlist_items item
    left join public.user_preferences pref on pref.user_id = item.user_id
    where item.review_at is not null
      and item.status not in ('paused', 'invalidated')
      and (item.review_at at time zone coalesce(pref.timezone, 'UTC'))::date
        <= (now() at time zone coalesce(pref.timezone, 'UTC'))::date
    order by item.review_at, item.id
    limit least(greatest(p_limit, 1), 2000)
  ), inserted as (
    insert into public.watchlist_alert_events (
      user_id,
      alert_id,
      watchlist_item_id,
      ticker,
      alert_type,
      event_key,
      payload,
      delivery_status,
      triggered_at
    )
    select
      due.user_id,
      null,
      due.id,
      due.ticker,
      'review',
      'review:' || due.review_date::text,
      jsonb_build_object(
        'label_en', 'Decision review due since ' || due.review_date::text,
        'label_zh', '投资决策复核已于 ' || due.review_date::text || ' 到期',
        'review_at', due.review_at,
        'review_date', due.review_date,
        'timezone', due.timezone
      ),
      'pending',
      now()
    from due
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function public.enqueue_watchlist_review_reminders(integer) from public;
grant execute on function public.enqueue_watchlist_review_reminders(integer) to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_review_reminders')
on conflict (marker) do nothing;
