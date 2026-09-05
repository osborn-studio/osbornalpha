-- Durable, cancellable AI perspective work. Provider secrets are resolved by
-- the worker at execution time and are never copied into this queue.
create table if not exists public.perspective_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null references public.stocks_universe(ticker) on update cascade on delete cascade,
  persona_ids text[],
  requested_analysis_mode text not null check (requested_analysis_mode in ('auto', 'evidence_required', 'structured_only')),
  llm_source text not null check (llm_source in ('user', 'env')),
  include_external_evidence boolean not null,
  request_warnings text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  stage text not null default 'queued' check (stage in ('queued', 'context', 'model', 'persistence', 'complete')),
  progress integer not null default 0 check (progress between 0 and 100),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  quota_plan text not null check (quota_plan in ('free', 'pro', 'admin')),
  quota_limit integer not null check (quota_limit = -1 or quota_limit > 0),
  quota_used integer not null default 0 check (quota_used >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  lease_token uuid,
  cancel_requested_at timestamptz,
  result_generation_id uuid,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists perspective_generation_jobs_active_idx
  on public.perspective_generation_jobs (user_id, ticker)
  where status in ('queued', 'running');
create index if not exists perspective_generation_jobs_due_idx
  on public.perspective_generation_jobs (next_attempt_at, created_at)
  where status in ('queued', 'running');
create index if not exists perspective_generation_jobs_user_created_idx
  on public.perspective_generation_jobs (user_id, created_at desc);

alter table public.perspective_generation_jobs enable row level security;
revoke all on table public.perspective_generation_jobs from anon, authenticated;
grant select on table public.perspective_generation_jobs to authenticated;
grant select, insert, update, delete on table public.perspective_generation_jobs to service_role;

drop policy if exists perspective_generation_jobs_user_select on public.perspective_generation_jobs;
create policy perspective_generation_jobs_user_select
  on public.perspective_generation_jobs for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.enqueue_perspective_generation_job(
  p_ticker text,
  p_persona_ids text[],
  p_analysis_mode text,
  p_llm_source text,
  p_include_external_evidence boolean,
  p_warnings text[] default '{}'
)
returns public.perspective_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticker text := upper(trim(coalesce(p_ticker, '')));
  v_plan text;
  v_limit integer;
  v_used integer := 0;
  v_day_start timestamptz;
  v_include_external_evidence boolean := p_include_external_evidence;
  v_warnings text[] := coalesce(p_warnings, '{}');
  v_job public.perspective_generation_jobs;
begin
  if v_user_id is null then raise exception 'watchlist_auth_required'; end if;
  if v_ticker !~ '^[A-Z0-9][A-Z0-9.-]{0,19}$'
    or p_analysis_mode not in ('auto', 'evidence_required', 'structured_only')
    or p_llm_source not in ('user', 'env')
    or coalesce(array_length(p_persona_ids, 1), 0) > 6
    or coalesce(array_length(p_warnings, 1), 0) > 10 then
    raise exception 'invalid_perspective_generation_job';
  end if;
  if not exists (
    select 1 from public.watchlist_items item
    where item.user_id = v_user_id and item.ticker = v_ticker
      and item.status not in ('paused', 'invalidated')
  ) then raise exception 'watchlist_item_not_found'; end if;

  -- Serialize all platform-key reservations for one user. A per-ticker lock is
  -- insufficient because concurrent requests for different tickers share the
  -- same daily allowance.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 71203));
  select * into v_job from public.perspective_generation_jobs
  where user_id = v_user_id and ticker = v_ticker and status in ('queued', 'running')
  order by created_at desc limit 1;
  if found then return v_job; end if;

  v_plan := public.effective_watchlist_plan(v_user_id);
  v_limit := case when v_plan = 'admin' then -1 when v_plan = 'pro' then 50 else 5 end;
  if p_llm_source = 'env' and v_limit <> -1 then
    v_day_start := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
    select
      (select count(*) from public.usage_events event
       where event.user_id = v_user_id
         and event.feature = 'perspectives'
         and not event.byo
         and event.status = 'completed'
         and event.created_at >= v_day_start
         and event.created_at < v_day_start + interval '1 day')
      +
      (select count(*) from public.perspective_generation_jobs job
       where job.user_id = v_user_id
         and job.llm_source = 'env'
         and job.status in ('queued', 'running')
         and not exists (
           select 1 from public.usage_events event
           where event.idempotency_key = job.lease_token
             and event.status = 'completed'
         ))
    into v_used;
    if v_used >= v_limit then
      raise exception using errcode = 'P0001',
        message = format('perspective_quota_exhausted:%s:%s:%s', v_used, v_limit, v_plan);
    end if;
  end if;

  if v_include_external_evidence and not public.consume_external_evidence_user_quota(30, 3600) then
    if p_analysis_mode = 'auto' then
      v_include_external_evidence := false;
      v_warnings := array_append(v_warnings, 'external_evidence_rate_limited');
    else
      raise exception using errcode = 'P0001', message = 'external_evidence_rate_limited';
    end if;
  end if;

  insert into public.perspective_generation_jobs (
    user_id, ticker, persona_ids, requested_analysis_mode, llm_source,
    include_external_evidence, request_warnings, quota_plan, quota_limit, quota_used
  ) values (
    v_user_id, v_ticker, p_persona_ids, p_analysis_mode, p_llm_source,
    v_include_external_evidence, v_warnings, v_plan, v_limit,
    case when p_llm_source = 'env' and v_limit <> -1 then v_used + 1 else 0 end
  ) returning * into v_job;
  return v_job;
