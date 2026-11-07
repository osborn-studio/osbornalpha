-- supabase/migrations/20261117090000_broker_research.sql
-- FR-0 (foreign broker research spec §4): the private research library. 22 tables, their
-- constraints and indexes, the private bucket `broker-research`, table privileges (every base table
-- is service_role only; public reads go through the §4.11 views of 20261117092000), and the
-- TABLE-LEVEL triggers: licence_material_change (before + after), document / intent / run
-- lifecycles, broker_reports_guard, child-table guards, close-only rating scales,
-- analyst_disclosure_change, insert-only publications (unpublished_at once), append-only receipts
-- and logs, outbox immutability. Triggers that need the module's SQL functions (approval checks,
-- withdraw cascade, claim.retract) live in 20261117091000_broker_research_functions.sql.
-- Trigger errors carry the code as the message prefix (`<code>[:<detail>]`, SQLSTATE P0001 or
-- 23514 for append_only:*), which the TS adapters map to BrokerResearchDbError(code).
-- Hosted `postgres` is not a superuser: no `alter … owner`, `set search_path = public`.
-- Replayable: create table if not exists, constraint adds guarded by pg_constraint, create or
-- replace function, drop trigger if exists + create trigger, insert … on conflict. Only
-- storage.buckets is referenced (the local harness has no storage.objects).

-- ---------------------------------------------------------------- 4.1 settings, licences
create table if not exists public.broker_research_settings (
  id                        integer primary key,
  public_enabled            boolean not null default false,
  approved_gold_corpus_hash text,
  approved_gold_corpus_by   uuid,
  approved_gold_corpus_at   timestamptz,
  updated_by                uuid,
  updated_at                timestamptz not null default now(),
  constraint broker_research_settings_singleton check (id = 1),
  constraint broker_research_settings_gold_hash check (approved_gold_corpus_hash is null or approved_gold_corpus_hash ~ '^[0-9a-f]{64}$')
);
insert into public.broker_research_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.broker_report_licences (
  licence_id                 uuid primary key default gen_random_uuid(),
  version                    integer not null default 1,
  source_label               text not null,
  licence_kind               text not null,
  holder                     text not null,
  terms_summary              text not null,
  evidence_path              text,
  allows_llm_processing      boolean not null default false,
  allows_public_metadata     boolean not null default false,
  allows_public_snippets     boolean not null default false,
  allows_public_summary      boolean not null default false,
  allows_public_target_price boolean not null default false,
  snippet_max_chars          integer not null,
  valid_from                 date not null,
  valid_to                   date,
  confirmed_by               uuid,
  confirmed_at               timestamptz,
  confirmed_version          integer,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint broker_licences_version check (version >= 1),
  constraint broker_licences_source_label check (length(source_label) between 1 and 120),
  constraint broker_licences_kind check (licence_kind in ('terminal_subscription','direct_from_broker','owner_authored','other')),
  constraint broker_licences_holder check (length(holder) between 1 and 200),
  constraint broker_licences_terms check (length(terms_summary) between 1 and 4000),
  constraint broker_licences_evidence_path check (evidence_path is null or evidence_path ~ '^licences/[0-9a-f]{64}\.pdf$'),
  constraint broker_licences_snippet_max check (snippet_max_chars > 0 and snippet_max_chars <= 500),
  constraint broker_licences_validity check (valid_to is null or valid_to >= valid_from),
  constraint broker_licences_confirmed_triple check ((confirmed_at is null) = (confirmed_by is null) and (confirmed_at is null) = (confirmed_version is null)),
  constraint broker_licences_confirmed_version check (confirmed_version is null or confirmed_version = version)
);

-- ---------------------------------------------------------------- 4.9 entities (referenced by reports)
create table if not exists public.research_institutions (
  institution_id        uuid primary key default gen_random_uuid(),
  name_en               text not null,
  name_zh               text,
  aliases               text[] not null default '{}',
  kind                  text,
  rating_disclosure_url text,
  created_at            timestamptz not null default now(),
  constraint research_institutions_name check (length(name_en) between 1 and 200)
);
create unique index if not exists research_institutions_name_en_uniq on public.research_institutions (lower(name_en));

create table if not exists public.research_rating_scales (
  scale_id       uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.research_institutions(institution_id) on delete restrict,
  raw_label      text not null,
  normalized     text not null,
  source_url     text not null,
  valid_from     date not null,
  valid_to       date,
  created_by     uuid not null,
  created_at     timestamptz not null default now(),
  closed_by      uuid,
  closed_at      timestamptz,
  constraint research_rating_scales_label check (length(raw_label) between 1 and 80),
  constraint research_rating_scales_normalized check (normalized in ('buy','overweight','neutral','underweight','sell','not_rated')),
  constraint research_rating_scales_source check (length(source_url) between 1 and 2000),
  constraint research_rating_scales_validity check (valid_to is null or valid_to > valid_from),
  constraint research_rating_scales_closed check ((valid_to is null) = (closed_at is null) and (closed_at is null) = (closed_by is null))
);
create unique index if not exists research_rating_scales_label_uniq on public.research_rating_scales (institution_id, lower(btrim(raw_label)), valid_from);

create table if not exists public.research_analysts (
  analyst_id     uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.research_institutions(institution_id) on delete restrict,
  display_name   text not null,
  name_variants  text[] not null default '{}',
  public_display boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint research_analysts_name check (length(display_name) between 1 and 200)
);
create index if not exists research_analysts_institution_idx on public.research_analysts (institution_id);

