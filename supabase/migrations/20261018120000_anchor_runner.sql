-- I1.4b: anchor runner database identity, scoped functions and checkpoint cache.
-- ADR docs/adr/2026-10-18-anchor-runner-and-checkpoint.md §4; plan 06 §D "Runner RLS迁移形状".
-- Disabled state: this migration creates NOLOGIN roles, tables and functions only.
-- No login role, no principal mapping and no runtime identity row are created here;
-- operations register those during release, so nothing can acknowledge until then.
do $$ begin
  if not exists (select from pg_roles where rolname = 'alpha_anchor_fn_owner') then
    create role alpha_anchor_fn_owner nologin noinherit nosuperuser nobypassrls nocreaterole nocreatedb;
  end if;
  if not exists (select from pg_roles where rolname = 'alpha_anchor_runner') then
    create role alpha_anchor_runner nologin noinherit nosuperuser nobypassrls nocreaterole nocreatedb;
  end if;
end $$;
-- Hosted Supabase applies migrations as a non-superuser `postgres` (CREATEROLE only, PostgreSQL 17,
-- createrole_self_grant empty). There, creating a role grants the creator ADMIN OPTION but no SET
-- membership, and `alter function ... owner to alpha_anchor_fn_owner` below needs two things the
-- executor does not get for free: the ability to SET ROLE to the new owner, and CREATE on the schema
-- for the new owner. Grant both to whichever role runs this file (never a hard-coded role name).
-- A superuser already satisfies both, so the statements are harmless there. The membership stays,
-- matching the production project (applied 2026-10-18 as part of version 20261018120000); CREATE on
-- public is temporary and revoked at the end of this file.
do $$ begin
  if current_user <> 'alpha_anchor_fn_owner' and not pg_catalog.pg_has_role(current_user, 'alpha_anchor_fn_owner', 'SET') then
    execute pg_catalog.format('grant alpha_anchor_fn_owner to %I with set true, inherit false', current_user);
  end if;
end $$;
grant create on schema public to alpha_anchor_fn_owner;
grant usage on schema public to alpha_anchor_fn_owner, alpha_anchor_runner;
-- No USAGE on schema auth: the anchor functions name only pg_catalog and public objects, and the
-- foreign-key checks against auth.users run as that table's owner. On hosted Supabase `postgres`
-- holds USAGE on auth without grant option, so such a grant would only emit a WARNING anyway.

-- One registered database identity per deployment. Written only by the release executor.
create table public.research_s4_runtime_identity (
  singleton boolean primary key default true check (singleton),
  database_identity uuid not null,
  generation bigint not null check (generation >= 1),
  registered_at timestamptz not null default clock_timestamp()
);
-- Operator-maintained principal mapping: which database session role may anchor for which owner.
create table public.research_s4_anchor_principals (
  principal_id uuid primary key,
  session_role name not null,
  user_id uuid not null references auth.users(id),
  environment text not null check (environment in ('local','staging','production')),
  generation bigint not null check (generation >= 1),
  valid_until timestamptz not null,
  unique (session_role, user_id)
);
-- Cache of the last checkpoint the runner confirmed in the independent registry.
-- The authoritative copy lives outside this database; this row only gates evaluation.
create table public.research_s4_anchor_checkpoints (
  user_id uuid primary key references auth.users(id),
  store_id uuid not null,
  database_identity uuid not null,
  last_sequence bigint not null check (last_sequence >= 1),
  last_hash text not null check (last_hash ~ '^[0-9a-f]{64}$'),
  generation bigint not null check (generation >= 1),
  principal_id uuid not null,
  confirmed_at timestamptz not null default clock_timestamp()
);

