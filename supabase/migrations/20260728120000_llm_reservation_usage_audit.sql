-- Durable per-provider-call accounting. Cost and normalized token usage for a
-- settled platform call are committed by the same row update/transaction.
alter table public.llm_cost_reservations
  add column if not exists input_tokens bigint,
  add column if not exists cache_hit_input_tokens bigint,
  add column if not exists cache_miss_input_tokens bigint,
  add column if not exists output_tokens bigint,
  add column if not exists pricing_version text,
  add column if not exists usd_cny_micros bigint,
  add column if not exists usage_estimated boolean;

alter table public.llm_cost_reservations
  add constraint llm_cost_reservations_usage_values_check check (
    (
      input_tokens is null
      and cache_hit_input_tokens is null
      and cache_miss_input_tokens is null
      and output_tokens is null
      and pricing_version is null
      and usd_cny_micros is null
      and usage_estimated is null
    )
    or (
      input_tokens >= 0
      and cache_hit_input_tokens >= 0
      and cache_miss_input_tokens >= 0
      and output_tokens >= 0
      and cache_hit_input_tokens::numeric + cache_miss_input_tokens::numeric
        = input_tokens::numeric
      and nullif(pg_catalog.btrim(pricing_version), '') is not null
      and usd_cny_micros > 0
      and usage_estimated is not null
    )
  );

create or replace function public.mark_llm_budget_incurred(
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

  if v_reservation.status = 'reserved' then
    if v_reservation.expires_at <= pg_catalog.clock_timestamp() then
      raise exception using
        errcode = '55000',
        message = 'LLM cost reservation expired';
    end if;

    update public.llm_cost_reservations as r
    set
      status = 'incurred',
      input_tokens = p_input_tokens,
      cache_hit_input_tokens = p_cache_hit_input_tokens,
      cache_miss_input_tokens = p_cache_miss_input_tokens,
      output_tokens = p_output_tokens,
      pricing_version = pg_catalog.btrim(p_pricing_version),
      usd_cny_micros = p_usd_cny_micros,
      usage_estimated = true
    where r.id = p_reservation_id
    returning r.* into v_reservation;
  elsif v_reservation.status = 'incurred' then
    if v_reservation.input_tokens is null then
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
    elsif v_reservation.input_tokens is distinct from p_input_tokens
       or v_reservation.cache_hit_input_tokens is distinct from p_cache_hit_input_tokens
       or v_reservation.cache_miss_input_tokens is distinct from p_cache_miss_input_tokens
       or v_reservation.output_tokens is distinct from p_output_tokens
       or v_reservation.pricing_version is distinct from pg_catalog.btrim(p_pricing_version)
       or v_reservation.usd_cny_micros is distinct from p_usd_cny_micros
       or v_reservation.usage_estimated is distinct from true then
      raise exception using
        errcode = '55000',
        message = 'incurred reservation audit snapshot mismatch';
    end if;
  elsif v_reservation.status <> 'settled' then
    raise exception using errcode = '55000', message = 'LLM cost reservation is terminal';
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
  if v_reservation.status not in ('incurred', 'settled') then
    raise exception using errcode = '55000', message = 'LLM cost reservation is not incurred';
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

alter table public.usage_events
  add column if not exists idempotency_key uuid;

create unique index if not exists usage_events_idempotency_key_idx
  on public.usage_events (idempotency_key);

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
    status
  )
  values (
    p_idempotency_key,
    p_user_id,
    p_feature,
    p_ticker,
    least(p_input_tokens, 2147483647::bigint)::integer,
    least(p_output_tokens, 2147483647::bigint)::integer,
    p_provider,
    p_model,
    p_input_tokens,
    p_cache_hit_input_tokens,
    p_cache_miss_input_tokens,
    p_output_tokens,
    p_cost_micrormb,
    p_pricing_version,
    p_usd_cny_micros,
    p_usage_estimated,
    p_byo,
    p_status
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

alter function public.settle_llm_budget(
  uuid, bigint, bigint, bigint, bigint, bigint, text, bigint, boolean
) owner to postgres;
alter function public.mark_llm_budget_incurred(
  uuid, bigint, bigint, bigint, bigint, text, bigint, boolean
) owner to postgres;
alter function public.finalize_llm_budget_incurred(
  uuid, bigint, bigint, bigint, bigint, text, bigint, boolean
) owner to postgres;
alter function public.record_usage_event(
  uuid, uuid, text, text, text, text, bigint, bigint, bigint, bigint,
  bigint, text, bigint, boolean, boolean, text
) owner to postgres;

revoke execute on function public.settle_llm_budget(uuid, bigint)
  from service_role;
revoke execute on function public.mark_llm_budget_incurred(uuid)
  from service_role;
revoke execute on function public.mark_llm_budget_incurred(
  uuid, bigint, bigint, bigint, bigint, text, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.mark_llm_budget_incurred(
  uuid, bigint, bigint, bigint, bigint, text, bigint, boolean
) to service_role;
revoke execute on function public.settle_llm_budget(
  uuid, bigint, bigint, bigint, bigint, bigint, text, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.settle_llm_budget(
  uuid, bigint, bigint, bigint, bigint, bigint, text, bigint, boolean
) to service_role;

revoke execute on function public.finalize_llm_budget_incurred(
  uuid, bigint, bigint, bigint, bigint, text, bigint, boolean
) from public, anon, authenticated;
grant execute on function public.finalize_llm_budget_incurred(
  uuid, bigint, bigint, bigint, bigint, text, bigint, boolean
) to service_role;

revoke execute on function public.record_usage_event(
  uuid, uuid, text, text, text, text, bigint, bigint, bigint, bigint,
  bigint, text, bigint, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.record_usage_event(
  uuid, uuid, text, text, text, text, bigint, bigint, bigint, bigint,
  bigint, text, bigint, boolean, boolean, text
) to service_role;
