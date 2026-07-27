alter table public.usage_events
  add column if not exists run_provider text,
  add column if not exists run_model text,
  add column if not exists run_pricing_version text,
  add column if not exists run_usd_cny_micros bigint,
  add column if not exists run_byo boolean,
  add column if not exists finalized_at timestamptz;

update public.usage_events
set
  run_provider = coalesce(nullif(provider, ''), 'unknown'),
  run_model = coalesce(nullif(model, ''), 'unknown'),
  run_pricing_version = pricing_version,
  run_usd_cny_micros = usd_cny_micros,
  run_byo = byo,
  finalized_at = coalesce(finalized_at, created_at)
where run_provider is null
   or run_model is null
   or run_byo is null;

alter table public.usage_events
  alter column run_provider set not null,
  alter column run_model set not null,
  alter column run_byo set not null;

alter table public.usage_events
  drop constraint if exists usage_events_status_check;
alter table public.usage_events
  add constraint usage_events_status_check
  check (status in ('pending', 'completed', 'failed'));

create or replace function public.begin_usage_run(
  p_idempotency_key uuid,
  p_user_id uuid,
  p_feature text,
  p_ticker text,
  p_provider text,
  p_model text,
  p_pricing_version text,
  p_usd_cny_micros bigint,
  p_byo boolean
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.usage_events%rowtype;
begin
  if p_idempotency_key is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'usage run identity is required';
  end if;
  if p_feature is null or p_feature not in ('copilot', 'perspectives', 'brief_preview')
     or nullif(pg_catalog.btrim(p_provider), '') is null
     or nullif(pg_catalog.btrim(p_model), '') is null
     or p_byo is null then
    raise exception using errcode = '22023', message = 'invalid usage run identity';
  end if;
  if not p_byo and (
    nullif(pg_catalog.btrim(p_pricing_version), '') is null
    or p_usd_cny_micros is null
    or p_usd_cny_micros <= 0
  ) then
    raise exception using errcode = '22023', message = 'invalid usage run pricing snapshot';
  end if;

  perform public.fail_stale_usage_runs(900, 100);

  insert into public.usage_events (
    idempotency_key,
    user_id,
    feature,
    ticker,
    provider,
    model,
    input_tokens,
    cache_hit_input_tokens,
    cache_miss_input_tokens,
    output_tokens,
    cost_micrormb,
    pricing_version,
    usd_cny_micros,
    usage_estimated,
    byo,
    status,
    run_provider,
    run_model,
    run_pricing_version,
    run_usd_cny_micros,
    run_byo
  )
  values (
    p_idempotency_key,
    p_user_id,
    p_feature,
    p_ticker,
    pg_catalog.btrim(p_provider),
    pg_catalog.btrim(p_model),
    0,
    0,
    0,
    0,
    0,
    p_pricing_version,
    p_usd_cny_micros,
    true,
    p_byo,
    'pending',
    pg_catalog.btrim(p_provider),
    pg_catalog.btrim(p_model),
    p_pricing_version,
    p_usd_cny_micros,
    p_byo
  )
  on conflict (idempotency_key) do nothing;

  select e.*
  into v_event
  from public.usage_events as e
  where e.idempotency_key = p_idempotency_key
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'usage run not found';
  end if;

  if v_event.user_id is distinct from p_user_id
     or v_event.feature is distinct from p_feature
     or v_event.ticker is distinct from p_ticker
     or v_event.run_provider is distinct from pg_catalog.btrim(p_provider)
     or v_event.run_model is distinct from pg_catalog.btrim(p_model)
     or v_event.run_pricing_version is distinct from p_pricing_version
     or v_event.run_usd_cny_micros is distinct from p_usd_cny_micros
     or v_event.run_byo is distinct from p_byo then
    raise exception using errcode = '55000', message = 'usage run begin conflict';
  end if;

  return query select v_event.id, v_event.status;
end;
$$;

create or replace function public.finalize_usage_run(
  p_idempotency_key uuid,
  p_user_id uuid,
  p_feature text,
  p_ticker text,
  p_provider text,
  p_model text,
  p_input_tokens bigint,
  p_cache_hit_input_tokens bigint,
  p_cache_miss_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_micrormb bigint,
  p_pricing_version text,
  p_usd_cny_micros bigint,
  p_usage_estimated boolean,
  p_byo boolean,
  p_status text
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.usage_events%rowtype;
begin
  if p_idempotency_key is null or p_user_id is null
     or p_feature is null
     or p_feature not in ('copilot', 'perspectives', 'brief_preview')
     or p_status is null
     or p_status not in ('completed', 'failed') then
    raise exception using errcode = '22023', message = 'invalid usage run finalization identity';
  end if;
  if nullif(pg_catalog.btrim(p_provider), '') is null
     or nullif(pg_catalog.btrim(p_model), '') is null
     or p_input_tokens is null or p_input_tokens < 0
     or p_cache_hit_input_tokens is null or p_cache_hit_input_tokens < 0
     or p_cache_miss_input_tokens is null or p_cache_miss_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_cost_micrormb is null or p_cost_micrormb < 0
     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
       <> p_input_tokens::numeric
     or p_usage_estimated is null
     or p_byo is null then
    raise exception using errcode = '22023', message = 'invalid usage run finalization totals';
  end if;
  if not p_byo and (
    nullif(pg_catalog.btrim(p_pricing_version), '') is null
    or p_usd_cny_micros is null
    or p_usd_cny_micros <= 0
  ) then
    raise exception using errcode = '22023', message = 'invalid usage run finalization pricing';
  end if;
  if p_byo and p_cost_micrormb <> 0 then
    raise exception using errcode = '22023', message = 'BYO usage run cost must be zero';
  end if;

  select e.*
  into v_event
  from public.usage_events as e
  where e.idempotency_key = p_idempotency_key
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'usage run not found';
  end if;

  if v_event.status = 'pending' then
    if v_event.user_id is distinct from p_user_id
       or v_event.feature is distinct from p_feature
       or v_event.ticker is distinct from p_ticker then
      raise exception using errcode = '55000', message = 'usage run finalize conflict';
    end if;

    update public.usage_events as e
    set
      tokens_in = least(p_input_tokens, 2147483647::bigint)::integer,
      tokens_out = least(p_output_tokens, 2147483647::bigint)::integer,
      provider = pg_catalog.btrim(p_provider),
      model = pg_catalog.btrim(p_model),
      input_tokens = p_input_tokens,
      cache_hit_input_tokens = p_cache_hit_input_tokens,
      cache_miss_input_tokens = p_cache_miss_input_tokens,
      output_tokens = p_output_tokens,
      cost_micrormb = p_cost_micrormb,
      pricing_version = p_pricing_version,
      usd_cny_micros = p_usd_cny_micros,
      usage_estimated = p_usage_estimated,
      byo = p_byo,
      status = p_status,
      finalized_at = pg_catalog.now()
    where e.id = v_event.id
    returning e.* into v_event;
  elsif v_event.user_id is distinct from p_user_id
     or v_event.feature is distinct from p_feature
     or v_event.ticker is distinct from p_ticker
     or v_event.provider is distinct from pg_catalog.btrim(p_provider)
     or v_event.model is distinct from pg_catalog.btrim(p_model)
     or v_event.input_tokens is distinct from p_input_tokens
     or v_event.cache_hit_input_tokens is distinct from p_cache_hit_input_tokens
     or v_event.cache_miss_input_tokens is distinct from p_cache_miss_input_tokens
     or v_event.output_tokens is distinct from p_output_tokens
     or v_event.cost_micrormb is distinct from p_cost_micrormb
     or v_event.pricing_version is distinct from p_pricing_version
     or v_event.usd_cny_micros is distinct from p_usd_cny_micros
     or v_event.usage_estimated is distinct from p_usage_estimated
     or v_event.byo is distinct from p_byo
     or v_event.status is distinct from p_status then
    raise exception using errcode = '55000', message = 'usage run finalize conflict';
  end if;

  return query select v_event.id, v_event.status;
end;
$$;

create or replace function public.fail_stale_usage_runs(
  p_stale_after_seconds integer default 900,
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
begin
  if p_stale_after_seconds < 60 or p_stale_after_seconds > 86400
     or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'invalid stale usage run bounds';
  end if;

  with stale as (
    select e.id
    from public.usage_events as e
    where e.status = 'pending'
      and e.created_at < pg_catalog.now()
        - pg_catalog.make_interval(secs => p_stale_after_seconds)
    order by e.created_at, e.id
    for update skip locked
    limit p_limit
  )
  update public.usage_events as e
  set
    status = 'failed',
    usage_estimated = true,
    finalized_at = pg_catalog.now()
  from stale
  where e.id = stale.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter function public.begin_usage_run(
  uuid, uuid, text, text, text, text, text, bigint, boolean
) owner to postgres;
alter function public.finalize_usage_run(
  uuid, uuid, text, text, text, text, bigint, bigint, bigint, bigint,
  bigint, text, bigint, boolean, boolean, text
) owner to postgres;
alter function public.fail_stale_usage_runs(integer, integer) owner to postgres;

revoke execute on function public.begin_usage_run(
  uuid, uuid, text, text, text, text, text, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.begin_usage_run(
  uuid, uuid, text, text, text, text, text, bigint, boolean
) to service_role;
revoke execute on function public.finalize_usage_run(
  uuid, uuid, text, text, text, text, bigint, bigint, bigint, bigint,
  bigint, text, bigint, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.finalize_usage_run(
  uuid, uuid, text, text, text, text, bigint, bigint, bigint, bigint,
  bigint, text, bigint, boolean, boolean, text
) to service_role;
revoke execute on function public.fail_stale_usage_runs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.fail_stale_usage_runs(integer, integer)
  to service_role;

-- Keep the legacy terminal-only writer compatible with the new non-null run
-- identity columns while callers migrate to begin/finalize_usage_run.
create or replace function public.record_usage_event(
  p_idempotency_key uuid,
  p_user_id uuid,
  p_feature text,
  p_ticker text,
  p_provider text,
  p_model text,
  p_input_tokens bigint,
  p_cache_hit_input_tokens bigint,
  p_cache_miss_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_micrormb bigint,
  p_pricing_version text,
  p_usd_cny_micros bigint,
  p_usage_estimated boolean,
  p_byo boolean,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_inserted integer;
begin
  if p_idempotency_key is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'audit identity is required';
  end if;
  if p_feature is null
     or p_feature not in ('copilot', 'perspectives', 'brief_preview')
     or p_status is null
     or p_status not in ('completed', 'failed') then
    raise exception using errcode = '22023', message = 'invalid usage audit classification';
  end if;
  if p_input_tokens is null or p_input_tokens < 0
     or p_cache_hit_input_tokens is null or p_cache_hit_input_tokens < 0
     or p_cache_miss_input_tokens is null or p_cache_miss_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_cost_micrormb is null or p_cost_micrormb < 0
     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
       <> p_input_tokens::numeric then
    raise exception using errcode = '22023', message = 'invalid usage audit totals';
  end if;
  if p_usage_estimated is null
     or p_byo is null
     or nullif(pg_catalog.btrim(p_provider), '') is null
     or nullif(pg_catalog.btrim(p_model), '') is null
     or (
       not p_byo
       and (
         nullif(pg_catalog.btrim(p_pricing_version), '') is null
         or p_usd_cny_micros is null
         or p_usd_cny_micros <= 0
       )
     )
     or (p_byo and p_cost_micrormb <> 0) then
    raise exception using errcode = '22023', message = 'invalid usage audit pricing snapshot';
  end if;

  insert into public.usage_events (
    idempotency_key,
    user_id,
    feature,
    ticker,
    tokens_in,
    tokens_out,
    provider,
    model,
    input_tokens,
    cache_hit_input_tokens,
    cache_miss_input_tokens,
    output_tokens,
    cost_micrormb,
    pricing_version,
    usd_cny_micros,
    usage_estimated,
    byo,
    status,
    run_provider,
    run_model,
    run_pricing_version,
    run_usd_cny_micros,
    run_byo,
    finalized_at
  )
  values (
    p_idempotency_key,
    p_user_id,
    p_feature,
    p_ticker,
    least(p_input_tokens, 2147483647::bigint)::integer,
    least(p_output_tokens, 2147483647::bigint)::integer,
    pg_catalog.btrim(p_provider),
    pg_catalog.btrim(p_model),
    p_input_tokens,
    p_cache_hit_input_tokens,
    p_cache_miss_input_tokens,
    p_output_tokens,
    p_cost_micrormb,
    p_pricing_version,
    p_usd_cny_micros,
    p_usage_estimated,
    p_byo,
    p_status,
    pg_catalog.btrim(p_provider),
    pg_catalog.btrim(p_model),
    p_pricing_version,
    p_usd_cny_micros,
    p_byo,
    pg_catalog.now()
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

-- Terminal retries are idempotent only when the complete audit payload is
-- identical. A reused reservation id must never silently accept new totals.
create or replace function public.settle_llm_budget(
  p_reservation_id uuid,
  p_actual_micrormb bigint,
  p_input_tokens bigint,
  p_cache_hit_input_tokens bigint,
  p_cache_miss_input_tokens bigint,
  p_output_tokens bigint,
  p_pricing_version text,
  p_usd_cny_micros bigint,
  p_usage_estimated boolean
)
returns table (
  reservation_id uuid,
  user_id uuid,
  feature text,
  provider text,
  model text,
  reserved_micrormb bigint,
  settled_micrormb bigint,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  settled_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid;
  v_reservation public.llm_cost_reservations%rowtype;
begin
  if p_reservation_id is null then
    raise exception using errcode = '22023', message = 'p_reservation_id is required';
  end if;
  if p_actual_micrormb is null or p_actual_micrormb < 0 then
    raise exception using errcode = '22023', message = 'actual cost must be non-negative';
  end if;
  if p_input_tokens is null or p_input_tokens < 0
     or p_cache_hit_input_tokens is null or p_cache_hit_input_tokens < 0
     or p_cache_miss_input_tokens is null or p_cache_miss_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
       <> p_input_tokens::numeric then
    raise exception using errcode = '22023', message = 'invalid normalized usage';
  end if;
  if nullif(pg_catalog.btrim(p_pricing_version), '') is null
     or p_usd_cny_micros is null or p_usd_cny_micros <= 0
     or p_usage_estimated is null then
    raise exception using errcode = '22023', message = 'invalid pricing snapshot';
  end if;

  select r.user_id
  into v_user_id
  from public.llm_cost_reservations as r
  where r.id = p_reservation_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'LLM cost reservation not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );
  select r.*
  into v_reservation
  from public.llm_cost_reservations as r
  where r.id = p_reservation_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'LLM cost reservation not found';
  end if;

  if v_reservation.status = 'incurred' then
    if p_actual_micrormb > v_reservation.reserved_micrormb then
      raise exception using errcode = '22023', message = 'actual cost exceeds reserved cost';
    end if;
    update public.llm_cost_reservations as r
    set
      settled_micrormb = p_actual_micrormb,
      input_tokens = p_input_tokens,
      cache_hit_input_tokens = p_cache_hit_input_tokens,
      cache_miss_input_tokens = p_cache_miss_input_tokens,
      output_tokens = p_output_tokens,
      pricing_version = pg_catalog.btrim(p_pricing_version),
      usd_cny_micros = p_usd_cny_micros,
      usage_estimated = p_usage_estimated,
      status = 'settled',
      settled_at = pg_catalog.now()
    where r.id = p_reservation_id
    returning r.* into v_reservation;
  elsif v_reservation.status = 'settled' then
    if v_reservation.settled_micrormb is distinct from p_actual_micrormb
       or v_reservation.input_tokens is distinct from p_input_tokens
       or v_reservation.cache_hit_input_tokens is distinct from p_cache_hit_input_tokens
       or v_reservation.cache_miss_input_tokens is distinct from p_cache_miss_input_tokens
       or v_reservation.output_tokens is distinct from p_output_tokens
       or v_reservation.pricing_version is distinct from pg_catalog.btrim(p_pricing_version)
       or v_reservation.usd_cny_micros is distinct from p_usd_cny_micros
       or v_reservation.usage_estimated is distinct from p_usage_estimated then
      raise exception using errcode = '55000', message = 'settled reservation audit conflict';
    end if;
  else
    raise exception using errcode = '55000', message = 'LLM cost reservation is not incurred';
  end if;

  return query
  select
    v_reservation.id,
    v_reservation.user_id,
    v_reservation.feature,
    v_reservation.provider,
    v_reservation.model,
    v_reservation.reserved_micrormb,
    v_reservation.settled_micrormb,
    v_reservation.status,
    v_reservation.expires_at,
    v_reservation.created_at,
    v_reservation.settled_at;
end;
$$;

create or replace function public.finalize_llm_budget_incurred(
  p_reservation_id uuid,
  p_input_tokens bigint,
  p_cache_hit_input_tokens bigint,
  p_cache_miss_input_tokens bigint,
  p_output_tokens bigint,
  p_pricing_version text,
  p_usd_cny_micros bigint,
  p_usage_estimated boolean
)
returns table (
  reservation_id uuid,
  user_id uuid,
  feature text,
  provider text,
  model text,
  reserved_micrormb bigint,
  settled_micrormb bigint,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  settled_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid;
  v_reservation public.llm_cost_reservations%rowtype;
begin
  if p_reservation_id is null then
    raise exception using errcode = '22023', message = 'p_reservation_id is required';
  end if;
  if p_input_tokens is null or p_input_tokens < 0
     or p_cache_hit_input_tokens is null or p_cache_hit_input_tokens < 0
     or p_cache_miss_input_tokens is null or p_cache_miss_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_cache_hit_input_tokens::numeric + p_cache_miss_input_tokens::numeric
       <> p_input_tokens::numeric then
    raise exception using errcode = '22023', message = 'invalid normalized usage';
  end if;
  if nullif(pg_catalog.btrim(p_pricing_version), '') is null
     or p_usd_cny_micros is null or p_usd_cny_micros <= 0
     or p_usage_estimated is distinct from true then
    raise exception using errcode = '22023', message = 'invalid conservative pricing snapshot';
  end if;

  select r.user_id
  into v_user_id
  from public.llm_cost_reservations as r
  where r.id = p_reservation_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'LLM cost reservation not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );
  select r.*
  into v_reservation
  from public.llm_cost_reservations as r
  where r.id = p_reservation_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'LLM cost reservation not found';
  end if;

  if v_reservation.status = 'incurred' and v_reservation.input_tokens is null then
    update public.llm_cost_reservations as r
    set
      input_tokens = p_input_tokens,
      cache_hit_input_tokens = p_cache_hit_input_tokens,
      cache_miss_input_tokens = p_cache_miss_input_tokens,
      output_tokens = p_output_tokens,
      pricing_version = pg_catalog.btrim(p_pricing_version),
      usd_cny_micros = p_usd_cny_micros,
      usage_estimated = true
    where r.id = p_reservation_id
    returning r.* into v_reservation;
  elsif v_reservation.status in ('incurred', 'settled') then
    if v_reservation.input_tokens is distinct from p_input_tokens
       or v_reservation.cache_hit_input_tokens is distinct from p_cache_hit_input_tokens
       or v_reservation.cache_miss_input_tokens is distinct from p_cache_miss_input_tokens
       or v_reservation.output_tokens is distinct from p_output_tokens
       or v_reservation.pricing_version is distinct from pg_catalog.btrim(p_pricing_version)
       or v_reservation.usd_cny_micros is distinct from p_usd_cny_micros
       or v_reservation.usage_estimated is distinct from true then
      raise exception using errcode = '55000', message = 'incurred finalization audit conflict';
    end if;
  else
    raise exception using errcode = '55000', message = 'LLM cost reservation is not incurred';
  end if;

  return query
  select
    v_reservation.id,
    v_reservation.user_id,
    v_reservation.feature,
    v_reservation.provider,
    v_reservation.model,
    v_reservation.reserved_micrormb,
    v_reservation.settled_micrormb,
    v_reservation.status,
    v_reservation.expires_at,
    v_reservation.created_at,
    v_reservation.settled_at;
end;
$$;
