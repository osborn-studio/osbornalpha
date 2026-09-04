alter table public.user_preferences
  add column if not exists watchlist_alert_channels text[] not null default array['email']::text[],
  add column if not exists watchlist_alert_delivery_mode text not null default 'instant',
  add column if not exists watchlist_alert_quiet_start time,
  add column if not exists watchlist_alert_quiet_end time,
  add column if not exists watchlist_alert_digest_time time not null default '08:30';

alter table public.user_preferences
  drop constraint if exists user_preferences_watchlist_alert_channels_check,
  drop constraint if exists user_preferences_watchlist_alert_delivery_mode_check,
  drop constraint if exists user_preferences_watchlist_alert_quiet_pair_check;

alter table public.user_preferences
  add constraint user_preferences_watchlist_alert_channels_check check (
    watchlist_alert_channels <@ array['email', 'telegram']::text[]
    and cardinality(watchlist_alert_channels) <= 2
  ),
  add constraint user_preferences_watchlist_alert_delivery_mode_check check (
    watchlist_alert_delivery_mode in ('instant', 'digest')
  ),
  add constraint user_preferences_watchlist_alert_quiet_pair_check check (
    (watchlist_alert_quiet_start is null) = (watchlist_alert_quiet_end is null)
  );

alter table public.watchlist_alert_events
  add column if not exists delivery_channels jsonb not null default '{}'::jsonb
    check (jsonb_typeof(delivery_channels) = 'object');

alter table public.watchlist_alert_runs
  add column if not exists delivery_deferred integer not null default 0 check (delivery_deferred >= 0);

create or replace function public.defer_watchlist_alert_events(
  p_event_ids uuid[],
  p_next_delivery_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_next_delivery_at <= now() then
    raise exception using errcode = '22023', message = 'invalid_next_delivery_at';
  end if;
  update public.watchlist_alert_events
  set delivery_status = 'pending',
      delivery_attempts = greatest(delivery_attempts - 1, 0),
      claimed_at = null,
      next_delivery_at = p_next_delivery_at
  where id = any(p_event_ids)
    and delivery_status = 'processing';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.defer_watchlist_alert_events(uuid[], timestamptz) from public;
grant execute on function public.defer_watchlist_alert_events(uuid[], timestamptz) to service_role;