-- ---------------------------------------------------------------- 4.2 documents, intents; 4.3 runs
create table if not exists public.broker_report_documents (
  document_id          uuid primary key,
  sha256               text not null,
  storage_path         text not null,
  byte_size            bigint not null,
  page_count           integer,
  licence_id           uuid not null references public.broker_report_licences(licence_id) on delete restrict,
  uploaded_by          uuid not null,
  uploaded_at          timestamptz not null default now(),
  original_filename    text not null,
  current_parse_run_id uuid,
  status               text not null default 'uploaded',
  lease_token          uuid,
  lease_until          timestamptz,
  promotion_pending    boolean not null default false,
  last_verified_at     timestamptz,
  verify_status        text,
  withdrawn_at         timestamptz,
  withdrawn_reason     text,
  purged_at            timestamptz,
  purge_requested_at   timestamptz,
  purge_requested_by   uuid,
  constraint broker_documents_purge_intent check ((purge_requested_at is null) = (purge_requested_by is null)),
  constraint broker_documents_sha256_uniq unique (sha256),
  constraint broker_documents_storage_path_uniq unique (storage_path),
  constraint broker_documents_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint broker_documents_storage_path check (storage_path = 'reports/' || sha256 || '.pdf'),
  constraint broker_documents_byte_size check (byte_size > 0),
  constraint broker_documents_page_count check (page_count is null or page_count > 0),
  constraint broker_documents_filename check (length(original_filename) between 1 and 255),
  constraint broker_documents_status check (status in ('uploaded','parsing','parsed','parse_failed','withdrawn')),
  constraint broker_documents_lease_pair check ((lease_token is null) = (lease_until is null)),
  constraint broker_documents_verify_status check (verify_status is null or verify_status in ('ok','failed','error')),
  constraint broker_documents_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null) and (withdrawn_at is null) = (withdrawn_reason is null)),
  constraint broker_documents_purged check (purged_at is null or status = 'withdrawn')
);
create index if not exists broker_documents_verify_idx on public.broker_report_documents (last_verified_at nulls first, document_id);
create index if not exists broker_documents_licence_idx on public.broker_report_documents (licence_id);

create table if not exists public.broker_report_upload_intents (
  intent_id         uuid primary key,
  sha256            text not null,
  byte_size         bigint not null,
  licence_id        uuid not null references public.broker_report_licences(licence_id) on delete restrict,
  original_filename text not null,
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  status            text not null default 'open',
  staging_path      text not null,
  document_id       uuid references public.broker_report_documents(document_id) on delete restrict,
  error_code        text,
  checkpoint_at     timestamptz,
  constraint broker_intents_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint broker_intents_byte_size check (byte_size > 0),
  constraint broker_intents_filename check (length(original_filename) between 1 and 255),
  constraint broker_intents_status check (status in ('open','validating','validated','promoting','committed','expired','abandoned')),
  constraint broker_intents_staging_path check (staging_path = 'staging/' || intent_id::text || '.pdf'),
  constraint broker_intents_committed_document check (status <> 'committed' or document_id is not null),
  constraint broker_intents_expiry check (expires_at > created_at)
);
create index if not exists broker_intents_status_idx on public.broker_report_upload_intents (status, expires_at);
create index if not exists broker_intents_sha_idx on public.broker_report_upload_intents (sha256);

create table if not exists public.broker_report_runs (
  run_id            uuid primary key,
  document_id       uuid not null references public.broker_report_documents(document_id) on delete restrict,
  kind              text not null,
  parse_run_id      uuid references public.broker_report_runs(run_id) on delete restrict,
  extractor_version text,
  artifact_path     text,
  artifact_hash     text,
  model_id          text,
  registry_hash     text,
  prompt_version    text,
  schema_version    text,
  code_version      text not null,
  behavior_digest   text,
  licence_version   integer not null,
  request_path      text,
  response_path     text,
  batch_id          uuid references public.ingest_batches(batch_id) on delete restrict,
  status            text not null default 'running',
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  detail            jsonb not null default '{}',
  constraint broker_runs_kind check (kind in ('parse','extract','summary','translate','verify')),
  constraint broker_runs_status check (status in ('running','succeeded','failed')),
  constraint broker_runs_finished check ((status = 'running') = (finished_at is null)),
  constraint broker_runs_detail check (jsonb_typeof(detail) = 'object'),
  constraint broker_runs_licence_version check (licence_version >= 1),
  constraint broker_runs_parse_extractor check (kind <> 'parse' or status <> 'succeeded' or extractor_version is not null),
  constraint broker_runs_parse_link check (kind not in ('extract','summary','translate') or parse_run_id is not null),
  constraint broker_runs_llm_lineage check (kind not in ('extract','summary','translate') or (model_id is not null and registry_hash is not null and prompt_version is not null)),
  constraint broker_runs_extract_lineage check (kind <> 'extract' or (schema_version is not null and behavior_digest ~ '^[0-9a-f]{64}$')),
  constraint broker_runs_parse_artifact check (not (kind = 'parse' and status = 'succeeded') or (artifact_path is not null and artifact_hash is not null)),
  constraint broker_runs_artifact_hash check (artifact_hash is null or artifact_hash ~ '^[0-9a-f]{64}$'),
  constraint broker_runs_artifact_path check (artifact_path is null or artifact_path ~ '^reports/[0-9a-f]{64}\.extract\.[0-9a-f-]{36}\.json$'),
  constraint broker_runs_request_path check (request_path is null or request_path = 'runs/' || run_id::text || '.request.json'),
  constraint broker_runs_response_path check (response_path is null or response_path = 'runs/' || run_id::text || '.response.json')
);
create index if not exists broker_runs_document_idx on public.broker_report_runs (document_id, started_at desc);
create index if not exists broker_runs_running_idx on public.broker_report_runs (document_id) where status = 'running';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'broker_documents_parse_run_fkey') then
    alter table public.broker_report_documents add constraint broker_documents_parse_run_fkey
      foreign key (current_parse_run_id) references public.broker_report_runs(run_id) on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------- 4.4 reports
create table if not exists public.broker_research_reports (
  report_id              uuid primary key default gen_random_uuid(),
  document_id            uuid not null references public.broker_report_documents(document_id) on delete restrict,
  revision               integer not null default 1,
  scope                  text,
  institution_id         uuid references public.research_institutions(institution_id) on delete restrict,
  title_original         text,
  title_lang             text,
  title_zh               text,
  title_en               text,
  title_run_id           uuid references public.broker_report_runs(run_id) on delete restrict,
  title_public           text,
  title_public_by        uuid,
  published_date         date,
  price_as_of_date       date,
  report_type            text,
  sector_as_stated       text,
  primary_target_key     text,
  effective_hash         text,
  materialized_hash      text,
  rules_input_hash       text,
  summary_input_digest   text,
  title_restricted       boolean not null default false,
  evidence_ok            boolean not null default true,
  disclosure_ok          boolean not null default true,
  review_status          text not null default 'pending',
  status                 text not null default 'draft',
  current_publication_id uuid,
  supersedes_report_id   uuid references public.broker_research_reports(report_id) on delete restrict,
  code_version           text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint broker_reports_document_uniq unique (document_id),
  constraint broker_reports_revision check (revision >= 1),
  constraint broker_reports_scope check (scope is null or scope in ('single_issuer','multi_issuer','sector','macro_strategy')),
  constraint broker_reports_review_status check (review_status in ('pending','in_review','approved','rejected')),
  constraint broker_reports_status check (status in ('draft','published','withdrawn')),
  constraint broker_reports_published_publication check (status <> 'published' or current_publication_id is not null),
  constraint broker_reports_supersedes_self check (supersedes_report_id is null or supersedes_report_id <> report_id),
  constraint broker_reports_title_public_by check ((title_public is null) or (title_public_by is not null)),
  constraint broker_reports_hashes check ((effective_hash is null or effective_hash ~ '^[0-9a-f]{64}$') and (materialized_hash is null or materialized_hash ~ '^[0-9a-f]{64}$')
                                          and (rules_input_hash is null or rules_input_hash ~ '^[0-9a-f]{64}$') and (summary_input_digest is null or summary_input_digest ~ '^[0-9a-f]{64}$'))
);
create index if not exists broker_reports_status_idx on public.broker_research_reports (status, review_status);
create index if not exists broker_reports_institution_idx on public.broker_research_reports (institution_id, published_date desc);

