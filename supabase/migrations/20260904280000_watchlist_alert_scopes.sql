alter table public.watchlist_alert_runs
  add column if not exists scope text not null default 'all',
  add column if not exists skipped_closed integer not null default 0;

alter table public.watchlist_alert_runs
  drop constraint if exists watchlist_alert_runs_scope_check,
  drop constraint if exists watchlist_alert_runs_skipped_closed_check;
alter table public.watchlist_alert_runs
  add constraint watchlist_alert_runs_scope_check check (scope in ('all', 'quote', 'research')),
  add constraint watchlist_alert_runs_skipped_closed_check check (skipped_closed >= 0);

create index if not exists watchlist_alert_runs_scope_started_idx
  on public.watchlist_alert_runs (scope, started_at desc);

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
  if v_scope not in ('all', 'quote', 'research') then
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

insert into public.watchlist_release_markers (marker)
values ('watchlist_alert_scopes')
on conflict (marker) do nothing;
