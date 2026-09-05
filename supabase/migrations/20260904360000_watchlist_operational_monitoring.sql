alter table public.service_alert_runs
  drop constraint if exists service_alert_runs_check_name_check;
alter table public.service_alert_runs
  add constraint service_alert_runs_check_name_check
  check (check_name in ('ai_daily', 'quote_15m', 'auth_email_daily', 'watchlist_15m'));

insert into public.watchlist_release_markers (marker)
values ('watchlist_operational_monitoring')
on conflict (marker) do nothing;
