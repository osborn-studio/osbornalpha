-- supabase/migrations/20261114090000_macro_workbench.sql
-- Macro workbench (spec §4.3; §0.2 M6, M10, M14, M16, M22, M24, N1, N2, N3; plan 第 4 稿 P1-4…P2-4, 第 5 稿 P1-1…P2-3). Twelve tables:
--   macro_catalog_versions (append-only catalog JSON per version) and macro_series (mirror of the
--   code catalog, src/lib/macro/catalog.ts); macro_evidence_objects (byte objects by sha256, bytes in
--   the private bucket macro-raw) and macro_retrievals (one receipt per fetch, even for repeated
--   bytes); macro_observations (lossless decimal values with local versions per series+period;
--   status ok | quarantined | rejected); macro_snapshots + macro_regime_results (transactional fact
--   snapshots with frozen manifest and display history); macro_publish_state (per-region revision and
--   input_revision, pre-seeded US/CN); macro_quarantine_members (dq_quarantine item → quarantined
--   observation rows); macro_ingest_runs (single-writer ingest lease with an owner token + exclusive resumable finish) and
--   macro_ingest_chunks (claimed/completed chunk receipts with errors and claim/location keys);
--   macro_analysis_runs (frozen, append-only correlation runs).
-- Publication eligibility (macro_ineligible_ids): an observation is eligible when it is ok, its batch
-- finished success/partial, and every derived_from ancestor is eligible, recursively. Publish and
-- republish validate it in-transaction; the service read RPCs used by the publish path filter by it.
-- Write path: NO role has insert/update/delete on these tables, service_role included; every write
-- goes through the security definer functions below, executable by service_role only. Two
-- security invoker read functions (macro_latest_observations, macro_snapshots_since) are open to
-- every client role and stay under RLS; the eligibility reads are security definer, service only
-- (ingest_batches is service-only).
-- Owner fence (第 5 稿 P1-3): every ingest mutation first calls macro_assert_owner(batch, token, states), which
-- locks the batch's macro_ingest_runs row FOR UPDATE and raises `fenced` unless the token matches and the run is in an
-- allowed state; a batch without a run row (FRED cron, single writer by Vercel cron) must pass a null token. A
-- takeover (macro_claim_ingest) sets the old run 'aborted' in the same transaction, so a paused old worker can never
-- write again.
-- Fenced finish side effects (第 6 稿 P1-1/P2-4): macro_finalize_batch (ingest_batches status/counts/errors/finished_at, the
-- AKShare finish and the cron, replacing finishBatch there) and macro_record_freshness (dq_freshness upsert with the
-- recordAttempt / computeFreshness semantics plus the freshness_recorded checkpoint, one transaction) validate the owner AND
-- finish token under the run row lock before writing, so a finisher whose finish token was rotated can never overwrite a
-- later collection's batch or freshness. Every token mismatch is checked before any terminal-state error and raises fenced.
-- macro_regime_results is service-only (第 6 稿 P1-2): judgments are never readable with the public anon key.
-- Lock discipline (always run row → other rows): macro_write_observations locks the run row, then the touched
-- regions' macro_publish_state rows (ordered by region); publish locks the run row (finish path), then its region
-- row; republish locks the region row; the resolver locks the dq_quarantine row, then the region row; the linker
-- locks the run row, then the dq_quarantine row (第 5 稿 P2-3); macro_finalize_batch locks the run row, then the
-- ingest_batches row; macro_record_freshness locks the run row, then takes the dq_freshness:<dataset> advisory lock. The write / publish / resolve paths bump input_revision / revision under the lock,
-- so a publisher that read stale state fails with stale_publisher. Ingest: macro_claim_ingest takes a per-dataset
-- advisory lock (the partial unique index on live runs is the backstop); chunk claims, completions, begin-finish and
-- finish steps lock the run row for update.
-- Errors carry the code as the message: stale_publisher, invalid_manifest, quota_exceeded,
-- already_resolved, reject_only, not_quarantined, member_ineligible, fenced, quarantine_closed, chunk_total_mismatch,
-- chunk_not_processing, batch_not_open, run_not_finishing, evidence_mismatch, catalog_version_conflict (P0001);
-- not_found, not_member, batch_not_claimed (P0002); invalid_* (incl. invalid_finalize, invalid_freshness, invalid_dataset) / observation_required /
-- observation_not_allowed (22023). Triggers refuse with 23514, prefix `append_only:`.
-- Timestamps written by this migration are truncated to milliseconds so JS ISO strings round-trip.
-- The hosted `postgres` role is not a superuser: functions keep the migration role as owner,
-- `set search_path = public`, and qualify every relation. Replayable: guarded creates, create or
-- replace, drop-then-create policies and triggers, insert … on conflict. Only storage.buckets is
-- referenced (local harness).

-- ---------------------------------------------------------------- catalog
create table if not exists public.macro_catalog_versions (
  catalog_version text primary key check (catalog_version ~ '^macro-catalog/[0-9a-f]{12}$'),
  catalog         jsonb not null check (jsonb_typeof(catalog) = 'array'),
  rules_version   text not null check (length(rules_version) between 1 and 64),
  created_at      timestamptz not null default date_trunc('milliseconds', now())
);

