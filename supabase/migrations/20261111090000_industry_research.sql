-- supabase/migrations/20261111090000_industry_research.sql
-- I-0 (industry research spec 6th draft §4.3, §4.8): tables, constraints, indexes, RLS policies,
-- table privileges, the industry-manifests bucket, the four dataset licence rows and the weekly
-- freshness cadence. Functions, triggers and function privileges are in
-- 20261111091000_industry_research_functions.sql — except the three read-only licence helpers
-- (industry_dataset_is_public, industry_metric_run_visible, industry_valuation_run_visible), which
-- live here because the policies below call them.
-- Ownership model (V1): the migration role owns every table and every security definer function;
-- functions run as the table owner (no table uses FORCE ROW LEVEL SECURITY), so they read and write
-- across modules. service_role has NO insert/update/delete/truncate on the protected tables: every
-- write goes through a function (V2). Semi-protected: industry_classifications (service_role
-- insert/update, no delete/truncate), industry_dataset_licenses (select only; written by
-- set_industry_dataset_license), industry_sync_scope (service_role read/write, not a fact table).
-- Public read (anon, authenticated; owner decision F: same rights) is gated per dataset by
-- industry_dataset_licenses through the helper functions; service_role has using(true) policies.
-- issuer_industry_memberships is altered in place: the landed all-status exclusion
-- issuer_industry_memberships_no_overlap is dropped explicitly (superseded history must coexist with
-- its replacement), the primary key moves to membership_id, the old five-column key becomes a
-- partial unique index over status='ok', and a per-level exclusion over status='ok' replaces it.
-- The upgrade requires an empty issuer_industry_memberships (no loader wrote it before this
-- migration); a non-empty table stops the migration with industry_upgrade_requires_empty_memberships.
-- Hosted postgres is not a superuser: no create role, no alter … owner. Local harness: only
-- storage.buckets exists (no storage.objects reference). Replayable: guarded creates, drop-then-add
-- constraints, drop-then-create policies, insert … on conflict.

