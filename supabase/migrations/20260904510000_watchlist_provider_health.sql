-- Persist sanitized provider probe outcomes so authenticated Watchlist clients
-- can distinguish configured capability from current runtime health.
create table if not exists public.watchlist_provider_health (
  provider_id text primary key check (provider_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  status text not null check (status in ('passed', 'failed', 'skipped')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  circuit_state text not null default 'closed' check (circuit_state in ('closed', 'open', 'half_open')),
  last_checked_at timestamptz not null,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  next_probe_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.watchlist_provider_health enable row level security;
revoke all on table public.watchlist_provider_health from anon, authenticated;
grant all on table public.watchlist_provider_health to service_role;

create or replace function public.record_watchlist_provider_health(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate jsonb;
  v_provider_id text;
  v_status text;
  v_checked_at timestamptz := now();
  v_latency integer;
  v_error_code text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'watchlist_provider_health_service_role_required';
  end if;
  if coalesce(jsonb_typeof(p_results), 'null') <> 'array' or jsonb_array_length(p_results) > 50 then
    raise exception 'invalid_watchlist_provider_health_results';
  end if;

  for candidate in select value from jsonb_array_elements(p_results)
  loop
    v_provider_id := lower(trim(coalesce(candidate ->> 'id', '')));
    v_status := lower(trim(coalesce(candidate ->> 'status', '')));
    v_latency := case
      when jsonb_typeof(candidate -> 'latencyMs') = 'number'
        then greatest(0, least(600000, (candidate ->> 'latencyMs')::integer))
      else null
    end;
    v_error_code := nullif(left(regexp_replace(coalesce(candidate ->> 'errorCode', ''), '[^a-zA-Z0-9_:-]', '_', 'g'), 100), '');
    if v_provider_id !~ '^[a-z0-9][a-z0-9-]{0,63}$' or v_status not in ('passed', 'failed', 'skipped') then
      raise exception 'invalid_watchlist_provider_health_result';
    end if;

    insert into public.watchlist_provider_health (
      provider_id, status, consecutive_failures, latency_ms, error_code,
      circuit_state, last_checked_at, last_success_at, last_failure_at,
      next_probe_at, updated_at
    ) values (
      v_provider_id,
      v_status,
      case when v_status = 'failed' then 1 else 0 end,
      v_latency,
      case when v_status = 'failed' then coalesce(v_error_code, 'provider_canary_failed') else null end,
      'closed',
      v_checked_at,
      case when v_status = 'passed' then v_checked_at else null end,
      case when v_status = 'failed' then v_checked_at else null end,
      null,
      v_checked_at
    )
    on conflict (provider_id) do update set
      status = excluded.status,
      consecutive_failures = case
        when excluded.status = 'passed' then 0
        when excluded.status = 'failed' then public.watchlist_provider_health.consecutive_failures + 1
        else public.watchlist_provider_health.consecutive_failures
      end,
      latency_ms = excluded.latency_ms,
      error_code = case when excluded.status = 'failed' then excluded.error_code else null end,
      circuit_state = case
        when excluded.status = 'passed' then 'closed'
        when excluded.status = 'failed' and public.watchlist_provider_health.consecutive_failures + 1 >= 3 then 'open'
        when excluded.status = 'failed' then public.watchlist_provider_health.circuit_state
        else public.watchlist_provider_health.circuit_state
      end,
      last_checked_at = excluded.last_checked_at,
      last_success_at = case
        when excluded.status = 'passed' then excluded.last_checked_at
        else public.watchlist_provider_health.last_success_at
      end,
      last_failure_at = case
        when excluded.status = 'failed' then excluded.last_checked_at
        else public.watchlist_provider_health.last_failure_at
      end,
      next_probe_at = case
        when excluded.status = 'passed' then null
        when excluded.status = 'failed' and public.watchlist_provider_health.consecutive_failures + 1 >= 3
          then excluded.last_checked_at + make_interval(mins => least(
            360,
            15 * (2 ^ least(public.watchlist_provider_health.consecutive_failures - 2, 4))::integer
          ))
        else public.watchlist_provider_health.next_probe_at
      end,
      updated_at = excluded.updated_at;
  end loop;
end;
$$;

revoke all on function public.record_watchlist_provider_health(jsonb) from public;
grant execute on function public.record_watchlist_provider_health(jsonb) to service_role;

create or replace function public.get_watchlist_provider_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'watchlist_auth_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'providerId', provider_id,
      'status', status,
      'consecutiveFailures', consecutive_failures,
      'latencyMs', latency_ms,
      'errorCode', error_code,
      'circuitState', circuit_state,
      'lastCheckedAt', last_checked_at,
      'lastSuccessAt', last_success_at,
      'lastFailureAt', last_failure_at,
      'nextProbeAt', next_probe_at
    ) order by provider_id)
    from public.watchlist_provider_health
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_watchlist_provider_health() from public;
grant execute on function public.get_watchlist_provider_health() to authenticated, service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_provider_health')
on conflict (marker) do nothing;