create table if not exists public.macro_series (
  id                 text primary key check (id ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  region             text not null check (region in ('US','CN')),
  role               text not null check (role in ('indicator','asset','event_source')),
  type               text check (type is null or type in ('policy_rate','bond_yield','fx','inflation_yoy','pmi','labor_rate','growth_yoy','liquidity_yoy','risk_index','asset_price')),
  name               jsonb not null check (jsonb_typeof(name) = 'object'),
  unit               text not null check (length(unit) between 1 and 32),
  native_frequency   text not null check (native_frequency in ('daily','monthly','quarterly','event')),
  period             text not null check (period in ('day','month','quarter')),
  adjustment         text not null check (adjustment in ('sa','nsa','na')),
  status             text not null check (status in ('active','missing','restricted')),
  reason             jsonb check (reason is null or jsonb_typeof(reason) = 'object'),
  source             jsonb check (source is null or jsonb_typeof(source) = 'object'),
  derive             jsonb check (derive is null or (jsonb_typeof(derive) = 'object' and derive->>'kind' in ('month_end','yoy_from_index','index_minus_100'))),
  alias_of           text,
  revision_policy    text not null check (revision_policy in ('revisable','immutable')),
  weight             numeric not null check (weight >= 0),
  change_kind        text not null check (change_kind in ('bp','pp','pct','points')),
  release_lag_days   int check (release_lag_days is null or release_lag_days >= 0),
  definition_version int not null check (definition_version >= 1),
  catalog_version    text not null references public.macro_catalog_versions(catalog_version) on delete restrict,
  updated_at         timestamptz not null default date_trunc('milliseconds', now()),
  constraint macro_series_source_iff_not_missing check ((status = 'missing') = (source is null)),
  constraint macro_series_reason_required check (status = 'active' or reason is not null)
);
create index if not exists macro_series_region_idx on public.macro_series(region, role);

-- ---------------------------------------------------------------- evidence (§0.2 N2)
create table if not exists public.macro_evidence_objects (
  sha256       text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  object_path  text not null unique,
  adapter      text not null check (adapter in ('fred_csv','akshare')),
  content_type text not null check (length(content_type) between 1 and 128),
  byte_length  bigint not null check (byte_length >= 0),
  created_at   timestamptz not null default date_trunc('milliseconds', now()),
  constraint macro_evidence_path check (object_path ~ ('^' || adapter || '/' || sha256 || '\.(csv|json|html|txt)$'))
);

create table if not exists public.macro_retrievals (
  retrieval_id  uuid primary key,
  sha256        text not null references public.macro_evidence_objects(sha256) on delete restrict,
  fetch_url     text not null check (fetch_url ~ '^https?://' and length(fetch_url) <= 2048),
  fetch_host    text not null check (length(fetch_host) between 1 and 255),
  http_status   int not null check (http_status between 100 and 599),
  fetched_at    timestamptz not null,
  batch_id      uuid not null references public.ingest_batches(batch_id) on delete restrict,
  tool_versions jsonb not null default '{}' check (jsonb_typeof(tool_versions) = 'object'),
  constraint macro_retrievals_host check (lower(substring(fetch_url from '^https?://([^/:?#]+)')) = fetch_host)
);
create index if not exists macro_retrievals_sha_idx on public.macro_retrievals(sha256);
create index if not exists macro_retrievals_batch_idx on public.macro_retrievals(batch_id);

-- ---------------------------------------------------------------- observations (§4.1, §4.4)
create table if not exists public.macro_observations (
  observation_id     uuid primary key,
  series_id          text not null references public.macro_series(id) on delete restrict,
  period_end         date not null,
  value              numeric not null,
  value_text         text not null check (value_text ~ '^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$' and value_text <> '-0'),
  version            int not null check (version >= 1),
  available_at       timestamptz not null,
  availability_basis text not null default 'first_seen' check (availability_basis = 'first_seen'),
  ingested_at        timestamptz not null default date_trunc('milliseconds', now()),
  status             text not null check (status in ('ok','quarantined','rejected')),
  retrieval_id       uuid references public.macro_retrievals(retrieval_id) on delete restrict,
  locator            jsonb check (locator is null or (jsonb_typeof(locator) = 'object' and locator->>'kind' in ('csv_row','json_pointer','html_cell'))),
  derived_from       uuid[],
  transform          text check (transform is null or length(transform) between 1 and 128),
  code_version       text not null check (length(code_version) between 1 and 128),
  batch_id           uuid not null references public.ingest_batches(batch_id) on delete restrict,
  constraint macro_observations_value_exact check (value = value_text::numeric),
  constraint macro_observations_key unique (series_id, period_end, version),
  constraint macro_observations_provenance check (
    (retrieval_id is not null and locator is not null and derived_from is null and transform is null)
    or (retrieval_id is null and locator is null and derived_from is not null and cardinality(derived_from) >= 1 and transform is not null))
);
create index if not exists macro_observations_latest_idx on public.macro_observations(series_id, period_end desc, version desc) where status = 'ok';
create index if not exists macro_observations_batch_idx on public.macro_observations(batch_id);

-- ---------------------------------------------------------------- snapshots (§4.3, §0.2 M16)
create table if not exists public.macro_snapshots (
  snapshot_id         uuid primary key,
  region              text not null check (region in ('US','CN')),
  as_of               date not null,
  revision            bigint not null check (revision >= 0),
  methodology_version text not null check (length(methodology_version) between 1 and 64),
  catalog_version     text not null check (length(catalog_version) between 1 and 64),
  observation_ids     uuid[] not null default '{}',
  history_ids         uuid[] not null default '{}',   -- frozen sparkline history (第 4 稿 P1-8)
  catalog_counts      jsonb not null check (jsonb_typeof(catalog_counts) = 'object'),
  status              text not null check (status in ('active','superseded','failed')),
  failure_reason      text check (failure_reason is null or length(failure_reason) between 1 and 2000),
  publish_key         text check (publish_key is null or length(publish_key) between 1 and 128),   -- 第 5 稿 P1-4: 'ingest:<batch>' | 'cron:<batch>'
  created_at          timestamptz not null default date_trunc('milliseconds', now()),
  constraint macro_snapshots_failure_iff check ((status = 'failed') = (failure_reason is not null))
);
create unique index if not exists macro_snapshots_one_active on public.macro_snapshots(region) where status = 'active';
create unique index if not exists macro_snapshots_publish_key_uniq on public.macro_snapshots(publish_key) where publish_key is not null;
create unique index if not exists macro_snapshots_revision_uniq on public.macro_snapshots(region, revision) where status <> 'failed';
create index if not exists macro_snapshots_since_idx on public.macro_snapshots(created_at, snapshot_id) where status <> 'failed';

create table if not exists public.macro_regime_results (
  snapshot_id      uuid primary key references public.macro_snapshots(snapshot_id) on delete restrict,
  region           text not null check (region in ('US','CN')),
  regime           jsonb check (regime is null or jsonb_typeof(regime) = 'object'),
  contributions    jsonb not null default '[]' check (jsonb_typeof(contributions) = 'array'),
  rules_version    text not null check (length(rules_version) between 1 and 64),
  uncovered_weight numeric not null check (uncovered_weight >= 0)
);

create table if not exists public.macro_publish_state (
  region         text primary key check (region in ('US','CN')),
  revision       bigint not null default 0 check (revision >= 0),
  input_revision bigint not null default 0 check (input_revision >= 0),
  updated_at     timestamptz not null default date_trunc('milliseconds', now())
);
insert into public.macro_publish_state(region) values ('US'), ('CN') on conflict (region) do nothing;

-- ---------------------------------------------------------------- quarantine members (第 4 稿 P1-4)
-- dq_quarantine reuses one OPEN item per (dataset, table, natural_key, reason) and keeps the first payload, so
-- the item ↔ observation binding lives here, written by macro_link_quarantine right after quarantine().
create table if not exists public.macro_quarantine_members (
  quarantine_id  uuid not null references public.dq_quarantine(id) on delete restrict,
  observation_id uuid not null references public.macro_observations(observation_id) on delete restrict,
  created_at     timestamptz not null default date_trunc('milliseconds', now()),
  primary key (quarantine_id, observation_id)
);
create index if not exists macro_quarantine_members_obs_idx on public.macro_quarantine_members(observation_id);

-- ---------------------------------------------------------------- ingest lease, chunks (§0.2 M24; 第 4 稿 P1-6, P2-1, P2-4; 第 5 稿 P1-3, P1-4, P2-1)
-- owner_token fences every mutation of the run's batch (macro_assert_owner); processing_timeout bounds how long a chunk may
-- stay 'processing' before a takeover may abort the run; finish_token is rotated by every macro_begin_finish, so only the
-- latest finisher of the owner can record steps.
create table if not exists public.macro_ingest_runs (
  batch_id           uuid primary key references public.ingest_batches(batch_id) on delete restrict,
  dataset            text not null check (dataset ~ '^macro\.[a-z0-9_]{1,32}$'),
  state              text not null default 'open' check (state in ('open','finishing','finished','aborted')),
  owner_token        uuid not null,
  processing_timeout interval not null default interval '10 minutes' check (processing_timeout > interval '0'),
  finish_token       uuid,
  finish_progress    jsonb not null default '{}' check (jsonb_typeof(finish_progress) = 'object'),
  created_at         timestamptz not null default date_trunc('milliseconds', now()),
  updated_at         timestamptz not null default date_trunc('milliseconds', now()),
  constraint macro_ingest_runs_finish_token check (state not in ('finishing','finished') or finish_token is not null)
);
-- the single-writer lease: at most one live (open or finishing) run per dataset
create unique index if not exists macro_ingest_runs_one_live on public.macro_ingest_runs(dataset) where state in ('open','finishing');

create table if not exists public.macro_ingest_chunks (
  batch_id     uuid not null references public.ingest_batches(batch_id) on delete restrict,
  seq          int not null check (seq >= 0),
  total        int not null check (total between 1 and 10000),
  state        text not null default 'processing' check (state in ('processing','done')),
  counts       jsonb not null default '{"fetched":0,"inserted":0,"duplicates":0,"versioned":0,"quarantined":0,"failed":0}' check (jsonb_typeof(counts) = 'object'),
  native_usable int not null default 0 check (native_usable >= 0),   -- 第 6 稿 P2-1: usable native rows (previously_rejected excluded)
  errors       jsonb not null default '[]' check (jsonb_typeof(errors) = 'array'),
  claim_keys   jsonb not null default '[]' check (jsonb_typeof(claim_keys) = 'array'),
  located_keys jsonb not null default '[]' check (jsonb_typeof(located_keys) = 'array'),
  received_at  timestamptz not null default date_trunc('milliseconds', now()),
  completed_at timestamptz,
  primary key (batch_id, seq),
  constraint macro_ingest_chunks_seq_in_range check (seq < total),
  constraint macro_ingest_chunks_done_iff check ((state = 'done') = (completed_at is not null))
);

-- ---------------------------------------------------------------- analysis runs (§7, §0.2 M22, N1)
create table if not exists public.macro_analysis_runs (
  run_id         uuid primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  request_id     uuid not null,
  kind           text not null check (kind in ('change','level','rolling','event_window')),
  spec           jsonb not null check (jsonb_typeof(spec) = 'object'),
  inputs         jsonb not null,
  inputs_hash    text not null check (inputs_hash ~ '^[0-9a-f]{64}$'),
  results        jsonb,
  code_version   text not null check (length(code_version) between 1 and 128),
  method_version text not null check (length(method_version) between 1 and 64),
  status         text not null check (status in ('ok','failed')),
  error          text check (error is null or length(error) between 1 and 2000),
  created_at     timestamptz not null default date_trunc('milliseconds', now()),
  constraint macro_analysis_runs_request_uniq unique (user_id, request_id),
  constraint macro_analysis_runs_outcome check ((status = 'ok' and results is not null and error is null) or (status = 'failed' and error is not null))
);
create index if not exists macro_analysis_runs_user_idx on public.macro_analysis_runs(user_id, created_at desc);

-- ---------------------------------------------------------------- bucket (§4.3; local harness has storage.buckets only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('macro-raw', 'macro-raw', false, 52428800, array['text/csv','application/json','text/html','text/plain'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- triggers (backstops for the function write path)
-- Observations: never deleted; only status may change, and only quarantined → ok | rejected (resolver).
create or replace function public.macro_observations_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: macro_observations rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') then
    raise exception 'append_only: macro_observations allows status changes only' using errcode = '23514';
  end if;
  if new.status <> old.status and not (old.status = 'quarantined' and new.status in ('ok','rejected')) then
    raise exception 'append_only: macro_observations status % -> % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists macro_observations_lifecycle on public.macro_observations;
create trigger macro_observations_lifecycle before update or delete on public.macro_observations
  for each row execute function public.macro_observations_lifecycle();

-- Snapshots: never deleted; only status active → superseded.
create or replace function public.macro_snapshots_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: macro_snapshots rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') or not (old.status = 'active' and new.status = 'superseded') then
    raise exception 'append_only: macro_snapshots allows active -> superseded only' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists macro_snapshots_lifecycle on public.macro_snapshots;
create trigger macro_snapshots_lifecycle before update or delete on public.macro_snapshots
  for each row execute function public.macro_snapshots_lifecycle();

-- Chunks: never deleted; a claimed (processing) row is completed exactly once (→ done).
create or replace function public.macro_ingest_chunks_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: macro_ingest_chunks rows are never deleted' using errcode = '23514';
  end if;
  if old.state <> 'processing' or new.state <> 'done'
     or (new.batch_id, new.seq, new.total, new.received_at) is distinct from (old.batch_id, old.seq, old.total, old.received_at) then
    raise exception 'append_only: macro_ingest_chunks allows processing -> done only' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists macro_ingest_chunks_lifecycle on public.macro_ingest_chunks;
create trigger macro_ingest_chunks_lifecycle before update or delete on public.macro_ingest_chunks
  for each row execute function public.macro_ingest_chunks_lifecycle();

-- Ingest runs: never deleted; identity (batch, dataset, owner token, processing timeout, created_at) fixed; state only
-- moves forward: open → finishing → finished, open | finishing → aborted (takeover); finished and aborted are frozen.
create or replace function public.macro_ingest_runs_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: macro_ingest_runs rows are never deleted' using errcode = '23514';
  end if;
  if (new.batch_id, new.dataset, new.owner_token, new.processing_timeout, new.created_at)
       is distinct from (old.batch_id, old.dataset, old.owner_token, old.processing_timeout, old.created_at)
     or old.state in ('finished','aborted')
     or (old.state = 'finishing' and new.state = 'open')
     or (old.state = 'open' and new.state = 'finished') then
    raise exception 'append_only: macro_ingest_runs moves forward only (open -> finishing -> finished | aborted)' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists macro_ingest_runs_lifecycle on public.macro_ingest_runs;
create trigger macro_ingest_runs_lifecycle before update or delete on public.macro_ingest_runs
  for each row execute function public.macro_ingest_runs_lifecycle();

-- Strictly append-only tables. macro_analysis_runs refuses updates only (auth.users cascade deletes it).
create or replace function public.macro_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'append_only: % rows cannot be %d', tg_table_name, lower(tg_op) using errcode = '23514';
end $$;
do $$ declare t text; begin
  foreach t in array array['macro_catalog_versions','macro_evidence_objects','macro_retrievals','macro_regime_results','macro_quarantine_members'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.macro_append_only()', t || '_append_only', t);
  end loop;
end $$;
drop trigger if exists macro_analysis_runs_append_only on public.macro_analysis_runs;
create trigger macro_analysis_runs_append_only before update on public.macro_analysis_runs
  for each row execute function public.macro_append_only();

-- ---------------------------------------------------------------- catalog write (§4.2, §0.2 M14)
-- Appends the catalog version (no-op when it exists with the same JSON; a different JSON under an
-- existing version is catalog_version_conflict) and upserts every definition into the mirror.
-- p_defs is the MacroSeriesDef[] array exactly as catalog.ts exports it (camelCase keys).
create or replace function public.macro_upsert_catalog(p_catalog_version text, p_rules_version text, p_defs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_existing jsonb; d jsonb; n int := 0;
begin
  if p_catalog_version is null or p_catalog_version !~ '^macro-catalog/[0-9a-f]{12}$' then
    raise exception 'invalid_catalog_version' using errcode = '22023';
  end if;
  if p_defs is null or jsonb_typeof(p_defs) <> 'array' or jsonb_array_length(p_defs) = 0 then
    raise exception 'invalid_catalog' using errcode = '22023';
  end if;
  insert into public.macro_catalog_versions(catalog_version, catalog, rules_version)
  values (p_catalog_version, p_defs, p_rules_version)
  on conflict (catalog_version) do nothing;
  select catalog into v_existing from public.macro_catalog_versions where catalog_version = p_catalog_version;
  if v_existing <> p_defs then
    raise exception 'catalog_version_conflict' using errcode = 'P0001';
  end if;
  for d in select value from jsonb_array_elements(p_defs) loop
    if jsonb_typeof(d) <> 'object' then raise exception 'invalid_catalog' using errcode = '22023'; end if;
    insert into public.macro_series(id, region, role, type, name, unit, native_frequency, period, adjustment, status, reason, source, derive,
                                    alias_of, revision_policy, weight, change_kind, release_lag_days, definition_version, catalog_version, updated_at)
    values (d->>'id', d->>'region', d->>'role', d->>'type', d->'name', d->>'unit', d->>'nativeFrequency', d->>'period', d->>'adjustment', d->>'status',
            nullif(d->'reason', 'null'::jsonb), nullif(d->'source', 'null'::jsonb), nullif(d->'derive', 'null'::jsonb),
            d->>'aliasOf', d->>'revisionPolicy', (d->>'weight')::numeric, d->>'changeKind', (d->>'releaseLagDays')::int, (d->>'definitionVersion')::int,
            p_catalog_version, date_trunc('milliseconds', now()))
    on conflict (id) do update set
      region = excluded.region, role = excluded.role, type = excluded.type, name = excluded.name, unit = excluded.unit,
      native_frequency = excluded.native_frequency, period = excluded.period, adjustment = excluded.adjustment, status = excluded.status,
      reason = excluded.reason, source = excluded.source, derive = excluded.derive, alias_of = excluded.alias_of,
      revision_policy = excluded.revision_policy, weight = excluded.weight, change_kind = excluded.change_kind,
      release_lag_days = excluded.release_lag_days, definition_version = excluded.definition_version,
      catalog_version = excluded.catalog_version, updated_at = excluded.updated_at;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.macro_upsert_catalog(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.macro_upsert_catalog(text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- owner fence (plan "ingest 租约、所有者令牌…"; 第 5 稿 P1-3)
-- Locks the batch's run row FOR UPDATE (so a takeover waits for in-flight mutations and every later one sees 'aborted')
-- and raises `fenced` unless: no run row and no token (FRED cron: its batch never has a run; single writer by Vercel
-- cron), or a run whose owner_token equals the token and whose state is in p_states. p_batch_id null = no fencing
-- context (tests and the batch-less Task 18 link only). Returns the run row (null without one).
create or replace function public.macro_assert_owner(p_batch_id uuid, p_owner_token uuid, p_states text[])
returns public.macro_ingest_runs language plpgsql security definer set search_path = public as $$
declare r public.macro_ingest_runs;
begin
  if p_batch_id is null then return null; end if;
  select * into r from public.macro_ingest_runs where batch_id = p_batch_id for update;
  if not found then
    if p_owner_token is not null then raise exception 'fenced' using errcode = 'P0001'; end if;
    return null;
  end if;
  if p_owner_token is null or r.owner_token <> p_owner_token or not (r.state = any(p_states)) then
    raise exception 'fenced' using errcode = 'P0001';
  end if;
  return r;
end $$;
revoke execute on function public.macro_assert_owner(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.macro_assert_owner(uuid, uuid, text[]) to service_role;

-- ---------------------------------------------------------------- evidence write (§0.2 N2)
-- Inserts the byte object if new (by sha256; an existing object must agree on path, adapter, type
-- and length, else evidence_mismatch) and ALWAYS a new retrieval row. fetched_at must already be
-- millisecond-precise (observations copy it into available_at and JS round-trips it). Owner-fenced (第 5 稿 P1-3).
create or replace function public.macro_put_retrieval(
  p_sha256 text, p_object_path text, p_adapter text, p_content_type text, p_byte_length bigint,
  p_fetch_url text, p_fetch_host text, p_http_status int, p_fetched_at timestamptz, p_batch_id uuid, p_tool_versions jsonb,
  p_owner_token uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.macro_evidence_objects; v_id uuid := gen_random_uuid(); v_bstatus text;
begin
  perform public.macro_assert_owner(p_batch_id, p_owner_token, array['open','finishing']);
  select status into v_bstatus from public.ingest_batches where batch_id = p_batch_id;
  if not found then raise exception 'invalid_batch' using errcode = '22023'; end if;
  if v_bstatus <> 'running' then raise exception 'batch_not_running' using errcode = 'P0001'; end if;
  if p_fetched_at is null or p_fetched_at <> date_trunc('milliseconds', p_fetched_at) then
    raise exception 'invalid_retrieval' using errcode = '22023';
  end if;
  insert into public.macro_evidence_objects(sha256, object_path, adapter, content_type, byte_length)
  values (p_sha256, p_object_path, p_adapter, p_content_type, p_byte_length)
  on conflict (sha256) do nothing;
  select * into o from public.macro_evidence_objects where sha256 = p_sha256;
  if (o.object_path, o.adapter, o.content_type, o.byte_length) is distinct from (p_object_path, p_adapter, p_content_type, p_byte_length) then
    raise exception 'evidence_mismatch' using errcode = 'P0001';
  end if;
  insert into public.macro_retrievals(retrieval_id, sha256, fetch_url, fetch_host, http_status, fetched_at, batch_id, tool_versions)
  values (v_id, p_sha256, p_fetch_url, p_fetch_host, p_http_status, p_fetched_at, p_batch_id, coalesce(p_tool_versions, '{}'::jsonb));
  return v_id;
end $$;
revoke execute on function public.macro_put_retrieval(text, text, text, text, bigint, text, text, int, timestamptz, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.macro_put_retrieval(text, text, text, text, bigint, text, text, int, timestamptz, uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------- publication eligibility (plan "发布资格"; spec §0.2 N3; 第 4 稿 P1-5)
-- The ids among p_ids that are NOT eligible: missing, not ok, batch not finished success/partial, or any
-- derived_from ancestor (recursively) failing the same test. p_include_batch additionally admits rows of
-- that one batch (writes and derivation inside an open batch); publication never passes it.
create or replace function public.macro_ineligible_ids(p_ids uuid[], p_include_batch uuid default null)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare v_deep boolean; v_bad uuid[];
begin
  with recursive walk(root, id, depth) as (
    select t.i, t.i, 0 from unnest(coalesce(p_ids, '{}'::uuid[])) as t(i)
    union all
    select w.root, d.i, w.depth + 1
    from walk w
    join public.macro_observations o on o.observation_id = w.id
    cross join lateral unnest(coalesce(o.derived_from, '{}'::uuid[])) as d(i)
    where w.depth < 8
  ), bad as (
    select distinct w.root
    from walk w
    left join public.macro_observations o on o.observation_id = w.id
    left join public.ingest_batches b on b.batch_id = o.batch_id
    where o.observation_id is null or o.status <> 'ok'
       or not (coalesce(b.status in ('success','partial'), false) or (p_include_batch is not null and o.batch_id = p_include_batch))
  )
  select exists (select 1 from walk w join public.macro_observations o on o.observation_id = w.id
                  where w.depth = 8 and cardinality(coalesce(o.derived_from, '{}'::uuid[])) > 0),
         coalesce((select array_agg(root) from bad), '{}'::uuid[])
    into v_deep, v_bad;
  -- depth 8 reached with ancestors remaining: the walk is incomplete, so no verdict is safe (R4)
  if v_deep then raise exception 'ancestry_too_deep' using errcode = 'P0001'; end if;
  return query select unnest(v_bad);
end $$;
revoke execute on function public.macro_ineligible_ids(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.macro_ineligible_ids(uuid[], uuid) to service_role;

-- A publishable id list for the region: no null element, every id an ok observation of a series of the
-- region, and every id eligible. (Distinctness is checked by the callers per array.)
create or replace function public.macro_manifest_ok(p_region text, p_ids uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select p_ids is not null and array_position(p_ids, null) is null
     and not exists (select 1 from unnest(p_ids) as t(i)
                      where not exists (select 1 from public.macro_observations o join public.macro_series ms on ms.id = o.series_id
                                         where o.observation_id = t.i and o.status = 'ok' and ms.region = p_region))
     and not exists (select 1 from public.macro_ineligible_ids(p_ids, null))
$$;
revoke execute on function public.macro_manifest_ok(text, uuid[]) from public, anon, authenticated;
grant execute on function public.macro_manifest_ok(text, uuid[]) to service_role;

-- ---------------------------------------------------------------- observation write (plan "写入规则"; spec §4.4, §0.2 M6/M8/M10/M16)
-- p_rows: ObservationWrite[] (src/lib/macro/types.ts). The whole call is one transaction: any
-- invalid row (shape, value_text not canonical, series unknown/not active/alias, native row on a
-- derived series or vice versa, available_at not equal to the retrieval's fetched_at / the max of
-- the inputs' available_at) raises and nothing is written. Per (series_id, period_end) group, in
-- input order:
--  1. two different values → conflicting_rows for each distinct value (first-appearance order),
--     quarantined += 1, nothing written;
--  2. native row whose retrieval is unknown → missing_evidence; derived row with an input that is
--     unknown, not ok, or neither eligible nor of p_batch → missing_input; nothing written, not counted;
--  3. a REJECTED row with the same value exists → previously_rejected (第 5 稿 P1-2): nothing inserted,
--     duplicates += 1, informational conflict carrying the rejected row's id — decided before any action,
--     so a newer redelivery of a rejected value can never become ok;
--  4. cur = highest-version ok row whose batch is eligible (success/partial) or p_batch — rows left by
--     an abandoned batch are invisible here (第 4 稿 P1-5): different value delivered with
--     available_at < cur.available_at → stale_delivery; no cur → inserted (version = max over all
--     statuses + 1); same value → duplicate; different and revisable → versioned (new ok version);
--     different and immutable → unexpected_revision. stale_delivery / unexpected_revision reuse a
--     same-value quarantined row only when its batch is eligible or p_batch (第 5 稿 P1-6), else insert
--     a new quarantined version, and count quarantined += 1. Their conflict carries that row's
--     observation_id (Task 6 links it to the dq_quarantine item); conflicting_rows / missing_* carry null.
-- Regions whose series received any row get input_revision + 1 at the end. Owner-fenced first (第 5 稿 P1-3).
create or replace function public.macro_write_observations(p_batch uuid, p_code_version text, p_rows jsonb, p_owner_token uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e jsonb; s public.macro_series; g record; cur public.macro_observations; v_has_cur boolean;
  v_region text; v_touched text[] := '{}'; v_native boolean; v_ret public.macro_retrievals;
  v_text text; v_new numeric; v_avail timestamptz; v_inputs uuid[]; v_input_ok int; v_input_n int; v_input_max timestamptz;
  v_max int; v_action text; v_status text; v_t text; v_obs uuid; v_bstatus text;
  n_ins int := 0; n_dup int := 0; n_ver int := 0; n_q int := 0; v_conf jsonb := '[]'::jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_code_version is null or length(p_code_version) not between 1 and 128 then raise exception 'invalid_code_version' using errcode = '22023'; end if;
  select status into v_bstatus from public.ingest_batches where batch_id = p_batch;
  if not found then raise exception 'invalid_batch' using errcode = '22023'; end if;
  perform public.macro_assert_owner(p_batch, p_owner_token, array['open','finishing']);   -- run row before region rows
  if v_bstatus <> 'running' then raise exception 'batch_not_running' using errcode = 'P0001'; end if;

  -- validate every row before any write
  for e in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'value_text') is distinct from 'string'
       or e->>'value_text' !~ '^-?(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$' or e->>'value_text' = '-0' then
      raise exception 'invalid_value_text' using errcode = '22023';
    end if;
    if jsonb_typeof(e->'series_id') is distinct from 'string' or jsonb_typeof(e->'period_end') is distinct from 'string'
       or jsonb_typeof(e->'available_at') is distinct from 'string' or jsonb_typeof(e->'revisable') is distinct from 'boolean' then
      raise exception 'invalid_row' using errcode = '22023';
    end if;
    perform (e->>'period_end')::date, (e->>'available_at')::timestamptz;
    select * into s from public.macro_series where id = e->>'series_id';
    if not found or s.status <> 'active' or s.alias_of is not null then
      raise exception 'invalid_series' using errcode = '22023';
    end if;
    if e ? 'retrieval_id' then
      if s.derive is not null or e ? 'derived_from' or e ? 'transform' or jsonb_typeof(e->'locator') is distinct from 'object'
         or e->'locator'->>'kind' is null or e->'locator'->>'kind' not in ('csv_row','json_pointer','html_cell') then
        raise exception 'invalid_row' using errcode = '22023';
      end if;
      perform (e->>'retrieval_id')::uuid;
    else
      if s.derive is null or e ? 'locator' or jsonb_typeof(e->'derived_from') is distinct from 'array' or jsonb_array_length(e->'derived_from') = 0
         or jsonb_typeof(e->'transform') is distinct from 'string' or e->>'transform' not like (s.derive->>'kind') || '@%' then
        raise exception 'invalid_row' using errcode = '22023';
      end if;
      perform x::uuid from jsonb_array_elements_text(e->'derived_from') as t(x);
    end if;
  end loop;

  -- lock the touched regions in a fixed order (deadlock-free with other writers and publishers)
  for v_region in
    select distinct ms.region from jsonb_array_elements(p_rows) as x(e) join public.macro_series ms on ms.id = x.e->>'series_id' order by 1
  loop
    perform 1 from public.macro_publish_state where region = v_region for update;
  end loop;

  for g in
    select x.e->>'series_id' as series_id, (x.e->>'period_end')::date as period_end, array_agg(x.e order by x.ord) as rows
    from jsonb_array_elements(p_rows) with ordinality as x(e, ord)
    group by 1, 2
    order by min(x.ord)
  loop
    select * into s from public.macro_series where id = g.series_id;
    -- a row's ancestors were eligible or of its own batch when it was written (step 2), so its own batch decides here
    select o.* into cur from public.macro_observations o
      where o.series_id = g.series_id and o.period_end = g.period_end and o.status = 'ok'
        and (o.batch_id = p_batch or exists (select 1 from public.ingest_batches b where b.batch_id = o.batch_id and b.status in ('success','partial')))
      order by o.version desc limit 1;
    v_has_cur := found;

    -- 1. conflicting values inside this call
    if (select count(distinct (r->>'value_text')::numeric) from unnest(g.rows) as u(r)) > 1 then
      for v_t in
        select z.txt from (
          select (array_agg(u.r->>'value_text' order by u.o))[1] as txt, min(u.o) as first_o
          from unnest(g.rows) with ordinality as u(r, o) group by (u.r->>'value_text')::numeric
        ) z order by z.first_o
      loop
        v_conf := v_conf || jsonb_build_array(jsonb_build_object('series_id', g.series_id, 'period_end', g.period_end::text,
          'reason', 'conflicting_rows', 'value_text', v_t, 'current_value_text', case when v_has_cur then cur.value_text end, 'observation_id', null));
      end loop;
      n_q := n_q + 1;
      continue;
    end if;

    e := g.rows[1];
    v_text := e->>'value_text'; v_new := v_text::numeric;
    v_native := e ? 'retrieval_id';

    -- 2. provenance must exist
    if v_native then
      select * into v_ret from public.macro_retrievals where retrieval_id = (e->>'retrieval_id')::uuid;
      if not found then
        v_conf := v_conf || jsonb_build_array(jsonb_build_object('series_id', g.series_id, 'period_end', g.period_end::text,
          'reason', 'missing_evidence', 'value_text', v_text, 'current_value_text', case when v_has_cur then cur.value_text end, 'observation_id', null));
        continue;
      end if;
      if (e->>'available_at')::timestamptz <> v_ret.fetched_at then raise exception 'invalid_available_at' using errcode = '22023'; end if;
      v_avail := v_ret.fetched_at; v_inputs := null;
    else
      select array_agg(distinct x::uuid) into v_inputs from jsonb_array_elements_text(e->'derived_from') as t(x);
      v_input_n := cardinality(v_inputs);
      select count(*), max(available_at) into v_input_ok, v_input_max
        from public.macro_observations where observation_id = any(v_inputs) and status = 'ok';
      if v_input_ok <> v_input_n or exists (select 1 from public.macro_ineligible_ids(v_inputs, p_batch)) then
        v_conf := v_conf || jsonb_build_array(jsonb_build_object('series_id', g.series_id, 'period_end', g.period_end::text,
          'reason', 'missing_input', 'value_text', v_text, 'current_value_text', case when v_has_cur then cur.value_text end, 'observation_id', null));
        continue;
      end if;
      if (e->>'available_at')::timestamptz <> v_input_max then raise exception 'invalid_available_at' using errcode = '22023'; end if;
      v_avail := v_input_max;
      select array_agg(x::uuid order by o) into v_inputs from jsonb_array_elements_text(e->'derived_from') with ordinality as t(x, o);   -- keep the caller's order
    end if;

    -- 3. rejected-value finality (第 5 稿 P1-2): checked before any action is chosen
    select observation_id into v_obs from public.macro_observations
     where series_id = g.series_id and period_end = g.period_end and status = 'rejected' and value = v_new
     order by version desc limit 1;
    if found then
      n_dup := n_dup + 1;
      v_conf := v_conf || jsonb_build_array(jsonb_build_object('series_id', g.series_id, 'period_end', g.period_end::text,
        'reason', 'previously_rejected', 'value_text', v_text, 'current_value_text', case when v_has_cur then cur.value_text end, 'observation_id', v_obs));
      continue;
    end if;

    -- 4. version identity
    if v_has_cur and cur.value <> v_new and v_avail < cur.available_at then v_action := 'stale_delivery';
    elsif not v_has_cur then v_action := 'inserted';
    elsif cur.value = v_new then v_action := 'duplicate';
    elsif (e->>'revisable')::boolean then v_action := 'versioned';
    else v_action := 'unexpected_revision';
    end if;

    if v_action = 'duplicate' then n_dup := n_dup + 1; continue; end if;
    v_obs := null;
    if v_action in ('inserted','versioned') then v_status := 'ok';
    else
      -- a same-value quarantined row is reused only when its batch is eligible or this call's (第 5 稿 P1-6); a row
      -- stranded in a failed / rejected / other running batch gets a fresh quarantined version backed by this delivery
      select o.observation_id into v_obs from public.macro_observations o
       where o.series_id = g.series_id and o.period_end = g.period_end and o.status = 'quarantined' and o.value = v_new
         and (o.batch_id = p_batch or exists (select 1 from public.ingest_batches b where b.batch_id = o.batch_id and b.status in ('success','partial')))
       order by o.version desc limit 1;
      v_status := case when v_obs is null then 'quarantined' end;
    end if;

    if v_status is not null then
      select coalesce(max(version), 0) into v_max from public.macro_observations where series_id = g.series_id and period_end = g.period_end;
      v_obs := gen_random_uuid();
      insert into public.macro_observations(observation_id, series_id, period_end, value, value_text, version, available_at, status,
                                            retrieval_id, locator, derived_from, transform, code_version, batch_id)
      values (v_obs, g.series_id, g.period_end, v_new, v_text, v_max + 1, v_avail, v_status,
              case when v_native then (e->>'retrieval_id')::uuid end, case when v_native then e->'locator' end,
              case when v_native then null else v_inputs end, case when v_native then null else e->>'transform' end,
              p_code_version, p_batch);
      if not (s.region = any(v_touched)) then v_touched := array_append(v_touched, s.region); end if;
    end if;

    if v_action = 'inserted' then n_ins := n_ins + 1;
    elsif v_action = 'versioned' then n_ver := n_ver + 1;
    else
      n_q := n_q + 1;
      v_conf := v_conf || jsonb_build_array(jsonb_build_object('series_id', g.series_id, 'period_end', g.period_end::text,
        'reason', v_action, 'value_text', v_text, 'current_value_text', cur.value_text, 'observation_id', v_obs));
    end if;
  end loop;

  update public.macro_publish_state set input_revision = input_revision + 1, updated_at = date_trunc('milliseconds', now())
   where region = any(v_touched);
  return jsonb_build_object('inserted', n_ins, 'duplicates', n_dup, 'versioned', n_ver, 'quarantined', n_q, 'conflicts', v_conf);
end $$;
revoke execute on function public.macro_write_observations(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.macro_write_observations(uuid, text, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------- snapshot cursor (A4)
-- The snapshot feed is consumed by (created_at, snapshot_id) markers, so cursor order must equal COMMIT order and be strictly
-- increasing. Every snapshot insert (publish, republish, failed) calls this LAST, holding a transaction-scoped advisory lock
-- until commit: a later committer always draws a later value. Millisecond-aligned (JS Date round-trips milliseconds; every row
-- is aligned), at least 1 ms after the newest stored row.
create or replace function public.macro_next_snapshot_cursor()
returns timestamptz language plpgsql set search_path = public as $$
declare v timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('macro_snapshot_cursor', 0));
  select greatest(date_trunc('milliseconds', clock_timestamp()), coalesce(max(created_at), '-infinity'::timestamptz) + interval '1 millisecond')
    into v from public.macro_snapshots;
  return v;
end $$;
revoke execute on function public.macro_next_snapshot_cursor() from public, anon, authenticated;
grant execute on function public.macro_next_snapshot_cursor() to service_role;

-- ---------------------------------------------------------------- publish (plan "发布规则"; spec §4.3, §0.2 M16; 第 4 稿 P1-5, P1-8)
-- p_observation_ids is the manifest, p_history_ids the frozen sparkline history; both must be publishable
-- (macro_manifest_ok: ok, region, eligible — checked here, in the transaction that inserts the snapshot).
-- 第 5 稿 P1-3/P1-4: the AKShare finish passes p_batch_id + p_owner_token (fenced first; cron passes neither); a
-- p_publish_key that already published returns that snapshot with replayed:true and writes nothing — checked under
-- the region lock and BEFORE the revision check, so a retry after a crash between publish and its checkpoint is safe.
create or replace function public.publish_macro_snapshot(
  p_region text, p_expected_revision bigint, p_expected_input_revision bigint, p_as_of date,
  p_methodology_version text, p_catalog_version text, p_observation_ids uuid[], p_history_ids uuid[], p_catalog_counts jsonb,
  p_regime jsonb, p_contributions jsonb, p_rules_version text, p_uncovered_weight numeric,
  p_publish_key text default null, p_batch_id uuid default null, p_owner_token uuid default null, p_finish_token uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st public.macro_publish_state; v_id uuid := gen_random_uuid(); v_regime jsonb := nullif(p_regime, 'null'::jsonb); prior public.macro_snapshots;
  r public.macro_ingest_runs; v_ts timestamptz;
begin
  r := public.macro_assert_owner(p_batch_id, p_owner_token, array['open','finishing']);
  -- A2: under the run lock a run-bound publication must also carry the run's CURRENT finish token (a rotated-out finisher is fenced)
  if p_owner_token is not null and (p_finish_token is null or r.finish_token is distinct from p_finish_token) then
    raise exception 'fenced' using errcode = 'P0001';
  end if;
  if p_publish_key is not null and length(p_publish_key) not between 1 and 128 then raise exception 'invalid_manifest' using errcode = 'P0001'; end if;
  select * into st from public.macro_publish_state where region = p_region for update;
  if not found then raise exception 'invalid_manifest' using errcode = 'P0001'; end if;
  if p_publish_key is not null then
    select * into prior from public.macro_snapshots where publish_key = p_publish_key;
    if found then
      if prior.region <> p_region then raise exception 'invalid_manifest' using errcode = 'P0001'; end if;   -- R3
      return jsonb_build_object('snapshot_id', prior.snapshot_id, 'revision', prior.revision, 'replayed', true);
    end if;
  end if;
  if st.revision <> p_expected_revision or st.input_revision <> p_expected_input_revision then
    raise exception 'stale_publisher' using errcode = 'P0001';
  end if;
  if p_as_of is null or p_methodology_version is null or length(p_methodology_version) not between 1 and 64
     or p_rules_version is null or length(p_rules_version) not between 1 and 64
     or not exists (select 1 from public.macro_catalog_versions where catalog_version = p_catalog_version) then
    raise exception 'invalid_manifest' using errcode = 'P0001';
  end if;
  if p_observation_ids is null or p_history_ids is null
     or cardinality(p_observation_ids) <> (select count(distinct i) from unnest(p_observation_ids) as t(i))
     or cardinality(p_history_ids) <> (select count(distinct i) from unnest(p_history_ids) as t(i))
     or not public.macro_manifest_ok(p_region, p_observation_ids) or not public.macro_manifest_ok(p_region, p_history_ids) then
    raise exception 'invalid_manifest' using errcode = 'P0001';
  end if;
  if p_catalog_counts is null or jsonb_typeof(p_catalog_counts) <> 'object'
     or not (p_catalog_counts ?& array['verified','missing','restricted'])
     or (select count(*) from jsonb_object_keys(p_catalog_counts)) <> 3
     or exists (select 1 from jsonb_each(p_catalog_counts) where jsonb_typeof(value) <> 'number'
                  or (value #>> '{}')::numeric < 0 or (value #>> '{}')::numeric <> trunc((value #>> '{}')::numeric)) then
    raise exception 'invalid_manifest' using errcode = 'P0001';
  end if;
  if (v_regime is not null and jsonb_typeof(v_regime) <> 'object') or p_contributions is null or jsonb_typeof(p_contributions) <> 'array'
     or p_uncovered_weight is null or p_uncovered_weight < 0 then
    raise exception 'invalid_manifest' using errcode = 'P0001';
  end if;
  update public.macro_snapshots set status = 'superseded' where region = p_region and status = 'active';
  v_ts := public.macro_next_snapshot_cursor();
  insert into public.macro_snapshots(snapshot_id, region, as_of, revision, methodology_version, catalog_version, observation_ids, history_ids, catalog_counts, status, publish_key, created_at)
  values (v_id, p_region, p_as_of, p_expected_revision + 1, p_methodology_version, p_catalog_version, p_observation_ids, p_history_ids, p_catalog_counts, 'active', p_publish_key, v_ts);
  insert into public.macro_regime_results(snapshot_id, region, regime, contributions, rules_version, uncovered_weight)
  values (v_id, p_region, v_regime, p_contributions, p_rules_version, p_uncovered_weight);
  update public.macro_publish_state set revision = revision + 1, updated_at = date_trunc('milliseconds', now()) where region = p_region;
  return jsonb_build_object('snapshot_id', v_id, 'revision', p_expected_revision + 1, 'replayed', false);
end $$;
revoke execute on function public.publish_macro_snapshot(text, bigint, bigint, date, text, text, uuid[], uuid[], jsonb, jsonb, jsonb, text, numeric, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_macro_snapshot(text, bigint, bigint, date, text, text, uuid[], uuid[], jsonb, jsonb, jsonb, text, numeric, text, uuid, uuid, uuid) to service_role;

-- Rollback (第 4 稿 P1-11): a NEW active snapshot (new id, next revision) copying a non-failed snapshot's as_of,
-- versions, manifest, history, counts and regime result, after re-validating eligibility. Snapshot rows stay
-- immutable (the lifecycle trigger still allows only active → superseded).
create or replace function public.republish_macro_snapshot(p_snapshot_id uuid, p_expected_revision bigint, p_expected_input_revision bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare src public.macro_snapshots; rr public.macro_regime_results; st public.macro_publish_state; v_id uuid := gen_random_uuid();
begin
  select * into src from public.macro_snapshots where snapshot_id = p_snapshot_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if src.status = 'failed' then raise exception 'invalid_manifest' using errcode = 'P0001'; end if;
  select * into st from public.macro_publish_state where region = src.region for update;
  if st.revision <> p_expected_revision or st.input_revision <> p_expected_input_revision then
    raise exception 'stale_publisher' using errcode = 'P0001';
  end if;
  select * into rr from public.macro_regime_results where snapshot_id = p_snapshot_id;
  if not found or not public.macro_manifest_ok(src.region, src.observation_ids) or not public.macro_manifest_ok(src.region, src.history_ids) then
    raise exception 'invalid_manifest' using errcode = 'P0001';
  end if;
  update public.macro_snapshots set status = 'superseded' where region = src.region and status = 'active';
  insert into public.macro_snapshots(snapshot_id, region, as_of, revision, methodology_version, catalog_version, observation_ids, history_ids, catalog_counts, status, created_at)
  values (v_id, src.region, src.as_of, p_expected_revision + 1, src.methodology_version, src.catalog_version, src.observation_ids, src.history_ids, src.catalog_counts, 'active', public.macro_next_snapshot_cursor());
  insert into public.macro_regime_results(snapshot_id, region, regime, contributions, rules_version, uncovered_weight)
  values (v_id, src.region, rr.regime, rr.contributions, rr.rules_version, rr.uncovered_weight);
  update public.macro_publish_state set revision = revision + 1, updated_at = date_trunc('milliseconds', now()) where region = src.region;
  return jsonb_build_object('snapshot_id', v_id, 'revision', p_expected_revision + 1, 'source_snapshot_id', p_snapshot_id);
end $$;
revoke execute on function public.republish_macro_snapshot(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.republish_macro_snapshot(uuid, bigint, bigint) to service_role;

-- A failed publication attempt: recorded with the current revision, never touches the active row.
create or replace function public.record_failed_macro_snapshot(p_region text, p_as_of date, p_methodology_version text, p_catalog_version text, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_rev bigint;
begin
  select revision into v_rev from public.macro_publish_state where region = p_region;
  if not found then raise exception 'invalid_region' using errcode = '22023'; end if;
  if p_reason is null or length(p_reason) not between 1 and 2000 then raise exception 'invalid_reason' using errcode = '22023'; end if;
  insert into public.macro_snapshots(snapshot_id, region, as_of, revision, methodology_version, catalog_version, observation_ids, catalog_counts, status, failure_reason, created_at)
  values (v_id, p_region, p_as_of, v_rev, p_methodology_version, p_catalog_version, '{}',
          '{"verified":0,"missing":0,"restricted":0}'::jsonb, 'failed', p_reason, public.macro_next_snapshot_cursor());
  return v_id;
end $$;
revoke execute on function public.record_failed_macro_snapshot(text, date, text, text, text) from public, anon, authenticated;
grant execute on function public.record_failed_macro_snapshot(text, date, text, text, text) to service_role;

-- ---------------------------------------------------------------- quarantine members + conflict resolution (plan "隔离裁决"; spec §0.2 M10; 第 4 稿 P1-4)
-- Binds stored quarantined/rejected rows of the item's natural key to an OPEN macro item (Task 6 calls it right
-- after quarantine() returned the possibly reused item id). Owner-fenced (p_batch_id + p_owner_token, 第 5 稿 P1-3), then
-- the dq_quarantine row is locked FOR UPDATE like macro_resolve_conflict does (第 5 稿 P2-3): a resolution that wins the
-- lock leaves the item closed. On a closed item the exact rows are inspected under that lock (第 6 稿 P2-3): when every given
-- row is a member of THIS item and is now ok or rejected (the item's recorded resolution disposed of it — a concurrent accept
-- or reject of a reused member), linking is already complete and 0 is returned; otherwise (a row still quarantined) this
-- call raises quarantine_closed (Task 6 re-parks into a new open item and retries once). Callers link one row per call.
-- Re-linking is a no-op; returns the rows added.
create or replace function public.macro_link_quarantine(p_quarantine_id uuid, p_observation_ids uuid[], p_batch_id uuid default null, p_owner_token uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; n int;
begin
  perform public.macro_assert_owner(p_batch_id, p_owner_token, array['open','finishing']);
  select * into q from public.dq_quarantine where id = p_quarantine_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if q.dataset not like 'macro.%' or q.table_name <> 'macro_observations' then raise exception 'invalid_item' using errcode = '22023'; end if;
  if q.status <> 'open' then
    if p_observation_ids is not null and cardinality(p_observation_ids) > 0 and array_position(p_observation_ids, null) is null
       and not exists (select 1 from unnest(p_observation_ids) as t(i)
                        where not exists (select 1 from public.macro_quarantine_members m
                                            join public.macro_observations o on o.observation_id = m.observation_id
                                           where m.quarantine_id = p_quarantine_id and m.observation_id = t.i
                                             and o.status in ('ok','rejected'))) then
      return 0;                                                                   -- disposed by this item's resolution: complete
    end if;
    raise exception 'quarantine_closed' using errcode = 'P0001';
  end if;
  if p_observation_ids is null or cardinality(p_observation_ids) = 0 or array_position(p_observation_ids, null) is not null
     or exists (select 1 from unnest(p_observation_ids) as t(i)
                 where not exists (select 1 from public.macro_observations o
                                    where o.observation_id = t.i and o.status in ('quarantined','rejected')
                                      and o.series_id || '|' || o.period_end::text = q.natural_key)) then
    raise exception 'invalid_member' using errcode = '22023';
  end if;
  insert into public.macro_quarantine_members(quarantine_id, observation_id)
  select p_quarantine_id, t.i from unnest(p_observation_ids) as t(i)
  on conflict (quarantine_id, observation_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.macro_link_quarantine(uuid, uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.macro_link_quarantine(uuid, uuid[], uuid, uuid) to service_role;

-- accept: needs p_observation_id, a member that is still quarantined and whose batch is not failed/rejected
-- (member_ineligible, 第 5 稿 P1-6: such a row could never publish) → ok; every other quarantined member of
-- the item → rejected; the region's input_revision + 1. adapter_mismatch / rule_failed:* items are reject-only
-- (their values were never written). reject: every quarantined member → rejected (no input_revision change:
-- quarantined rows never publish). Rejected rows are final (lifecycle trigger) and never eligible. Either
-- decision closes the dq_quarantine item and writes a research_audit_log row (action dq.quarantine_resolve,
-- object_type dq), in one transaction.
create or replace function public.macro_resolve_conflict(p_quarantine_id uuid, p_decision text, p_resolved_by uuid, p_observation_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_series text; v_region text; o public.macro_observations; v_status text; v_obs uuid; v_rejected int := 0;
begin
  if p_decision is null or p_decision not in ('accept','reject') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_quarantine_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if q.dataset not like 'macro.%' or q.table_name <> 'macro_observations' or q.natural_key !~ '^[A-Z][A-Z0-9_]{0,63}\|[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid_item' using errcode = '22023';
  end if;
  if q.status <> 'open' then raise exception 'already_resolved' using errcode = 'P0001'; end if;
  v_series := split_part(q.natural_key, '|', 1);
  select region into v_region from public.macro_series where id = v_series;
  if not found then raise exception 'invalid_item' using errcode = '22023'; end if;
  if p_decision = 'accept' then
    if q.reason_code = 'adapter_mismatch' or q.reason_code like 'rule_failed:%' then raise exception 'reject_only' using errcode = 'P0001'; end if;
    if p_observation_id is null then raise exception 'observation_required' using errcode = '22023'; end if;
    perform 1 from public.macro_publish_state where region = v_region for update;
    select ob.* into o from public.macro_observations ob
      join public.macro_quarantine_members m on m.observation_id = ob.observation_id
     where m.quarantine_id = p_quarantine_id and ob.observation_id = p_observation_id
     for update of ob;
    if not found then raise exception 'not_member' using errcode = 'P0002'; end if;
    if o.status <> 'quarantined' then raise exception 'not_quarantined' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.ingest_batches b where b.batch_id = o.batch_id and b.status in ('success','partial')) then
      raise exception 'member_ineligible' using errcode = 'P0001';
    end if;
    update public.macro_observations set status = 'ok' where observation_id = p_observation_id;
    update public.macro_observations ob set status = 'rejected'
      from public.macro_quarantine_members m
     where m.quarantine_id = p_quarantine_id and m.observation_id = ob.observation_id
       and ob.observation_id <> p_observation_id and ob.status = 'quarantined';
    get diagnostics v_rejected = row_count;
    update public.macro_publish_state set input_revision = input_revision + 1, updated_at = date_trunc('milliseconds', now()) where region = v_region;
    v_obs := p_observation_id; v_status := 'resolved_accept';
  else
    if p_observation_id is not null then raise exception 'observation_not_allowed' using errcode = '22023'; end if;
    update public.macro_observations ob set status = 'rejected'
      from public.macro_quarantine_members m
     where m.quarantine_id = p_quarantine_id and m.observation_id = ob.observation_id and ob.status = 'quarantined';
    get diagnostics v_rejected = row_count;
    v_status := 'resolved_reject';
  end if;
  update public.dq_quarantine set status = v_status, resolved_by = p_resolved_by, resolved_at = now() where id = p_quarantine_id;
  insert into public.research_audit_log(id, user_id, actor, action, object_type, object_id, detail)
  values (gen_random_uuid(), p_resolved_by, 'user', 'dq.quarantine_resolve', 'dq', p_quarantine_id,
          jsonb_build_object('id', p_quarantine_id, 'status', v_status, 'decision', p_decision, 'dataset', q.dataset,
                             'natural_key', q.natural_key, 'reason_code', q.reason_code, 'observation_id', v_obs, 'rejected', v_rejected));
  return jsonb_build_object('status', v_status, 'observation_id', v_obs, 'rejected', v_rejected);
end $$;
revoke execute on function public.macro_resolve_conflict(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.macro_resolve_conflict(uuid, text, uuid, uuid) to service_role;

-- ---------------------------------------------------------------- ingest lease, owner token, chunks, exclusive finish (plan "ingest 租约、所有者令牌、分块与独占可续完成"; spec §0.2 M9/M24; 第 4 稿 P1-6, P2-1, P2-4; 第 5 稿 P1-3, P1-4, P2-1)
-- Single-writer lease with a fresh owner token. Under the per-dataset advisory lock and in this one transaction: live
-- runs older than p_max_age, and (p_takeover only) live runs holding a chunk in 'processing' for longer than their own
-- processing_timeout, become 'aborted' (fencing their owner token for good); a remaining live run → busy (the caller
-- finishes its own batch rejected and answers 409); else the run is inserted open with a new owner_token. `aborted` lists
-- every aborted run of the dataset whose batch is still running (the caller finishes those batches failed, ignoring
-- batch_not_running), so a sweep interrupted half-way heals on the next start.
create or replace function public.macro_claim_ingest(p_batch_id uuid, p_dataset text, p_max_age interval, p_processing_timeout interval, p_takeover boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_aborted uuid[]; v_holder uuid; v_token uuid := gen_random_uuid();
begin
  if p_batch_id is null or p_dataset is null or p_dataset !~ '^macro\.[a-z0-9_]{1,32}$' or p_max_age is null or p_max_age <= interval '0'
     or p_processing_timeout is null or p_processing_timeout <= interval '0' or p_takeover is null then
    raise exception 'invalid_claim' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ingest_batches where batch_id = p_batch_id and dataset = p_dataset and status = 'running') then
    raise exception 'invalid_batch' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('macro_ingest:' || p_dataset, 0));
  update public.macro_ingest_runs r
     set state = 'aborted',
         finish_progress = r.finish_progress || jsonb_build_object('aborted', jsonb_build_object('by', p_batch_id,
                             'reason', case when r.created_at < now() - p_max_age then 'max_age' else 'stalled_chunk' end)),
         updated_at = date_trunc('milliseconds', now())
   where r.dataset = p_dataset and r.state in ('open','finishing')
     and (r.created_at < now() - p_max_age
          or (p_takeover and exists (select 1 from public.macro_ingest_chunks c
                                      where c.batch_id = r.batch_id and c.state = 'processing' and c.received_at < now() - r.processing_timeout)));
  select coalesce(array_agg(r.batch_id order by r.batch_id), '{}') into v_aborted
    from public.macro_ingest_runs r join public.ingest_batches b on b.batch_id = r.batch_id
   where r.dataset = p_dataset and r.state = 'aborted' and b.status = 'running';
  select batch_id into v_holder from public.macro_ingest_runs where dataset = p_dataset and state in ('open','finishing') limit 1;
  if v_holder is not null then
    return jsonb_build_object('status', 'busy', 'aborted', to_jsonb(v_aborted), 'holder', v_holder);
  end if;
  insert into public.macro_ingest_runs(batch_id, dataset, owner_token, processing_timeout) values (p_batch_id, p_dataset, v_token, p_processing_timeout);
  return jsonb_build_object('status', 'claimed', 'owner_token', v_token, 'aborted', to_jsonb(v_aborted));
end $$;
revoke execute on function public.macro_claim_ingest(uuid, text, interval, interval, boolean) from public, anon, authenticated;
grant execute on function public.macro_claim_ingest(uuid, text, interval, interval, boolean) to service_role;

-- Chunk claim: the owner token must match a non-aborted run (else fenced); a (batch, seq) that already exists is returned
-- as stored ({status: processing|done, chunk}) and is never processed again; otherwise it is inserted as processing
-- ({status:'claimed'}). The run row is locked, so claims, completions and macro_begin_finish serialize.
create or replace function public.macro_claim_chunk(p_batch_id uuid, p_seq int, p_total int, p_owner_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.macro_ingest_runs; c public.macro_ingest_chunks; v_total int; n int;
begin
  if p_batch_id is null or p_seq is null or p_total is null or p_seq < 0 or p_total < 1 or p_total > 10000 or p_seq >= p_total then
    raise exception 'invalid_chunk' using errcode = '22023';
  end if;
  select * into r from public.macro_ingest_runs where batch_id = p_batch_id for update;
  if not found then raise exception 'batch_not_claimed' using errcode = 'P0002'; end if;
  if p_owner_token is null or r.owner_token <> p_owner_token or r.state = 'aborted' then raise exception 'fenced' using errcode = 'P0001'; end if;
  select * into c from public.macro_ingest_chunks where batch_id = p_batch_id and seq = p_seq;
  if found then return jsonb_build_object('status', c.state, 'chunk', to_jsonb(c) - 'batch_id' - 'received_at' - 'completed_at'); end if;
  if r.state <> 'open' then raise exception 'batch_not_open' using errcode = 'P0001'; end if;
  select total into v_total from public.macro_ingest_chunks where batch_id = p_batch_id limit 1;
  if found and v_total <> p_total then raise exception 'chunk_total_mismatch' using errcode = 'P0001'; end if;
  insert into public.macro_ingest_chunks(batch_id, seq, total) values (p_batch_id, p_seq, p_total)
  on conflict (batch_id, seq) do nothing;
  get diagnostics n = row_count;
  if n = 1 then return jsonb_build_object('status', 'claimed'); end if;
  select * into c from public.macro_ingest_chunks where batch_id = p_batch_id and seq = p_seq;   -- backstop: a concurrent claim won
  return jsonb_build_object('status', c.state, 'chunk', to_jsonb(c) - 'batch_id' - 'received_at' - 'completed_at');
end $$;
revoke execute on function public.macro_claim_chunk(uuid, int, int, uuid) from public, anon, authenticated;
grant execute on function public.macro_claim_chunk(uuid, int, int, uuid) to service_role;

-- Completes a processing chunk exactly once (owner-fenced, run open) with its NATIVE counts, native_usable (第 6 稿 P2-1:
-- usable native rows, previously_rejected excluded; 0 ≤ native_usable ≤ inserted+versioned+duplicates), sanitized errors
-- ({code,key?,message?}, ≤ 500) and the claim / location key sets the finish step needs for the batch-wide
-- unlocated-claims summary (P2-1).
create or replace function public.macro_complete_chunk(p_batch_id uuid, p_seq int, p_counts jsonb, p_native_usable int, p_errors jsonb, p_claim_keys jsonb, p_located_keys jsonb, p_owner_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.macro_ingest_chunks;
begin
  if p_counts is null or jsonb_typeof(p_counts) <> 'object'
     or not (p_counts ?& array['fetched','inserted','duplicates','versioned','quarantined','failed'])
     or (select count(*) from jsonb_object_keys(p_counts)) <> 6
     or exists (select 1 from jsonb_each(p_counts) where jsonb_typeof(value) <> 'number'
                  or (value #>> '{}')::numeric < 0 or (value #>> '{}')::numeric <> trunc((value #>> '{}')::numeric))
     or p_native_usable is null or p_native_usable < 0
     or p_native_usable > (p_counts->>'inserted')::numeric + (p_counts->>'versioned')::numeric + (p_counts->>'duplicates')::numeric
     or p_errors is null or jsonb_typeof(p_errors) <> 'array' or jsonb_array_length(p_errors) > 500
     or exists (select 1 from jsonb_array_elements(p_errors) e where jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'code') is distinct from 'string')
     or p_claim_keys is null or jsonb_typeof(p_claim_keys) <> 'array' or exists (select 1 from jsonb_array_elements(p_claim_keys) k where jsonb_typeof(k) <> 'string')
     or p_located_keys is null or jsonb_typeof(p_located_keys) <> 'array' or exists (select 1 from jsonb_array_elements(p_located_keys) k where jsonb_typeof(k) <> 'string') then
    raise exception 'invalid_chunk' using errcode = '22023';
  end if;
  perform public.macro_assert_owner(p_batch_id, p_owner_token, array['open']);
  update public.macro_ingest_chunks
     set state = 'done', counts = p_counts, native_usable = p_native_usable, errors = p_errors, claim_keys = p_claim_keys, located_keys = p_located_keys,
         completed_at = date_trunc('milliseconds', now())
   where batch_id = p_batch_id and seq = p_seq and state = 'processing'
  returning * into c;
  if not found then raise exception 'chunk_not_processing' using errcode = 'P0001'; end if;
  return to_jsonb(c) - 'batch_id' - 'received_at' - 'completed_at';
end $$;
revoke execute on function public.macro_complete_chunk(uuid, int, jsonb, int, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.macro_complete_chunk(uuid, int, jsonb, int, jsonb, jsonb, jsonb, uuid) to service_role;

-- Exclusive finish (第 5 稿 P1-4). Only the token owner (another token or an aborted run → fenced). open → finishing once
-- every chunk 0..p_total−1 is done with that total (p_total 0 = a run with no chunks); a finishing run resumes. Both hand
-- out a NEW finish_token, so an older concurrent finisher of the same owner is fenced at its next step; finished returns
-- the stored progress so a retried finish replays its receipt.
create or replace function public.macro_begin_finish(p_batch_id uuid, p_total int, p_owner_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.macro_ingest_runs; v_missing int[]; v_ft uuid := gen_random_uuid();
begin
  if p_batch_id is null or p_total is null or p_total < 0 or p_total > 10000 then raise exception 'invalid_chunk' using errcode = '22023'; end if;
  select * into r from public.macro_ingest_runs where batch_id = p_batch_id for update;
  if not found then raise exception 'batch_not_claimed' using errcode = 'P0002'; end if;
  if p_owner_token is null or r.owner_token <> p_owner_token or r.state = 'aborted' then raise exception 'fenced' using errcode = 'P0001'; end if;
  if r.state = 'finished' then return jsonb_build_object('status', 'finished', 'progress', r.finish_progress); end if;
  if r.state = 'open' then
    select coalesce(array_agg(g.s order by g.s), '{}') into v_missing from generate_series(0, p_total - 1) as g(s)
     where not exists (select 1 from public.macro_ingest_chunks c where c.batch_id = p_batch_id and c.seq = g.s and c.state = 'done');
    if cardinality(v_missing) > 0 or exists (select 1 from public.macro_ingest_chunks where batch_id = p_batch_id and (total <> p_total or state <> 'done')) then
      return jsonb_build_object('status', 'incomplete', 'missing', to_jsonb(v_missing));
    end if;
  end if;
  update public.macro_ingest_runs set state = 'finishing', finish_token = v_ft, updated_at = date_trunc('milliseconds', now()) where batch_id = p_batch_id;
  return jsonb_build_object('status', 'finishing', 'progress', r.finish_progress, 'finish_token', v_ft);
end $$;
revoke execute on function public.macro_begin_finish(uuid, int, uuid) from public, anon, authenticated;
grant execute on function public.macro_begin_finish(uuid, int, uuid) to service_role;

-- Records one completed finish step (derived | batch_finished | published | publish_attempt | receipt; freshness_recorded
-- is written only by macro_record_freshness, 第 6 稿 P1-1). Owner token and the CURRENT finish token must match and the run
-- must not be aborted (else fenced) — checked BEFORE the state, so an obsolete token after completion is fenced too; the run
-- must be finishing (run_not_finishing). publish_attempt appends p_data to finish_progress.attempts (at most 20 kept); every other
-- step is merged under its name; 'receipt' also finishes the run (and so releases the dataset lease). Returns the progress.
create or replace function public.macro_record_finish_step(p_batch_id uuid, p_step text, p_data jsonb, p_owner_token uuid, p_finish_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.macro_ingest_runs; v jsonb; v_att jsonb;
begin
  if p_step is null or p_step not in ('derived','batch_finished','published','publish_attempt','receipt')
     or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_step' using errcode = '22023';
  end if;
  select * into r from public.macro_ingest_runs where batch_id = p_batch_id for update;
  if not found then raise exception 'batch_not_claimed' using errcode = 'P0002'; end if;
  if p_owner_token is null or r.owner_token <> p_owner_token or p_finish_token is null or r.finish_token is distinct from p_finish_token
     or r.state = 'aborted' then
    raise exception 'fenced' using errcode = 'P0001';
  end if;
  if r.state <> 'finishing' then raise exception 'run_not_finishing' using errcode = 'P0001'; end if;
  if p_step = 'publish_attempt' then
    v_att := case when jsonb_typeof(r.finish_progress->'attempts') = 'array' then r.finish_progress->'attempts' else '[]'::jsonb end;
    v := r.finish_progress || jsonb_build_object('attempts', case when jsonb_array_length(v_att) >= 20 then v_att else v_att || jsonb_build_array(p_data) end);
  else
    v := r.finish_progress || jsonb_build_object(p_step, p_data);
  end if;
  update public.macro_ingest_runs
     set finish_progress = v,
         state = case when p_step = 'receipt' then 'finished' else state end,
         updated_at = date_trunc('milliseconds', now())
   where batch_id = p_batch_id;
  return v;
end $$;
revoke execute on function public.macro_record_finish_step(uuid, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.macro_record_finish_step(uuid, text, jsonb, uuid, uuid) to service_role;

-- Fenced batch finalization (第 6 稿 P1-1/P2-4), used by the AKShare finish and the cron instead of dq finishBatch. With a run
-- row (AKShare): owner + finish token must match and the run must not be aborted (fenced, checked first), and it must be
-- finishing (run_not_finishing). Without a run row (cron): both tokens must be null (fenced otherwise). The batch row is then
-- locked: a batch no longer running returns its stored status with finalized:false (an earlier attempt finished it, never
-- twice); else status/counts/errors/finished_at are written with finishBatch's column semantics (finished_at ≥ started_at, the
-- DQ invariant). Status and the capped errors are computed in TS (ingest.ts::batchFinalizeInput) and passed in; a fatal abort
-- passes 'failed' explicitly.
create or replace function public.macro_finalize_batch(p_batch_id uuid, p_owner_token uuid, p_finish_token uuid, p_status text, p_counts jsonb, p_errors jsonb, p_finished_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.macro_ingest_runs; b public.ingest_batches; v_region text;
begin
  if p_batch_id is null or p_status is null or p_status not in ('success','partial','failed','rejected') or p_finished_at is null
     or p_counts is null or jsonb_typeof(p_counts) <> 'object'
     or not (p_counts ?& array['fetched','inserted','duplicates','versioned','quarantined','failed'])
     or (select count(*) from jsonb_object_keys(p_counts)) <> 6
     or exists (select 1 from jsonb_each(p_counts) where jsonb_typeof(value) <> 'number'
                  or (value #>> '{}')::numeric < 0 or (value #>> '{}')::numeric <> trunc((value #>> '{}')::numeric))
     or p_errors is null or jsonb_typeof(p_errors) <> 'array' or jsonb_array_length(p_errors) > 101
     or exists (select 1 from jsonb_array_elements(p_errors) e where jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'code') is distinct from 'string') then
    raise exception 'invalid_finalize' using errcode = '22023';
  end if;
  select * into r from public.macro_ingest_runs where batch_id = p_batch_id for update;
  if found then
    if p_owner_token is null or r.owner_token <> p_owner_token or p_finish_token is null or r.finish_token is distinct from p_finish_token
       or r.state = 'aborted' then
      raise exception 'fenced' using errcode = 'P0001';
    end if;
    if r.state <> 'finishing' then raise exception 'run_not_finishing' using errcode = 'P0001'; end if;
  elsif p_owner_token is not null or p_finish_token is not null then
    raise exception 'fenced' using errcode = 'P0001';
  end if;
  select * into b from public.ingest_batches where batch_id = p_batch_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if b.status <> 'running' then return jsonb_build_object('status', b.status, 'finalized', false); end if;
  update public.ingest_batches
     set status = p_status, counts = p_counts, errors = p_errors, finished_at = greatest(p_finished_at, b.started_at)
   where batch_id = p_batch_id;
  -- A3: finalization changes which rows are publication-eligible, so every region this batch wrote to gets input_revision + 1
  -- in the same transaction (region-name order, as macro_write_observations locks them)
  for v_region in
    select distinct ms.region from public.macro_observations o join public.macro_series ms on ms.id = o.series_id where o.batch_id = p_batch_id order by 1
  loop
    perform 1 from public.macro_publish_state where region = v_region for update;
    update public.macro_publish_state set input_revision = input_revision + 1, updated_at = date_trunc('milliseconds', now()) where region = v_region;
  end loop;
  return jsonb_build_object('status', p_status, 'finalized', true);
end $$;
revoke execute on function public.macro_finalize_batch(uuid, uuid, uuid, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.macro_finalize_batch(uuid, uuid, uuid, text, jsonb, jsonb, timestamptz) to service_role;

-- Fenced freshness attempt (第 6 稿 P1-1), used by the AKShare finish instead of dq recordAttempt. Under the run row lock: both
-- tokens are compared FIRST (mismatch or aborted → fenced), then finishing (run_not_finishing) and p_dataset = the run's
-- dataset (invalid_dataset). A run that already recorded freshness returns its progress unchanged (never a second attempt).
-- Otherwise, under the dq_freshness:<dataset> advisory lock, the same semantics as src/lib/dq/freshness.ts recordAttempt +
-- computeFreshness: consecutive_errors = ok ? 0 : previous + 1; last_ok_at = ok ? now : previous; status = error when
-- consecutive_errors ≥ 2, missing without last_ok_at, fresh for 'event', else fresh iff now − last_ok_at ≤ window + grace in
-- milliseconds (daily 1 d + 2 d, monthly 31 d + 3 d, quarterly 92 d + 3 d), stale otherwise. The upsert and the
-- freshness_recorded {ok, status} checkpoint commit together. Returns the progress.
create or replace function public.macro_record_freshness(p_batch_id uuid, p_owner_token uuid, p_finish_token uuid, p_dataset text, p_ok boolean, p_cadence text, p_now timestamptz, p_detail jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.macro_ingest_runs; f public.dq_freshness; v_errors int; v_last_ok timestamptz; v_status text; v_limit_ms numeric; v jsonb;
begin
  if p_batch_id is null or p_dataset is null or length(p_dataset) not between 1 and 64 or p_ok is null or p_now is null
     or p_cadence is null or p_cadence not in ('daily','monthly','quarterly','event')
     or p_detail is null or jsonb_typeof(p_detail) <> 'object' then
    raise exception 'invalid_freshness' using errcode = '22023';
  end if;
  select * into r from public.macro_ingest_runs where batch_id = p_batch_id for update;
  if not found then raise exception 'batch_not_claimed' using errcode = 'P0002'; end if;
  if p_owner_token is null or r.owner_token <> p_owner_token or p_finish_token is null or r.finish_token is distinct from p_finish_token
     or r.state = 'aborted' then
    raise exception 'fenced' using errcode = 'P0001';
  end if;
  if r.state <> 'finishing' then raise exception 'run_not_finishing' using errcode = 'P0001'; end if;
  if p_dataset <> r.dataset then raise exception 'invalid_dataset' using errcode = '22023'; end if;
  if r.finish_progress ? 'freshness_recorded' then return r.finish_progress; end if;
  perform pg_advisory_xact_lock(hashtextextended('dq_freshness:' || p_dataset, 0));
  select * into f from public.dq_freshness where dataset = p_dataset for update;
  v_errors := case when p_ok then 0 else coalesce(f.consecutive_errors, 0) + 1 end;
  v_last_ok := case when p_ok then p_now else f.last_ok_at end;
  v_limit_ms := case p_cadence when 'daily' then 3 when 'monthly' then 34 when 'quarterly' then 95 end * 86400000::numeric;
  v_status := case
    when v_errors >= 2 then 'error'
    when v_last_ok is null then 'missing'
    when p_cadence = 'event' then 'fresh'
    when extract(epoch from (p_now - v_last_ok)) * 1000 <= v_limit_ms then 'fresh'
    else 'stale' end;
  insert into public.dq_freshness(dataset, expected_cadence, last_ok_at, last_attempt_at, consecutive_errors, status, detail, updated_at)
  values (p_dataset, p_cadence, v_last_ok, p_now, v_errors, v_status, p_detail, p_now)
  on conflict (dataset) do update
     set expected_cadence = excluded.expected_cadence, last_ok_at = excluded.last_ok_at, last_attempt_at = excluded.last_attempt_at,
         consecutive_errors = excluded.consecutive_errors, status = excluded.status, detail = excluded.detail, updated_at = excluded.updated_at;
  v := r.finish_progress || jsonb_build_object('freshness_recorded', jsonb_build_object('ok', p_ok, 'status', v_status));
  update public.macro_ingest_runs set finish_progress = v, updated_at = date_trunc('milliseconds', now()) where batch_id = p_batch_id;
  return v;
end $$;
revoke execute on function public.macro_record_freshness(uuid, uuid, uuid, text, boolean, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.macro_record_freshness(uuid, uuid, uuid, text, boolean, text, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------- analysis run + quota (plan "分析运行配额"; spec §2, §0.2 M22, N1)
-- The caller (route) passes the verified session user. Per-user advisory lock first, then: an
-- existing (user, request) row is returned as is (never counted twice); an ok run is admitted when
-- the user's ok runs in the last 24 h are below the plan limit (admin: unlimited; effective pro:
-- 100; otherwise 10 — effective pro = plan 'pro' and plan_expires_at null or in the future, as
-- src/lib/billing/plan.ts::effectivePlan); failed runs are recorded without a quota check and never
-- counted.
create or replace function public.create_macro_analysis_run(
  p_user_id uuid, p_request_id uuid, p_kind text, p_spec jsonb, p_inputs jsonb, p_inputs_hash text,
  p_results jsonb, p_code_version text, p_method_version text, p_status text, p_error text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_plan text; v_role text; v_expires timestamptz; v_limit int; v_used int;
begin
  if p_user_id is null or p_request_id is null then raise exception 'invalid_run' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('macro_analysis:' || p_user_id::text, 0));
  select run_id into v_id from public.macro_analysis_runs where user_id = p_user_id and request_id = p_request_id;
  if found then return v_id; end if;
  if p_status = 'ok' then
    select plan, role, plan_expires_at into v_plan, v_role, v_expires from public.profiles where id = p_user_id;
    if coalesce(v_role, 'user') <> 'admin' then
      v_limit := case when v_plan = 'pro' and (v_expires is null or v_expires > now()) then 100 else 10 end;
      select count(*) into v_used from public.macro_analysis_runs
       where user_id = p_user_id and status = 'ok' and created_at > now() - interval '24 hours';
      if v_used >= v_limit then raise exception 'quota_exceeded' using errcode = 'P0001'; end if;
    end if;
  end if;
  v_id := gen_random_uuid();
  insert into public.macro_analysis_runs(run_id, user_id, request_id, kind, spec, inputs, inputs_hash, results, code_version, method_version, status, error)
  values (v_id, p_user_id, p_request_id, p_kind, p_spec, p_inputs, p_inputs_hash, nullif(p_results, 'null'::jsonb), p_code_version, p_method_version, p_status, p_error);
  return v_id;
end $$;
revoke execute on function public.create_macro_analysis_run(uuid, uuid, text, jsonb, jsonb, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_macro_analysis_run(uuid, uuid, text, jsonb, jsonb, text, jsonb, text, text, text, text) to service_role;

-- ---------------------------------------------------------------- read helpers (security invoker: RLS applies)
-- Latest period per series, highest ok version within it; p_as_of keeps rows available by then;
-- p_period_end_lte caps the period.
create or replace function public.macro_latest_observations(p_series_ids text[], p_as_of timestamptz default null, p_period_end_lte date default null)
returns setof public.macro_observations language sql stable security invoker set search_path = public as $$
  select distinct on (o.series_id) o.*
  from public.macro_observations o
  where o.series_id = any(p_series_ids) and o.status = 'ok'
    and (p_as_of is null or o.available_at <= p_as_of)
    and (p_period_end_lte is null or o.period_end <= p_period_end_lte)
  order by o.series_id, o.period_end desc, o.version desc
$$;
revoke execute on function public.macro_latest_observations(text[], timestamptz, date) from public;
grant execute on function public.macro_latest_observations(text[], timestamptz, date) to anon, authenticated, service_role;

-- Active + superseded snapshots after a (created_at, snapshot_id) marker, ascending; limit 1..1000.
create or replace function public.macro_snapshots_since(p_created_at timestamptz, p_snapshot_id uuid, p_limit int)
returns setof public.macro_snapshots language sql stable security invoker set search_path = public as $$
  select s.* from public.macro_snapshots s
  where s.status in ('active','superseded')
    and (p_created_at is null or (s.created_at, s.snapshot_id) > (p_created_at, p_snapshot_id))
  order by s.created_at, s.snapshot_id
  limit least(greatest(coalesce(p_limit, 100), 1), 1000)
$$;
revoke execute on function public.macro_snapshots_since(timestamptz, uuid, int) from public;
grant execute on function public.macro_snapshots_since(timestamptz, uuid, int) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- eligible reads for the publish path (security definer, service only; 第 4 稿 P1-5)
-- Latest period per series, highest ELIGIBLE version within it (p_include_batch also admits that batch's rows).
create or replace function public.macro_latest_eligible_observations(p_series_ids text[], p_as_of timestamptz default null, p_period_end_lte date default null, p_include_batch uuid default null)
returns setof public.macro_observations language sql stable security definer set search_path = public as $$
  with cand as (
    select o.* from public.macro_observations o
    where o.series_id = any(p_series_ids) and o.status = 'ok'
      and (p_as_of is null or o.available_at <= p_as_of)
      and (p_period_end_lte is null or o.period_end <= p_period_end_lte)
  ), bad as (
    select x.id from public.macro_ineligible_ids((select array_agg(observation_id) from cand), p_include_batch) as x(id)
  )
  select distinct on (c.series_id) c.* from cand c
  where not exists (select 1 from bad where bad.id = c.observation_id)
  order by c.series_id, c.period_end desc, c.version desc
$$;
revoke execute on function public.macro_latest_eligible_observations(text[], timestamptz, date, uuid) from public, anon, authenticated;
grant execute on function public.macro_latest_eligible_observations(text[], timestamptz, date, uuid) to service_role;

-- Highest eligible version per period of one series, ascending, at most p_limit (1..1000) periods after p_after
-- (keyset paging by period_end; MacroDb.eligibleHistory pages to completion).
create or replace function public.macro_eligible_history(p_series_id text, p_from date, p_to date, p_as_of timestamptz, p_include_batch uuid, p_after date, p_limit int)
returns setof public.macro_observations language sql stable security definer set search_path = public as $$
  with cand as (
    select o.* from public.macro_observations o
    where o.series_id = p_series_id and o.status = 'ok'
      and (p_from is null or o.period_end >= p_from) and (p_to is null or o.period_end <= p_to)
      and (p_after is null or o.period_end > p_after)
      and (p_as_of is null or o.available_at <= p_as_of)
  ), bad as (
    select x.id from public.macro_ineligible_ids((select array_agg(observation_id) from cand), p_include_batch) as x(id)
  ), best as (
    select distinct on (c.period_end) c.* from cand c
    where not exists (select 1 from bad where bad.id = c.observation_id)
    order by c.period_end, c.version desc
  )
  select * from best order by period_end limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
$$;
revoke execute on function public.macro_eligible_history(text, date, date, timestamptz, uuid, date, int) from public, anon, authenticated;
grant execute on function public.macro_eligible_history(text, date, date, timestamptz, uuid, date, int) to service_role;

-- ---------------------------------------------------------------- table privileges and policies
do $$ declare t text; begin
  foreach t in array array['macro_series','macro_catalog_versions','macro_evidence_objects','macro_retrievals','macro_observations',
                           'macro_snapshots','macro_regime_results','macro_publish_state','macro_ingest_chunks','macro_ingest_runs',
                           'macro_quarantine_members','macro_analysis_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['macro_series','macro_catalog_versions','macro_evidence_objects','macro_retrievals','macro_snapshots'] loop
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select using (true)', t, t);
  end loop;
  -- macro_regime_results is service-only (第 6 稿 P1-2): judgments never leave the server through the public anon key.
  foreach t in array array['macro_publish_state','macro_ingest_chunks','macro_ingest_runs','macro_quarantine_members','macro_regime_results'] loop
    execute format('grant select on public.%I to service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
end $$;
-- A1: public reads see ok rows of FINISHED (success/partial) batches only; rows of running, failed or rejected batches stay
-- service-only. security definer so the policy can read ingest_batches (not granted to anon/authenticated).
create or replace function public.macro_batch_eligible(p_batch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ingest_batches b where b.batch_id = p_batch_id and b.status in ('success','partial'))
$$;
revoke execute on function public.macro_batch_eligible(uuid) from public, anon, authenticated;
grant execute on function public.macro_batch_eligible(uuid) to anon, authenticated, service_role;
grant select on public.macro_observations to anon, authenticated, service_role;
drop policy if exists "macro_observations public read" on public.macro_observations;
create policy "macro_observations public read" on public.macro_observations for select to anon, authenticated
  using (status = 'ok' and public.macro_batch_eligible(batch_id));
drop policy if exists "macro_observations service read" on public.macro_observations;
create policy "macro_observations service read" on public.macro_observations for select to service_role using (true);
grant select on public.macro_analysis_runs to authenticated, service_role;
drop policy if exists "macro_analysis_runs own read" on public.macro_analysis_runs;
create policy "macro_analysis_runs own read" on public.macro_analysis_runs for select to authenticated using (user_id = auth.uid());
drop policy if exists "macro_analysis_runs service read" on public.macro_analysis_runs;
create policy "macro_analysis_runs service read" on public.macro_analysis_runs for select to service_role using (true);
