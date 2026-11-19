-- Extend usage metering atomically, preserving all existing RPC privileges.

begin;

alter table public.usage_events
  drop constraint usage_events_feature_check,
  add constraint usage_events_feature_check
    check (feature in ('copilot', 'perspectives', 'brief_preview', 'topic_summary'));

alter table public.llm_cost_reservations
  drop constraint llm_cost_reservations_feature_check,
  add constraint llm_cost_reservations_feature_check
    check (feature in ('copilot', 'perspectives', 'brief_preview', 'topic_summary'));

create or replace function public.reserve_llm_daily_budget(
  p_user_id uuid,
  p_feature text,
  p_provider text,
  p_model text,
  p_requested_micrormb bigint,
  p_daily_limit_micrormb bigint,
  p_ttl_seconds integer
)
returns table (
  allowed boolean,
  reservation_id uuid,
  used_micrormb bigint,
  limit_micrormb bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_used numeric;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'p_user_id is required';
  end if;
  if p_feature is null
     or p_feature not in ('copilot', 'perspectives', 'brief_preview', 'topic_summary') then
    raise exception using errcode = '22023', message = 'invalid LLM feature';
  end if;
  if nullif(pg_catalog.btrim(p_provider), '') is null
     or nullif(pg_catalog.btrim(p_model), '') is null then
    raise exception using errcode = '22023', message = 'provider and model are required';
  end if;
  if p_requested_micrormb is null or p_requested_micrormb <= 0 then
    raise exception using errcode = '22023', message = 'requested cost must be positive';
  end if;
  if p_daily_limit_micrormb is null or p_daily_limit_micrormb <= 0 then
    raise exception using errcode = '22023', message = 'daily limit must be positive';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 1 or p_ttl_seconds > 86400 then
    raise exception using errcode = '22023', message = 'TTL must be between 1 and 86400 seconds';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  v_day_start :=
    pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'Asia/Shanghai')
    at time zone 'Asia/Shanghai';
  v_day_end :=
    (
      pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'Asia/Shanghai')
      + interval '1 day'
    ) at time zone 'Asia/Shanghai';

  select coalesce(
    sum(
      case
        when r.status = 'settled' then r.settled_micrormb
        when r.status = 'incurred' then r.reserved_micrormb
        when r.status = 'reserved' and r.expires_at > pg_catalog.now()
          then r.reserved_micrormb
        else 0
      end
    ),
    0
  )
  into v_used
  from public.llm_cost_reservations as r
  where r.user_id = p_user_id
    and r.created_at >= v_day_start
    and r.created_at < v_day_end
    and not r.cap_exempt
    and (
      r.status in ('settled', 'incurred')
      or (r.status = 'reserved' and r.expires_at > pg_catalog.now())
    );

  allowed := v_used + p_requested_micrormb::numeric
    <= p_daily_limit_micrormb::numeric;
  reservation_id := null;
  used_micrormb := (
    case
      when v_used > 9223372036854775807::numeric
        then 9223372036854775807::numeric
      else v_used
    end
  )::bigint;
  limit_micrormb := p_daily_limit_micrormb;

  if allowed then
    insert into public.llm_cost_reservations (
      user_id,
      feature,
      provider,
      model,
      reserved_micrormb,
      expires_at
    )
    values (
      p_user_id,
      p_feature,
      pg_catalog.btrim(p_provider),
      pg_catalog.btrim(p_model),
      p_requested_micrormb,
      pg_catalog.now() + pg_catalog.make_interval(secs => p_ttl_seconds)
    )
    returning id into reservation_id;
  end if;

  return next;
end;
$$;

