create or replace function public.get_watchlist_operational_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'watchlist_operational_health_service_role_required';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'research_queue', jsonb_build_object(
      'due', (select count(*) from public.watchlist_research_ticker_refresh_state where next_refresh_at <= now()),
      'failed', (select count(*) from public.watchlist_research_ticker_refresh_state where status = 'failed'),
      'oldest_due_at', (select min(next_refresh_at) from public.watchlist_research_ticker_refresh_state where next_refresh_at <= now())
    ),
    'metric_queue', jsonb_build_object(
      'due', (select count(*) from public.watchlist_metric_refresh_state where next_refresh_at <= now()),
      'failed', (select count(*) from public.watchlist_metric_refresh_state where status = 'failed'),
      'oldest_due_at', (select min(next_refresh_at) from public.watchlist_metric_refresh_state where next_refresh_at <= now())
    ),
    'quotes', jsonb_build_object(
      'count', (select count(*) from public.market_quote_snapshots),
      'latest_observed_at', (select max(observed_at) from public.market_quote_snapshots)
    ),
    'metrics', jsonb_build_object(
      'count', (select count(*) from public.watchlist_metric_snapshots),
      'latest_observed_at', (select max(observed_at) from public.watchlist_metric_snapshots)
    ),
    'alerts', jsonb_build_object(
      'latest_finished_at', (select finished_at from public.watchlist_alert_runs order by started_at desc limit 1),
      'latest_status', (select status from public.watchlist_alert_runs order by started_at desc limit 1),
      'pending', (select count(*) from public.watchlist_alert_events where delivery_status in ('pending', 'processing')),
      'failed', (select count(*) from public.watchlist_alert_events where delivery_status = 'failed'),
      'dead_letter', (select count(*) from public.watchlist_alert_events where delivery_status = 'dead_letter'),
      'oldest_pending_at', (
        select min(created_at) from public.watchlist_alert_events
        where delivery_status in ('pending', 'processing', 'failed')
      )
    ),
    'citations', jsonb_build_object(
      'sample_size', (
        select count(*) from public.perspectives
        where created_at >= now() - interval '7 days' and evidence_coverage_ratio is not null
      ),
      'average_coverage', (
        select avg(evidence_coverage_ratio) from public.perspectives
        where created_at >= now() - interval '7 days' and evidence_coverage_ratio is not null
      )
    ),
    'shared_research', jsonb_build_object(
      'artifacts', (select count(*) from public.shared_research_artifacts),
      'links', (select count(*) from public.user_research_artifact_links)
    ),
    'perspective_evaluations', jsonb_build_object(
      'pending', (select count(*) from public.perspective_evaluation_queue where status = 'pending'),
      'dead_letter', (select count(*) from public.perspective_evaluation_queue where status = 'dead_letter'),
      'oldest_due_at', (
        select min(due_at) from public.perspective_evaluation_queue
        where status = 'pending' and due_at <= now()
      )
    )
  );
end;
$$;

revoke all on function public.get_watchlist_operational_health() from public;
grant execute on function public.get_watchlist_operational_health() to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_operational_health')
on conflict (marker) do nothing;