-- ---------------------------------------------------------------- 4.5 targets, overrides
create table if not exists public.broker_report_targets (
  report_id              uuid not null references public.broker_research_reports(report_id) on delete cascade,
  target_key             text not null,
  basis                  text not null,
  ticker_as_stated       text not null,
  security_ticker        text references public.stocks_universe(ticker) on delete restrict,
  issuer_id              uuid references public.issuers(issuer_id) on delete restrict,
  resolution             jsonb not null default '{}',
  rating_raw             text,
  rating_normalized      text,
  scale_id               uuid references public.research_rating_scales(scale_id) on delete restrict,
  target_price           numeric,
  target_currency        text,
  target_horizon_months  integer,
  price_at_report        numeric,
  price_currency         text,
  price_as_of_date       date,
  upside_pct             numeric,
  upside_formula_version text,
  input_hash             text not null,
  primary key (report_id, target_key),
  constraint broker_targets_key check (length(target_key) between 1 and 128),
  constraint broker_targets_basis check (basis in ('candidate','effective')),
  constraint broker_targets_resolution check (jsonb_typeof(resolution) = 'object'),
  constraint broker_targets_rating check (rating_normalized is null or rating_normalized in ('buy','overweight','neutral','underweight','sell','not_rated')),
  constraint broker_targets_currencies check ((target_currency is null or target_currency ~ '^[A-Z]{3}$') and (price_currency is null or price_currency ~ '^[A-Z]{3}$')),
  constraint broker_targets_horizon check (target_horizon_months is null or target_horizon_months > 0),
  constraint broker_targets_upside check ((upside_pct is null) = (upside_formula_version is null))
);
create index if not exists broker_targets_security_idx on public.broker_report_targets (security_ticker);
create index if not exists broker_targets_issuer_idx on public.broker_report_targets (issuer_id);

create table if not exists public.broker_report_target_overrides (
  override_id     uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.broker_research_reports(report_id) on delete cascade,
  target_key      text not null,
  security_ticker text not null references public.stocks_universe(ticker) on delete restrict,
  issuer_id       uuid references public.issuers(issuer_id) on delete restrict,
  set_by          uuid not null,
  set_at          timestamptz not null default now(),
  note            text,
  constraint broker_overrides_uniq unique (report_id, target_key)
);

-- ---------------------------------------------------------------- 4.6 evidence rows
create table if not exists public.broker_report_fields (
  field_id             uuid primary key default gen_random_uuid(),
  report_id            uuid not null references public.broker_research_reports(report_id) on delete cascade,
  parse_run_id         uuid references public.broker_report_runs(run_id) on delete restrict,
  run_id               uuid references public.broker_report_runs(run_id) on delete restrict,
  superseded_by_run_id uuid references public.broker_report_runs(run_id) on delete restrict,
  target_key           text,
  field                text not null,
  occurrence           integer not null default 1,
  value_text           text not null,
  value_num            numeric,
  value_currency       text,
  value_unit           text,
  value_date           date,
  page                 integer,
  char_start           integer,
  char_end             integer,
  value_source_text    text,
  extractor            text not null,
  extractor_confidence double precision,
  status               text not null,
  corrected            jsonb,
  conflict_group       text,
  detail               jsonb not null default '{}',
  reviewed_by          uuid,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  constraint broker_fields_field check (field in ('institution','analyst','published_date','price_as_of_date','ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','upside_stated','wacc','terminal_growth','terminal_value_share','valuation_method','sector','title')),
  constraint broker_fields_status check (status in ('extracted','unverified','confirmed','corrected','rejected','absent')),
  constraint broker_fields_occurrence check (occurrence >= 1),
  constraint broker_fields_value_currency check (value_currency is null or value_currency ~ '^[A-Z]{3}$'),
  constraint broker_fields_value_unit check (value_unit is null or value_unit in ('pct','ratio','months','price')),
  constraint broker_fields_page check (page is null or page > 0),
  constraint broker_fields_span check ((char_start is null) = (char_end is null) and (char_start is null or (char_start >= 0 and char_end > char_start)) and (char_start is null or page is not null)),
  constraint broker_fields_span_run check (char_start is null or parse_run_id is not null),
  constraint broker_fields_source_text check (value_source_text is null or char_start is not null),
  constraint broker_fields_extractor check (extractor ~ '^(llm:.+|human:[0-9a-f-]{36})$'),
  constraint broker_fields_confidence check (extractor_confidence is null or (extractor_confidence >= 0 and extractor_confidence <= 1)),
  constraint broker_fields_detail check (jsonb_typeof(detail) = 'object'),
  constraint broker_fields_target_key_level check (
    (field in ('ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','price_as_of_date','upside_stated')) = (target_key is not null)),
  constraint broker_fields_confirmed_span check (status not in ('confirmed','corrected') or (page is not null and char_start is not null and char_end is not null and value_source_text is not null and parse_run_id is not null)),
  constraint broker_fields_absent_shape check (status <> 'absent' or (extractor like 'human:%' and field in ('rating','target_price','analyst','target_horizon')
                                               and page is not null and char_start is null and value_source_text is null and value_text = 'ABSENT' and parse_run_id is not null)),
  constraint broker_fields_candidate_run check (status not in ('extracted','unverified') or (run_id is not null and extractor like 'llm:%')),
  constraint broker_fields_corrected_iff check ((status = 'corrected') = (corrected is not null)),
  constraint broker_fields_corrected_payload check (corrected is null or (
        jsonb_typeof(corrected) = 'object'
    and corrected - array['value_text','value_num','value_currency','value_unit','value_date'] = '{}'::jsonb
    and corrected ? 'value_text'
    and jsonb_typeof(corrected -> 'value_text') = 'string'
    and (not corrected ? 'value_num' or jsonb_typeof(corrected -> 'value_num') = 'null' or (jsonb_typeof(corrected -> 'value_num') = 'string' and corrected ->> 'value_num' ~ '^-?[0-9]+(\.[0-9]+)?$'))
    and (not corrected ? 'value_currency' or jsonb_typeof(corrected -> 'value_currency') = 'null' or corrected ->> 'value_currency' ~ '^[A-Z]{3}$')
    and (not corrected ? 'value_unit' or jsonb_typeof(corrected -> 'value_unit') = 'null' or corrected ->> 'value_unit' in ('pct','ratio','months','price'))
    and (not corrected ? 'value_date' or jsonb_typeof(corrected -> 'value_date') = 'null' or corrected ->> 'value_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')))
);
create unique index if not exists broker_fields_effective_uniq on public.broker_report_fields (report_id, coalesce(target_key, ''), field, occurrence) where status in ('confirmed','corrected','absent');
create index if not exists broker_fields_report_idx on public.broker_report_fields (report_id, field, target_key);
create index if not exists broker_fields_run_idx on public.broker_report_fields (run_id);

