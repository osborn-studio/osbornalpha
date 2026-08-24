-- Platform-funded admin calls bypass the per-user cap, but never bypass the
-- durable cost ledger. The immutable snapshot makes a retried pre-network
-- audit distinguishable from a conflicting reuse of its idempotency key.
alter table public.llm_cost_reservations
  add column if not exists cap_exempt boolean not null default false,
  add column if not exists cap_exempt_idempotency_key uuid,
  add column if not exists cap_exempt_snapshot jsonb;

alter table public.llm_cost_reservations
  add constraint llm_cost_reservations_cap_exempt_audit_check check (
    (
      cap_exempt
      and cap_exempt_idempotency_key is not null
      and cap_exempt_snapshot is not null
    )
    or (
      not cap_exempt
      and cap_exempt_idempotency_key is null
      and cap_exempt_snapshot is null
    )
  );

create unique index if not exists llm_cost_reservations_cap_exempt_idempotency_idx
  on public.llm_cost_reservations (cap_exempt_idempotency_key)
  where cap_exempt;

create index if not exists llm_cost_reservations_cap_exempt_created_idx
  on public.llm_cost_reservations (user_id, created_at desc)
  where cap_exempt;

create index if not exists llm_cost_reservations_budget_created_idx
  on public.llm_cost_reservations (user_id, created_at, status, expires_at)
  where not cap_exempt;

create index if not exists usage_events_pending_reconcile_idx
  on public.usage_events (created_at, id)
  where status = 'pending';

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
     or p_feature not in ('copilot', 'perspectives', 'brief_preview') then
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

-- Reinstall the cap function so exempt audit-only rows never consume capacity.
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
     or p_feature not in ('copilot', 'perspectives', 'brief_preview') then
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

-- The audited settlement RPC is idempotent only when every terminal field is
-- an exact match. This applies equally to capped and cap-exempt reservations.
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
  if v_reservation.status not in ('incurred', 'settled') then
    raise exception using errcode = '55000', message = 'LLM cost reservation is not incurred';
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
  elsif v_reservation.settled_micrormb is distinct from p_actual_micrormb
     or v_reservation.input_tokens is distinct from p_input_tokens
     or v_reservation.cache_hit_input_tokens is distinct from p_cache_hit_input_tokens
     or v_reservation.cache_miss_input_tokens is distinct from p_cache_miss_input_tokens
     or v_reservation.output_tokens is distinct from p_output_tokens
     or v_reservation.pricing_version is distinct from pg_catalog.btrim(p_pricing_version)
     or v_reservation.usd_cny_micros is distinct from p_usd_cny_micros
     or v_reservation.usage_estimated is distinct from p_usage_estimated then
    raise exception using errcode = '55000', message = 'settled reservation audit conflict';
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

alter function public.create_cap_exempt_llm_audit(
  uuid, uuid, text, text, text, bigint, bigint, bigint, bigint, bigint,
  text, bigint, boolean
) owner to postgres;
alter function public.reserve_llm_daily_budget(
  uuid, text, text, text, bigint, bigint, integer
) owner to postgres;
alter function public.settle_llm_budget(
  uuid, bigint, bigint, bigint, bigint, bigint, text, bigint, boolean
) owner to postgres;

revoke execute on function public.create_cap_exempt_llm_audit(
  uuid, uuid, text, text, text, bigint, bigint, bigint, bigint, bigint,
  text, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.create_cap_exempt_llm_audit(
  uuid, uuid, text, text, text, bigint, bigint, bigint, bigint, bigint,
  text, bigint, boolean
) to service_role;
