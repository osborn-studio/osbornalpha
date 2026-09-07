-- Durable idempotency and result replay for multi-item Watchlist commands.
create table if not exists public.watchlist_bulk_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (request_id ~ '^[A-Za-z0-9:_-]{8,128}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  operation text not null check (operation in ('research', 'alert', 'review')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 262144)),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists watchlist_bulk_workflow_runs_user_created_idx
  on public.watchlist_bulk_workflow_runs (user_id, created_at desc);
create index if not exists watchlist_bulk_workflow_runs_retention_idx
  on public.watchlist_bulk_workflow_runs (coalesce(finished_at, updated_at))
  where status in ('succeeded', 'partial', 'failed');

alter table public.watchlist_bulk_workflow_runs enable row level security;
revoke all on table public.watchlist_bulk_workflow_runs from anon, authenticated;
grant select on table public.watchlist_bulk_workflow_runs to authenticated;
grant select, insert, update, delete on table public.watchlist_bulk_workflow_runs to service_role;
drop policy if exists watchlist_bulk_workflow_runs_user_select on public.watchlist_bulk_workflow_runs;
create policy watchlist_bulk_workflow_runs_user_select
  on public.watchlist_bulk_workflow_runs for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.begin_watchlist_bulk_workflow(
  p_request_id text,
  p_request_hash text,
  p_operation text,
  p_lease_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.watchlist_bulk_workflow_runs;
  v_lease_token uuid := gen_random_uuid();
  v_lease_minutes integer := least(greatest(coalesce(p_lease_minutes, 5), 1), 15);
begin
  if v_user_id is null then raise exception 'watchlist_auth_required'; end if;
  if coalesce(p_request_id, '') !~ '^[A-Za-z0-9:_-]{8,128}$'
    or coalesce(p_request_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_operation, '') not in ('research', 'alert', 'review') then
    raise exception 'invalid_watchlist_bulk_workflow';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_request_id, 71205));
  select * into v_run
  from public.watchlist_bulk_workflow_runs
  where user_id = v_user_id and request_id = p_request_id
  for update;

  if found then
    if v_run.request_hash <> p_request_hash or v_run.operation <> p_operation then
      return jsonb_build_object('state', 'conflict', 'runId', v_run.id);
    end if;
    if v_run.status in ('succeeded', 'partial', 'failed') and v_run.result is not null then
      return jsonb_build_object('state', 'replay', 'runId', v_run.id, 'result', v_run.result);
    end if;
    if v_run.status = 'running' and v_run.lease_expires_at is not null and v_run.lease_expires_at > now() then
      return jsonb_build_object('state', 'in_progress', 'runId', v_run.id);
    end if;
    update public.watchlist_bulk_workflow_runs
    set status = 'running', lease_token = v_lease_token,
        lease_expires_at = now() + make_interval(mins => v_lease_minutes), updated_at = now()
    where id = v_run.id
    returning * into v_run;
  else
    insert into public.watchlist_bulk_workflow_runs (
      user_id, request_id, request_hash, operation, lease_token, lease_expires_at
    ) values (
      v_user_id, p_request_id, p_request_hash, p_operation,
      v_lease_token, now() + make_interval(mins => v_lease_minutes)
    ) returning * into v_run;
  end if;

  return jsonb_build_object(
    'state', 'acquired', 'runId', v_run.id, 'leaseToken', v_run.lease_token
  );
end;
$$;

revoke all on function public.begin_watchlist_bulk_workflow(text, text, text, integer) from public;
grant execute on function public.begin_watchlist_bulk_workflow(text, text, text, integer) to authenticated;

create or replace function public.finish_watchlist_bulk_workflow(
  p_run_id uuid,
  p_lease_token uuid,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_failed integer;
  v_conflicted integer;
begin
  if auth.uid() is null then raise exception 'watchlist_auth_required'; end if;
  if jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text) > 262144 then
    raise exception 'invalid_watchlist_bulk_workflow_result';
  end if;
  begin
    v_total := (p_result ->> 'total')::integer;
    v_failed := (p_result ->> 'failed')::integer;
    v_conflicted := (p_result ->> 'conflicted')::integer;
  exception when others then
    raise exception 'invalid_watchlist_bulk_workflow_result';
  end;
  if v_total < 1 or v_failed < 0 or v_conflicted < 0 then
    raise exception 'invalid_watchlist_bulk_workflow_result';
  end if;

  update public.watchlist_bulk_workflow_runs
  set status = case
        when v_failed = v_total then 'failed'
        when v_failed > 0 or v_conflicted > 0 then 'partial'
        else 'succeeded'
      end,
      result = p_result,
      lease_token = null,
      lease_expires_at = null,
      finished_at = now(),
      updated_at = now()
  where id = p_run_id and user_id = auth.uid()
    and status = 'running' and lease_token = p_lease_token
    and request_id = p_result ->> 'requestId';
  return found;
end;
$$;

revoke all on function public.finish_watchlist_bulk_workflow(uuid, uuid, jsonb) from public;
grant execute on function public.finish_watchlist_bulk_workflow(uuid, uuid, jsonb) to authenticated;

create or replace function public.cleanup_watchlist_bulk_workflow_runs(
  p_retention_days integer default 30,
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_retention_days, 30), 7), 365);
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 0), 5000);
  v_deleted integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if v_limit = 0 then return 0; end if;
  with candidates as (
    select id from public.watchlist_bulk_workflow_runs
    where status in ('succeeded', 'partial', 'failed')
      and coalesce(finished_at, updated_at) < now() - make_interval(days => v_days)
    order by coalesce(finished_at, updated_at), id
    limit v_limit
  ), deleted as (
    delete from public.watchlist_bulk_workflow_runs run
    using candidates where run.id = candidates.id returning run.id
  ) select count(*) into v_deleted from deleted;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_watchlist_bulk_workflow_runs(integer, integer) from public;
grant execute on function public.cleanup_watchlist_bulk_workflow_runs(integer, integer) to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_bulk_workflow_runs')
on conflict (marker) do nothing;