-- ---------------------------------------------------------------- 4.7 snippets, summaries
create table if not exists public.broker_report_snippets (
  snippet_id       uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.broker_research_reports(report_id) on delete cascade,
  target_key       text,
  purpose          text not null,
  parse_run_id     uuid not null references public.broker_report_runs(run_id) on delete restrict,
  page             integer not null,
  char_start       integer not null,
  char_end         integer not null,
  text             text,
  field_id         uuid references public.broker_report_fields(field_id) on delete restrict,
  status           text not null default 'draft',
  disclosure_check jsonb,
  draft_reason     text,
  approved_by      uuid,
  approved_at      timestamptz,
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  constraint broker_snippets_purpose check (purpose in ('rating','target','thesis','risk','method','other')),
  constraint broker_snippets_status check (status in ('draft','approved','rejected')),
  constraint broker_snippets_span check (page > 0 and char_start >= 0 and char_end > char_start),
  constraint broker_snippets_text_length check (text is null or length(text) <= 500),
  constraint broker_snippets_text_required check (status = 'rejected' or text is not null),
  constraint broker_snippets_approved check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint broker_snippets_draft_reason check (draft_reason is null or draft_reason in ('licence_version','analyst_disclosure','disclosure_inputs'))
);
create index if not exists broker_snippets_report_idx on public.broker_report_snippets (report_id, status);

create table if not exists public.broker_report_summaries (
  summary_id           uuid primary key default gen_random_uuid(),
  report_id            uuid not null references public.broker_research_reports(report_id) on delete cascade,
  lang                 text not null,
  kind                 text not null default 'independent_summary',
  run_id               uuid not null references public.broker_report_runs(run_id) on delete restrict,
  input_hash           text not null,
  summary_md           text not null,
  max_verbatim_overlap integer not null,
  numeric_grounding    jsonb not null,
  disclosure_check     jsonb not null,
  status               text not null default 'draft',
  draft_reason         text,
  approved_by          uuid,
  approved_at          timestamptz,
  generated_at         timestamptz not null default now(),
  constraint broker_summaries_lang check (lang in ('zh','en')),
  constraint broker_summaries_kind check (kind = 'independent_summary'),
  constraint broker_summaries_input_hash check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint broker_summaries_overlap check (max_verbatim_overlap >= 0),
  constraint broker_summaries_status check (status in ('draft','approved','rejected')),
  constraint broker_summaries_approved check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint broker_summaries_draft_reason check (draft_reason is null or draft_reason in ('licence_version','analyst_disclosure','summary_stale'))
);
create unique index if not exists broker_summaries_approved_uniq on public.broker_report_summaries (report_id, lang) where status = 'approved';

-- ---------------------------------------------------------------- 4.8 rule receipts, publications
create table if not exists public.broker_report_rule_receipts (
  receipt_id    uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.broker_research_reports(report_id) on delete restrict,
  rules_version text not null,
  input_hash    text not null,
  results       jsonb not null,
  code_version  text not null,
  created_at    timestamptz not null default now(),
  constraint broker_rule_receipts_hash check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint broker_rule_receipts_results check (jsonb_typeof(results) = 'array')
);
create index if not exists broker_rule_receipts_lookup_idx on public.broker_report_rule_receipts (report_id, input_hash, created_at desc);

create table if not exists public.broker_eval_receipts (
  receipt_id        uuid primary key default gen_random_uuid(),
  corpus_kind       text not null,
  corpus_hash       text not null,
  behavior_digest   text not null,
  extractor_version text not null,
  model_id          text not null,
  registry_hash     text not null,
  prompt_version    text not null,
  schema_version    text not null,
  code_version      text not null,
  n_docs            integer not null,
  per_field         jsonb not null,
  absence           jsonb not null,
  precision_min     double precision,
  recall_min        double precision,
  passed            boolean not null,
  ran_at            timestamptz not null default now(),
  ran_by            uuid not null,
  constraint broker_eval_corpus_kind check (corpus_kind in ('gold','synthetic')),
  constraint broker_eval_hashes check (corpus_hash ~ '^[0-9a-f]{64}$' and behavior_digest ~ '^[0-9a-f]{64}$'),
  constraint broker_eval_n_docs check (n_docs >= 0),
  constraint broker_eval_shapes check (jsonb_typeof(per_field) = 'object' and jsonb_typeof(absence) = 'object'),
  constraint broker_eval_passed_rule check (passed = coalesce(precision_min >= 0.95 and recall_min >= 0.95, false))
);
create index if not exists broker_eval_digest_idx on public.broker_eval_receipts (behavior_digest, ran_at desc);

