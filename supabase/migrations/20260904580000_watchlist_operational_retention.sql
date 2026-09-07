-- Bounded retention for terminal operational records. User decisions and
-- stored research artifacts are intentionally excluded from this cleanup.

create or replace function public.cleanup_watchlist_operational_history(
  p_job_retention_days integer default 30,
  p_evidence_retention_days integer default 90,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_days integer := least(greatest(coalesce(p_job_retention_days, 30), 7), 365);
  v_evidence_days integer := least(greatest(coalesce(p_evidence_retention_days, 90), 30), 730);
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 0), 5000);
  v_research_jobs integer := 0;
  v_perspective_jobs integer := 0;
  v_evidence_runs integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if v_limit = 0 then
    return jsonb_build_object(
      'research_jobs', 0,
      'perspective_jobs', 0,
      'evidence_runs', 0
    );
  end if;

  with candidates as (
    select id from public.watchlist_research_jobs
    where status in ('succeeded', 'failed', 'cancelled')
      and coalesce(finished_at, updated_at) < now() - make_interval(days => v_job_days)
    order by coalesce(finished_at, updated_at), id
    limit v_limit
  ), deleted as (
    delete from public.watchlist_research_jobs job
    using candidates
    where job.id = candidates.id
    returning job.id
  ) select count(*) into v_research_jobs from deleted;

  with candidates as (
    select id from public.perspective_generation_jobs
    where status in ('succeeded', 'failed', 'cancelled')
      and coalesce(finished_at, updated_at) < now() - make_interval(days => v_job_days)
    order by coalesce(finished_at, updated_at), id
    limit v_limit
  ), deleted as (
    delete from public.perspective_generation_jobs job
    using candidates
    where job.id = candidates.id
    returning job.id
  ) select count(*) into v_perspective_jobs from deleted;

  with candidates as (
    select request_id from public.external_evidence_runs
    where created_at < now() - make_interval(days => v_evidence_days)
    order by created_at, request_id
    limit v_limit
  ), deleted as (
    delete from public.external_evidence_runs run
    using candidates
    where run.request_id = candidates.request_id
    returning run.request_id
  ) select count(*) into v_evidence_runs from deleted;

  return jsonb_build_object(
    'research_jobs', v_research_jobs,
    'perspective_jobs', v_perspective_jobs,
    'evidence_runs', v_evidence_runs
  );
end;
$$;

revoke all on function public.cleanup_watchlist_operational_history(integer, integer, integer) from public;
grant execute on function public.cleanup_watchlist_operational_history(integer, integer, integer) to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_operational_retention')
on conflict (marker) do nothing;