create or replace function public.create_cap_exempt_llm_audit(
  p_idempotency_key uuid,
  p_user_id uuid,
  p_feature text,
  p_provider text,
  p_model text,
  p_reserved_micrormb bigint,
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
  settled_at timestamptz,
  cap_exempt boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_provider text;
  v_model text;
  v_pricing_version text;
  v_snapshot jsonb;
  v_reservation public.llm_cost_reservations%rowtype;
begin
  if p_idempotency_key is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'cap-exempt audit identity is required';
  end if;
  if p_feature is null
     or p_feature not in ('copilot', 'perspectives', 'brief_preview', 'topic_summary') then
    raise exception using errcode = '22023', message = 'invalid LLM feature';
  end if;

  v_provider := nullif(pg_catalog.btrim(p_provider), '');
  v_model := nullif(pg_catalog.btrim(p_model), '');
  v_pricing_version := nullif(pg_catalog.btrim(p_pricing_version), '');
  if v_provider is null or v_model is null then
    raise exception using errcode = '22023', message = 'provider and model are required';
  end if;
  if p_reserved_micrormb is null or p_reserved_micrormb <= 0 then
    raise exception using errcode = '22023', message = 'reserved cost must be positive';
  end if;
  if p_input_tokens is null or p_input_tokens < 0
     or p_cache_hit_input_tokens is distinct from 0
     or p_cache_miss_input_tokens is distinct from p_input_tokens
     or p_output_tokens is null or p_output_tokens < 0 then
    raise exception using errcode = '22023', message = 'invalid conservative usage ceiling';
  end if;
  if v_pricing_version is null
     or p_usd_cny_micros is null or p_usd_cny_micros <= 0
     or p_usage_estimated is distinct from true then
    raise exception using errcode = '22023', message = 'invalid conservative pricing snapshot';
  end if;

  v_snapshot := pg_catalog.jsonb_build_object(
    'user_id', p_user_id,
    'feature', p_feature,
    'provider', v_provider,
    'model', v_model,
    'reserved_micrormb', p_reserved_micrormb,
    'input_tokens', p_input_tokens,
    'cache_hit_input_tokens', p_cache_hit_input_tokens,
    'cache_miss_input_tokens', p_cache_miss_input_tokens,
    'output_tokens', p_output_tokens,
    'pricing_version', v_pricing_version,
    'usd_cny_micros', p_usd_cny_micros,
    'usage_estimated', p_usage_estimated
  );

  insert into public.llm_cost_reservations (
    user_id,
    feature,
    provider,
    model,
    reserved_micrormb,
    input_tokens,
    cache_hit_input_tokens,
    cache_miss_input_tokens,
    output_tokens,
    pricing_version,
    usd_cny_micros,
    usage_estimated,
    status,
    expires_at,
    cap_exempt,
    cap_exempt_idempotency_key,
    cap_exempt_snapshot
  )
  values (
    p_user_id,
    p_feature,
    v_provider,
    v_model,
    p_reserved_micrormb,
    p_input_tokens,
    p_cache_hit_input_tokens,
    p_cache_miss_input_tokens,
    p_output_tokens,
    v_pricing_version,
    p_usd_cny_micros,
    true,
    'incurred',
    pg_catalog.now() + interval '1 day',
    true,
    p_idempotency_key,
    v_snapshot
  )
  on conflict do nothing;

  select r.*
  into v_reservation
  from public.llm_cost_reservations as r
  where r.cap_exempt_idempotency_key = p_idempotency_key
    and r.cap_exempt
  for update;

  if not found
     or v_reservation.user_id is distinct from p_user_id
     or v_reservation.feature is distinct from p_feature
     or v_reservation.provider is distinct from v_provider
     or v_reservation.model is distinct from v_model
     or v_reservation.reserved_micrormb is distinct from p_reserved_micrormb
     or v_reservation.cap_exempt_snapshot is distinct from v_snapshot then
    raise exception using errcode = '55000', message = 'cap-exempt audit retry conflict';
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
    v_reservation.settled_at,
    v_reservation.cap_exempt;
end;
$$;

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
  if p_feature is null or p_feature not in ('copilot', 'perspectives', 'brief_preview', 'topic_summary')
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
     or p_feature not in ('copilot', 'perspectives', 'brief_preview', 'topic_summary')
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
     or p_feature not in ('copilot', 'perspectives', 'brief_preview', 'topic_summary')
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

commit;