create table if not exists public.broker_report_publications (
  publication_id   uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.broker_research_reports(report_id) on delete restrict,
  revision         integer not null,
  snapshot         jsonb not null,
  snapshot_hash    text not null,
  licence_version  integer not null,
  rules_receipt_id uuid not null references public.broker_report_rule_receipts(receipt_id) on delete restrict,
  eval_receipt_id  uuid references public.broker_eval_receipts(receipt_id) on delete restrict,
  published_at     timestamptz not null default now(),
  published_by     uuid not null,
  unpublished_at   timestamptz,
  unpublish_reason text,
  constraint broker_publications_revision_uniq unique (report_id, revision),
  constraint broker_publications_snapshot check (jsonb_typeof(snapshot) = 'object'),
  constraint broker_publications_hash check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint broker_publications_unpublished check ((unpublished_at is null) = (unpublish_reason is null))
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'broker_reports_publication_fkey') then
    alter table public.broker_research_reports add constraint broker_reports_publication_fkey
      foreign key (current_publication_id) references public.broker_report_publications(publication_id) on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------- analysts binding, purge, logs, outbox
create table if not exists public.broker_report_analysts (
  report_id  uuid not null references public.broker_research_reports(report_id) on delete cascade,
  analyst_id uuid not null references public.research_analysts(analyst_id) on delete restrict,
  role       text,
  field_id   uuid not null references public.broker_report_fields(field_id) on delete restrict,
  primary key (report_id, analyst_id)
);
create index if not exists broker_report_analysts_analyst_idx on public.broker_report_analysts (analyst_id);

create table if not exists public.broker_purge_steps (
  document_id uuid not null references public.broker_report_documents(document_id) on delete restrict,
  step        text not null,
  status      text not null default 'pending',
  attempts    integer not null default 0,
  last_error  text,
  at          timestamptz not null default now(),
  primary key (document_id, step),
  constraint broker_purge_steps_step check (step in ('pdf','artifacts','runs','fields_text','snippets_text','summaries','quarantine_payload')),
  constraint broker_purge_steps_status check (status in ('pending','done','failed')),
  constraint broker_purge_steps_attempts check (attempts >= 0)
);

-- Durable inventory of every bucket write made for a document (P-R5-01..03): a writer registers the row BEFORE it
-- sends a byte (path = an object path, or a prefix ending in '/' for objects a port writes, e.g. F3 page images),
-- finishes it after confirmed success; purge / cron delete registered paths only for explicit purge intent.
-- Only explicit purge intent authorizes deletion. Uncertain pending writes are swept indefinitely;
-- completion plus a deletion completed after finished_at is required to reconcile.
create table if not exists public.broker_storage_writes (
  write_id      uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.broker_report_documents(document_id) on delete restrict,
  path          text not null,
  writer        text not null,
  status        text not null default 'pending',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  reconciled_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  deleted_at timestamptz,
  constraint broker_storage_writes_path check (length(path) between 1 and 512),
  constraint broker_storage_writes_writer check (writer in ('parse','extract','summary','translate','eval','f3')),
  constraint broker_storage_writes_status check (status in ('pending','done','reconciled','abandoned')),
  constraint broker_storage_writes_reconciled check ((status = 'reconciled') = (reconciled_at is not null)),
  constraint broker_storage_writes_finished check ((status in ('pending','abandoned') and finished_at is null) or (status in ('done','reconciled') and finished_at is not null)),
  constraint broker_storage_writes_deleted check (status <> 'reconciled' or (deleted_at is not null and deleted_at >= finished_at))
);
create index if not exists broker_storage_writes_status_idx on public.broker_storage_writes (status, started_at);
create index if not exists broker_storage_writes_unreconciled_idx on public.broker_storage_writes (next_attempt_at, write_id) where status in ('pending','done');
create index if not exists broker_storage_writes_document_idx on public.broker_storage_writes (document_id, status);

create table if not exists public.broker_report_access_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid references public.broker_report_documents(document_id) on delete restrict,
  user_id     uuid not null,
  action      text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  constraint broker_access_log_action check (action in ('upload','signed_url_issued','text_viewed','parse_run','extract_run','summary_run','unpublish','withdraw','purge','orphan_cleanup')),
  constraint broker_access_log_detail check (jsonb_typeof(detail) = 'object')
);
create index if not exists broker_access_log_document_idx on public.broker_report_access_log (document_id, created_at desc);
create index if not exists broker_access_log_created_idx on public.broker_report_access_log (created_at desc);

create table if not exists public.broker_outbox (
  event_id     uuid primary key default gen_random_uuid(),
  kind         text not null,
  payload      jsonb not null,
  status       text not null default 'pending',
  attempts     integer not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz,
  constraint broker_outbox_kind check (kind in ('claim.register','claim.revise','claim.retract','licence.changed','mapping.changed')),
  constraint broker_outbox_payload check (jsonb_typeof(payload) = 'object'),
  constraint broker_outbox_status check (status in ('pending','delivered','failed')),
  constraint broker_outbox_delivered check ((status = 'delivered') = (delivered_at is not null)),
  constraint broker_outbox_attempts check (attempts >= 0)
);
create unique index if not exists broker_outbox_claim_uniq on public.broker_outbox ((payload ->> 'claim_key'), (payload ->> 'claim_seq')) where kind in ('claim.register','claim.retract');
create index if not exists broker_outbox_pending_idx on public.broker_outbox (created_at, event_id) where status = 'pending';
create index if not exists broker_outbox_publication_idx on public.broker_outbox ((payload -> 'source' ->> 'publication_id')) where kind = 'claim.register';

-- ---------------------------------------------------------------- 4.12 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('broker-research', 'broker-research', false, 52428800, array['application/pdf','application/json','image/png'])
on conflict (id) do update
set public = false, name = excluded.name, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- triggers: shared
-- Generic append-only backstop (rule receipts, eval receipts, access log).
create or replace function public.broker_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'append_only:% rows are never updated or deleted', tg_table_name using errcode = '23514';
end $$;
drop trigger if exists broker_append_only on public.broker_report_rule_receipts;
create trigger broker_append_only before update or delete on public.broker_report_rule_receipts for each row execute function public.broker_append_only();
drop trigger if exists broker_append_only on public.broker_eval_receipts;
create trigger broker_append_only before update or delete on public.broker_eval_receipts for each row execute function public.broker_append_only();
drop trigger if exists broker_append_only on public.broker_report_access_log;
create trigger broker_append_only before update or delete on public.broker_report_access_log for each row execute function public.broker_append_only();

