-- Durable manual Watchlist research refreshes. Scheduled shared refreshes keep
-- using the ticker queue; this queue provides user-visible idempotency and recovery.
create table if not exists public.watchlist_research_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null references public.stocks_universe(ticker) on update cascade on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  stage text not null default 'queued' check (stage in ('queued', 'sources', 'persistence', 'complete')),
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
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists watchlist_research_jobs_active_idx
  on public.watchlist_research_jobs (user_id, ticker)
  where status in ('queued', 'running');
create index if not exists watchlist_research_jobs_due_idx
  on public.watchlist_research_jobs (next_attempt_at, created_at)
  where status in ('queued', 'running');
create index if not exists watchlist_research_jobs_user_created_idx
  on public.watchlist_research_jobs (user_id, created_at desc);

alter table public.watchlist_research_jobs enable row level security;
revoke all on table public.watchlist_research_jobs from anon, authenticated;
grant select on table public.watchlist_research_jobs to authenticated;
grant select, insert, update, delete on table public.watchlist_research_jobs to service_role;
drop policy if exists watchlist_research_jobs_user_select on public.watchlist_research_jobs;
create policy watchlist_research_jobs_user_select
  on public.watchlist_research_jobs for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.enqueue_watchlist_research_job(p_ticker text)
returns public.watchlist_research_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticker text := upper(trim(coalesce(p_ticker, '')));
  v_authorization jsonb;
  v_job public.watchlist_research_jobs;
begin
  if v_user_id is null then raise exception 'watchlist_auth_required'; end if;
  if v_ticker !~ '^[A-Z0-9][A-Z0-9.-]{0,19}$' then raise exception 'invalid_ticker'; end if;
  if not exists (
    select 1 from public.watchlist_items item
    where item.user_id = v_user_id and item.ticker = v_ticker
  ) then raise exception 'watchlist_item_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_ticker, 71204));
  select * into v_job from public.watchlist_research_jobs
  where user_id = v_user_id and ticker = v_ticker and status in ('queued', 'running')
  order by created_at desc limit 1;
  if found then return v_job; end if;

  v_authorization := public.authorize_watchlist_research_refresh();
  if not coalesce((v_authorization ->> 'allowed')::boolean, false) then
    raise exception using errcode = 'P0001', message = format(
      'watchlist_research_%s:%s:%s:%s',
      coalesce(v_authorization ->> 'reason', 'plan_limit'),
      coalesce(v_authorization ->> 'used', '0'),
      coalesce(v_authorization ->> 'limit', '0'),
      coalesce(v_authorization ->> 'plan', 'free')
    );
  end if;

  insert into public.watchlist_research_jobs (
    user_id, ticker, quota_plan, quota_limit, quota_used
  ) values (
    v_user_id,
    v_ticker,
    v_authorization ->> 'plan',
    (v_authorization ->> 'limit')::integer,
    (v_authorization ->> 'used')::integer
  ) returning * into v_job;
  return v_job;
end;
$$;

revoke all on function public.enqueue_watchlist_research_job(text) from public;
grant execute on function public.enqueue_watchlist_research_job(text) to authenticated;

create or replace function public.cancel_watchlist_research_job(p_job_id uuid)
returns public.watchlist_research_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.watchlist_research_jobs;
  v_was_queued boolean := false;
begin
  if auth.uid() is null then raise exception 'watchlist_auth_required'; end if;
  select status = 'queued' into v_was_queued
  from public.watchlist_research_jobs where id = p_job_id and user_id = auth.uid();
  update public.watchlist_research_jobs
  set cancel_requested_at = coalesce(cancel_requested_at, now()),
      status = case when status = 'queued' then 'cancelled' else status end,
      stage = case when status = 'queued' then 'complete' else stage end,
      progress = case when status = 'queued' then 100 else progress end,
      finished_at = case when status = 'queued' then now() else finished_at end,
      updated_at = now()
  where id = p_job_id and user_id = auth.uid() and status in ('queued', 'running')
  returning * into v_job;
  if not found then
    select * into v_job from public.watchlist_research_jobs
    where id = p_job_id and user_id = auth.uid();
  elsif v_was_queued then
    perform public.refund_watchlist_research_quota();
  end if;
  return v_job;
end;
$$;

revoke all on function public.cancel_watchlist_research_job(uuid) from public;
grant execute on function public.cancel_watchlist_research_job(uuid) to authenticated;

create or replace function public.claim_watchlist_research_jobs(
  p_limit integer default 2,
  p_lease_minutes integer default 10,
  p_job_id uuid default null
)
returns setof public.watchlist_research_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'watchlist_research_job_service_role_required';
  end if;
  if coalesce(p_limit, 2) = 0 then return; end if;
  return query
  with candidates as (
    select job.id
    from public.watchlist_research_jobs job
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
  update public.watchlist_research_jobs job
  set status = 'running', stage = 'sources', progress = greatest(job.progress, 10),
      attempt_count = job.attempt_count + 1,
      started_at = coalesce(job.started_at, now()),
      lease_expires_at = now() + make_interval(mins => least(greatest(coalesce(p_lease_minutes, 10), 1), 15)),
      lease_token = gen_random_uuid(),
      updated_at = now()
  from candidates where job.id = candidates.id
  returning job.*;
end;
$$;

revoke all on function public.claim_watchlist_research_jobs(integer, integer, uuid) from public;
grant execute on function public.claim_watchlist_research_jobs(integer, integer, uuid) to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_research_jobs')
on conflict (marker) do nothing;
