-- supabase/migrations/20261116090000_judgments.sql
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

-- ================================================================ §5.6 functions (plan Task 3)
-- Public read RPCs: security invoker, executable by anon/authenticated/service_role, so the RLS
-- policies above apply inside them too (calibration_cohort is empty for an unpublishable
-- methodology). Service write RPCs: security definer (owner = migration role), executable by
-- service_role only. Internal helpers: no client role. Every function sets search_path = ''.
-- Errors carry the code as the message head: lease_lost (55P03); methodology_unavailable,
-- formula_hash_drift, item_not_open (P0001); unknown_judgment, unknown_methodology (P0002);
-- methodology_mismatch, settle_window_mismatch, subject_type_not_public, input_not_allowed,
-- invalid_parameter (22023); settlement transitions raise the trigger's 23514. A duplicate
-- judgment_id is the primary key's 23505, raised unchanged (spec §6.2 step 4 re-reads).
-- Composite results are jsonb objects (PostgREST returns one JSON object; plpgsql OUT parameters
-- would collide with the column names seq/status).
-- request_digest (spec §5.3 S02, R06): computed by the caller with src/lib/judgments/settlement-digest.ts
-- (RFC 8785, the single implementation) and passed as p_row.request_digest. SQL cannot reproduce
-- RFC 8785 bytes, so append_settlement stores the digest as given and, on a request_key hit,
-- requires stored digest = incoming digest AND the jsonb operation payload rebuilt from the stored
-- columns = the one rebuilt from the incoming row (jsonb equality: key order and number spelling
-- free). Both payloads carry the same nine semantic fields, resolver_version included.

do $$ begin
  if not exists (select 1 from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'judgment_envelope') then
    create type public.judgment_envelope as (
      judgment          public.judgments,
      settlement        public.judgment_settlements,
      calibration       public.judgment_calibrations,
      calibration_valid boolean,
      methodology_state public.judgment_methodology_events);
  end if;
end $$;

-- ---------------------------------------------------------------- internal helpers
-- Settle window (plan 契约补充; TS twin src/lib/judgments/time.ts settleWindowOf): the UTC date D.
create or replace function public.judgments_settle_after_date(p_target jsonb) returns date
language sql stable set search_path = '' as $$
  select case p_target ->> 'kind'
    when 'session_index' then (p_target ->> 'base_date')::date + (p_target ->> 'n')::integer
    when 'date'          then (p_target ->> 'date')::date
    when 'period'        then (((p_target ->> 'period') || '-01')::date + interval '1 month')::date
    when 'fiscal_period' then (p_target ->> 'period_end')::date + 1
  end
$$;
create or replace function public.judgments_grace_days(p_params jsonb, p_horizon jsonb) returns integer
language sql immutable set search_path = '' as $$
  select coalesce((p_params ->> 'grace_days')::integer,
    case p_horizon ->> 'unit' when 'trading_sessions' then 60 when 'calendar_days' then 30
                              when 'calendar_months' then 30 when 'fiscal_quarters' then 120 end)