-- ---------------------------------------------------------------- triggers: licences (§4.1)
-- before: inserts start at version 1, unconfirmed; version is trigger-managed; a material change
-- (allows_*, snippet_max_chars, validity, terms_summary, licence_kind, holder) bumps the version
-- and clears the confirmation. after: a version bump drafts every approved snippet/summary of the
-- licence's reports (draft_reason='licence_version'), sets disclosure_ok=false on its non-withdrawn
-- reports (A2's report trigger turns that into claim.retract for published ones), and writes
-- outbox licence.changed.
create or replace function public.broker_licences_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_licences rows are never deleted' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    new.version := 1; new.confirmed_by := null; new.confirmed_at := null; new.confirmed_version := null;
    return new;
  end if;
  if new.licence_id <> old.licence_id or new.created_at <> old.created_at then raise exception 'licence_immutable'; end if;
  if new.version <> old.version then raise exception 'licence_version_managed'; end if;
  if (new.allows_llm_processing, new.allows_public_metadata, new.allows_public_snippets, new.allows_public_summary, new.allows_public_target_price,
      new.snippet_max_chars, new.valid_from, new.valid_to, new.terms_summary, new.licence_kind, new.holder)
     is distinct from
     (old.allows_llm_processing, old.allows_public_metadata, old.allows_public_snippets, old.allows_public_summary, old.allows_public_target_price,
      old.snippet_max_chars, old.valid_from, old.valid_to, old.terms_summary, old.licence_kind, old.holder) then
    new.version := old.version + 1;
    new.confirmed_by := null; new.confirmed_at := null; new.confirmed_version := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists licence_material_change on public.broker_report_licences;
create trigger licence_material_change before insert or update or delete on public.broker_report_licences
  for each row execute function public.broker_licences_version();

create or replace function public.broker_licences_after_change() returns trigger
language plpgsql set search_path = public as $$
declare v_event uuid := gen_random_uuid();
begin
  if new.version = old.version then return null; end if;
  update public.broker_report_snippets s set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'licence_version'
  from public.broker_research_reports r join public.broker_report_documents d on d.document_id = r.document_id
  where s.report_id = r.report_id and d.licence_id = new.licence_id and s.status = 'approved';
  update public.broker_report_summaries s set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'licence_version'
  from public.broker_research_reports r join public.broker_report_documents d on d.document_id = r.document_id
  where s.report_id = r.report_id and d.licence_id = new.licence_id and s.status = 'approved';
  update public.broker_research_reports r set disclosure_ok = false
  from public.broker_report_documents d
  where d.document_id = r.document_id and d.licence_id = new.licence_id and r.status <> 'withdrawn' and r.disclosure_ok;
  insert into public.broker_outbox (event_id, kind, payload)
  values (v_event, 'licence.changed', jsonb_build_object('event_id', v_event, 'kind', 'licence.changed', 'licence_id', new.licence_id, 'version', new.version, 'previous_version', old.version));
  return null;
end $$;
drop trigger if exists licence_material_change_after on public.broker_report_licences;
create trigger licence_material_change_after after update on public.broker_report_licences
  for each row execute function public.broker_licences_after_change();

-- ---------------------------------------------------------------- triggers: intents, documents, runs (§4.2, §4.3, §6.1)
create or replace function public.broker_intents_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_upload_intents rows are never deleted' using errcode = '23514'; end if;
  if (new.intent_id, new.sha256, new.byte_size, new.licence_id, new.original_filename, new.created_by, new.created_at, new.expires_at, new.staging_path)
     is distinct from (old.intent_id, old.sha256, old.byte_size, old.licence_id, old.original_filename, old.created_by, old.created_at, old.expires_at, old.staging_path) then
    raise exception 'intent_immutable';
  end if;
  if old.document_id is not null and new.document_id is distinct from old.document_id then raise exception 'intent_document_set_once'; end if;
  if new.status <> old.status then
    if not ((old.status, new.status) in (('open','validating'),('open','expired'),('open','abandoned'),
            ('validating','open'),   -- staging bytes not there yet: back to open, retryable intent_not_uploaded (C3)
            ('validating','validated'),('validating','abandoned'),('validating','expired'),
            ('validated','promoting'),('validated','abandoned'),('validated','expired'),
            ('promoting','committed'),('promoting','abandoned'))) then
      raise exception 'intent_transition_invalid:%->%', old.status, new.status;
    end if;
    new.checkpoint_at := now();
  end if;
  return new;
end $$;
drop trigger if exists broker_intents_lifecycle on public.broker_report_upload_intents;
create trigger broker_intents_lifecycle before update or delete on public.broker_report_upload_intents
  for each row execute function public.broker_intents_lifecycle();

create or replace function public.broker_documents_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_documents rows are never deleted' using errcode = '23514'; end if;
  if (new.document_id, new.sha256, new.storage_path, new.byte_size, new.licence_id, new.uploaded_by, new.uploaded_at, new.original_filename)
     is distinct from (old.document_id, old.sha256, old.storage_path, old.byte_size, old.licence_id, old.uploaded_by, old.uploaded_at, old.original_filename) then
    raise exception 'document_immutable';
  end if;
  if new.promotion_pending and not old.promotion_pending then raise exception 'document_promotion_pending_only_clears'; end if;
  if old.purged_at is not null and new.purged_at is distinct from old.purged_at then raise exception 'document_purged'; end if;
  if new.status <> old.status then
    if old.status = 'withdrawn' then
      if not (new.status = 'uploaded' and old.withdrawn_reason = 'promotion_lost' and old.purged_at is null) then
        raise exception 'document_transition_invalid:%->%', old.status, new.status;
      end if;
    elsif new.status <> 'withdrawn' and not ((old.status, new.status) in (('uploaded','parsing'),('parse_failed','parsing'),('parsed','parsing'),('parsing','parsed'),('parsing','parse_failed'))) then
      raise exception 'document_transition_invalid:%->%', old.status, new.status;
    end if;
  end if;
  if new.status = 'parsed' and new.current_parse_run_id is null then raise exception 'document_parse_run_required'; end if;
  if new.current_parse_run_id is distinct from old.current_parse_run_id and new.current_parse_run_id is not null
     and not exists (select 1 from public.broker_report_runs r where r.run_id = new.current_parse_run_id and r.document_id = new.document_id and r.kind = 'parse' and r.status = 'succeeded') then
    raise exception 'document_parse_run_invalid';
  end if;
  return new;
end $$;
drop trigger if exists broker_documents_lifecycle on public.broker_report_documents;
create trigger broker_documents_lifecycle before update or delete on public.broker_report_documents
  for each row execute function public.broker_documents_lifecycle();

create or replace function public.broker_runs_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['status','finished_at','detail','artifact_path','artifact_hash','request_path','response_path','extractor_version'];
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_runs rows are never deleted' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'running' or new.finished_at is not null then raise exception 'append_only:runs are inserted running' using errcode = '23514'; end if;
    return new;
  end if;
  if old.status <> 'running' then raise exception 'append_only:run % is already finished', old.run_id using errcode = '23514'; end if;
  if new.status = 'running' then raise exception 'append_only:a run update must finish the run' using errcode = '23514'; end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then raise exception 'append_only:runs allow only the finishing columns to change' using errcode = '23514'; end if;
  if old.extractor_version is not null and new.extractor_version is distinct from old.extractor_version then raise exception 'extractor_version_immutable'; end if;
  new.finished_at := now();
  return new;
end $$;
drop trigger if exists broker_runs_lifecycle on public.broker_report_runs;
create trigger broker_runs_lifecycle before insert or update or delete on public.broker_report_runs
  for each row execute function public.broker_runs_lifecycle();

-- ---------------------------------------------------------------- triggers: reports (§4.4 broker_reports_guard)
-- Insert as draft only. draft→published only under set_config('broker.publishing', report_id)
-- (broker_report_publish) and only status/current_publication_id/title_restricted change;
-- published→published only updated_at/evidence_ok/disclosure_ok/supersedes_report_id;
-- published→draft only under 'broker.unpublishing' (status, revision+1, current_publication_id,
-- review_status); →withdrawn only under 'broker.withdrawing' (the document cascade); withdrawn is
-- terminal; draft→draft never touches revision/current_publication_id/document_id/created_at.
create or replace function public.broker_reports_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  k_pub   text[] := array['status','current_publication_id','updated_at','title_restricted'];
  k_live  text[] := array['updated_at','evidence_ok','disclosure_ok','supersedes_report_id'];
  k_unpub text[] := array['status','revision','current_publication_id','review_status','updated_at'];
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_research_reports rows are never deleted' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.current_publication_id is not null or new.revision <> 1 then raise exception 'publish_direct_forbidden:insert'; end if;
    return new;
  end if;
  new.updated_at := now();
  if old.status = 'withdrawn' then
    if (to_jsonb(new) - 'updated_at') <> (to_jsonb(old) - 'updated_at') then raise exception 'report_withdrawn'; end if;
    return new;
  end if;
  if new.status = 'withdrawn' then
    if current_setting('broker.withdrawing', true) is distinct from new.report_id::text
       or (to_jsonb(new) - array['status','updated_at']) <> (to_jsonb(old) - array['status','updated_at']) then
      raise exception 'withdraw_direct_forbidden';
    end if;
    return new;
  end if;
  if old.status = 'draft' and new.status = 'published' then
    if current_setting('broker.publishing', true) is distinct from new.report_id::text then raise exception 'publish_direct_forbidden'; end if;
    if (to_jsonb(new) - k_pub) <> (to_jsonb(old) - k_pub) or new.current_publication_id is null then raise exception 'publish_direct_forbidden:columns'; end if;
    return new;
  end if;
  if old.status = 'published' and new.status = 'published' then
    if (to_jsonb(new) - k_live) <> (to_jsonb(old) - k_live) then raise exception 'published_immutable'; end if;
    return new;
  end if;
  if old.status = 'published' and new.status = 'draft' then
    if current_setting('broker.unpublishing', true) is distinct from new.report_id::text then raise exception 'unpublish_direct_forbidden'; end if;
    if new.revision <> old.revision + 1 or (to_jsonb(new) - k_unpub) <> (to_jsonb(old) - k_unpub) then raise exception 'unpublish_direct_forbidden:columns'; end if;
    return new;
  end if;
  if new.revision <> old.revision or new.current_publication_id is distinct from old.current_publication_id
     or new.document_id <> old.document_id or new.created_at <> old.created_at then
    raise exception 'report_column_managed';
  end if;
  return new;
end $$;
drop trigger if exists broker_reports_guard on public.broker_research_reports;
create trigger broker_reports_guard before insert or update or delete on public.broker_research_reports
  for each row execute function public.broker_reports_guard();

-- ---------------------------------------------------------------- triggers: child tables (§4.4, §4.6, §4.9)
-- A published report freezes targets, overrides, fields, snippets, summaries and analyst bindings;
-- the one exception is a snippet/summary falling back to draft|rejected (only status, approved_*,
-- draft_reason change). Fields, snippets and summaries are never deleted. Field identity and
-- extracted values are immutable; status moves: never into 'extracted', never into 'absent', an
-- absent row may only become rejected; superseded_by_run_id is set once. Analyst bindings must
-- point at an 'analyst' row of the same report.
create or replace function public.broker_report_child_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  v_report uuid; v_status text;
  k_fall  text[] := array['status','approved_by','approved_at','draft_reason'];
  k_field text[] := array['status','corrected','reviewed_by','reviewed_at','superseded_by_run_id','detail','page','char_start','char_end','value_source_text'];
begin
  if tg_op = 'DELETE' then v_report := old.report_id; else v_report := new.report_id; end if;
  if tg_op = 'UPDATE' and new.report_id <> old.report_id then raise exception 'child_report_immutable'; end if;
  if tg_op = 'DELETE' and tg_table_name in ('broker_report_fields','broker_report_snippets','broker_report_summaries') then
    raise exception 'append_only:% rows are never deleted', tg_table_name using errcode = '23514';
  end if;
  -- Parent row lock first (same order as broker_lock_draft / broker_report_publish: report, then children), so a
  -- child write cannot interleave with a publication in progress: it waits, then sees 'published' (P-R1-03).
  select r.status into v_status from public.broker_research_reports r where r.report_id = v_report for update;
  if v_status = 'published' then
    -- Table-specific columns only inside table-specific branches: PL/pgSQL resolves record fields when it
    -- prepares an expression, so new.status must not appear in a condition evaluated for targets (P-R1-02).
    if tg_op = 'UPDATE' and tg_table_name in ('broker_report_snippets','broker_report_summaries') then
      if new.status in ('draft','rejected') and (to_jsonb(new) - k_fall) = (to_jsonb(old) - k_fall) then
        return new;
      end if;
    end if;
    raise exception 'published_immutable:%', tg_table_name;
  end if;
  if tg_table_name = 'broker_report_fields' then
    if tg_op = 'UPDATE' then
      if (to_jsonb(new) - k_field) <> (to_jsonb(old) - k_field) then raise exception 'field_immutable'; end if;
      if old.superseded_by_run_id is not null and new.superseded_by_run_id is distinct from old.superseded_by_run_id then raise exception 'field_superseded_once'; end if;
      if new.status <> old.status then
        if new.status in ('extracted','absent') or (old.status = 'absent' and new.status <> 'rejected') then
          raise exception 'field_transition_invalid:%->%', old.status, new.status;
        end if;
      end if;
    end if;
  elsif tg_table_name = 'broker_report_analysts' then
    if tg_op <> 'DELETE' then
      if not exists (select 1 from public.broker_report_fields f where f.field_id = new.field_id and f.report_id = new.report_id and f.field = 'analyst') then
        raise exception 'analyst_field_mismatch';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['broker_report_targets','broker_report_target_overrides','broker_report_fields','broker_report_snippets','broker_report_summaries','broker_report_analysts'] loop
    execute format('drop trigger if exists broker_report_child_guard on public.%I', t);
    execute format('create trigger broker_report_child_guard before insert or update or delete on public.%I for each row execute function public.broker_report_child_guard()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- triggers: publications (§4.8)
create or replace function public.broker_publications_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_report_publications rows are never deleted' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    if current_setting('broker.publishing', true) is distinct from new.report_id::text then raise exception 'publish_direct_forbidden:publication'; end if;
    if new.unpublished_at is not null then raise exception 'publish_direct_forbidden:publication'; end if;
    return new;
  end if;
  if old.unpublished_at is not null or new.unpublished_at is null
     or (to_jsonb(new) - array['unpublished_at','unpublish_reason']) <> (to_jsonb(old) - array['unpublished_at','unpublish_reason']) then
    raise exception 'append_only:publications are immutable except one unpublished_at' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists broker_publications_guard on public.broker_report_publications;
create trigger broker_publications_guard before insert or update or delete on public.broker_report_publications
  for each row execute function public.broker_publications_guard();

-- ---------------------------------------------------------------- triggers: entities (§4.9)
create or replace function public.broker_rating_scales_close_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:research_rating_scales rows are never deleted' using errcode = '23514'; end if;
  if old.valid_to is not null then raise exception 'scale_closed'; end if;
  if new.valid_to is null or (to_jsonb(new) - array['valid_to','closed_by','closed_at']) <> (to_jsonb(old) - array['valid_to','closed_by','closed_at']) then
    raise exception 'scale_close_only';
  end if;
  if new.closed_by is null then raise exception 'scale_closed_by_required'; end if;
  new.closed_at := now();
  return new;
end $$;
drop trigger if exists broker_rating_scales_close_only on public.research_rating_scales;
create trigger broker_rating_scales_close_only before update or delete on public.research_rating_scales
  for each row execute function public.broker_rating_scales_close_only();

create or replace function public.broker_analysts_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:research_analysts rows are never deleted' using errcode = '23514'; end if;
  if new.analyst_id <> old.analyst_id or new.institution_id <> old.institution_id or new.created_at <> old.created_at then raise exception 'analyst_immutable'; end if;
  return new;
end $$;
drop trigger if exists broker_analysts_guard on public.research_analysts;
create trigger broker_analysts_guard before update or delete on public.research_analysts
  for each row execute function public.broker_analysts_guard();

create or replace function public.broker_analyst_disclosure_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.public_display, new.display_name, new.name_variants) is not distinct from (old.public_display, old.display_name, old.name_variants) then return null; end if;
  update public.broker_research_reports r set disclosure_ok = false
  where r.report_id in (select a.report_id from public.broker_report_analysts a where a.analyst_id = new.analyst_id) and r.status <> 'withdrawn' and r.disclosure_ok;
  update public.broker_report_snippets s set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'analyst_disclosure'
  where s.status = 'approved' and s.report_id in (select a.report_id from public.broker_report_analysts a where a.analyst_id = new.analyst_id);
  update public.broker_report_summaries s set status = 'draft', approved_by = null, approved_at = null, draft_reason = 'analyst_disclosure'
  where s.status = 'approved' and s.report_id in (select a.report_id from public.broker_report_analysts a where a.analyst_id = new.analyst_id);
  return null;
end $$;
drop trigger if exists analyst_disclosure_change on public.research_analysts;
create trigger analyst_disclosure_change after update of public_display, display_name, name_variants on public.research_analysts
  for each row execute function public.broker_analyst_disclosure_change();

-- ---------------------------------------------------------------- triggers: outbox (§4.10)
create or replace function public.broker_outbox_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:broker_outbox rows are never deleted' using errcode = '23514'; end if;
  if (new.event_id, new.kind, new.payload, new.created_at) is distinct from (old.event_id, old.kind, old.payload, old.created_at) then
    raise exception 'append_only:outbox events change only status, attempts, last_error, delivered_at' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists broker_outbox_guard on public.broker_outbox;
create trigger broker_outbox_guard before update or delete on public.broker_outbox
  for each row execute function public.broker_outbox_guard();

-- ---------------------------------------------------------------- 4.13 table privileges
-- RLS on, no policies: service_role (bypassrls) is the only reader/writer; anon/authenticated get
-- nothing (Supabase grants ALL on new public tables by default and RLS does not stop TRUNCATE).
-- settings has no insert/delete (singleton row created above).
do $$ declare t text; begin
  foreach t in array array['broker_research_settings','broker_report_licences','broker_report_upload_intents','broker_report_documents','broker_report_runs',
    'broker_research_reports','broker_report_targets','broker_report_target_overrides','broker_report_fields','broker_report_snippets','broker_report_summaries',
    'broker_report_publications','broker_report_rule_receipts','broker_purge_steps','research_institutions','research_rating_scales','research_analysts',
    'broker_report_analysts','broker_report_access_log','broker_eval_receipts','broker_outbox','broker_storage_writes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    if t = 'broker_research_settings' then
      execute format('grant select, update on public.%I to service_role', t);
    else
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
    end if;
  end loop;
end $$;
-- ---------------------------------------------------------------- §4.13 function privileges (P-R1-05)
-- No client role may EXECUTE any function of this module, trigger functions included (Supabase grants
-- EXECUTE to anon/authenticated on new functions by default). Service-role grants made above stay.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'broker\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
