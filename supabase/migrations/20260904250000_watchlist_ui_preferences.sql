-- Keep Watchlist presentation state portable without coupling it to watchlist membership.
alter table public.user_preferences
  add column if not exists watchlist_ui_preferences jsonb not null default '{}'::jsonb,
  add column if not exists watchlist_ui_preferences_version integer not null default 0,
  add column if not exists watchlist_ui_preferences_updated_at timestamptz not null default now();

alter table public.user_preferences
  drop constraint if exists user_preferences_watchlist_ui_preferences_object_check,
  drop constraint if exists user_preferences_watchlist_ui_preferences_size_check,
  drop constraint if exists user_preferences_watchlist_ui_preferences_version_check;

alter table public.user_preferences
  add constraint user_preferences_watchlist_ui_preferences_object_check check (
    jsonb_typeof(watchlist_ui_preferences) = 'object'
  ),
  add constraint user_preferences_watchlist_ui_preferences_size_check check (
    octet_length(convert_to(watchlist_ui_preferences::text, 'UTF8')) <= 65536
  ),
  add constraint user_preferences_watchlist_ui_preferences_version_check check (
    watchlist_ui_preferences_version >= 0
  );

insert into public.watchlist_release_markers (marker)
values ('watchlist_ui_preferences')
on conflict (marker) do nothing;