end;
$$;

revoke all on function public.enqueue_perspective_generation_job(text, text[], text, text, boolean, text[]) from public;
grant execute on function public.enqueue_perspective_generation_job(text, text[], text, text, boolean, text[]) to authenticated;

create or replace function public.cancel_perspective_generation_job(p_job_id uuid)
returns public.perspective_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.perspective_generation_jobs;
begin
  if auth.uid() is null then raise exception 'watchlist_auth_required'; end if;
  update public.perspective_generation_jobs
  set cancel_requested_at = coalesce(cancel_requested_at, now()),
      status = case when status = 'queued' then 'cancelled' else status end,
      stage = case when status = 'queued' then 'complete' else stage end,
      progress = case when status = 'queued' then 100 else progress end,
      finished_at = case when status = 'queued' then now() else finished_at end,
      updated_at = now()
  where id = p_job_id and user_id = auth.uid() and status in ('queued', 'running')
  returning * into v_job;
  if not found then
    select * into v_job from public.perspective_generation_jobs
    where id = p_job_id and user_id = auth.uid();
  end if;
  return v_job;
end;
$$;

revoke all on function public.cancel_perspective_generation_job(uuid) from public;
grant execute on function public.cancel_perspective_generation_job(uuid) to authenticated;

create or replace function public.claim_perspective_generation_jobs(
  p_limit integer default 2,
  p_lease_minutes integer default 5,
  p_job_id uuid default null
)
returns setof public.perspective_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_limit, 2) = 0 then return; end if;
  return query
  with candidates as (
    select job.id
    from public.perspective_generation_jobs job
    where job.status in ('queued', 'running')
      and (p_job_id is null or job.id = p_job_id)
      and job.cancel_requested_at is null
      and job.next_attempt_at <= now()
      and (job.status = 'queued' or job.lease_expires_at is null or job.lease_expires_at < now())
      and job.attempt_count < job.max_attempts
    order by job.next_attempt_at, job.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 2), 1), 5)
  )
  update public.perspective_generation_jobs job
  set status = 'running', stage = 'context', progress = greatest(job.progress, 10),
      attempt_count = job.attempt_count + 1,
      started_at = coalesce(job.started_at, now()),
      lease_expires_at = now() + make_interval(mins => least(greatest(coalesce(p_lease_minutes, 5), 1), 10)),
      lease_token = gen_random_uuid(),
      updated_at = now()
  from candidates where job.id = candidates.id
  returning job.*;
end;
$$;

revoke all on function public.claim_perspective_generation_jobs(integer, integer, uuid) from public;
grant execute on function public.claim_perspective_generation_jobs(integer, integer, uuid) to service_role;

-- Extend the existing Watchlist health contract after the generation queue
-- exists. Keeping one RPC avoids a second operational polling path.
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
    'perspective_generation_queue', jsonb_build_object(
      'queued', (select count(*) from public.perspective_generation_jobs where status = 'queued' and next_attempt_at <= now()),
      'running', (select count(*) from public.perspective_generation_jobs where status = 'running'),
      'failed', (select count(*) from public.perspective_generation_jobs where status = 'failed' and finished_at >= now() - interval '24 hours'),
      'oldest_queued_at', (select min(created_at) from public.perspective_generation_jobs where status = 'queued' and next_attempt_at <= now()),
      'oldest_running_at', (select min(started_at) from public.perspective_generation_jobs where status = 'running')
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
      'oldest_pending_at', (select min(created_at) from public.watchlist_alert_events where delivery_status in ('pending', 'processing', 'failed'))
    ),
    'citations', jsonb_build_object(
      'sample_size', (select count(*) from public.perspectives where created_at >= now() - interval '7 days' and evidence_coverage_ratio is not null),
      'average_coverage', (select avg(evidence_coverage_ratio) from public.perspectives where created_at >= now() - interval '7 days' and evidence_coverage_ratio is not null)
    ),
    'shared_research', jsonb_build_object(
      'artifacts', (select count(*) from public.shared_research_artifacts),
      'links', (select count(*) from public.user_research_artifact_links)
    ),
    'perspective_evaluations', jsonb_build_object(
      'pending', (select count(*) from public.perspective_evaluation_queue where status = 'pending'),
      'dead_letter', (select count(*) from public.perspective_evaluation_queue where status = 'dead_letter'),
      'oldest_due_at', (select min(due_at) from public.perspective_evaluation_queue where status = 'pending' and due_at <= now())
    )
  );
end;
$$;

revoke all on function public.get_watchlist_operational_health() from public;
grant execute on function public.get_watchlist_operational_health() to service_role;

insert into public.watchlist_release_markers (marker)
values ('perspective_generation_jobs')
on conflict (marker) do nothing;