$$;
-- The nine semantic fields of a settlement (S02), from an incoming append_settlement row …
create or replace function public.judgment_operation_payload(p_judgment_id uuid, p_row jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('judgment_id', p_judgment_id::text, 'kind', p_row ->> 'kind', 'outcome', p_row ->> 'outcome',
    'realized', nullif(p_row -> 'realized', 'null'::jsonb), 'evidence', coalesce(p_row -> 'evidence', '{}'::jsonb),
    'resolver', p_row ->> 'resolver', 'resolver_version', p_row ->> 'resolver_version', 'reason', p_row ->> 'reason', 'actor', p_row ->> 'actor')
$$;
-- … and from a stored row (same keys, same JSON types).
create or replace function public.judgment_settlement_payload(p_s public.judgment_settlements) returns jsonb
language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('judgment_id', p_s.judgment_id::text, 'kind', p_s.kind, 'outcome', p_s.outcome,
    'realized', p_s.realized, 'evidence', p_s.evidence, 'resolver', p_s.resolver, 'resolver_version', p_s.resolver_version,
    'reason', p_s.reason, 'actor', p_s.actor)
$$;
create or replace function public.judgment_replay_status(p_hit public.judgment_settlements, p_judgment_id uuid, p_digest text, p_payload jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('seq', p_hit.seq, 'status',
    case when p_hit.judgment_id = p_judgment_id and p_hit.request_digest = p_digest
              and public.judgment_settlement_payload(p_hit) = p_payload
         then 'already_applied' else 'request_key_conflict' end)
$$;

-- ---------------------------------------------------------------- public read RPCs
create or replace function public.judgments_server_time() returns timestamptz
language sql stable security invoker set search_path = '' as $$ select pg_catalog.now() $$;

-- One envelope for a judgment row under a view: latest settlement, latest scope='all' calibration
-- with its validity, and the methodology state (latest event, or the last event <= cutoff).
create or replace function public.judgment_envelope_of(p_j public.judgments, p_view text, p_cutoff timestamptz)
returns public.judgment_envelope language plpgsql stable security invoker set search_path = '' as $$
declare r public.judgment_envelope;
begin
  if p_view is null or p_view not in ('latest','as_known') or (p_view = 'as_known' and p_cutoff is null) then
    raise exception 'invalid_parameter: view' using errcode = '22023';
  end if;
  -- Review C-02 / D-01: only p_j.judgment_id is trusted. The persisted row is loaded under the caller's RLS and used for
  -- every returned field, join and predicate (as_known: registered_at <= cutoff and a methodology event <= cutoff);
  -- a forged or unreadable row yields NULL.
  select pj, (select s from public.judgment_settlements s
               where s.judgment_id = pj.judgment_id and (p_view = 'latest' or s.settled_at <= p_cutoff)
               order by s.seq desc limit 1),
         k.c,
         coalesce((k.c).validity_revision = v.revision and (k.c).valid_until > case when p_view = 'latest' then pg_catalog.now() else p_cutoff end, false),
         (select e from public.judgment_methodology_events e
           where e.methodology_id = pj.methodology_id and e.version = pj.methodology_version
             and (p_view = 'latest' or e.occurred_at <= p_cutoff)
           order by e.occurred_at desc, e.seq desc limit 1)
  into r
  from public.judgments pj
  cross join lateral (select (select c from public.judgment_calibrations c
                 where c.methodology_id = pj.methodology_id and c.methodology_version = pj.methodology_version
                   and c.scope_type = 'all' and c.scope_key = '' and (p_view = 'latest' or c.computed_at <= p_cutoff)
                 order by c.computed_at desc, c.calibration_id limit 1) as c) k
  left join public.judgment_calibration_validity v on v.methodology_id = pj.methodology_id and v.version = pj.methodology_version
  where pj.judgment_id = p_j.judgment_id
    and (p_view = 'latest' or (pj.registered_at <= p_cutoff and exists (
      select 1 from public.judgment_methodology_events ev
      where ev.methodology_id = pj.methodology_id and ev.version = pj.methodology_version and ev.occurred_at <= p_cutoff)));
  return r;
end $$;

-- §10 / §12.4: one card per (judgment_type, methodology_id, version); issuer subjects include the
-- issuers merged into p_subject_key (merged_into chain, depth <= 8). as_known: registered_at <=
-- cutoff and the methodology must have an event <= cutoff.
create or replace function public.latest_judgment_cards(p_subject_type text, p_subject_key text, p_types text[], p_view text, p_cutoff timestamptz)
returns setof public.judgment_envelope language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_view is null or p_view not in ('latest','as_known') or (p_view = 'as_known' and p_cutoff is null) then
    raise exception 'invalid_parameter: view' using errcode = '22023';
  end if;
  return query
  with recursive subjects(key, depth) as (
    select p_subject_key, 0
    union
    select i.issuer_id::text, s.depth + 1
    from subjects s join public.issuers i on i.merged_into::text = s.key
    where p_subject_type = 'issuer' and s.depth < 8
  ), picked as (
    select distinct on (j.judgment_type, j.methodology_id, j.methodology_version) j
    from public.judgments j
    where j.subject_type = p_subject_type and j.subject_key in (select s.key from subjects s)
      and (p_types is null or j.judgment_type = any(p_types))
      and (p_view = 'latest' or (j.registered_at <= p_cutoff and exists (
        select 1 from public.judgment_methodology_events e
        where e.methodology_id = j.methodology_id and e.version = j.methodology_version and e.occurred_at <= p_cutoff)))
    order by j.judgment_type, j.methodology_id, j.methodology_version, j.as_of desc, j.registered_at desc, j.judgment_id
  )
  select e.* from picked p cross join lateral public.judgment_envelope_of(p.j, p_view, p_cutoff) e
  order by (p.j).as_of desc, (p.j).registered_at desc, (p.j).judgment_id;
end $$;

create or replace function public.judgment_history(p_subject_type text, p_subject_key text, p_type text, p_methodology text, p_version text,
  p_view text, p_cutoff timestamptz, p_before uuid, p_limit integer)
returns setof public.judgment_envelope language plpgsql stable security invoker set search_path = '' as $$
declare b public.judgments;
begin
  if p_view is null or p_view not in ('latest','as_known') or (p_view = 'as_known' and p_cutoff is null) then
    raise exception 'invalid_parameter: view' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'invalid_parameter: limit' using errcode = '22023'; end if;
  if p_before is not null then
    select x.* into b from public.judgments x where x.judgment_id = p_before;
    if not found then raise exception 'unknown_judgment' using errcode = 'P0002'; end if;
  end if;
  return query
  select e.* from (
    select j from public.judgments j
    where j.subject_type = p_subject_type and j.subject_key = p_subject_key and j.judgment_type = p_type
      and j.methodology_id = p_methodology and j.methodology_version = p_version
      and (p_view = 'latest' or (j.registered_at <= p_cutoff and exists (
        select 1 from public.judgment_methodology_events ev
        where ev.methodology_id = j.methodology_id and ev.version = j.methodology_version and ev.occurred_at <= p_cutoff)))
      and (p_before is null or (j.as_of, j.registered_at, j.judgment_id) < (b.as_of, b.registered_at, b.judgment_id))
    order by j.as_of desc, j.registered_at desc, j.judgment_id desc
    limit p_limit) p
  cross join lateral public.judgment_envelope_of(p.j, p_view, p_cutoff) e
  order by (e.judgment).as_of desc, (e.judgment).registered_at desc, (e.judgment).judgment_id desc;
end $$;

-- §8.3 / R03: every active registration in the as_of window registered at or before p_cutoff, with
-- its latest settlement at or before p_cutoff; keyset by judgment_id. Public path (RLS-gated).
create or replace function public.calibration_cohort(p_methodology text, p_version text, p_window_from date, p_window_to date,
  p_cutoff timestamptz, p_after uuid, p_limit integer)
returns setof public.judgment_envelope language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_cutoff is null or p_window_from is null or p_window_to is null or p_window_from > p_window_to then
    raise exception 'invalid_parameter: window' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid_parameter: limit' using errcode = '22023'; end if;
  return query
  select j,
         (select s from public.judgment_settlements s where s.judgment_id = j.judgment_id and s.settled_at <= p_cutoff order by s.seq desc limit 1),
         null::public.judgment_calibrations, false, null::public.judgment_methodology_events
  from public.judgments j
  where j.methodology_id = p_methodology and j.methodology_version = p_version and not j.abstained
    and j.as_of between p_window_from and p_window_to and j.registered_at <= p_cutoff
    and (p_after is null or j.judgment_id > p_after)
  order by j.judgment_id
  limit p_limit;
end $$;

create or replace function public.methodology_state_at(p_methodology text, p_version text, p_cutoff timestamptz)
returns public.judgment_methodology_events language sql stable security invoker set search_path = '' as $$
  select e.* from public.judgment_methodology_events e
  where e.methodology_id = p_methodology and e.version = p_version and e.occurred_at <= p_cutoff
  order by e.occurred_at desc, e.seq desc limit 1
$$;

-- §10 / plan audit P2-01: one envelope by judgment id under the judgment_history view semantics; RLS-gated
-- (invoker), so an unpublishable judgment returns no row. Replaces scanning history pages to find an id.
create or replace function public.judgment_envelope_by_id(p_id uuid, p_view text, p_cutoff timestamptz)
returns setof public.judgment_envelope language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_view is null or p_view not in ('latest','as_known') or (p_view = 'as_known' and p_cutoff is null) then
    raise exception 'invalid_parameter: view' using errcode = '22023';
  end if;
  return query
  select e.* from public.judgments j
  cross join lateral public.judgment_envelope_of(j, p_view, p_cutoff) e
  where j.judgment_id = p_id
    and (p_view = 'latest' or (j.registered_at <= p_cutoff and exists (
      select 1 from public.judgment_methodology_events ev
      where ev.methodology_id = j.methodology_id and ev.version = j.methodology_version and ev.occurred_at <= p_cutoff)));
end $$;

-- ---------------------------------------------------------------- service write RPCs
-- R04: same query and cutoff semantics as calibration_cohort, NOT gated by publishable (the
-- definer owns the tables, so RLS does not restrict it). Read-only.
create or replace function public.calibration_cohort_internal(p_methodology text, p_version text, p_window_from date, p_window_to date,
  p_cutoff timestamptz, p_after uuid, p_limit integer)
returns setof public.judgment_envelope language sql stable security definer set search_path = '' as $$
  select * from public.calibration_cohort(p_methodology, p_version, p_window_from, p_window_to, p_cutoff, p_after, p_limit)
$$;

-- §5.1b: first sync → row + validity(revision 1) + 'registered'; status / publishable change → update +
-- 'status_changed' then 'publishable_changed'; otherwise synced_at + 'resynced'. Any other column
-- differing from the stored row (formula_hash, params, doc, titles, …) → formula_hash_drift.
create or replace function public.sync_methodology(p_row jsonb, p_actor text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_new public.judgment_methodologies := pg_catalog.jsonb_populate_record(null::public.judgment_methodologies, p_row);
  v_old public.judgment_methodologies;
  v_seq integer;
  v_changed boolean := false;
  v_meta text[] := array['status','publishable','synced_at','code_version','created_at'];
begin
  if v_new.methodology_id is null or v_new.version is null then raise exception 'invalid_parameter: methodology' using errcode = '22023'; end if;
  v_new.publishable := coalesce(v_new.publishable, false);
  select m.* into v_old from public.judgment_methodologies m
  where m.methodology_id = v_new.methodology_id and m.version = v_new.version for update;
  if not found then
    v_new.created_at := pg_catalog.now(); v_new.synced_at := pg_catalog.now();
    insert into public.judgment_methodologies select v_new.*;
    insert into public.judgment_calibration_validity (methodology_id, version, revision, bumped_at, reason)
    values (v_new.methodology_id, v_new.version, 1, pg_catalog.now(), 'initial') on conflict do nothing;
    insert into public.judgment_methodology_events (event_id, methodology_id, version, seq, event, status, publishable, formula_hash, code_version, actor, reason, occurred_at)
    values (pg_catalog.gen_random_uuid(), v_new.methodology_id, v_new.version, 1, 'registered', v_new.status, v_new.publishable, v_new.formula_hash, v_new.code_version, p_actor, p_reason, pg_catalog.now());
    return pg_catalog.jsonb_build_object('changed', true, 'seq', 1);
  end if;
  if (pg_catalog.to_jsonb(v_new) - v_meta) is distinct from (pg_catalog.to_jsonb(v_old) - v_meta) then
    raise exception 'formula_hash_drift: %@% stored %', v_new.methodology_id, v_new.version, v_old.formula_hash using errcode = 'P0001';
  end if;
  select coalesce(pg_catalog.max(e.seq), 0) into v_seq from public.judgment_methodology_events e
  where e.methodology_id = v_new.methodology_id and e.version = v_new.version;
  if v_new.status is distinct from v_old.status then
    v_seq := v_seq + 1; v_changed := true;
    insert into public.judgment_methodology_events (event_id, methodology_id, version, seq, event, status, publishable, formula_hash, code_version, actor, reason, occurred_at)
    values (pg_catalog.gen_random_uuid(), v_new.methodology_id, v_new.version, v_seq, 'status_changed', v_new.status, v_old.publishable, v_new.formula_hash, v_new.code_version, p_actor, p_reason, pg_catalog.now());
  end if;
  if v_new.publishable is distinct from v_old.publishable then
    v_seq := v_seq + 1; v_changed := true;
    insert into public.judgment_methodology_events (event_id, methodology_id, version, seq, event, status, publishable, formula_hash, code_version, actor, reason, occurred_at)
    values (pg_catalog.gen_random_uuid(), v_new.methodology_id, v_new.version, v_seq, 'publishable_changed', v_new.status, v_new.publishable, v_new.formula_hash, v_new.code_version, p_actor, p_reason, pg_catalog.now());
  end if;
  if not v_changed then
    v_seq := v_seq + 1;
    insert into public.judgment_methodology_events (event_id, methodology_id, version, seq, event, status, publishable, formula_hash, code_version, actor, reason, occurred_at)
    values (pg_catalog.gen_random_uuid(), v_new.methodology_id, v_new.version, v_seq, 'resynced', v_new.status, v_new.publishable, v_new.formula_hash, v_new.code_version, p_actor, p_reason, pg_catalog.now());
  end if;
  update public.judgment_methodologies m
  set status = v_new.status, publishable = v_new.publishable, code_version = v_new.code_version, synced_at = pg_catalog.now()
  where m.methodology_id = v_new.methodology_id and m.version = v_new.version;
  return pg_catalog.jsonb_build_object('changed', v_changed, 'seq', v_seq);
end $$;

-- §5.6 / §6.2: validate against the methodology row, recompute the settle window (audit G21),
-- registered_at = now(), retrospective by the three §3.4 rules, insert the judgment and (active)
-- its queue row in one transaction. 23505 on a duplicate id is raised unchanged.
create or replace function public.register_judgment(p_row jsonb, p_queue jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.judgments := pg_catalog.jsonb_populate_record(null::public.judgments, p_row);
  m public.judgment_methodologies;
  v_date date; v_after timestamptz; v_by timestamptz; v_hint timestamptz;
  v_queue jsonb := nullif(p_queue, 'null'::jsonb);
begin
  select x.* into m from public.judgment_methodologies x
  where x.methodology_id = r.methodology_id and x.version = r.methodology_version for share;
  if not found or m.status <> 'active' then
    raise exception 'methodology_unavailable: %@% %', r.methodology_id, r.methodology_version, coalesce(m.status, 'missing') using errcode = 'P0001';
  end if;
  if m.producer_kind not in ('rule','model') then
    raise exception 'methodology_unavailable: producer_kind % is not public', m.producer_kind using errcode = 'P0001';
  end if;
  if r.subject_type is null or r.subject_type not in ('issuer','industry','macro_region','macro_series') then
    raise exception 'subject_type_not_public: %', r.subject_type using errcode = '22023';
  end if;
  if r.judgment_type is distinct from m.judgment_type or r.kind is distinct from m.kind
     or r.producer_kind is distinct from m.producer_kind or not (r.subject_type = any(m.subject_types)) then
    raise exception 'methodology_mismatch: judgment_type/kind/producer_kind/subject_type' using errcode = '22023';
  end if;
  if r.inputs is null or pg_catalog.jsonb_typeof(r.inputs) <> 'array' or exists (
       select 1 from pg_catalog.jsonb_array_elements(r.inputs) e
       where not coalesce((e ->> 'kind') = any(m.input_kinds)
         and (e ->> 'kind') = any(array['financial_fact','financial_metric','macro_observation','macro_snapshot','price_bar','table_rows','judgment']), false)) then
    raise exception 'input_not_allowed' using errcode = '22023';
  end if;
  if r.abstained then
    if v_queue is not null then raise exception 'settle_window_mismatch: abstained judgments have no queue row' using errcode = '22023'; end if;
  else
    if r.horizon is distinct from m.horizon then raise exception 'methodology_mismatch: horizon' using errcode = '22023'; end if;
    v_date := public.judgments_settle_after_date(r.target);
    v_after := v_date::timestamp at time zone 'UTC';
    v_by := (v_date + public.judgments_grace_days(m.params, m.horizon))::timestamp at time zone 'UTC';
    if v_date is null or v_queue is null
       or r.settle_after is distinct from v_after or r.settle_by is distinct from v_by
       or (v_queue ->> 'settle_after')::timestamptz is distinct from v_after
       or (v_queue ->> 'settle_by')::timestamptz is distinct from v_by
       or (v_queue ->> 'label_policy') is distinct from r.label_policy then
      raise exception 'settle_window_mismatch: expected [%, %]', v_after, v_by using errcode = '22023';
    end if;
  end if;
  r.registered_at := pg_catalog.now();
  r.created_at := pg_catalog.now();
  v_hint := (p_row -> 'retrospective_hint' ->> 'label_available_at')::timestamptz;
  r.retrospective := r.as_of < (r.registered_at at time zone 'UTC')::date
    or (not r.abstained and r.settle_after <= r.registered_at)
    or (v_hint is not null and v_hint <= r.registered_at);
  insert into public.judgments select r.*;
  if not r.abstained then
    insert into public.judgment_settle_queue (judgment_id, settle_after, settle_by, label_policy, next_attempt_at, attempts, last_status, last_detail, updated_at)
    values (r.judgment_id, r.settle_after, r.settle_by, r.label_policy, r.settle_after, 0, null, '{}'::jsonb, pg_catalog.now());
  end if;
  return pg_catalog.jsonb_build_object('judgment_id', r.judgment_id, 'registered_at', r.registered_at, 'retrospective', r.retrospective);
end $$;

-- §5.4: due = open, next_attempt_at <= now, lease free or expired; order (next_attempt_at, judgment_id);
-- skip rows another transaction holds; a fresh lease token per claim.
-- Review E-03: ONE jsonb array (a scalar result), ordered by next_attempt_at, judgment_id — a setof result would be cut by a
-- lower hosted PostgREST max_rows AFTER the rows were leased. The return type changed, so the old definition is dropped first.
drop function if exists public.claim_due_judgments(integer, integer);
create function public.claim_due_judgments(p_limit integer, p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'invalid_parameter: limit' using errcode = '22023'; end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 3600 then raise exception 'invalid_parameter: lease_seconds' using errcode = '22023'; end if;
  with due as (
    select x.judgment_id from public.judgment_settle_queue x
    where x.closed_at is null and x.next_attempt_at <= pg_catalog.now() and (x.leased_until is null or x.leased_until < pg_catalog.now())
    order by x.next_attempt_at, x.judgment_id
    limit p_limit
    for update skip locked),
  leased as (
    update public.judgment_settle_queue q
    set leased_until = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds), lease_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.now()
    from due where q.judgment_id = due.judgment_id
    returning q.*)
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) order by l.next_attempt_at, l.judgment_id), '[]'::jsonb) into v_out from leased l;
  return v_out;
end $$;

-- Plan audit T-01: the admin "settle one now" fence. Locks ONE queue row; an open row whose lease is free or expired is
-- leased (fresh token) whatever its next_attempt_at; a live lease -> 'leased', a closed (or absent) queue -> 'closed'.
create or replace function public.claim_judgment(p_judgment_id uuid, p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_q public.judgment_settle_queue;
begin
  if p_judgment_id is null then raise exception 'invalid_parameter: judgment_id' using errcode = '22023'; end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 3600 then raise exception 'invalid_parameter: lease_seconds' using errcode = '22023'; end if;
  select x.* into v_q from public.judgment_settle_queue x where x.judgment_id = p_judgment_id for update;
  if not found or v_q.closed_at is not null then return pg_catalog.jsonb_build_object('status', 'closed'); end if;
  if v_q.lease_token is not null and v_q.leased_until is not null and v_q.leased_until > pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object('status', 'leased');
  end if;
  update public.judgment_settle_queue x
  set leased_until = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds), lease_token = pg_catalog.gen_random_uuid(), updated_at = pg_catalog.now()
  where x.judgment_id = p_judgment_id returning x.* into v_q;
  return pg_catalog.jsonb_build_object('status', 'claimed', 'lease_token', v_q.lease_token, 'row', pg_catalog.to_jsonb(v_q));
end $$;

-- §5.4: fencing by token; next_attempt_at is never set before now(). Plan audit R3-01: last_detail.incident is never
-- written here — the locked row's open incident is carried over unchanged (a transient pending / unavailable / error
-- attempt does not end it, so the review deadline cannot restart) and a patch incident is dropped.
create or replace function public.release_lease(p_judgment_id uuid, p_lease_token uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_q public.judgment_settle_queue; v_detail jsonb;
begin
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object'
     or coalesce(p_patch ->> 'last_status', '') not in ('pending','unavailable','inconsistent','error')
     or pg_catalog.jsonb_typeof(p_patch -> 'last_detail') is distinct from 'object'
     or (p_patch ->> 'next_attempt_at') is null
     or coalesce(p_patch ->> 'attempts_increment', '') not in ('0','1') then
    raise exception 'invalid_parameter: patch' using errcode = '22023';
  end if;
  select x.* into v_q from public.judgment_settle_queue x where x.judgment_id = p_judgment_id for update;
  if not found or v_q.lease_token is null or v_q.lease_token is distinct from p_lease_token
     or v_q.leased_until is null or v_q.leased_until <= pg_catalog.clock_timestamp() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  v_detail := (p_patch -> 'last_detail') - 'incident';
  if pg_catalog.jsonb_typeof(v_q.last_detail -> 'incident') = 'object' then
    v_detail := v_detail || pg_catalog.jsonb_build_object('incident', v_q.last_detail -> 'incident');
  end if;
  update public.judgment_settle_queue x
  set last_status = p_patch ->> 'last_status', last_detail = v_detail,
      next_attempt_at = greatest((p_patch ->> 'next_attempt_at')::timestamptz, pg_catalog.now()),
      attempts = x.attempts + (p_patch ->> 'attempts_increment')::integer,
      leased_until = null, lease_token = null, updated_at = pg_catalog.now()
  where x.judgment_id = p_judgment_id;
end $$;

-- §5.6 / R06. Order: request_key replay check (no lease check) → judgment exists → lock the queue
-- row → replay check again under the lock → closed queue + automatic actor → already_final → lease
-- (null token only for admin:<uuid>) → insert (trigger checks seq and transition) → queue update →
-- validity +1 on withdrawn/reopened. A concurrent insert of the same request_key (23505) re-reads.
-- Internal (no client role; not a definer): the single append implementation, called by append_settlement and
-- reject_quarantined_settlement (plan audit P1-05) inside their transactions.
create or replace function public.judgment_append_settlement_internal(p_judgment_id uuid, p_lease_token uuid, p_request_key text, p_row jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_digest text := p_row ->> 'request_digest';
  v_kind text := p_row ->> 'kind';
  v_actor text := p_row ->> 'actor';
  v_payload jsonb;
  v_hit public.judgment_settlements;
  v_q public.judgment_settle_queue;
  v_j public.judgments;
  v_seq integer;
  v_id uuid := pg_catalog.gen_random_uuid();
begin
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' or coalesce(v_digest, '') !~ '^[0-9a-f]{64}$'
     or p_request_key is null or v_kind is null or v_actor is null then
    raise exception 'invalid_parameter: settlement' using errcode = '22023';
  end if;
  v_payload := public.judgment_operation_payload(p_judgment_id, p_row);
  select s.* into v_hit from public.judgment_settlements s where s.request_key = p_request_key;
  if found then return public.judgment_replay_status(v_hit, p_judgment_id, v_digest, v_payload); end if;
  select x.* into v_j from public.judgments x where x.judgment_id = p_judgment_id;
  if not found then raise exception 'unknown_judgment' using errcode = 'P0002'; end if;
  select x.* into v_q from public.judgment_settle_queue x where x.judgment_id = p_judgment_id for update;
  if not found then
    raise exception 'settlement_sequence: judgment % has no settle queue (abstained)', p_judgment_id using errcode = '23514';
  end if;
  select s.* into v_hit from public.judgment_settlements s where s.request_key = p_request_key;
  if found then return public.judgment_replay_status(v_hit, p_judgment_id, v_digest, v_payload); end if;
  select coalesce(pg_catalog.max(s.seq), 0) into v_seq from public.judgment_settlements s where s.judgment_id = p_judgment_id;
  if v_q.closed_at is not null and v_actor in ('cron','script') then
    return pg_catalog.jsonb_build_object('seq', v_seq, 'status', 'already_final');
  end if;
  if p_lease_token is null then
    if v_actor !~ '^admin:[0-9a-f-]{36}$' then raise exception 'lease_lost' using errcode = '55P03'; end if;
  elsif v_q.lease_token is distinct from p_lease_token or v_q.leased_until is null or v_q.leased_until <= pg_catalog.clock_timestamp() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  begin
    insert into public.judgment_settlements (settlement_id, judgment_id, seq, kind, outcome, realized, evidence, resolver, resolver_version,
      reason, actor, settled_at, request_key, request_digest, code_version, batch_id)
    values (v_id, p_judgment_id, v_seq + 1, v_kind, p_row ->> 'outcome', nullif(p_row -> 'realized', 'null'::jsonb), coalesce(p_row -> 'evidence', '{}'::jsonb),
      p_row ->> 'resolver', p_row ->> 'resolver_version', p_row ->> 'reason', v_actor, pg_catalog.now(), p_request_key, v_digest,
      p_row ->> 'code_version', (p_row ->> 'batch_id')::uuid);
  exception when unique_violation then
    select s.* into v_hit from public.judgment_settlements s where s.request_key = p_request_key;
    if found then return public.judgment_replay_status(v_hit, p_judgment_id, v_digest, v_payload); end if;
    raise;
  end;
  if v_kind = 'reopened' then
    update public.judgment_settle_queue x
    set closed_at = null, next_attempt_at = pg_catalog.now(), attempts = 0, last_status = null, last_detail = '{}'::jsonb, override = null,
        leased_until = null, lease_token = null, updated_at = pg_catalog.now()
    where x.judgment_id = p_judgment_id;
  else
    -- R3-01: a final settlement (including a rejection's void) ends the open incident.
    update public.judgment_settle_queue x
    set closed_at = pg_catalog.now(), last_detail = x.last_detail - 'incident', leased_until = null, lease_token = null, updated_at = pg_catalog.now()
    where x.judgment_id = p_judgment_id;
  end if;
  if v_kind in ('withdrawn','reopened') then
    update public.judgment_calibration_validity v
    set revision = v.revision + 1, bumped_at = pg_catalog.now(), reason = v_kind || ':' || v_id::text
    where v.methodology_id = v_j.methodology_id and v.version = v_j.methodology_version;
  end if;
  return pg_catalog.jsonb_build_object('seq', v_seq + 1, 'status', 'applied');
end $$;
create or replace function public.append_settlement(p_judgment_id uuid, p_lease_token uuid, p_request_key text, p_row jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  select public.judgment_append_settlement_internal(p_judgment_id, p_lease_token, p_request_key, p_row)
$$;

-- §7.6 / plan audit Q1-02: the settle worker's ONLY quarantine write. One transaction: lock the queue row, check the
-- lease (a stale / revoked / replaced worker gets lease_lost and NOTHING is written), upsert the open item with
-- quarantine()'s semantics (one OPEN item per dataset/table/natural_key/reason_code via dq_quarantine_open_key_uniq;
-- a reused item keeps id, batch_id, created_at and detail, its payload is refreshed), then publish the queue state
-- (last_detail with incident = {quarantine_id, reason_code, evidence_hash, cutoff, quarantined_at}, plan audit R3-01; the
-- quarantined_at of an open incident is kept whatever the last attempt status, Q1-01), never in the past, attempts
-- unchanged, lease cleared. Item and queue therefore always name the same evidence.
create or replace function public.quarantine_settlement(p_judgment_id uuid, p_lease_token uuid, p_reason_code text, p_payload jsonb, p_patch jsonb, p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_q public.judgment_settle_queue; v_id uuid; v_detail jsonb := p_patch -> 'last_detail'; v_at jsonb;
begin
  if p_judgment_id is null or p_batch_id is null or coalesce(p_reason_code, '') = '' or pg_catalog.length(p_reason_code) > 64
     or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or coalesce(p_payload ->> 'evidence_hash', '') !~ '^[0-9a-f]{64}$' or (p_payload ->> 'cutoff') is null
     or p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' or pg_catalog.jsonb_typeof(v_detail) is distinct from 'object'
     or (p_patch ->> 'last_status') is distinct from 'inconsistent' or (p_patch ->> 'attempts_increment') is distinct from '0'
     or (p_patch ->> 'next_attempt_at') is null
     or (v_detail ->> 'evidence_hash') is distinct from (p_payload ->> 'evidence_hash')
     or (v_detail ->> 'cutoff') is distinct from (p_payload ->> 'cutoff')
     or pg_catalog.jsonb_typeof(v_detail -> 'incident') is distinct from 'object'
     or pg_catalog.jsonb_typeof(v_detail -> 'incident' -> 'quarantined_at') is distinct from 'string'
     or (v_detail -> 'incident' ->> 'evidence_hash') is distinct from (p_payload ->> 'evidence_hash')
     or (v_detail -> 'incident' ->> 'cutoff') is distinct from (p_payload ->> 'cutoff') then
    raise exception 'invalid_parameter: quarantine_settlement' using errcode = '22023';
  end if;
  select x.* into v_q from public.judgment_settle_queue x where x.judgment_id = p_judgment_id for update;
  if not found then raise exception 'unknown_judgment' using errcode = 'P0002'; end if;
  if v_q.lease_token is null or v_q.lease_token is distinct from p_lease_token
     or v_q.leased_until is null or v_q.leased_until <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object('status', 'lease_lost', 'quarantine_id', null);
  end if;
  insert into public.dq_quarantine as x (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status, resolved_by, resolved_at, created_at)
  values (pg_catalog.gen_random_uuid(), 'judgments', 'judgment_settlements', p_judgment_id::text, p_reason_code, '{}'::jsonb, p_payload, p_batch_id, 'open', null, null, pg_catalog.now())
  on conflict (dataset, table_name, natural_key, reason_code) where status = 'open'
  do update set payload = excluded.payload
  returning x.id into v_id;
  -- Plan audit T-06: a NEW incident is stamped here, with the database clock at the moment of the write (never the worker's
  -- pre-resolution instant, which can be minutes older); an open incident keeps its first quarantine time (R3-01).
  v_at := pg_catalog.to_jsonb(pg_catalog.to_char(pg_catalog.clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  if pg_catalog.jsonb_typeof(v_q.last_detail -> 'incident' -> 'quarantined_at') = 'string' then
    v_at := v_q.last_detail -> 'incident' -> 'quarantined_at';                 -- the open incident's first quarantine (R3-01)
  end if;
  update public.judgment_settle_queue x
  set last_status = 'inconsistent',
      last_detail = (v_detail - 'incident') || pg_catalog.jsonb_build_object('incident', pg_catalog.jsonb_build_object(
        'quarantine_id', v_id::text, 'reason_code', p_reason_code, 'evidence_hash', p_payload -> 'evidence_hash',
        'cutoff', p_payload -> 'cutoff', 'quarantined_at', v_at)),
      next_attempt_at = greatest((p_patch ->> 'next_attempt_at')::timestamptz, pg_catalog.now()),
      leased_until = null, lease_token = null, updated_at = pg_catalog.now()
  where x.judgment_id = p_judgment_id;
  return pg_catalog.jsonb_build_object('status', 'quarantined', 'quarantine_id', v_id::text);
end $$;

-- §7.6 / plan audit P1-04: the quarantine hook's acceptance, one transaction, locks queue row THEN item. It is
-- usable only for the inconsistency it was raised for: the queue must be open with an open incident whose
-- last_detail.incident.evidence_hash / cutoff = override.evidence_hash / cutoff (the identity the hook read, Q1-03;
-- the incident, not last_status, decides — a transient attempt in between does not end it, R3-01), and the
-- item open with the same evidence_hash and cutoff;
-- otherwise a status is returned and NOTHING is written. Applying sets the override, schedules now and REVOKES
-- any lease (an in-flight worker then gets lease_lost instead of overwriting last_status / last_detail), flips
-- the item and writes research_audit_log. Idempotent for the same override ('applied').
create or replace function public.apply_quarantine_override(p_judgment_id uuid, p_override jsonb, p_quarantine_id uuid, p_audit jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare v_q public.judgment_settle_queue; v_i public.dq_quarantine; v_by uuid;
begin
  if p_override is null or pg_catalog.jsonb_typeof(p_override) <> 'object'
     or pg_catalog.jsonb_typeof(p_override -> 'resolution') is distinct from 'object'
     or coalesce(p_override ->> 'reason_code', '') = ''
     or coalesce(p_override ->> 'evidence_hash', '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_override ->> 'resolved_by', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (p_override ->> 'at') is null or (p_override ->> 'cutoff') is null
     or p_audit is null or pg_catalog.jsonb_typeof(p_audit) <> 'object' then
    raise exception 'invalid_parameter: override' using errcode = '22023';
  end if;
  v_by := (p_override ->> 'resolved_by')::uuid;
  select x.* into v_q from public.judgment_settle_queue x where x.judgment_id = p_judgment_id for update;
  if not found then raise exception 'unknown_judgment' using errcode = 'P0002'; end if;
  select x.* into v_i from public.dq_quarantine x where x.id = p_quarantine_id for update;
  if not found or v_i.dataset <> 'judgments' or v_i.natural_key <> p_judgment_id::text then return 'item_not_open'; end if;
  if v_i.status <> 'open' then
    if v_i.status = 'resolved_accept' and v_q.override = p_override then return 'applied'; end if;
    return 'item_not_open';
  end if;
  if v_q.closed_at is not null then return 'closed'; end if;
  if v_i.table_name <> 'judgment_settlements'
     or pg_catalog.jsonb_typeof(v_q.last_detail -> 'incident') is distinct from 'object'
     or (v_q.last_detail -> 'incident' ->> 'quarantine_id') is distinct from p_quarantine_id::text
     or (v_q.last_detail -> 'incident' ->> 'evidence_hash') is distinct from (p_override ->> 'evidence_hash')
     or (v_q.last_detail -> 'incident' ->> 'cutoff') is distinct from (p_override ->> 'cutoff')
     or (v_i.payload ->> 'evidence_hash') is distinct from (p_override ->> 'evidence_hash')
     or (v_i.payload ->> 'cutoff') is distinct from (p_override ->> 'cutoff') then
    return 'stale';
  end if;
  update public.judgment_settle_queue x
  set override = p_override, next_attempt_at = pg_catalog.now(), leased_until = null, lease_token = null, updated_at = pg_catalog.now()
  where x.judgment_id = p_judgment_id;
  update public.dq_quarantine x
  set status = 'resolved_accept', resolved_by = v_by, resolved_at = pg_catalog.now(), detail = x.detail || pg_catalog.jsonb_build_object('override', p_override)
  where x.id = p_quarantine_id;
  insert into public.research_audit_log (id, user_id, actor, action, object_type, object_id, detail, created_at)
  values (pg_catalog.gen_random_uuid(), v_by, 'user', 'dq.quarantine_resolve', 'dq', p_quarantine_id,
          p_audit || pg_catalog.jsonb_build_object('judgment_id', p_judgment_id::text, 'override', p_override), pg_catalog.now());
  return 'applied';
end $$;

-- §7.6 / plan audit P1-05: the quarantine hook's rejection, ONE transaction: replay check on the request key →
-- lock queue row THEN item → replay check again → validate (item open; queue open with an open incident, R3-01; the
-- evidence identity the hook read, p_expected = {evidence_hash, cutoff}, equals BOTH the locked queue
-- last_detail.incident and the locked item payload — plan audit Q1-03) → the void through the single append
-- implementation (which closes the queue and so ends the incident) → item
-- resolved_reject → audit row. A crash can no longer leave a void with an open item, a concurrent acceptance cannot
-- interleave, and a worker refresh between the hook's read and this call makes the request stale.
create or replace function public.reject_quarantined_settlement(p_judgment_id uuid, p_quarantine_id uuid, p_expected jsonb, p_request_key text, p_row jsonb, p_audit jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_digest text := p_row ->> 'request_digest';
  v_actor text := p_row ->> 'actor';
  v_payload jsonb;
  v_hit public.judgment_settlements;
  v_q public.judgment_settle_queue;
  v_i public.dq_quarantine;
  v_seq integer;
  v_res jsonb;
begin
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' or (p_row ->> 'kind') is distinct from 'void'
     or coalesce(v_actor, '') !~ '^admin:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(v_digest, '') !~ '^[0-9a-f]{64}$' or p_request_key is null
     or p_expected is null or pg_catalog.jsonb_typeof(p_expected) <> 'object'
     or coalesce(p_expected ->> 'evidence_hash', '') !~ '^[0-9a-f]{64}$' or (p_expected ->> 'cutoff') is null
     or p_audit is null or pg_catalog.jsonb_typeof(p_audit) <> 'object' then
    raise exception 'invalid_parameter: rejection' using errcode = '22023';
  end if;
  v_payload := public.judgment_operation_payload(p_judgment_id, p_row);
  select s.* into v_hit from public.judgment_settlements s where s.request_key = p_request_key;
  if found then return public.judgment_replay_status(v_hit, p_judgment_id, v_digest, v_payload); end if;
  select x.* into v_q from public.judgment_settle_queue x where x.judgment_id = p_judgment_id for update;
  if not found then raise exception 'unknown_judgment' using errcode = 'P0002'; end if;
  select x.* into v_i from public.dq_quarantine x where x.id = p_quarantine_id for update;
  select s.* into v_hit from public.judgment_settlements s where s.request_key = p_request_key;
  if found then return public.judgment_replay_status(v_hit, p_judgment_id, v_digest, v_payload); end if;
  select coalesce(pg_catalog.max(s.seq), 0) into v_seq from public.judgment_settlements s where s.judgment_id = p_judgment_id;
  if v_i.id is null or v_i.dataset <> 'judgments' or v_i.natural_key <> p_judgment_id::text or v_i.status <> 'open' then
    return pg_catalog.jsonb_build_object('seq', v_seq, 'status', 'item_not_open');
  end if;
  if v_q.closed_at is not null or v_i.table_name <> 'judgment_settlements'
     or pg_catalog.jsonb_typeof(v_q.last_detail -> 'incident') is distinct from 'object'
     or (v_q.last_detail -> 'incident' ->> 'quarantine_id') is distinct from p_quarantine_id::text
     or (v_q.last_detail -> 'incident' ->> 'evidence_hash') is distinct from (p_expected ->> 'evidence_hash')
     or (v_q.last_detail -> 'incident' ->> 'cutoff') is distinct from (p_expected ->> 'cutoff')
     or (v_i.payload ->> 'evidence_hash') is distinct from (p_expected ->> 'evidence_hash')
     or (v_i.payload ->> 'cutoff') is distinct from (p_expected ->> 'cutoff') then
    return pg_catalog.jsonb_build_object('seq', v_seq, 'status', 'stale');
  end if;
  v_res := public.judgment_append_settlement_internal(p_judgment_id, null, p_request_key, p_row);
  if v_res ->> 'status' <> 'applied' then return v_res; end if;
  update public.dq_quarantine x
  set status = 'resolved_reject', resolved_by = pg_catalog.substr(v_actor, 7)::uuid, resolved_at = pg_catalog.now(),
      detail = x.detail || pg_catalog.jsonb_build_object('rejected_settlement_seq', (v_res ->> 'seq')::integer)
  where x.id = p_quarantine_id;
  insert into public.research_audit_log (id, user_id, actor, action, object_type, object_id, detail, created_at)
  values (pg_catalog.gen_random_uuid(), pg_catalog.substr(v_actor, 7)::uuid, 'user', 'dq.quarantine_resolve', 'dq', p_quarantine_id,
          p_audit || pg_catalog.jsonb_build_object('judgment_id', p_judgment_id::text, 'decision', 'reject', 'seq', (v_res ->> 'seq')::integer), pg_catalog.now());
  return v_res;
end $$;

-- Final-state cleanup locks queue before item, validates the evidence read by the hook,
-- and commits the rejection and its audit together without appending a settlement.
create or replace function public.resolve_closed_judgment_quarantine(p_judgment_id uuid, p_quarantine_id uuid, p_expected jsonb, p_resolved_by uuid, p_audit jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare v_q public.judgment_settle_queue; v_i public.dq_quarantine;
begin
  if p_expected is null or pg_catalog.jsonb_typeof(p_expected) <> 'object'
     or coalesce(p_expected ->> 'evidence_hash', '') !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(p_expected -> 'cutoff') is distinct from 'string'
     or p_resolved_by is null or p_audit is null or pg_catalog.jsonb_typeof(p_audit) <> 'object' then
    raise exception 'invalid_parameter: closed quarantine' using errcode = '22023';
  end if;
  select x.* into v_q from public.judgment_settle_queue x where x.judgment_id=p_judgment_id for update;
  if not found then raise exception 'unknown_judgment' using errcode = 'P0002'; end if;
  select x.* into v_i from public.dq_quarantine x where x.id=p_quarantine_id for update;
  if v_i.id is null or v_i.dataset <> 'judgments' or v_i.natural_key <> p_judgment_id::text or v_i.status <> 'open' then return 'item_not_open'; end if;
  if v_q.closed_at is null or v_i.table_name <> 'judgment_settlements'
     or (v_i.payload ->> 'evidence_hash') is distinct from (p_expected ->> 'evidence_hash')
     or (v_i.payload ->> 'cutoff') is distinct from (p_expected ->> 'cutoff') then return 'stale'; end if;
  update public.dq_quarantine set status='resolved_reject',resolved_by=p_resolved_by,resolved_at=pg_catalog.now() where id=p_quarantine_id;
  insert into public.research_audit_log(id,user_id,actor,action,object_type,object_id,detail,created_at)
  values(pg_catalog.gen_random_uuid(),p_resolved_by,'user','dq.quarantine_resolve','dq',p_quarantine_id,
    p_audit || pg_catalog.jsonb_build_object('judgment_id',p_judgment_id::text,'decision','reject','closed',true),pg_catalog.now());
  return 'applied';
end $$;
revoke execute on function public.resolve_closed_judgment_quarantine(uuid,uuid,jsonb,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.resolve_closed_judgment_quarantine(uuid,uuid,jsonb,uuid,jsonb) to service_role;

-- §8.3 / plan audit P1-10: freeze one calibration generation's cohort in ONE statement (one MVCC snapshot):
-- every non-abstained registration with as_of in the window and its latest settlement at that snapshot. A
-- transaction that began before and commits after the freeze is consistently outside the generation.
-- Plan audit Q1-05: the generation is CLAIMED first through the marker judgment_job_state['cohort:<generation>']
-- (insert … on conflict do nothing: a concurrent freeze of the same generation waits on the key and then sees the
-- claim). A claimed generation — including an empty one — returns already_frozen from the marker and inserts nothing.
create or replace function public.freeze_calibration_cohort(p_generation uuid, p_methodology text, p_version text, p_window_from date, p_window_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n bigint; v_at timestamptz := pg_catalog.date_trunc('milliseconds', pg_catalog.statement_timestamp()); v_job text; v_claimed text; v_marker jsonb;   -- review E-01: frozen_at is a millisecond value, so adapters round-trip it exactly
begin
  if p_generation is null or p_methodology is null or p_version is null or p_window_from is null or p_window_to is null or p_window_from > p_window_to then
    raise exception 'invalid_parameter: window' using errcode = '22023';
  end if;
  v_job := 'cohort:' || p_generation::text;
  -- Review C-04: freeze and clear of one generation serialise on this lock (taken first in both), held to commit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_job, 0));
  insert into public.judgment_job_state (job, state, updated_at)
  values (v_job, pg_catalog.jsonb_build_object('frozen_at', v_at, 'n', null, 'methodology', p_methodology, 'version', p_version,
          'window', pg_catalog.jsonb_build_object('from', p_window_from, 'to', p_window_to)), pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()))
  on conflict (job) do nothing
  returning job into v_claimed;
  if v_claimed is null then
    select s.state into v_marker from public.judgment_job_state s where s.job = v_job;
    return pg_catalog.jsonb_build_object('status', 'already_frozen', 'frozen_at', v_marker -> 'frozen_at', 'n', coalesce((v_marker ->> 'n')::bigint, 0));
  end if;
  insert into public.judgment_calibration_cohort_members (generation, judgment_id, settlement_id, ord)
  select p_generation, j.judgment_id,
         (select s.settlement_id from public.judgment_settlements s where s.judgment_id = j.judgment_id and s.settled_at <= v_at order by s.seq desc limit 1),
         pg_catalog.row_number() over (order by j.judgment_id)
  from public.judgments j
  where j.methodology_id = p_methodology and j.methodology_version = p_version and not j.abstained
    and j.as_of between p_window_from and p_window_to and j.registered_at <= v_at;   -- review minor 7: frozen_at bounds registrations and settlements
  get diagnostics n = row_count;
  update public.judgment_job_state s set state = s.state || pg_catalog.jsonb_build_object('n', n) where s.job = v_job;
  return pg_catalog.jsonb_build_object('status', 'frozen', 'frozen_at', v_at, 'n', n);
end $$;

-- The frozen members of a generation as envelopes (settlement = the one frozen with it), keyset by judgment_id.
create or replace function public.calibration_cohort_members(p_generation uuid, p_after uuid, p_limit integer)
returns setof public.judgment_envelope language plpgsql stable security definer set search_path = '' as $$
begin
  if p_generation is null then raise exception 'invalid_parameter: generation' using errcode = '22023'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid_parameter: limit' using errcode = '22023'; end if;
  return query
  select j,
         (select s from public.judgment_settlements s where s.settlement_id = c.settlement_id),
         null::public.judgment_calibrations, false, null::public.judgment_methodology_events
  from public.judgment_calibration_cohort_members c
  join public.judgments j on j.judgment_id = c.judgment_id
  where c.generation = p_generation and (p_after is null or c.judgment_id > p_after)
  order by c.judgment_id
  limit p_limit;
end $$;

create or replace function public.clear_calibration_generation(p_generation uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_generation is null then raise exception 'invalid_parameter: generation' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cohort:' || p_generation::text, 0));   -- review C-04: same lock as freeze
  delete from public.judgment_calibration_cohort_members c where c.generation = p_generation;
  get diagnostics n = row_count;
  delete from public.judgment_job_state s where s.job = 'cohort:' || p_generation::text;   -- Q1-05: the claim goes with the members
  return n;
end $$;

-- §5.6 / R05: lock the validity row; the row's revision, the caller's expectation and the locked
-- revision must agree, else stale_revision (nothing written); a known fingerprint is a duplicate.
create or replace function public.insert_calibration(p_row jsonb, p_expected_revision bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.judgment_calibrations := pg_catalog.jsonb_populate_record(null::public.judgment_calibrations, p_row);
  v public.judgment_calibration_validity;
  n integer;
begin
  select x.* into v from public.judgment_calibration_validity x
  where x.methodology_id = r.methodology_id and x.version = r.methodology_version for update;
  if not found then raise exception 'unknown_methodology' using errcode = 'P0002'; end if;
  if p_expected_revision is null or r.validity_revision is distinct from p_expected_revision or p_expected_revision <> v.revision then
    return 'stale_revision';
  end if;
  insert into public.judgment_calibrations select r.* on conflict (fingerprint) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'inserted' else 'duplicate' end;
end $$;

-- §5.5b: optimistic lock on updated_at (millisecond precision, strictly increasing).
-- Plan audit T-04: returns {ok, updated_at} so the writer keeps ownership of the revision it just wrote (a re-read could name
-- another writer's). The return type changed from boolean, so the old definition is dropped first.
drop function if exists public.set_job_state(text, timestamptz, jsonb);
create function public.set_job_state(p_job text, p_expected_updated_at timestamptz, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()); v_at timestamptz;
begin
  if p_job is null or p_state is null or pg_catalog.jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_parameter: job_state' using errcode = '22023';
  end if;
  if p_expected_updated_at is null then
    insert into public.judgment_job_state (job, state, updated_at) values (p_job, p_state, v_now) on conflict (job) do nothing
    returning updated_at into v_at;
  else
    update public.judgment_job_state x set state = p_state, updated_at = greatest(v_now, x.updated_at + interval '1 millisecond')
    where x.job = p_job and x.updated_at = p_expected_updated_at
    returning x.updated_at into v_at;
  end if;
  return pg_catalog.jsonb_build_object('ok', v_at is not null, 'updated_at', v_at);
end $$;

-- §7.1 / audit G26: running batches of ONE judgments.* dataset older than p_older_than → failed.
create or replace function public.repair_stale_batches(p_dataset text, p_older_than interval) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_dataset is null or p_dataset !~ '^judgments\.[a-z0-9_.]{1,54}$' or p_older_than is null or p_older_than < interval '1 minute' then
    raise exception 'invalid_parameter: repair_stale_batches' using errcode = '22023';
  end if;
  update public.ingest_batches b
  set status = 'failed', finished_at = greatest(pg_catalog.now(), b.started_at),
      errors = b.errors || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code', 'stale_running',
        'message', 'running since ' || b.started_at::text || ', repaired after ' || p_older_than::text))
  where b.dataset = p_dataset and b.status = 'running' and b.started_at < pg_catalog.now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- execute grants
do $$ declare f text; begin
  foreach f in array array[
    'public.judgments_server_time()',
    'public.judgment_envelope_of(public.judgments, text, timestamptz)',
    'public.latest_judgment_cards(text, text, text[], text, timestamptz)',
    'public.judgment_history(text, text, text, text, text, text, timestamptz, uuid, integer)',
    'public.calibration_cohort(text, text, date, date, timestamptz, uuid, integer)',
    'public.methodology_state_at(text, text, timestamptz)',
    'public.judgment_envelope_by_id(uuid, text, timestamptz)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.calibration_cohort_internal(text, text, date, date, timestamptz, uuid, integer)',
    'public.sync_methodology(jsonb, text, text)',
    'public.register_judgment(jsonb, jsonb)',
    'public.claim_due_judgments(integer, integer)',
    'public.claim_judgment(uuid, integer)',
    'public.release_lease(uuid, uuid, jsonb)',
    'public.append_settlement(uuid, uuid, text, jsonb)',
    'public.quarantine_settlement(uuid, uuid, text, jsonb, jsonb, uuid)',
    'public.apply_quarantine_override(uuid, jsonb, uuid, jsonb)',
    'public.resolve_closed_judgment_quarantine(uuid, uuid, jsonb, uuid, jsonb)',
    'public.reject_quarantined_settlement(uuid, uuid, jsonb, text, jsonb, jsonb)',
    'public.freeze_calibration_cohort(uuid, text, text, date, date)',
    'public.calibration_cohort_members(uuid, uuid, integer)',
    'public.clear_calibration_generation(uuid)',
    'public.insert_calibration(jsonb, bigint)',
    'public.set_job_state(text, timestamptz, jsonb)',
    'public.repair_stale_batches(text, interval)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.judgments_settle_after_date(jsonb)',
    'public.judgments_grace_days(jsonb, jsonb)',
    'public.judgment_operation_payload(uuid, jsonb)',
    'public.judgment_settlement_payload(public.judgment_settlements)',
    'public.judgment_replay_status(public.judgment_settlements, uuid, text, jsonb)',
    'public.judgment_append_settlement_internal(uuid, uuid, text, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $$;
