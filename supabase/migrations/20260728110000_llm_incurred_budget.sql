alter table public.llm_cost_reservations
  drop constraint if exists llm_cost_reservations_terminal_state_check,
  drop constraint if exists llm_cost_reservations_status_check;

alter table public.llm_cost_reservations
  add constraint llm_cost_reservations_status_check
    check (status in ('reserved', 'incurred', 'settled', 'released')),
  add constraint llm_cost_reservations_terminal_state_check check (
    (
      status = 'settled'
      and settled_micrormb is not null
      and settled_at is not null
    )
    or (
      status in ('reserved', 'incurred', 'released')
      and settled_micrormb is null
      and settled_at is null
    )
  );

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

create or replace function public.mark_llm_budget_incurred(
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
    set status = 'incurred'
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

  if v_reservation.status in ('reserved', 'incurred') then
    if p_actual_micrormb > v_reservation.reserved_micrormb then
      raise exception using
        errcode = '22023',
        message = 'actual cost exceeds reserved cost';
    end if;

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
alter function public.mark_llm_budget_incurred(uuid) owner to postgres;
alter function public.settle_llm_budget(uuid, bigint) owner to postgres;
alter function public.release_llm_budget(uuid) owner to postgres;

revoke execute on function public.mark_llm_budget_incurred(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_llm_budget_incurred(uuid)
  to service_role;