do $$ declare t text; begin
  foreach t in array array['research_s4_runtime_identity','research_s4_anchor_principals','research_s4_anchor_checkpoints'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Web runtime: may learn whether the gate is active and read its owner's checkpoint. Never writes either.
grant select on public.research_s4_runtime_identity to alpha_s4_runtime;
create policy s4_identity_read on public.research_s4_runtime_identity for select to alpha_s4_runtime using (true);
grant select on public.research_s4_anchor_checkpoints to alpha_s4_runtime;
create policy s4_owner on public.research_s4_anchor_checkpoints for select to alpha_s4_runtime using (user_id = auth.uid());

-- Hosted Supabase's default privileges in public also hand EXECUTE on new functions to anon and
-- authenticated, which `revoke ... from public` alone does not undo, so both are named explicitly.
-- Grants on each function are issued while the executor still owns it, i.e. before the owner is
-- changed: a non-superuser executor does not inherit the owner role, so afterwards it could only
-- warn "no privileges were granted" instead of granting EXECUTE to the runner.
-- Function owner: transaction-scoped owner plus the principal mapping of the real session_user.
-- A caller-preset GUC alone never grants access; the mapping must also name session_user and the owner.
create function public.research_s4_anchor_scope() returns uuid
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select nullif(pg_catalog.current_setting('alpha.anchor_owner', true), '')::uuid
$$;
revoke all on function public.research_s4_anchor_scope() from public, anon, authenticated;
alter function public.research_s4_anchor_scope() owner to alpha_anchor_fn_owner;

grant select on public.research_s4_runtime_identity to alpha_anchor_fn_owner;
create policy anchor_fn_identity on public.research_s4_runtime_identity for select to alpha_anchor_fn_owner using (true);
grant select on public.research_s4_anchor_principals to alpha_anchor_fn_owner;
create policy anchor_fn_principal on public.research_s4_anchor_principals for select to alpha_anchor_fn_owner using (session_role = session_user);
do $$ declare t text; begin
  foreach t in array array['research_s4_outbox','research_s4_observation_state','research_s4_records','research_s4_candidates','research_s4_anchor_checkpoints'] loop
    execute format('create policy anchor_fn_scope on public.%I to alpha_anchor_fn_owner using (user_id = public.research_s4_anchor_scope() and exists (select 1 from public.research_s4_anchor_principals p where p.session_role = session_user and p.user_id = %I.user_id and p.valid_until > pg_catalog.clock_timestamp())) with check (user_id = public.research_s4_anchor_scope() and exists (select 1 from public.research_s4_anchor_principals p where p.session_role = session_user and p.user_id = %I.user_id and p.valid_until > pg_catalog.clock_timestamp()))', t, t, t);
    execute format('grant select on public.%I to alpha_anchor_fn_owner', t);
  end loop;
end $$;
grant update (anchored_at, receipt_hash) on public.research_s4_outbox to alpha_anchor_fn_owner;
grant update (anchor_status, revision) on public.research_s4_observation_state to alpha_anchor_fn_owner;
grant insert on public.research_s4_records to alpha_anchor_fn_owner;
grant insert, update (last_sequence, last_hash, generation, principal_id, confirmed_at) on public.research_s4_anchor_checkpoints to alpha_anchor_fn_owner;
grant insert on public.research_audit_log to alpha_anchor_fn_owner;
create policy anchor_fn_audit on public.research_audit_log for insert to alpha_anchor_fn_owner with check (user_id = public.research_s4_anchor_scope() and exists (select 1 from public.research_s4_anchor_principals p where p.session_role = session_user and p.user_id = research_audit_log.user_id and p.valid_until > pg_catalog.clock_timestamp()));

-- Internal: resolve the principal for session_user and the requested owner, fence on the registered
-- generation, and set the transaction-local scope. Not executable by the runner directly.
create function public.research_s4_anchor_principal(p_owner uuid, p_generation bigint) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare p public.research_s4_anchor_principals%rowtype; ident public.research_s4_runtime_identity%rowtype;
begin
  if p_owner is null or p_generation is null then raise exception 'anchor_principal_denied' using errcode = '42501'; end if;
  select * into p from public.research_s4_anchor_principals where session_role = session_user and user_id = p_owner;
  if not found or p.valid_until <= pg_catalog.clock_timestamp() then raise exception 'anchor_principal_denied' using errcode = '42501'; end if;
  select * into ident from public.research_s4_runtime_identity;
  if not found then raise exception 'anchor_identity_unregistered' using errcode = '42501'; end if;
  if p.generation <> ident.generation or p_generation <> ident.generation then raise exception 'anchor_generation_fenced' using errcode = '42501'; end if;
  perform pg_catalog.set_config('alpha.anchor_owner', p_owner::text, true);
  return p.principal_id;
end $$;
revoke all on function public.research_s4_anchor_principal(uuid, bigint) from public, anon, authenticated;
alter function public.research_s4_anchor_principal(uuid, bigint) owner to alpha_anchor_fn_owner;

create function public.research_s4_anchor_tail(p_owner uuid, p_generation bigint)
returns table (last_sequence bigint, last_anchored_sequence bigint, last_receipt_hash text, checkpoint_sequence bigint, database_identity uuid, generation bigint)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.research_s4_anchor_principal(p_owner, p_generation);
  return query select
    (select max(o.sequence) from public.research_s4_outbox o where o.user_id = p_owner),
    (select max(o.sequence) from public.research_s4_outbox o where o.user_id = p_owner and o.anchored_at is not null),
    (select o.receipt_hash from public.research_s4_outbox o where o.user_id = p_owner and o.anchored_at is not null order by o.sequence desc limit 1),
    (select c.last_sequence from public.research_s4_anchor_checkpoints c where c.user_id = p_owner),
    i.database_identity, i.generation
  from public.research_s4_runtime_identity i;
end $$;
revoke all on function public.research_s4_anchor_tail(uuid, bigint) from public, anon, authenticated;
grant execute on function public.research_s4_anchor_tail(uuid, bigint) to alpha_anchor_runner;
alter function public.research_s4_anchor_tail(uuid, bigint) owner to alpha_anchor_fn_owner;

create function public.research_s4_anchor_read_outbox(p_owner uuid, p_generation bigint, p_after bigint, p_limit integer)
returns table (sequence bigint, candidate_id uuid, record_id uuid, event jsonb, event_hash text, anchored_at timestamptz, receipt_hash text)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 or p_after is null or p_after < 0 then raise exception 'input_limit' using errcode = '22023'; end if;
  perform public.research_s4_anchor_principal(p_owner, p_generation);
  return query select o.sequence, o.candidate_id, o.record_id, o.event, o.event_hash, o.anchored_at, o.receipt_hash
    from public.research_s4_outbox o where o.user_id = p_owner and o.sequence > p_after order by o.sequence limit p_limit;
end $$;
revoke all on function public.research_s4_anchor_read_outbox(uuid, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.research_s4_anchor_read_outbox(uuid, bigint, bigint, integer) to alpha_anchor_runner;
alter function public.research_s4_anchor_read_outbox(uuid, bigint, bigint, integer) owner to alpha_anchor_fn_owner;

-- Acknowledge one durable receipt. Serialized with web transactions by the same owner advisory lock
-- (see src/lib/research/s4/db.ts). Chain order and hashes are enforced in SQL; a repeated identical
-- acknowledgement is a duplicate, a different receipt for the same sequence is a conflict.
create function public.research_s4_anchor_ack(p_owner uuid, p_generation bigint, p_sequence bigint, p_event_hash text, p_receipt_hash text,
  p_previous_hash text, p_store_id uuid, p_receipt_record jsonb, p_receipt_record_hash text)
returns table (acknowledged boolean, duplicate boolean)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare principal uuid; row public.research_s4_outbox%rowtype; prev public.research_s4_outbox%rowtype; at timestamptz; record_id uuid;
begin
  if p_sequence is null or p_event_hash !~ '^[0-9a-f]{64}$' or p_receipt_hash !~ '^[0-9a-f]{64}$' or p_previous_hash !~ '^[0-9a-f]{64}$'
     or p_receipt_record_hash !~ '^[0-9a-f]{64}$' or p_store_id is null or pg_catalog.jsonb_typeof(p_receipt_record) <> 'object' then
    raise exception 'invalid_schema' using errcode = '22023';
  end if;
  principal := public.research_s4_anchor_principal(p_owner, p_generation);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 0));
  select * into row from public.research_s4_outbox o where o.user_id = p_owner and o.sequence = p_sequence for update;
  if not found then raise exception 'anchor_sequence_unknown' using errcode = '42501'; end if;
  if row.event_hash <> p_event_hash then raise exception 'anchor_hash_conflict' using errcode = '42501'; end if;
  if row.anchored_at is not null then
    if row.receipt_hash = p_receipt_hash then return query select false, true; return; end if;
    raise exception 'anchor_hash_conflict' using errcode = '42501';
  end if;
  select * into prev from public.research_s4_outbox o where o.user_id = p_owner and o.sequence < p_sequence order by o.sequence desc limit 1;
  if found then
    if prev.anchored_at is null or prev.receipt_hash <> p_previous_hash then raise exception 'anchor_order_violation' using errcode = '42501'; end if;
  elsif p_previous_hash <> repeat('0', 64) then
    raise exception 'anchor_order_violation' using errcode = '42501';
  end if;
  if p_receipt_record->>'receipt_hash' is distinct from p_receipt_hash or p_receipt_record->>'previous_hash' is distinct from p_previous_hash
     or p_receipt_record->>'record_id' is distinct from row.record_id::text or p_receipt_record->>'store_id' is distinct from p_store_id::text
     or p_receipt_record->>'execution_principal_id' is distinct from principal::text or p_receipt_record->>'provenance_level' is distinct from 'local_receipt' then
    raise exception 'invalid_schema' using errcode = '22023';
  end if;
  at := pg_catalog.clock_timestamp();
  update public.research_s4_outbox o set anchored_at = at, receipt_hash = p_receipt_hash where o.user_id = p_owner and o.sequence = p_sequence;
  if row.event->>'kind' = 'Observation' then
    update public.research_s4_observation_state s set anchor_status = 'anchored', revision = revision + 1
      where s.user_id = p_owner and s.observation_id = row.record_id and s.anchor_status = 'anchor_pending';
  end if;
  record_id := pg_catalog.gen_random_uuid();
  insert into public.research_s4_records (user_id, id, candidate_id, kind, payload, payload_hash, recorded_at)
    values (p_owner, record_id, row.candidate_id, 'AnchorReceipt', p_receipt_record, p_receipt_record_hash, at);
  insert into public.research_audit_log (id, user_id, actor, action, object_type, object_id, detail, created_at)
    values (pg_catalog.gen_random_uuid(), p_owner, 'agent', 's4.AnchorReceipt', 'AnchorReceipt', record_id,
      pg_catalog.jsonb_build_object('candidate_id', row.candidate_id, 'payload_hash', p_receipt_record_hash, 'outbox_sequence', p_sequence,
        'execution_principal_id', principal, 'store_id', p_store_id), at);
  return query select true, false;