-- ---------------------------------------------------------------- lock order
-- Every existing industry table is locked up front, in the order the functions of 20261111091000 touch
-- them (licences → nodes → source records → memberships → observations → runs → rows → manifests →
-- dependencies). A replay (tests replay migrations while other sessions run the functions) then only
-- ever waits while holding earlier tables, so it queues behind an in-flight function instead of
-- deadlocking with it. On the first apply only the two landed tables exist.
do $$ declare t text; begin
  foreach t in array array['industry_dataset_licenses','industry_classifications','industry_source_memberships','issuer_industry_memberships',
                           'industry_sync_scope','industry_fetch_events','industry_observation_receipts','security_marks','industry_official_valuations',
                           'industry_metric_runs','industry_metrics','industry_valuation_runs','industry_valuations','industry_valuation_pairs',
                           'industry_manifests','industry_run_dependencies'] loop
    if to_regclass('public.' || t) is not null then
      execute format('lock table public.%I in access exclusive mode', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- upgrade guard
do $$ begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.issuer_industry_memberships'::regclass and attname = 'membership_id' and not attisdropped)
     and exists (select 1 from public.issuer_industry_memberships) then
    raise exception 'industry_upgrade_requires_empty_memberships' using errcode = '55000';
  end if;
end $$;

-- ---------------------------------------------------------------- dq_freshness: weekly cadence (identical to plan 3)
alter table public.dq_freshness
  drop constraint if exists dq_freshness_expected_cadence_check,
  add constraint dq_freshness_expected_cadence_check check (expected_cadence in ('daily','weekly','monthly','quarterly','event'));

-- ---------------------------------------------------------------- industry_classifications (altered)
alter table public.industry_classifications
  drop constraint if exists industry_classifications_scheme_check,
  add constraint industry_classifications_scheme_check check (scheme in ('sw2021','sw2014','gics','csrc','custom','sic'));
alter table public.industry_classifications add column if not exists attributes jsonb not null default '{}';
alter table public.industry_classifications
  drop constraint if exists industry_classifications_attributes_object,
  add constraint industry_classifications_attributes_object check (jsonb_typeof(attributes) = 'object');
create unique index if not exists industry_classifications_code_level_uidx on public.industry_classifications(scheme, version, code, level);

-- ---------------------------------------------------------------- industry_dataset_licenses
create table if not exists public.industry_dataset_licenses (
  dataset_key text primary key check (length(dataset_key) between 1 and 64),
  status      text not null check (status in ('internal','public')),
  decided_by  text not null check (length(decided_by) between 1 and 128),
  decided_at  timestamptz not null default now(),
  note        text
);
-- §4.1 defaults (owner decision A pending). on conflict do nothing: a replay never overrides an admin decision.
insert into public.industry_dataset_licenses (dataset_key, status, decided_by, note) values
  ('scheme:sw2021:2021', 'internal', 'migration:20261111090000', 'owner decision A pending'),
  ('scheme:sic:sec-current', 'public', 'migration:20261111090000', 'SEC submissions are public primary data'),
  ('marks:tushare-daily_basic', 'internal', 'migration:20261111090000', 'owner decision A pending'),
  ('official:tushare-sw_daily', 'internal', 'migration:20261111090000', 'owner decision A pending')
on conflict (dataset_key) do nothing;

-- ---------------------------------------------------------------- industry_source_memberships (§4.4)
create table if not exists public.industry_source_memberships (
  id               uuid primary key,
  scheme           text not null check (scheme = 'sw2021'),
  version          text not null check (version = '2021'),
  source           text not null check (length(source) between 1 and 64),
  ts_code          text not null check (length(ts_code) between 1 and 16),
  name             text,
  l1_code          text not null check (length(l1_code) between 1 and 32),
  l2_code          text not null check (length(l2_code) between 1 and 32),
  l3_code          text not null check (length(l3_code) between 1 and 32),
  in_date          date not null,
  out_date         date,
  observed_at      timestamptz not null,
  batch_id         uuid not null references public.ingest_batches(batch_id) on delete restrict,
  raw_hash         text not null check (length(raw_hash) between 1 and 128),
  locator          jsonb not null,
  status           text not null check (status in ('current','superseded')),
  superseded_by    uuid,
  issuer_id        uuid references public.issuers(issuer_id) on delete restrict,
  resolution       jsonb not null default '{}',
  resolution_error jsonb,
  created_at       timestamptz not null default now(),
  constraint industry_source_memberships_locator_object check (jsonb_typeof(locator) = 'object'),
  constraint industry_source_memberships_resolution_object check (jsonb_typeof(resolution) = 'object'),
  constraint industry_source_memberships_error_object check (resolution_error is null or jsonb_typeof(resolution_error) = 'object'),
  constraint industry_source_memberships_superseded_pair check ((status = 'superseded') = (superseded_by is not null))
);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.industry_source_memberships'::regclass and conname = 'industry_source_memberships_superseded_by_fkey') then
    alter table public.industry_source_memberships add constraint industry_source_memberships_superseded_by_fkey
      foreign key (superseded_by) references public.industry_source_memberships(id) deferrable initially deferred;
  end if;
end $$;
create unique index if not exists industry_source_memberships_current_key on public.industry_source_memberships(scheme, version, source, ts_code, l3_code, in_date) where status = 'current';
create index if not exists industry_source_memberships_l1_idx on public.industry_source_memberships(scheme, version, l1_code, status);
create index if not exists industry_source_memberships_issuer_idx on public.industry_source_memberships(issuer_id);
create index if not exists industry_source_memberships_unresolved_idx on public.industry_source_memberships(l1_code, in_date) where status = 'current' and issuer_id is null;

-- ---------------------------------------------------------------- issuer_industry_memberships (altered, §4.3)
alter table public.issuer_industry_memberships drop constraint if exists issuer_industry_memberships_no_overlap;
alter table public.issuer_industry_memberships add column if not exists membership_id uuid not null default gen_random_uuid();
alter table public.issuer_industry_memberships add column if not exists level int not null check (level between 1 and 4);
alter table public.issuer_industry_memberships add column if not exists available_date date not null;
alter table public.issuer_industry_memberships add column if not exists valid_to_available_date date;
alter table public.issuer_industry_memberships add column if not exists source_membership_id uuid references public.industry_source_memberships(id) on delete restrict;
alter table public.issuer_industry_memberships add column if not exists batch_id uuid not null references public.ingest_batches(batch_id) on delete restrict;
alter table public.issuer_industry_memberships add column if not exists status text not null default 'ok' check (status in ('ok','quarantined','superseded'));
alter table public.issuer_industry_memberships add column if not exists superseded_by uuid;
alter table public.issuer_industry_memberships
  drop constraint if exists issuer_industry_memberships_to_available_pair,
  add constraint issuer_industry_memberships_to_available_pair check ((valid_to is null) = (valid_to_available_date is null)),
  drop constraint if exists issuer_industry_memberships_to_available_after,
  add constraint issuer_industry_memberships_to_available_after check (valid_to_available_date is null or valid_to_available_date >= valid_from),
  drop constraint if exists issuer_industry_memberships_superseded_pair,
  add constraint issuer_industry_memberships_superseded_pair check ((status = 'superseded') = (superseded_by is not null));
-- Primary key: (issuer_id, scheme, version, code, valid_from) → (membership_id). The old key survives as a
-- partial unique index over ok rows, so a superseded version and its replacement share the key.
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.issuer_industry_memberships'::regclass and contype = 'p' and cardinality(conkey) <> 1) then
    alter table public.issuer_industry_memberships drop constraint issuer_industry_memberships_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_industry_memberships'::regclass and contype = 'p') then
    alter table public.issuer_industry_memberships add constraint issuer_industry_memberships_pkey primary key (membership_id);
  end if;
  -- superseded_by → the replacement row; deferred so status+successor are written in one update before the replacement exists (§4.5)
  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_industry_memberships'::regclass and conname = 'issuer_industry_memberships_superseded_by_fkey') then
    alter table public.issuer_industry_memberships add constraint issuer_industry_memberships_superseded_by_fkey
      foreign key (superseded_by) references public.issuer_industry_memberships(membership_id) deferrable initially deferred;
  end if;
  -- level must be the node's level (the landed (scheme, version, code) FK is kept)
  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_industry_memberships'::regclass and conname = 'issuer_industry_memberships_classification_level_fkey') then
    alter table public.issuer_industry_memberships add constraint issuer_industry_memberships_classification_level_fkey
      foreign key (scheme, version, code, level) references public.industry_classifications(scheme, version, code, level);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_industry_memberships'::regclass and conname = 'issuer_industry_memberships_one_per_level') then
    alter table public.issuer_industry_memberships add constraint issuer_industry_memberships_one_per_level
      exclude using gist (issuer_id with =, scheme with =, version with =, level with =, daterange(valid_from, valid_to, '[)') with &&) where (status = 'ok');
  end if;
end $$;
create unique index if not exists issuer_industry_memberships_ok_key on public.issuer_industry_memberships(issuer_id, scheme, version, code, valid_from) where status = 'ok';
create index if not exists issuer_industry_memberships_code_window_idx on public.issuer_industry_memberships using gist (scheme, version, code, daterange(valid_from, valid_to, '[)')) where status = 'ok';
create index if not exists issuer_industry_memberships_source_idx on public.issuer_industry_memberships(source_membership_id) where source_membership_id is not null;
create index if not exists issuer_industry_memberships_issuer_idx on public.issuer_industry_memberships(issuer_id, scheme, version);

-- ---------------------------------------------------------------- fetch events and receipts (§6.1, U3, V7)
create table if not exists public.industry_fetch_events (
  fetch_event_id uuid primary key,
  job            text not null check (length(job) between 1 and 64),
  params         jsonb not null check (jsonb_typeof(params) = 'object'),
  started_at     timestamptz not null default now(),
  batch_id       uuid not null references public.ingest_batches(batch_id) on delete restrict,
  attempt        int not null default 1 check (attempt >= 1)
);
create index if not exists industry_fetch_events_batch_idx on public.industry_fetch_events(batch_id);

create table if not exists public.industry_observation_receipts (
  fetch_event_id uuid not null references public.industry_fetch_events(fetch_event_id) on delete restrict,
  kind           text not null check (kind in ('marks','official')),
  natural_key    text not null check (length(natural_key) between 1 and 256),
  payload_hash   text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  outcome        text not null check (outcome in ('inserted','duplicate','superseded_previous')),
  observation_id uuid,
  created_at     timestamptz not null default now(),
  primary key (fetch_event_id, kind, natural_key)
);

-- ---------------------------------------------------------------- security_marks (§6.1, observation-versioned)
-- *_text columns carry the exact decimal for JSON clients (PostgREST sends numeric as a JSON number).
create table if not exists public.security_marks (
  observation_id   uuid primary key default gen_random_uuid(),
  ticker           text not null references public.stocks_universe(ticker) on delete restrict,
  trade_date       date not null,
  fetch_event_id   uuid not null references public.industry_fetch_events(fetch_event_id) on delete restrict,
  observed_at      timestamptz not null,
  close            numeric not null check (close > 0),
  total_share      numeric not null check (total_share > 0),
  market_cap       numeric generated always as (close * total_share) stored,
  close_text       text generated always as (close::text) stored,
  total_share_text text generated always as (total_share::text) stored,
  market_cap_text  text generated always as ((close * total_share)::text) stored,
  free_share       numeric check (free_share is null or free_share > 0),   -- Tushare free_share 万股 × 10000 (spec 7th draft K1; nullable)
  free_share_text  text generated always as (free_share::text) stored,
  source           text not null check (length(source) between 1 and 64),
  upstream         text not null check (upstream in ('sse','szse','bse')),
  raw_hash         text not null check (length(raw_hash) between 1 and 128),
  locator          jsonb not null check (jsonb_typeof(locator) = 'object'),
  batch_id         uuid not null references public.ingest_batches(batch_id) on delete restrict,
  status           text not null default 'ok' check (status in ('ok','quarantined','superseded')),
  supersedes       uuid references public.security_marks(observation_id),
  created_at       timestamptz not null default now(),
  constraint security_marks_event_key unique (ticker, trade_date, fetch_event_id)
);
alter table public.security_marks add column if not exists free_share numeric check (free_share is null or free_share > 0);
alter table public.security_marks add column if not exists free_share_text text generated always as (free_share::text) stored;
create unique index if not exists security_marks_current_uidx on public.security_marks(ticker, trade_date) where status = 'ok';
create index if not exists security_marks_date_idx on public.security_marks(trade_date, status);

-- ---------------------------------------------------------------- industry_official_valuations (§6.2)
create table if not exists public.industry_official_valuations (
  observation_id uuid primary key default gen_random_uuid(),
  scheme         text not null check (scheme = 'sw2021'),
  version        text not null check (length(version) between 1 and 32),
  code           text not null check (length(code) between 1 and 32),
  trade_date     date not null,
  metric         text not null check (metric in ('pe','pb','total_mv','float_mv','close')),
  fetch_event_id uuid not null references public.industry_fetch_events(fetch_event_id) on delete restrict,
  value          numeric not null,
  value_text     text generated always as (value::text) stored,
  observed_at    timestamptz not null,
  source         text not null check (length(source) between 1 and 64),
  upstream       text not null check (length(upstream) between 1 and 64),
  raw_hash       text not null check (length(raw_hash) between 1 and 128),
  locator        jsonb not null default '{}' check (jsonb_typeof(locator) = 'object'),
  batch_id       uuid not null references public.ingest_batches(batch_id) on delete restrict,
  status         text not null default 'ok' check (status in ('ok','superseded')),
  supersedes     uuid references public.industry_official_valuations(observation_id),
  created_at     timestamptz not null default now(),
  constraint industry_official_valuations_event_key unique (scheme, version, code, trade_date, metric, fetch_event_id)
);
create unique index if not exists industry_official_current_uidx on public.industry_official_valuations(scheme, version, code, trade_date, metric) where status = 'ok';

-- ---------------------------------------------------------------- industry_manifests (§5.3 content-addressed index)
create table if not exists public.industry_manifests (
  manifest_hash text primary key check (manifest_hash ~ '^[0-9a-f]{64}$'),
  kind          text not null check (kind in ('aggregate','valuation')),
  byte_length   int not null check (byte_length > 0),
  created_at    timestamptz not null default now(),
  -- incarnation storage key (Codex plan audit round 2 R2-1): chosen by put_industry_manifest when the row is created;
  -- a re-registration after GC is a new row with a new path, so a stale collector can only delete its own incarnation
  object_path   text not null,
  gc_claimed_at timestamptz,           -- GC tombstone (round 1 #4): set by gc_industry_manifest_candidates
  gc_claim      uuid,                  -- claim token; delete_industry_manifests only deletes the row of the matching claim
  constraint industry_manifests_object_path_check check (object_path = 'sha256/' || manifest_hash || '/' || substr(object_path, 73, 36) || '.json.gz'
    and substr(object_path, 73, 36) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

-- ---------------------------------------------------------------- industry_metric_runs / industry_metrics (§5.4)
create table if not exists public.industry_metric_runs (
  run_id           uuid primary key,
  scheme           text not null check (scheme in ('sw2021','sic')),
  version          text not null check (length(version) between 1 and 32),
  level            int not null check (level between 1 and 4),
  generation       bigint not null check (generation >= 1),
  facts_as_of      date not null,
  knowledge_date   date not null,
  history_class    text not null check (history_class in ('point_in_time','reconstruction')),
  method_version   text not null check (length(method_version) between 1 and 64),
  config_hash      text not null check (length(config_hash) between 1 and 128),
  formula_version  text not null check (length(formula_version) between 1 and 64),
  code_version     text not null check (length(code_version) between 1 and 64),
  expected_grid    jsonb not null check (jsonb_typeof(expected_grid) = 'object'),
  fingerprint_at   timestamptz not null,
  reused_from_run  uuid references public.industry_metric_runs(run_id) on delete set null,
  batch_id         uuid not null references public.ingest_batches(batch_id) on delete restrict,
  status           text not null check (status in ('building','active','superseded','failed')),
  coverage_summary jsonb not null default '{}' check (jsonb_typeof(coverage_summary) = 'object'),
  created_at       timestamptz not null default now(),
  activated_at     timestamptz,
  constraint industry_metric_runs_generation_key unique (scheme, version, level, generation),
  constraint industry_metric_runs_activated_iff check ((status in ('active','superseded')) = (activated_at is not null))
);
create unique index if not exists industry_metric_runs_active_uidx on public.industry_metric_runs(scheme, version, level) where status = 'active';

create table if not exists public.industry_metrics (
  run_id         uuid not null references public.industry_metric_runs(run_id) on delete cascade,
  code           text not null check (length(code) between 1 and 32),
  metric         text not null check (metric in ('revenue_sum','net_income_parent_sum','gross_margin','roe','revenue_yoy','net_income_yoy','member_count')),
  period_start   date not null,
  period_end     date not null,
  duration       text not null check (duration in ('3M','12M','TTM','INSTANT')),
  status         text not null check (status in ('ok','missing')),
  missing_reason text check (missing_reason is null or missing_reason in ('empty_set','zero_denominator','no_members','financial_excluded','unresolved_over_limit','manifest_mismatch')),
  value          numeric,
  value_text     text generated always as (value::text) stored,
  unit           text not null check (length(unit) between 1 and 16),
  n_members      int not null check (n_members >= 0),
  n_with_data    int not null check (n_with_data >= 0),
  n_unresolved   int not null check (n_unresolved >= 0),
  manifest_hash  text references public.industry_manifests(manifest_hash) on delete restrict,
  updated_at     timestamptz,
  primary key (run_id, code, metric, period_start, period_end),
  constraint industry_metrics_ok_value check ((status = 'ok') = (value is not null)),
  constraint industry_metrics_ok_manifest check ((status = 'ok') = (manifest_hash is not null)),
  constraint industry_metrics_missing_reason check ((status = 'missing') = (missing_reason is not null))
);
create index if not exists industry_metrics_series_idx on public.industry_metrics(code, metric, period_end desc);
create index if not exists industry_metrics_manifest_idx on public.industry_metrics(manifest_hash) where manifest_hash is not null;

-- ---------------------------------------------------------------- valuation runs / rows / pairs (§6.4; pipeline deferred)
create table if not exists public.industry_valuation_runs (
  run_id           uuid primary key,
  scheme           text not null check (scheme in ('sw2021','sic')),
  version          text not null check (length(version) between 1 and 32),
  level            int not null check (level between 1 and 4),
  generation       bigint not null check (generation >= 1),
  method_version   text not null check (length(method_version) between 1 and 64),
  config_hash      text not null check (length(config_hash) between 1 and 128),
  formula_version  text not null check (length(formula_version) between 1 and 64),
  code_version     text not null check (length(code_version) between 1 and 64),
  expected_dates   jsonb not null check (jsonb_typeof(expected_dates) = 'array'),
  comparator_basis text not null check (comparator_basis in ('ttm','static','unknown')),
  recompute_from   date not null,
  carried_from_run uuid references public.industry_valuation_runs(run_id) on delete set null,
  fingerprint_at   timestamptz not null,
  batch_id         uuid not null references public.ingest_batches(batch_id) on delete restrict,
  status           text not null check (status in ('building','published','active','superseded','failed')),
  reconciliation   jsonb not null default '{}' check (jsonb_typeof(reconciliation) = 'object'),
  created_at       timestamptz not null default now(),
  published_at     timestamptz,
  activated_at     timestamptz,
  constraint industry_valuation_runs_generation_key unique (scheme, version, level, generation),
  constraint industry_valuation_runs_published_at check (status not in ('published','active','superseded') or published_at is not null),
  constraint industry_valuation_runs_activated_iff check ((status in ('active','superseded')) = (activated_at is not null))
);
create unique index if not exists industry_valuation_runs_active_uidx on public.industry_valuation_runs(scheme, version, level) where status = 'active';

create table if not exists public.industry_valuations (
  run_id            uuid not null references public.industry_valuation_runs(run_id) on delete cascade,
  scheme            text not null,
  version           text not null,
  code              text not null check (length(code) between 1 and 32),
  trade_date        date not null,
  metric            text not null check (metric in ('pe_ttm','pe_static','pb','market_cap')),
  status            text not null check (status in ('ok','missing')),
  missing_reason    text check (missing_reason is null or length(missing_reason) between 1 and 64),
  value             numeric,
  value_text        text generated always as (value::text) stored,
  facts_as_of       date not null,
  n_members         int check (n_members is null or n_members >= 0),
  n_with_data       int check (n_with_data is null or n_with_data >= 0),
  n_unresolved      int check (n_unresolved is null or n_unresolved >= 0),
  mcap_coverage     numeric check (mcap_coverage is null or (mcap_coverage >= 0 and mcap_coverage <= 1)),
  mcap_coverage_text text generated always as (mcap_coverage::text) stored,
  manifest_hash     text references public.industry_manifests(manifest_hash) on delete restrict,
  updated_at        timestamptz,
  series_qualified  boolean not null default false,
  published         boolean not null default false,
  primary key (run_id, scheme, version, code, trade_date, metric),
  constraint industry_valuations_ok_value check ((status = 'ok') = (value is not null)),
  constraint industry_valuations_missing_reason check ((status = 'missing') = (missing_reason is not null)),
  constraint industry_valuations_published_requires check (not published or (status = 'ok' and series_qualified))
);
create index if not exists industry_valuations_published_idx on public.industry_valuations(scheme, version, code, metric, trade_date desc) where published;
create index if not exists industry_valuations_manifest_idx on public.industry_valuations(manifest_hash) where manifest_hash is not null;

create table if not exists public.industry_valuation_pairs (
  run_id                  uuid not null references public.industry_valuation_runs(run_id) on delete cascade,
  scheme                  text not null,
  version                 text not null,
  code                    text not null,
  trade_date              date not null,
  metric                  text not null check (metric in ('pe_ttm','pe_static','pb','market_cap')),
  official_observation_id uuid references public.industry_official_valuations(observation_id) on delete restrict,
  official_value          numeric,
  rel_diff                numeric,
  pair_status             text not null check (pair_status in ('within','outside','no_official','no_computed','invalid_denominator','not_applicable')),
  primary key (run_id, scheme, version, code, trade_date, metric)
);

-- ---------------------------------------------------------------- industry_run_dependencies (§5.4, U4/V6)
create table if not exists public.industry_run_dependencies (
  run_kind  text not null check (run_kind in ('aggregate','valuation')),
  run_id    uuid not null,
  cell_key  text not null check (length(cell_key) between 1 and 64),
  issuer_id uuid not null,
  state_rev bigint not null check (state_rev >= 0),
  primary key (run_kind, run_id, cell_key, issuer_id)
);

-- ---------------------------------------------------------------- industry_sync_scope (SIC schedule; not a fact table)
create table if not exists public.industry_sync_scope (
  issuer_id       uuid not null references public.issuers(issuer_id) on delete restrict,
  job             text not null check (job in ('sic')),
  next_due_at     timestamptz not null default now(),
  lease_until     timestamptz,
  lease_batch_id  uuid,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_status     text check (last_status is null or last_status in ('success','failed')),
  updated_at      timestamptz not null default now(),
  primary key (issuer_id, job),
  constraint industry_sync_scope_lease_pair check ((lease_until is null) = (lease_batch_id is null))
);
create index if not exists industry_sync_scope_due_idx on public.industry_sync_scope(job, next_due_at);

-- ---------------------------------------------------------------- bucket (§5.3)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('industry-manifests', 'industry-manifests', false, 20971520, array['application/gzip'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- licence helpers (§4.3 function table; called by the policies)
create or replace function public.industry_dataset_is_public(p_key text)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.industry_dataset_licenses l where l.dataset_key = p_key and l.status = 'public')
$$;
revoke execute on function public.industry_dataset_is_public(text) from public, anon, authenticated, service_role;
grant execute on function public.industry_dataset_is_public(text) to anon, authenticated, service_role;

create or replace function public.industry_metric_run_visible(p_run uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select r.status = 'active' and public.industry_dataset_is_public('scheme:' || r.scheme || ':' || r.version)
                   from public.industry_metric_runs r where r.run_id = p_run), false)
$$;
revoke execute on function public.industry_metric_run_visible(uuid) from public, anon, authenticated, service_role;
grant execute on function public.industry_metric_run_visible(uuid) to anon, authenticated, service_role;

create or replace function public.industry_valuation_run_visible(p_run uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select r.status = 'active' and public.industry_dataset_is_public('scheme:' || r.scheme || ':' || r.version)
                   from public.industry_valuation_runs r where r.run_id = p_run), false)
$$;
revoke execute on function public.industry_valuation_run_visible(uuid) from public, anon, authenticated, service_role;
grant execute on function public.industry_valuation_run_visible(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- table privileges and policies (§4.3, §4.8)
do $$ declare t text; begin
  -- every industry table: RLS on, nothing for client roles until granted below; service_role reads everything
  foreach t in array array['industry_classifications','issuer_industry_memberships','industry_dataset_licenses','industry_source_memberships',
                           'industry_fetch_events','industry_observation_receipts','security_marks','industry_official_valuations',
                           'industry_manifests','industry_metric_runs','industry_metrics','industry_valuation_runs','industry_valuations',
                           'industry_valuation_pairs','industry_run_dependencies','industry_sync_scope'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
  -- licence-gated public reads (the landed "<t> public read" policies are replaced)
  foreach t in array array['industry_classifications','issuer_industry_memberships','industry_metric_runs','industry_metrics',
                           'industry_valuation_runs','industry_valuations','security_marks'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('drop policy if exists "%s licensed read" on public.%I', t, t);
  end loop;
end $$;
create policy "industry_classifications licensed read" on public.industry_classifications for select to anon, authenticated
  using (public.industry_dataset_is_public('scheme:' || scheme || ':' || version));
create policy "issuer_industry_memberships licensed read" on public.issuer_industry_memberships for select to anon, authenticated
  using (status = 'ok' and public.industry_dataset_is_public('scheme:' || scheme || ':' || version));
create policy "industry_metric_runs licensed read" on public.industry_metric_runs for select to anon, authenticated
  using (status = 'active' and public.industry_dataset_is_public('scheme:' || scheme || ':' || version));
create policy "industry_metrics licensed read" on public.industry_metrics for select to anon, authenticated
  using (public.industry_metric_run_visible(run_id));
create policy "industry_valuation_runs licensed read" on public.industry_valuation_runs for select to anon, authenticated
  using (status = 'active' and public.industry_dataset_is_public('scheme:' || scheme || ':' || version));
create policy "industry_valuations licensed read" on public.industry_valuations for select to anon, authenticated
  using (published and public.industry_valuation_run_visible(run_id));
create policy "security_marks licensed read" on public.security_marks for select to anon, authenticated
  using (status = 'ok' and public.industry_dataset_is_public('marks:tushare-daily_basic'));
-- semi-protected writes: classifications (adapter inserts nodes, renames go through quarantine; no delete) and the SIC schedule
grant insert, update on public.industry_classifications to service_role;
drop policy if exists "industry_classifications service insert" on public.industry_classifications;
create policy "industry_classifications service insert" on public.industry_classifications for insert to service_role with check (true);
drop policy if exists "industry_classifications service update" on public.industry_classifications;
create policy "industry_classifications service update" on public.industry_classifications for update to service_role using (true) with check (true);
grant insert, update, delete on public.industry_sync_scope to service_role;
drop policy if exists "industry_sync_scope service write" on public.industry_sync_scope;
create policy "industry_sync_scope service write" on public.industry_sync_scope for all to service_role using (true) with check (true);
