alter table public.usage_events
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists input_tokens bigint not null default 0,
  add column if not exists cache_hit_input_tokens bigint not null default 0,
  add column if not exists cache_miss_input_tokens bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0,
  add column if not exists cost_micrormb bigint not null default 0,
  add column if not exists pricing_version text,
  add column if not exists usd_cny_micros bigint,
  add column if not exists usage_estimated boolean not null default false;

create table if not exists public.llm_cost_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null
    constraint llm_cost_reservations_feature_check
    check (feature in ('copilot', 'perspectives', 'brief_preview')),
  provider text not null,
  model text not null,
  reserved_micrormb bigint not null
    constraint llm_cost_reservations_reserved_cost_check
    check (reserved_micrormb >= 0),
  settled_micrormb bigint
    constraint llm_cost_reservations_settled_cost_check
    check (
      settled_micrormb >= 0
      and settled_micrormb <= reserved_micrormb
    ),
  status text not null default 'reserved'
    constraint llm_cost_reservations_status_check
    check (status in ('reserved', 'settled', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint llm_cost_reservations_terminal_state_check check (
    (
      status = 'settled'
      and settled_micrormb is not null
      and settled_at is not null
    )
    or (
      status in ('reserved', 'released')
      and settled_micrormb is null
      and settled_at is null
    )
  )
);

create index if not exists llm_cost_reservations_user_created_idx
  on public.llm_cost_reservations (user_id, created_at desc);

create index if not exists llm_cost_reservations_active_idx
  on public.llm_cost_reservations (user_id, expires_at, created_at)
  where status = 'reserved';

alter table public.llm_cost_reservations enable row level security;

revoke all on table public.llm_cost_reservations
  from public, anon, authenticated, service_role;
grant select on table public.llm_cost_reservations to service_role;

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
    and (
      r.status = 'settled'
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

create or replace function public.settle_llm_budget(
  p_reservation_id uuid,
  p_actual_micrormb bigint
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

  if p_actual_micrormb > v_reservation.reserved_micrormb then
    raise exception using
      errcode = '22023',
      message = 'actual cost exceeds reserved cost';
  end if;

  if v_reservation.status = 'reserved' then
    update public.llm_cost_reservations as r
    set
      settled_micrormb = p_actual_micrormb,
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

create or replace function public.release_llm_budget(
  p_reservation_id uuid
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
    update public.llm_cost_reservations as r
    set status = 'released'
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

alter function public.reserve_llm_daily_budget(
  uuid, text, text, text, bigint, bigint, integer
) owner to postgres;
alter function public.settle_llm_budget(uuid, bigint) owner to postgres;
alter function public.release_llm_budget(uuid) owner to postgres;

revoke execute on function public.reserve_llm_daily_budget(
  uuid, text, text, text, bigint, bigint, integer
) from public, anon, authenticated;
grant execute on function public.reserve_llm_daily_budget(
  uuid, text, text, text, bigint, bigint, integer
) to service_role;

revoke execute on function public.settle_llm_budget(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.settle_llm_budget(uuid, bigint)
  to service_role;

revoke execute on function public.release_llm_budget(uuid)
  from public, anon, authenticated;
grant execute on function public.release_llm_budget(uuid)
  to service_role;
