-- supabase/migrations/20261109150000_judgments.sql
-- F4 (judgment framework spec §5): the public judgment table family. Eight tables —
-- judgment_methodologies (code mirror; limited update) + judgment_methodology_events (append-only
-- status history, audit N3), judgments (append-only content-addressed registrations),
-- judgment_settlements (append-only evidence with a sequence/transition trigger),
-- judgment_settle_queue (mutable schedule, not evidence), judgment_calibrations (append-only
-- reports), judgment_calibration_validity and judgment_job_state (mutable run state, audit N2) —
-- and the private bucket judgments-calibration.
-- Read boundary (§5.6, audit N1): anon/authenticated SELECT through RLS; judgments, settlements and
-- calibrations are visible only while their methodology is publishable (the CURRENT value — licence
-- is not historical state). service_role selects all nine tables and writes NOTHING directly:
-- every write goes through the security definer functions at the end of this file (plan Task 3).
-- Errors: triggers raise 23514 with 'append_only:<table>' or 'settlement_sequence: …'; functions
-- raise with the error code as the message head (header of the functions section).
-- Hosted PostgreSQL 17, `postgres` is not a superuser: functions keep the migration role as owner,
-- set search_path = '' and qualify every relation (pg_catalog is always searched implicitly).
-- Replayable: guarded creates, create or replace, drop-then-create triggers and policies, guarded
-- type creation, bucket upsert. Only storage.buckets is referenced (local harness).