end $$;
revoke all on function public.research_s4_anchor_ack(uuid, bigint, bigint, text, text, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.research_s4_anchor_ack(uuid, bigint, bigint, text, text, text, uuid, jsonb, text) to alpha_anchor_runner;
alter function public.research_s4_anchor_ack(uuid, bigint, bigint, text, text, text, uuid, jsonb, text) owner to alpha_anchor_fn_owner;

-- Record that the independent registry confirmed a checkpoint. Only anchored sequences of the
-- registered identity, never backwards, and one store per owner.
create function public.research_s4_anchor_confirm_checkpoint(p_owner uuid, p_generation bigint, p_store_id uuid, p_database_identity uuid, p_last_sequence bigint, p_last_hash text)
returns table (confirmed boolean, last_sequence bigint)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare principal uuid; ident public.research_s4_runtime_identity%rowtype; row public.research_s4_outbox%rowtype; existing public.research_s4_anchor_checkpoints%rowtype;
begin
  if p_store_id is null or p_database_identity is null or p_last_sequence is null or p_last_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_schema' using errcode = '22023'; end if;
  principal := public.research_s4_anchor_principal(p_owner, p_generation);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 0));
  select * into ident from public.research_s4_runtime_identity;
  if ident.database_identity <> p_database_identity then raise exception 'anchor_identity_mismatch' using errcode = '42501'; end if;
  select * into row from public.research_s4_outbox o where o.user_id = p_owner and o.sequence = p_last_sequence;
  if not found or row.anchored_at is null then raise exception 'anchor_checkpoint_unanchored' using errcode = '42501'; end if;
  if row.receipt_hash <> p_last_hash then raise exception 'anchor_hash_conflict' using errcode = '42501'; end if;
  select * into existing from public.research_s4_anchor_checkpoints c where c.user_id = p_owner for update;
  if found then
    if existing.store_id <> p_store_id then raise exception 'anchor_store_mismatch' using errcode = '42501'; end if;
    if existing.last_sequence > p_last_sequence then raise exception 'anchor_checkpoint_regression' using errcode = '42501'; end if;
    update public.research_s4_anchor_checkpoints c set last_sequence = p_last_sequence, last_hash = p_last_hash, generation = p_generation,
      principal_id = principal, confirmed_at = pg_catalog.clock_timestamp() where c.user_id = p_owner;
  else
    insert into public.research_s4_anchor_checkpoints (user_id, store_id, database_identity, last_sequence, last_hash, generation, principal_id)
      values (p_owner, p_store_id, p_database_identity, p_last_sequence, p_last_hash, p_generation, principal);
  end if;
  return query select true, p_last_sequence;
end $$;
revoke all on function public.research_s4_anchor_confirm_checkpoint(uuid, bigint, uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.research_s4_anchor_confirm_checkpoint(uuid, bigint, uuid, uuid, bigint, text) to alpha_anchor_runner;
alter function public.research_s4_anchor_confirm_checkpoint(uuid, bigint, uuid, uuid, bigint, text) owner to alpha_anchor_fn_owner;

-- Temporary privilege for the ownership transfers above; the owner role keeps USAGE only.
revoke create on schema public from alpha_anchor_fn_owner;
