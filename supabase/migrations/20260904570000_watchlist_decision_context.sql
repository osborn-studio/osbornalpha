-- Bind each decision revision to the evidence and operational state that was
-- visible when it was saved. The snapshot is intentionally compact: it stores
-- immutable identifiers and timestamps, not duplicated article/model bodies.

alter table public.watchlist_item_decision_history
  add column if not exists context_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context_snapshot) = 'object');

create or replace function public.capture_watchlist_decision_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticker text;
  v_metric jsonb;
  v_research jsonb;
  v_perspective jsonb;
  v_alerts jsonb;
  v_review_reasons jsonb;
begin
  select item.ticker into v_ticker
  from public.watchlist_items item
  where item.id = new.watchlist_item_id and item.user_id = new.user_id;

  select jsonb_build_object(
    'history_range', metric.history_range,
    'benchmark_ticker', metric.benchmark_ticker,
    'calculator_version', metric.calculator_version,
    'observed_at', metric.observed_at,
    'generated_at', metric.generated_at,
    'coverage_ratio', metric.coverage_ratio
  ) into v_metric
  from public.watchlist_metric_snapshots metric
  where metric.ticker = v_ticker
  order by metric.generated_at desc, metric.history_range
  limit 1;

  select jsonb_build_object(
    'news_count', count(*) filter (where artifact.kind = 'news'),
    'report_count', count(*) filter (where artifact.kind = 'report'),
    'latest_fetched_at', max(artifact.fetched_at)
  ) into v_research
  from (
    select 'news'::text as kind, news.fetched_at
    from public.news_items news
    where news.user_id = new.user_id and news.ticker = v_ticker
    union all
    select 'report'::text as kind, report.fetched_at
    from public.broker_reports report
    where report.user_id = new.user_id and report.ticker = v_ticker
  ) artifact;

  select jsonb_build_object(
    'generation_id', perspective.generation_id,
    'model_version', perspective.model_version,
    'prompt_version', perspective.prompt_version,
    'resolved_analysis_mode', perspective.resolved_analysis_mode,
    'evidence_request_id', perspective.evidence_request_id,
    'evidence_fetched_at', perspective.evidence_fetched_at,
    'evidence_result_count', perspective.evidence_result_count,
    'evidence_coverage_ratio', perspective.evidence_coverage_ratio,
    'generated_at', perspective.created_at
  ) into v_perspective
  from public.perspectives perspective
  where perspective.user_id = new.user_id and perspective.ticker = v_ticker
  order by perspective.created_at desc, perspective.id
  limit 1;

  select jsonb_build_object(
    'latest_event_id', (array_agg(event.id order by event.triggered_at desc, event.id))[1],
    'latest_triggered_at', max(event.triggered_at),
    'unread_count', count(*) filter (where event.read_at is null),
    'failed_delivery_count', count(*) filter (
      where event.delivery_status in ('failed', 'dead_letter')
    )
  ) into v_alerts
  from public.watchlist_alert_events event
  where event.user_id = new.user_id
    and event.watchlist_item_id = new.watchlist_item_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', reason.id,
    'type', reason.reason_type,
    'alert_event_id', reason.alert_event_id,
    'created_at', reason.created_at
  ) order by reason.created_at desc), '[]'::jsonb)
  into v_review_reasons
  from public.watchlist_review_reasons reason
  where reason.user_id = new.user_id
    and reason.watchlist_item_id = new.watchlist_item_id
    and reason.resolved_at is null
    and (reason.snoozed_until is null or reason.snoozed_until <= now());

  new.context_snapshot := jsonb_build_object(
    'schema_version', 1,
    'captured_at', now(),
    'ticker', v_ticker,
    'metric', coalesce(v_metric, 'null'::jsonb),
    'research', coalesce(v_research, '{}'::jsonb),
    'perspective', coalesce(v_perspective, 'null'::jsonb),
    'alerts', coalesce(v_alerts, '{}'::jsonb),
    'review_reasons', coalesce(v_review_reasons, '[]'::jsonb)
  );
  return new;
end;
$$;

revoke all on function public.capture_watchlist_decision_context() from public;

drop trigger if exists watchlist_decision_capture_context
  on public.watchlist_item_decision_history;
create trigger watchlist_decision_capture_context
before insert on public.watchlist_item_decision_history
for each row execute function public.capture_watchlist_decision_context();

insert into public.watchlist_release_markers (marker)
values ('watchlist_decision_context')
on conflict (marker) do nothing;