-- ---------------------------------------------------------------- 5.1 judgment_methodologies
create table if not exists public.judgment_methodologies (
  methodology_id        text not null check (methodology_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  version               text not null check (version ~ '^v[1-9][0-9]{0,3}$'),
  judgment_type         text not null,
  kind                  text not null check (kind in ('probability','categorical','score','interval')),
  producer_kind         text not null check (producer_kind in ('rule','model','human','third_party')),
  subject_types         text[] not null,
  input_kinds           text[] not null,
  markets               text[],
  title_zh              text not null,
  title_en              text not null,
  doc_path              text not null,
  doc_sha256            text not null check (doc_sha256 ~ '^[0-9a-f]{64}$'),
  implementation_sha256 text not null check (implementation_sha256 ~ '^[0-9a-f]{64}$'),
  params                jsonb not null default '{}' check (jsonb_typeof(params) = 'object'),
  params_json           jsonb not null default '{}' check (jsonb_typeof(params_json) = 'object'),
  horizon               jsonb not null check (jsonb_typeof(horizon) = 'object'),
  upstream              jsonb not null default '{}' check (jsonb_typeof(upstream) = 'object'),
  deps_sha256           text not null check (deps_sha256 ~ '^[0-9a-f]{64}$'),
  formula_hash          text not null check (formula_hash ~ '^[0-9a-f]{64}$'),
  status                text not null check (status in ('draft','active','retired')),
  publishable           boolean not null default false,
  code_version          text not null,
  created_at            timestamptz not null default now(),   -- first sync, immutable (audit N3)
  synced_at             timestamptz not null default now(),   -- last sync (run metadata only)
  primary key (methodology_id, version)
);

-- ---------------------------------------------------------------- 5.1b judgment_methodology_events
create table if not exists public.judgment_methodology_events (
  event_id        uuid primary key,
  methodology_id  text not null,
  version         text not null,
  seq             integer not null check (seq >= 1),
  event           text not null check (event in ('registered','status_changed','publishable_changed','resynced')),
  status          text not null check (status in ('draft','active','retired')),
  publishable     boolean not null,
  formula_hash    text not null,
  code_version    text not null,
  actor           text not null check (actor ~ '^(script|admin:[0-9a-f-]{36})$'),
  reason          text,
  occurred_at     timestamptz not null,
  unique (methodology_id, version, seq),
  foreign key (methodology_id, version) references public.judgment_methodologies(methodology_id, version)
);
create index if not exists judgment_methodology_events_at_idx on public.judgment_methodology_events(methodology_id, version, occurred_at);

-- ---------------------------------------------------------------- 5.2 judgments
create table if not exists public.judgments (
  judgment_id          uuid primary key,
  subject_type         text not null check (subject_type in ('issuer','industry','macro_region','macro_series')),
  subject_key          text not null check (length(subject_key) between 1 and 128),
  judgment_type        text not null,
  methodology_id       text not null,
  methodology_version  text not null,
  kind                 text not null check (kind in ('probability','categorical','score','interval')),
  producer_kind        text not null check (producer_kind in ('rule','model')),
  producer_ref         jsonb not null default '{}' check (jsonb_typeof(producer_ref) = 'object'),
  producer_nonce       text not null default '',
  as_of                date not null,
  registered_at        timestamptz not null,
  retrospective        boolean not null,
  inputs               jsonb not null check (jsonb_typeof(inputs) = 'array'),
  inputs_hash          text not null check (inputs_hash ~ '^[0-9a-f]{64}$'),
  abstained            boolean not null,
  abstain_reason       text,
  claim                jsonb check (claim is null or jsonb_typeof(claim) = 'object'),
  condition            jsonb check (condition is null or jsonb_typeof(condition) = 'object'),
  horizon              jsonb check (horizon is null or jsonb_typeof(horizon) = 'object'),
  target               jsonb check (target is null or jsonb_typeof(target) = 'object'),
  label_policy         text check (label_policy in ('first_observed','cutoff_vintage')),
  settle_after         timestamptz,
  settle_by            timestamptz,
  code_version         text not null check (length(code_version) between 7 and 64),
  batch_id             uuid not null references public.ingest_batches(batch_id) on delete restrict,
  created_at           timestamptz not null default now(),
  foreign key (methodology_id, methodology_version) references public.judgment_methodologies(methodology_id, version) on delete restrict,
  constraint judgments_active_shape check (
    (abstained and claim is null and condition is null and horizon is null and target is null and label_policy is null
       and settle_after is null and settle_by is null and abstain_reason is not null)
    or (not abstained and claim is not null and condition is not null and horizon is not null and target is not null
       and label_policy is not null and settle_after is not null and settle_by is not null and abstain_reason is null)),
  constraint judgments_active_has_inputs check (abstained or case when jsonb_typeof(inputs) = 'array' then jsonb_array_length(inputs) > 0 else false end),
  constraint judgments_settle_order check (settle_by is null or settle_by > settle_after)
);
create index if not exists judgments_subject_idx on public.judgments(subject_type, subject_key, judgment_type, as_of desc, registered_at desc, judgment_id);
create index if not exists judgments_methodology_asof_idx on public.judgments(methodology_id, methodology_version, as_of) where not abstained;
create index if not exists judgments_inputs_gin_idx on public.judgments using gin (inputs jsonb_path_ops);

-- ---------------------------------------------------------------- 5.3 judgment_settlements
create table if not exists public.judgment_settlements (
  settlement_id     uuid primary key,
  judgment_id       uuid not null references public.judgments(judgment_id) on delete restrict,
  seq               integer not null check (seq >= 1),
  kind              text not null check (kind in ('settled','void','withdrawn','reopened')),
  outcome           text check (outcome in ('hit','miss')),
  realized          jsonb check (realized is null or jsonb_typeof(realized) = 'object'),
  evidence          jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object'),
  resolver          text not null,
  resolver_version  text not null,
  reason            text,
  actor             text not null check (actor ~ '^(cron|script|admin:[0-9a-f-]{36})$'),
  settled_at        timestamptz not null,
  request_key       text not null check (length(request_key) between 8 and 128),
  request_digest    text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  code_version      text not null,
  batch_id          uuid not null references public.ingest_batches(batch_id) on delete restrict,
  unique (judgment_id, seq),
  unique (request_key),
  constraint settlements_outcome_iff_settled check ((kind = 'settled') = (outcome is not null) and (kind = 'settled') = (realized is not null)),
  constraint settlements_reason_unless_settled check (kind = 'settled' or reason is not null)
);
create index if not exists judgment_settlements_settled_at_idx on public.judgment_settlements(settled_at desc);

-- ---------------------------------------------------------------- 5.4 judgment_settle_queue
create table if not exists public.judgment_settle_queue (
  judgment_id      uuid primary key references public.judgments(judgment_id) on delete restrict,
  settle_after     timestamptz not null,
  settle_by        timestamptz not null,
  label_policy     text not null,
  next_attempt_at  timestamptz not null,
  attempts         integer not null default 0,
  last_status      text check (last_status in ('pending','unavailable','inconsistent','error')),
  last_detail      jsonb not null default '{}',
  leased_until     timestamptz,
  lease_token      uuid,
  override         jsonb,
  closed_at        timestamptz,
  updated_at       timestamptz not null default now()
);
create index if not exists judgment_settle_queue_due_idx on public.judgment_settle_queue(next_attempt_at, judgment_id) where closed_at is null;

-- ---------------------------------------------------------------- 5.5 judgment_calibrations
create table if not exists public.judgment_calibrations (
  calibration_id           uuid primary key,
  methodology_id           text not null,
  methodology_version      text not null,
  scope_type               text not null check (scope_type in ('all','market','subject_type')),
  scope_key                text not null default '',
  window_from              date not null,
  window_to                date not null,
  n_registered             integer not null,
  n_settled                integer not null,
  n_independent            integer not null,
  n_void                   integer not null,
  n_retrospective_excluded integer not null,
  threshold_n              integer not null,
  ece_max                  numeric not null,
  kind                     text not null check (kind in ('probability','categorical','score','interval')),
  state                    text not null,
  valid_until              timestamptz not null,
  validity_revision        bigint not null,
  metrics                  jsonb not null check (jsonb_typeof(metrics) = 'object'),
  reliability              jsonb not null check (jsonb_typeof(reliability) = 'array'),
  isotonic_segments        jsonb check (isotonic_segments is null or jsonb_typeof(isotonic_segments) = 'array'),
  cohort_path              text not null,
  cohort_sha256            text not null,
  query_bounds             jsonb not null,
  fingerprint              text not null,
  algorithm_version        text not null,
  code_version             text not null,
  computed_at              timestamptz not null,
  batch_id                 uuid not null references public.ingest_batches(batch_id) on delete restrict,
  unique (fingerprint),
  constraint judgment_calibrations_state_by_kind check (
    (kind = 'score' and state in ('insufficient','evaluated')) or
    (kind <> 'score' and state in ('insufficient','failed','calibrated')))
);
create index if not exists judgment_calibrations_latest_idx on public.judgment_calibrations(methodology_id, methodology_version, scope_type, scope_key, computed_at desc);

-- ---------------------------------------------------------------- 5.5b validity + job state
create table if not exists public.judgment_calibration_validity (
  methodology_id  text not null,
  version         text not null,
  revision        bigint not null default 1,
  bumped_at       timestamptz not null default now(),
  reason          text,
  primary key (methodology_id, version),
  foreign key (methodology_id, version) references public.judgment_methodologies(methodology_id, version)
);
create table if not exists public.judgment_job_state (
  job         text primary key check (length(job) between 1 and 512),
  state       jsonb not null default '{}' check (jsonb_typeof(state) = 'object'),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- 5.5b frozen calibration cohorts (spec 第 7 稿; plan audit P1-10)
-- The members of one calibration generation, materialised by freeze_calibration_cohort in ONE insert … select
-- statement (one MVCC snapshot): every eligible registration with its latest settlement at that snapshot. Read by
-- calibration_cohort_members (keyset on judgment_id), deleted by clear_calibration_generation. RPC-only writes.
create table if not exists public.judgment_calibration_cohort_members (
  generation     uuid not null,
  judgment_id    uuid not null references public.judgments(judgment_id) on delete restrict,
  settlement_id  uuid references public.judgment_settlements(settlement_id) on delete restrict,
  ord            bigint not null check (ord >= 1),
  primary key (generation, judgment_id)
);

-- ---------------------------------------------------------------- 8.3 bucket (calibration cohorts)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('judgments-calibration', 'judgments-calibration', false, 52428800, array['application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- triggers
-- 5.1: the current methodology row may change status / publishable / synced_at / code_version only.
create or replace function public.judgment_methodologies_limited_update() returns trigger
language plpgsql set search_path = '' as $$
declare v_mutable text[] := array['status','publishable','synced_at','code_version'];
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only:judgment_methodologies' using errcode = '23514', detail = 'methodology rows are never deleted';
  end if;
  if (pg_catalog.to_jsonb(new) - v_mutable) is distinct from (pg_catalog.to_jsonb(old) - v_mutable) then
    raise exception 'append_only:judgment_methodologies' using errcode = '23514', detail = 'only status, publishable, synced_at and code_version may change';
  end if;
  return new;
end $$;
drop trigger if exists judgment_methodologies_limited_update on public.judgment_methodologies;
create trigger judgment_methodologies_limited_update before update or delete on public.judgment_methodologies
  for each row execute function public.judgment_methodologies_limited_update();

-- 5.1b / 5.2 / 5.3 / 5.5: append-only tables (row-level update/delete and statement-level truncate).
create or replace function public.judgments_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'append_only:%', tg_table_name using errcode = '23514';
end $$;
do $$ declare t text; begin
  foreach t in array array['judgments','judgment_settlements','judgment_methodology_events','judgment_calibrations'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.judgments_append_only()', t || '_append_only', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.judgments_append_only()', t || '_no_truncate', t);
  end loop;
end $$;

-- 5.3: seq = 1 + max(seq) and the allowed transitions; void→reopened, settled→withdrawn and
-- withdrawn→reopened only by an admin:<uuid> actor; abstained judgments are never settled.
create or replace function public.judgment_settlements_sequence() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_seq integer; v_kind text; v_abstained boolean;
  v_admin boolean := new.actor like 'admin:%';
  v_ok boolean;
begin
  select j.abstained into v_abstained from public.judgments j where j.judgment_id = new.judgment_id;
  if v_abstained then
    raise exception 'settlement_sequence: abstained judgment % is never settled', new.judgment_id using errcode = '23514';
  end if;
  select s.seq, s.kind into v_seq, v_kind from public.judgment_settlements s where s.judgment_id = new.judgment_id order by s.seq desc limit 1;
  if new.seq is distinct from coalesce(v_seq, 0) + 1 then
    raise exception 'settlement_sequence: seq % after %', new.seq, coalesce(v_seq, 0) using errcode = '23514';
  end if;
  v_ok := case
    when v_kind is null then new.kind in ('settled','void')
    when v_kind = 'void' then new.kind = 'reopened' and v_admin
    when v_kind = 'reopened' then new.kind in ('settled','void')
    when v_kind = 'settled' then new.kind = 'withdrawn' and v_admin
    when v_kind = 'withdrawn' then new.kind = 'reopened' and v_admin
    else false end;
  if not v_ok then
    raise exception 'settlement_sequence: % -> % by %', coalesce(v_kind, 'none'), new.kind, new.actor using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists judgment_settlements_sequence on public.judgment_settlements;
create trigger judgment_settlements_sequence before insert on public.judgment_settlements
  for each row execute function public.judgment_settlements_sequence();

-- P3-01: no client role executes a trigger function directly (firing a trigger does not check EXECUTE).
revoke execute on function public.judgment_methodologies_limited_update() from public, anon, authenticated, service_role;
revoke execute on function public.judgments_append_only() from public, anon, authenticated, service_role;
revoke execute on function public.judgment_settlements_sequence() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 5.6 table privileges and policies
do $$ declare t text; begin
  foreach t in array array['judgment_methodologies','judgment_methodology_events','judgments','judgment_settlements',
                           'judgment_settle_queue','judgment_calibrations','judgment_calibration_validity','judgment_job_state',
                           'judgment_calibration_cohort_members'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
  foreach t in array array['judgment_methodologies','judgment_methodology_events','judgment_calibration_validity'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
  foreach t in array array['judgments','judgment_settlements','judgment_calibrations'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
drop policy if exists "judgments publishable read" on public.judgments;
create policy "judgments publishable read" on public.judgments for select to anon, authenticated
  using (exists (select 1 from public.judgment_methodologies m
                 where m.methodology_id = judgments.methodology_id and m.version = judgments.methodology_version and m.publishable));
drop policy if exists "judgment_settlements publishable read" on public.judgment_settlements;
create policy "judgment_settlements publishable read" on public.judgment_settlements for select to anon, authenticated
  using (exists (select 1 from public.judgments j
                 join public.judgment_methodologies m on m.methodology_id = j.methodology_id and m.version = j.methodology_version
                 where j.judgment_id = judgment_settlements.judgment_id and m.publishable));
drop policy if exists "judgment_calibrations publishable read" on public.judgment_calibrations;
create policy "judgment_calibrations publishable read" on public.judgment_calibrations for select to anon, authenticated
  using (exists (select 1 from public.judgment_methodologies m
                 where m.methodology_id = judgment_calibrations.methodology_id and m.version = judgment_calibrations.methodology_version and m.publishable));
