-- supabase/migrations/20261108090000_disclosure_documents.sql
-- F3-0 (document pipeline spec §4.1–§4.8, §4.10, §4.12): the global disclosure document library.
-- disclosure_documents (one row per (source, source_ref, source_version)), its assets, immutable
-- extraction versions with their pages, code-point citations, extraction candidates with their
-- publication links, extraction approvals and the per-issuer document sync scope (schedule, lease,
-- cursors). Write path: NO role inserts/updates/deletes these tables directly — service_role
-- included — except extraction_approvals (service_role insert + update(revoked_at)); every other
-- change goes through the security definer functions below, each of which states its lock and its
-- authority (lease / row lock / admin route). Functions that read financial_facts belong to
-- migration two (20261108091000_fact_citations.sql), which also replaces the document_citations
-- read policy with the fact-linked one.
-- Errors carry the code as the first word of the message: lease_lost (55P03); not_eligible,
-- revision_exists, approval_revoked, not_publishable, decided, already_staged (P0001);
-- not_found (P0002); invalid_citation, invalid_input (22023). Triggers refuse with 23514,
-- prefix `append_only:`.
-- Offsets are Unicode code points: length()/substr() on a UTF8 database (the local harness is
-- initialised with --encoding=UTF8, like hosted Supabase).
-- The hosted `postgres` role is not a superuser: functions keep the migration role as owner,
-- `set search_path = public`, and qualify every relation. Replayable: guarded creates, create or
-- replace, drop-then-create policies/triggers/constraints, insert … on conflict for the bucket.
-- Only storage.buckets is referenced (local harness).

-- ---------------------------------------------------------------- 4.1 disclosure_documents
create table if not exists public.disclosure_documents (
  document_id            uuid primary key,
  issuer_id              uuid references public.issuers(issuer_id) on delete restrict,
  source                 text not null check (source in ('edgar','cninfo','hkexnews','upload')),
  market                 text not null check (market in ('US','CN','HK','other')),
  source_ref             text not null check (length(source_ref) between 1 and 512),
  source_version         int not null check (source_version >= 1),
  supersedes_document_id uuid references public.disclosure_documents(document_id) on delete restrict,
  observed_replacement   boolean not null default false,
  form_type              text,
  doc_class              text not null check (doc_class in ('annual_report','interim_report','quarterly_report','results_announcement','current_report','registration','proxy','ownership','other')),
  classifier_gen         int not null check (classifier_gen >= 0),
  title                  text not null,
  language               text check (language in ('zh','en')),
  source_url             text,
  content_sha256         text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  bytes                  bigint not null check (bytes > 0),
  mime                   text not null check (mime in ('application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json')),
  storage_path           text not null,
  acquisition            jsonb not null check (jsonb_typeof(acquisition) = 'object'),
  published_at           timestamptz not null,
  published_at_precision text not null check (published_at_precision in ('instant','date')),
  available_at           timestamptz not null,
  available_date         date not null,
  fiscal_year            int,
  fiscal_period          text check (fiscal_period in ('FY','H1','Q1','Q3')),
  period_end             date,
  filing_source_ref      text,
  permission             text not null check (permission in ('public','licensed','private')),
  owner_user_id          uuid references auth.users(id) on delete restrict,
  license_ref            text,
  status                 text not null default 'stored' check (status in ('stored','extracted','no_text_layer','extract_failed')),
  current_extraction_id  uuid,
  extract_lease_until    timestamptz,
  extract_lease_batch_id uuid references public.ingest_batches(batch_id) on delete set null,
  extract_attempts       int not null default 0 check (extract_attempts >= 0),
  batch_id               uuid not null references public.ingest_batches(batch_id) on delete restrict,
  code_version           text not null,
  created_at             timestamptz not null default now(),
  constraint dd_owner_iff_private check ((permission = 'public') = (owner_user_id is null)),
  constraint dd_issuer_required check (permission <> 'public' or issuer_id is not null),
  constraint dd_upload_shape check ((source = 'upload') = (source_url is null)),
  constraint dd_extracted_fields check (status not in ('extracted','no_text_layer') or current_extraction_id is not null),
  constraint dd_replacement_version check (observed_replacement = false or source_version > 1),
  constraint disclosure_documents_version_uniq unique (source, source_ref, source_version),
  constraint disclosure_documents_content_uniq unique (source, source_ref, content_sha256)
);
create index if not exists disclosure_documents_asof_idx on public.disclosure_documents(issuer_id, available_date, source, source_ref, source_version desc);
create index if not exists disclosure_documents_class_idx on public.disclosure_documents(issuer_id, doc_class, period_end desc);
create index if not exists disclosure_documents_stored_idx on public.disclosure_documents(status, created_at) where status = 'stored';
create index if not exists disclosure_documents_sha_idx on public.disclosure_documents(content_sha256);
create index if not exists disclosure_documents_owner_idx on public.disclosure_documents(owner_user_id) where owner_user_id is not null;

-- ---------------------------------------------------------------- 4.2 document_assets
create table if not exists public.document_assets (
  asset_id        uuid primary key,
  document_id     uuid not null references public.disclosure_documents(document_id) on delete restrict,
  role            text not null check (role in ('filing_index','xbrl_instance','exhibit')),
  filename        text not null check (length(filename) between 1 and 512),
  source_url      text not null,
  content_sha256  text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  bytes           bigint not null check (bytes > 0),
  mime            text not null,
  storage_path    text not null,
  acquisition     jsonb not null check (jsonb_typeof(acquisition) = 'object'),
  created_at      timestamptz not null default now(),
  constraint document_assets_role_file_uniq unique (document_id, role, filename)
);

-- ---------------------------------------------------------------- 4.3 document_extractions
create table if not exists public.document_extractions (
  extraction_id       uuid primary key,
  document_id         uuid not null references public.disclosure_documents(document_id) on delete restrict,
  extractor_version   text not null check (length(extractor_version) between 1 and 64),
  table_algo_version  text not null check (length(table_algo_version) between 1 and 64),
  code_version        text not null,
  has_text_layer      boolean not null,
  page_count          int not null check (page_count >= 0),
  pages_json_path     text not null,
  pages_json_sha256   text not null check (pages_json_sha256 ~ '^[0-9a-f]{64}$'),
  candidates_role     text not null check (candidates_role in ('none','primary','comparison')),
  candidates_status   text not null default 'n/a' check (candidates_status in ('n/a','pending','done','failed','exhausted')),
  candidates_attempts int not null default 0 check (candidates_attempts >= 0),
  candidates_lease_until    timestamptz,
  candidates_lease_batch_id uuid references public.ingest_batches(batch_id) on delete set null,
  batch_id            uuid not null references public.ingest_batches(batch_id) on delete restrict,
  created_at          timestamptz not null default now(),
  constraint document_extractions_version_uniq unique (document_id, extractor_version, table_algo_version),
  constraint document_extractions_doc_uniq unique (document_id, extraction_id),
  constraint de_role_status check ((candidates_role = 'none') = (candidates_status = 'n/a'))
);
alter table public.disclosure_documents drop constraint if exists dd_current_extraction_fkey;
alter table public.disclosure_documents add constraint dd_current_extraction_fkey
  foreign key (document_id, current_extraction_id) references public.document_extractions(document_id, extraction_id);

-- ---------------------------------------------------------------- 4.4 document_pages
create table if not exists public.document_pages (
  extraction_id uuid not null references public.document_extractions(extraction_id) on delete restrict,
  page_no       int not null check (page_no >= 1),
  text          text not null,
  text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  char_count    int not null check (char_count >= 0),
  width         numeric,
  height        numeric,
  line_count    int not null check (line_count >= 0),
  has_tables    boolean not null default false,
  primary key (extraction_id, page_no)
);

-- ---------------------------------------------------------------- 4.5 document_citations
create table if not exists public.document_citations (
  citation_id   uuid primary key,
  document_id   uuid not null references public.disclosure_documents(document_id) on delete restrict,
  extraction_id uuid not null,
  page_no       int not null,
  char_start    int not null check (char_start >= 0),
  char_end      int not null,
  bbox          jsonb check (bbox is null or jsonb_typeof(bbox) = 'object'),
  snippet       text not null,
  text_hash     text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  visibility    text not null default 'internal' check (visibility in ('internal','public')),
  created_by    text not null check (created_by in ('extractor','human','llm','module')),
  created_ref   text not null check (length(created_ref) between 1 and 256),
  created_at    timestamptz not null default now(),
  constraint document_citations_range check (char_end > char_start),
  constraint document_citations_page_fkey foreign key (extraction_id, page_no) references public.document_pages(extraction_id, page_no) on delete restrict,
  constraint document_citations_extraction_fkey foreign key (document_id, extraction_id) references public.document_extractions(document_id, extraction_id) on delete restrict
);
create index if not exists document_citations_page_idx on public.document_citations(document_id, page_no);
create index if not exists document_citations_extraction_idx on public.document_citations(extraction_id);

-- ---------------------------------------------------------------- 4.7 extraction_approvals (before candidates: approval_id references it)
create table if not exists public.extraction_approvals (
  approval_id        uuid primary key default gen_random_uuid(),
  extractor_ref      text not null check (length(extractor_ref) between 1 and 128),
  extractor_version  text not null,
  table_algo_version text not null,
  code_version       text not null,
  concepts           text[] not null,
  gold_sha256        text not null check (gold_sha256 ~ '^[0-9a-f]{64}$'),
  precision          numeric not null check (precision between 0 and 1),
  recall             numeric not null check (recall between 0 and 1),
  report_path        text not null,
  approved_by        uuid not null references auth.users(id),
  approved_at        timestamptz not null default now(),
  revoked_at         timestamptz,
  constraint ea_threshold check (precision >= 0.95 and recall >= 0.95)
);
create index if not exists extraction_approvals_ref_idx on public.extraction_approvals(extractor_ref, approved_at desc);

-- ---------------------------------------------------------------- 4.6 extraction_candidates, candidate_publications
create table if not exists public.extraction_candidates (
  candidate_id     uuid primary key,
  document_id      uuid not null,
  extraction_id    uuid not null,
  kind             text not null check (kind in ('financial_fact','table_cell','field')),
  extractor_kind   text not null check (extractor_kind in ('rule','llm')),
  extractor_ref    text not null check (length(extractor_ref) between 1 and 128),
  natural_key      text not null check (length(natural_key) between 1 and 512),
  citations        jsonb not null check (jsonb_typeof(citations) = 'object'),
  payload          jsonb not null check (jsonb_typeof(payload) = 'object'),
  fingerprint      text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  checks           jsonb not null default '[]' check (jsonb_typeof(checks) = 'array'),
  checks_passed    boolean not null default false,
  status           text not null default 'candidate' check (status in ('candidate','confirmed','rejected','promoted')),
  decision_kind    text check (decision_kind in ('human','auto')),
  decided_by       uuid references auth.users(id),
  approval_id      uuid references public.extraction_approvals(approval_id),
  decided_at       timestamptz,
  inherited_from   uuid references public.extraction_candidates(candidate_id),
  input_snapshot   jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  batch_id         uuid not null references public.ingest_batches(batch_id) on delete restrict,
  created_at       timestamptz not null default now(),
  constraint extraction_candidates_extraction_fkey foreign key (document_id, extraction_id) references public.document_extractions(document_id, extraction_id) on delete restrict,
  -- F3 review fix: NULL-safe (a NULL decision_kind must not make the CHECK evaluate to NULL and pass)
  constraint ec_decision_shape check (coalesce(
    (status = 'candidate' and decision_kind is null and decided_by is null and approval_id is null and decided_at is null)
    or (status in ('confirmed','rejected','promoted') and decided_at is not null and
        ((decision_kind = 'human' and decided_by is not null and approval_id is null)
         or (decision_kind = 'auto' and decided_by is null and approval_id is not null and inherited_from is null and status <> 'rejected'))), false)),
  constraint extraction_candidates_key_uniq unique (extraction_id, kind, extractor_ref, natural_key)
);
create index if not exists extraction_candidates_doc_status_idx on public.extraction_candidates(document_id, status);
create index if not exists extraction_candidates_open_idx on public.extraction_candidates(status, created_at) where status in ('candidate','confirmed');
create index if not exists extraction_candidates_fingerprint_idx on public.extraction_candidates(document_id, fingerprint);

create table if not exists public.candidate_publications (
  candidate_id   uuid not null references public.extraction_candidates(candidate_id) on delete restrict,
  pub_gen        int not null check (pub_gen >= 1),
  run_id         uuid not null,
  fact_id        uuid not null,
  state          text not null check (state in ('staged','published','abandoned')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (candidate_id, pub_gen)
);
create index if not exists candidate_publications_run_idx on public.candidate_publications(run_id);

-- ---------------------------------------------------------------- 4.7 document_sync_scope
create table if not exists public.document_sync_scope (
  issuer_id        uuid not null references public.issuers(issuer_id) on delete cascade,
  source           text not null check (source in ('edgar','cninfo','hkexnews')),
  reasons          jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array'),
  priority         int not null default 0 check (priority >= 0),
  fetch_key        text not null check (length(fetch_key) between 1 and 64),
  backfill_cursor  jsonb not null default '{}' check (jsonb_typeof(backfill_cursor) = 'object'),
  backfill_done    boolean not null default false,
  poll_cursor      jsonb not null default '{}' check (jsonb_typeof(poll_cursor) = 'object'),
  next_due_at      timestamptz not null default now(),
  lease_until      timestamptz,
  lease_batch_id   uuid references public.ingest_batches(batch_id) on delete set null,
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  last_status      text check (last_status in ('success','failed')),
  updated_at       timestamptz not null default now(),
  primary key (issuer_id, source)
);
create index if not exists document_sync_scope_due_idx on public.document_sync_scope(source, next_due_at, priority desc, issuer_id) where priority > 0;

-- ---------------------------------------------------------------- public view (§4.1)
create or replace view public.disclosure_documents_public with (security_invoker = true) as
select document_id, issuer_id, source, market, source_ref, source_version, supersedes_document_id, observed_replacement,
       form_type, doc_class, classifier_gen, title, language, source_url, content_sha256, bytes, mime, storage_path,
       published_at, published_at_precision, available_at, available_date, fiscal_year, fiscal_period, period_end,
       filing_source_ref, permission, status, current_extraction_id, batch_id, code_version, created_at
from public.disclosure_documents
where permission = 'public';

-- ---------------------------------------------------------------- 4.10 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disclosure-docs', 'disclosure-docs', false, 52428800,
        array['application/pdf','text/html','application/xhtml+xml','application/xml','text/xml','application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- triggers (backstops for the function write path)
-- disclosure_documents: only the processing/classification columns change; status moves
-- stored → extracted|no_text_layer|extract_failed and back to stored (request_document_extract);
-- never deleted. The table has no generated column, so the to_jsonb comparison is exact.
create or replace function public.disclosure_documents_limited_update() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['status','current_extraction_id','extract_lease_until','extract_lease_batch_id','extract_attempts','doc_class','classifier_gen','fiscal_year','fiscal_period','period_end','filing_source_ref'];
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: disclosure_documents rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: disclosure_documents allows processing and classification changes only' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in
     (('stored','extracted'), ('stored','no_text_layer'), ('stored','extract_failed'),
      ('extracted','stored'), ('no_text_layer','stored'), ('extract_failed','stored'))) then
    raise exception 'append_only: disclosure_documents status % -> % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.disclosure_documents_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists disclosure_documents_limited_update on public.disclosure_documents;
create trigger disclosure_documents_limited_update before update or delete on public.disclosure_documents
  for each row execute function public.disclosure_documents_limited_update();

-- document_assets and document_pages: immutable.
create or replace function public.document_rows_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'append_only: % rows are immutable', tg_table_name using errcode = '23514';
end $$;
revoke execute on function public.document_rows_immutable() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists document_assets_immutable on public.document_assets;
create trigger document_assets_immutable before update or delete on public.document_assets
  for each row execute function public.document_rows_immutable();
drop trigger if exists document_pages_immutable on public.document_pages;
create trigger document_pages_immutable before update or delete on public.document_pages
  for each row execute function public.document_rows_immutable();

-- document_extractions: only the candidates scheduling columns change; never deleted.
create or replace function public.document_extractions_limited_update() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['candidates_status','candidates_attempts','candidates_lease_until','candidates_lease_batch_id'];
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: document_extractions rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: document_extractions allows candidates scheduling changes only' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.document_extractions_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists document_extractions_limited_update on public.document_extractions;
create trigger document_extractions_limited_update before update or delete on public.document_extractions
  for each row execute function public.document_extractions_limited_update();

-- document_citations: visibility internal → public only, only for human/module citations; never deleted.
create or replace function public.document_citations_limited_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: document_citations rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'visibility') <> (to_jsonb(old) - 'visibility') then
    raise exception 'append_only: document_citations allows visibility changes only' using errcode = '23514';
  end if;
  if new.visibility is distinct from old.visibility
     and not (old.visibility = 'internal' and new.visibility = 'public' and old.created_by in ('human','module')) then
    raise exception 'append_only: document_citations visibility % -> % is not allowed for %', old.visibility, new.visibility, old.created_by using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.document_citations_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists document_citations_limited_update on public.document_citations;
create trigger document_citations_limited_update before update or delete on public.document_citations
  for each row execute function public.document_citations_limited_update();

-- extraction_candidates: the identity, citations, payload and snapshot never change; checks only
-- while the row is a candidate; status moves candidate→confirmed|rejected, confirmed→candidate|promoted;
-- never deleted.
create or replace function public.extraction_candidates_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['checks','checks_passed','status','decision_kind','decided_by','approval_id','decided_at','inherited_from'];
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: extraction_candidates rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: extraction_candidates allows checks and decision changes only' using errcode = '23514';
  end if;
  if old.status <> 'candidate' and (new.checks, new.checks_passed) is distinct from (old.checks, old.checks_passed) then
    raise exception 'append_only: extraction_candidates checks are frozen once decided' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in
     (('candidate','confirmed'), ('candidate','rejected'), ('confirmed','candidate'), ('confirmed','promoted'))) then
    raise exception 'append_only: extraction_candidates status % -> % is not allowed', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.extraction_candidates_lifecycle() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists extraction_candidates_lifecycle on public.extraction_candidates;
create trigger extraction_candidates_lifecycle before update or delete on public.extraction_candidates
  for each row execute function public.extraction_candidates_lifecycle();

-- candidate_publications: staged→published|abandoned, abandoned→staged (new run_id/fact_id);
-- run_id/fact_id change only on abandoned→staged; never deleted.
create or replace function public.candidate_publications_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: candidate_publications rows are never deleted' using errcode = '23514';
  end if;
  if (new.candidate_id, new.pub_gen, new.created_at) is distinct from (old.candidate_id, old.pub_gen, old.created_at) then
    raise exception 'append_only: candidate_publications identity is immutable' using errcode = '23514';
  end if;
  if new.state is distinct from old.state and not ((old.state, new.state) in (('staged','published'), ('staged','abandoned'), ('abandoned','staged'))) then
    raise exception 'append_only: candidate_publications state % -> % is not allowed', old.state, new.state using errcode = '23514';
  end if;
  if (new.run_id, new.fact_id) is distinct from (old.run_id, old.fact_id) and not (old.state = 'abandoned' and new.state = 'staged') then
    raise exception 'append_only: candidate_publications run/fact change only when re-staging an abandoned row' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.candidate_publications_lifecycle() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists candidate_publications_lifecycle on public.candidate_publications;
create trigger candidate_publications_lifecycle before update or delete on public.candidate_publications
  for each row execute function public.candidate_publications_lifecycle();

-- extraction_approvals: only revoked_at, once (null → timestamp); never deleted.
create or replace function public.extraction_approvals_limited_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: extraction_approvals rows are never deleted' using errcode = '23514';
  end if;
  if (to_jsonb(new) - 'revoked_at') <> (to_jsonb(old) - 'revoked_at') then
    raise exception 'append_only: extraction_approvals allows revocation only' using errcode = '23514';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'append_only: extraction_approvals revocation is final' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.extraction_approvals_limited_update() from public, anon, authenticated, service_role;   -- trigger-only (P2-3)
drop trigger if exists extraction_approvals_limited_update on public.extraction_approvals;
create trigger extraction_approvals_limited_update before update or delete on public.extraction_approvals
  for each row execute function public.extraction_approvals_limited_update();

-- ---------------------------------------------------------------- internal helpers (no client role may execute)
-- Locks the scope row and verifies the sync lease (lease_batch_id = p_batch, unexpired).
create or replace function public.doc_scope_lock(p_issuer uuid, p_source text, p_batch uuid)
returns public.document_sync_scope language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found or s.lease_batch_id is distinct from p_batch or s.lease_until is null or s.lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return s;
end $$;
revoke execute on function public.doc_scope_lock(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Locks the document row and verifies the extract lease.
create or replace function public.doc_extract_lock(p_document uuid, p_batch uuid)
returns public.disclosure_documents language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  select * into d from public.disclosure_documents where document_id = p_document for no key update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.extract_lease_batch_id is distinct from p_batch or d.extract_lease_until is null or d.extract_lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return d;
end $$;
revoke execute on function public.doc_extract_lock(uuid, uuid) from public, anon, authenticated, service_role;

-- Locks the extraction row and verifies the candidates lease.
create or replace function public.doc_candidates_lock(p_extraction uuid, p_batch uuid)
returns public.document_extractions language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if e.candidates_lease_batch_id is distinct from p_batch or e.candidates_lease_until is null or e.candidates_lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return e;
end $$;
revoke execute on function public.doc_candidates_lock(uuid, uuid) from public, anon, authenticated, service_role;

-- Citation ids referenced by a candidate's citations object: every top-level string value and the
-- citation_id of every object inside a top-level array (financial_fact: value/label/unit + period[]).
create or replace function public.candidate_citation_ids(p_citations jsonb)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(x), '{}'::text[]) from (
    select e.value #>> '{}' as x from jsonb_each(p_citations) e where jsonb_typeof(e.value) = 'string'
    union all
    select a ->> 'citation_id' from jsonb_each(p_citations) e cross join lateral jsonb_array_elements(e.value) a
    where jsonb_typeof(e.value) = 'array'   -- F3 review fix: non-objects yield a NULL id, which insert_candidates rejects
  ) t
$$;
revoke execute on function public.candidate_citation_ids(jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.8 sync scope functions
-- Schedule inputs only (reasons/priority/fetch_key); never touches cursors, schedule or lease.
-- Returns the number of rows inserted or actually changed.
create or replace function public.reconcile_document_sync_scope(p_source text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_source is null or p_source not in ('edgar','cninfo','hkexnews') then raise exception 'invalid_input: source' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  -- F3 review fix: duplicate issuer ids in one call are a caller error, not silently collapsed
  if exists (select 1 from jsonb_array_elements(p_rows) x group by (x ->> 'issuer_id') having count(*) > 1) then
    raise exception 'invalid_input: duplicate issuer' using errcode = '22023';
  end if;
  insert into public.document_sync_scope (issuer_id, source, reasons, priority, fetch_key)
  select distinct on ((x ->> 'issuer_id')) (x ->> 'issuer_id')::uuid, p_source, coalesce(x -> 'reasons', '[]'::jsonb), coalesce((x ->> 'priority')::int, 0), x ->> 'fetch_key'
  from jsonb_array_elements(p_rows) x
  on conflict (issuer_id, source) do update
    set reasons = excluded.reasons, priority = excluded.priority, fetch_key = excluded.fetch_key, updated_at = now()
    where (document_sync_scope.reasons, document_sync_scope.priority, document_sync_scope.fetch_key)
          is distinct from (excluded.reasons, excluded.priority, excluded.fetch_key);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.reconcile_document_sync_scope(text, jsonb) from public, anon, authenticated;
grant execute on function public.reconcile_document_sync_scope(text, jsonb) to service_role;

-- Unleased, expired, or held by the same batch → (re)lease and true; otherwise false. No row → false.
create or replace function public.claim_document_sync_lease(p_issuer uuid, p_source text, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found then return false; end if;
  if s.lease_batch_id is null or s.lease_until is null or s.lease_until <= now() or s.lease_batch_id = p_batch then
    update public.document_sync_scope
    set lease_batch_id = p_batch, lease_until = now() + make_interval(secs => p_ttl), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.claim_document_sync_lease(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_document_sync_lease(uuid, text, uuid, int) to service_role;

-- Scope lock + sync lease. One transaction: versions of (source, source_ref) are read under a
-- per-ref advisory lock; same content_sha256 → duplicate (nothing written); else version max + 1
-- with supersedes/observed_replacement, the document and all its assets. The listed sources are
-- public: issuer/source/batch come from the arguments, permission is forced to public. A
-- source_ref already held by another issuer is refused (invalid_input).
create or replace function public.insert_document_version(p_issuer uuid, p_source text, p_batch uuid, p_doc jsonb, p_assets jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; v_prev public.disclosure_documents; v_dup uuid; v_assets jsonb := coalesce(p_assets, '[]'::jsonb);
begin
  if p_source is null or p_source not in ('edgar','cninfo','hkexnews') then raise exception 'invalid_input: source' using errcode = '22023'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'invalid_input: doc' using errcode = '22023'; end if;
  if jsonb_typeof(v_assets) <> 'array'
     or jsonb_array_length(case when jsonb_typeof(v_assets) = 'array' then v_assets else '[]'::jsonb end) > 100   -- F3 review fix: at most 100 assets per version (assetsOf never truncates)
     or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_assets) = 'array' then v_assets else '[]'::jsonb end) a group by a ->> 'role', a ->> 'filename' having count(*) > 1) then
    raise exception 'invalid_input: assets' using errcode = '22023';
  end if;
  perform public.doc_scope_lock(p_issuer, p_source, p_batch);
  d := jsonb_populate_record(null::public.disclosure_documents, p_doc);
  if d.source_ref is null or d.content_sha256 is null then raise exception 'invalid_input: source_ref/content_sha256' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('docver:' || p_source || ':' || d.source_ref));
  if exists (select 1 from public.disclosure_documents x where x.source = p_source and x.source_ref = d.source_ref and x.issuer_id is distinct from p_issuer) then
    raise exception 'invalid_input: source_ref belongs to another issuer' using errcode = '22023';
  end if;
  select x.document_id into v_dup from public.disclosure_documents x
  where x.source = p_source and x.source_ref = d.source_ref and x.content_sha256 = d.content_sha256;
  if v_dup is not null then return jsonb_build_object('outcome', 'duplicate', 'document_id', v_dup); end if;
  select * into v_prev from public.disclosure_documents x
  where x.source = p_source and x.source_ref = d.source_ref order by x.source_version desc limit 1;
  d.document_id := gen_random_uuid();
  d.issuer_id := p_issuer; d.source := p_source; d.batch_id := p_batch;
  d.permission := 'public'; d.owner_user_id := null; d.license_ref := null;
  d.source_version := coalesce(v_prev.source_version, 0) + 1;
  d.supersedes_document_id := v_prev.document_id;
  d.observed_replacement := v_prev.document_id is not null;
  d.status := 'stored'; d.current_extraction_id := null; d.extract_lease_until := null; d.extract_lease_batch_id := null;
  d.extract_attempts := 0; d.created_at := now();
  insert into public.disclosure_documents select (d).*;
  insert into public.document_assets (asset_id, document_id, role, filename, source_url, content_sha256, bytes, mime, storage_path, acquisition, created_at)
  select gen_random_uuid(), d.document_id, a.role, a.filename, a.source_url, a.content_sha256, a.bytes, a.mime, a.storage_path, a.acquisition, now()
  from jsonb_populate_recordset(null::public.document_assets, v_assets) a;
  return jsonb_build_object('outcome', case when v_prev.document_id is null then 'inserted' else 'versioned' end, 'document_id', d.document_id);
end $$;
revoke execute on function public.insert_document_version(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.insert_document_version(uuid, text, uuid, jsonb, jsonb) to service_role;

-- Holder's advisory lock per owner. source='upload', source_ref = '<owner>/<sha256>', version 1;
-- same owner + same bytes → duplicate. permission must be licensed|private; issuer_id may be null.
create or replace function public.insert_upload_document(p_owner uuid, p_doc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; v_dup uuid;
begin
  if p_owner is null then raise exception 'invalid_input: owner' using errcode = '22023'; end if;
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'invalid_input: doc' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('upload:' || p_owner::text));
  d := jsonb_populate_record(null::public.disclosure_documents, p_doc);
  if d.permission is null or d.permission not in ('licensed','private') then raise exception 'invalid_input: permission' using errcode = '22023'; end if;
  if d.content_sha256 is null then raise exception 'invalid_input: content_sha256' using errcode = '22023'; end if;
  d.source := 'upload'; d.source_ref := p_owner::text || '/' || d.content_sha256;
  select x.document_id into v_dup from public.disclosure_documents x where x.source = 'upload' and x.source_ref = d.source_ref;
  if v_dup is not null then return jsonb_build_object('outcome', 'duplicate', 'document_id', v_dup); end if;
  d.document_id := gen_random_uuid(); d.owner_user_id := p_owner; d.source_url := null;
  d.source_version := 1; d.supersedes_document_id := null; d.observed_replacement := false;
  d.status := 'stored'; d.current_extraction_id := null; d.extract_lease_until := null; d.extract_lease_batch_id := null;
  d.extract_attempts := 0; d.created_at := now();
  insert into public.disclosure_documents select (d).*;
  return jsonb_build_object('outcome', 'inserted', 'document_id', d.document_id);
end $$;
revoke execute on function public.insert_upload_document(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_upload_document(uuid, jsonb) to service_role;

-- Scope lock + sync lease. backfill → backfill_cursor/backfill_done; poll → poll_cursor (null clears).
-- Never backwards unless p_reset (an operator replay; codex plan round 1 P2-4): a finished backfill
-- (backfill_done) accepts only a repeated completion (null cursor, done) — no new backfill cursor and
-- no done → false; once the stored cursor carries seq, a new cursor must carry a strictly greater
-- seq (the sync core bumps it at every checkpoint). Refused → cursor_regression (P0001), no change.
create or replace function public.advance_document_cursor(p_issuer uuid, p_source text, p_batch uuid, p_mode text, p_cursor jsonb, p_done boolean, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope; v_old jsonb;
begin
  if p_mode is null or p_mode not in ('backfill','poll') then raise exception 'invalid_input: mode' using errcode = '22023'; end if;
  if p_cursor is not null and jsonb_typeof(p_cursor) <> 'object' then raise exception 'invalid_input: cursor' using errcode = '22023'; end if;
  if p_cursor is not null and p_cursor ? 'seq' and jsonb_typeof(p_cursor -> 'seq') <> 'number' then raise exception 'invalid_input: cursor seq' using errcode = '22023'; end if;
  s := public.doc_scope_lock(p_issuer, p_source, p_batch);
  if not coalesce(p_reset, false) then
    -- F3 review fix: clearing a backfill cursor is only allowed when it marks the backfill complete
    if p_mode = 'backfill' and p_cursor is null and not coalesce(p_done, false) then
      raise exception 'cursor_regression' using errcode = 'P0001', detail = 'cleared';
    end if;
    if p_mode = 'backfill' and s.backfill_done and not (p_cursor is null and coalesce(p_done, false)) then
      raise exception 'cursor_regression' using errcode = 'P0001', detail = 'backfill_done';
    end if;
    v_old := case when p_mode = 'backfill' then s.backfill_cursor else s.poll_cursor end;
    if p_cursor is not null and v_old ? 'seq' and jsonb_typeof(v_old -> 'seq') = 'number'
       and (not (p_cursor ? 'seq') or (p_cursor ->> 'seq')::numeric <= (v_old ->> 'seq')::numeric) then
      raise exception 'cursor_regression' using errcode = 'P0001', detail = 'seq';
    end if;
  end if;
  if p_mode = 'backfill' then
    update public.document_sync_scope set backfill_cursor = coalesce(p_cursor, '{}'::jsonb), backfill_done = coalesce(p_done, false), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
  else
    update public.document_sync_scope set poll_cursor = coalesce(p_cursor, '{}'::jsonb), updated_at = now()
    where issuer_id = p_issuer and source = p_source;
  end if;
end $$;
revoke execute on function public.advance_document_cursor(uuid, text, uuid, text, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.advance_document_cursor(uuid, text, uuid, text, jsonb, boolean, boolean) to service_role;

-- Holder check (an expired but unclaimed lease may still be released); records the outcome.
create or replace function public.release_document_sync_lease(p_issuer uuid, p_source text, p_batch uuid, p_outcome text, p_next_due timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s public.document_sync_scope;
begin
  if p_outcome is null or p_outcome not in ('success','failed') then raise exception 'invalid_input: outcome' using errcode = '22023'; end if;
  select * into s from public.document_sync_scope where issuer_id = p_issuer and source = p_source for update;
  if not found or s.lease_batch_id is distinct from p_batch then raise exception 'lease_lost' using errcode = '55P03'; end if;
  update public.document_sync_scope
  set lease_until = null, lease_batch_id = null, last_attempt_at = now(),
      last_success_at = case when p_outcome = 'success' then now() else last_success_at end,
      last_status = p_outcome, next_due_at = coalesce(p_next_due, now()), updated_at = now()
  where issuer_id = p_issuer and source = p_source;
end $$;
revoke execute on function public.release_document_sync_lease(uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.release_document_sync_lease(uuid, text, uuid, text, timestamptz) to service_role;

-- Document row lock; admin authority (the route already ran requireAdminUser and writes the audit).
-- Only the classification columns named in p_patch change.
create or replace function public.reclassify_document(p_document uuid, p_patch jsonb, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; p public.disclosure_documents;
begin
  if p_actor is null then raise exception 'invalid_input: actor' using errcode = '22023'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('doc_class','classifier_gen','fiscal_year','fiscal_period','period_end','filing_source_ref')) then
    raise exception 'invalid_input: patch' using errcode = '22023';
  end if;
  select * into d from public.disclosure_documents where document_id = p_document for no key update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  p := jsonb_populate_record(d, p_patch);
  update public.disclosure_documents
  set doc_class = p.doc_class, classifier_gen = p.classifier_gen, fiscal_year = p.fiscal_year,
      fiscal_period = p.fiscal_period, period_end = p.period_end, filing_source_ref = p.filing_source_ref
  where document_id = p_document;
end $$;
revoke execute on function public.reclassify_document(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.reclassify_document(uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------- 4.8 extraction functions
-- Document row lock. Requires status 'stored' and an unleased/expired/same-batch lease. The third
-- crash is closed here: attempts >= 3 → extract_failed, lease cleared, false. Otherwise lease and
-- extract_attempts + 1 (the only counting point), true.
create or replace function public.claim_document_extract_lease(p_document uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for no key update;
  if not found or d.status <> 'stored' then return false; end if;
  if not (d.extract_lease_batch_id is null or d.extract_lease_until is null or d.extract_lease_until <= now() or d.extract_lease_batch_id = p_batch) then
    return false;
  end if;
  if d.extract_attempts >= 3 then
    update public.disclosure_documents set status = 'extract_failed', extract_lease_until = null, extract_lease_batch_id = null where document_id = p_document;
    return false;
  end if;
  update public.disclosure_documents
  set extract_lease_batch_id = p_batch, extract_lease_until = now() + make_interval(secs => p_ttl), extract_attempts = extract_attempts + 1
  where document_id = p_document;
  return true;
end $$;
revoke execute on function public.claim_document_extract_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_document_extract_lease(uuid, uuid, int) to service_role;

-- Document row lock. The holder (extract_lease_batch_id = p_batch — an expired lease nobody else
-- claimed is still the holder's) extends its lease without counting an attempt (codex plan round 1
-- P2-7: long extractions renew before each mutating phase); status must still be 'stored'. Another
-- batch took over, or the document moved on → false, nothing changes.
create or replace function public.renew_document_extract_lease(p_document uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for no key update;
  if not found or p_batch is null or d.status <> 'stored' or d.extract_lease_batch_id is distinct from p_batch then return false; end if;   -- F3 review fix: holder-only, never acquires
  update public.disclosure_documents set extract_lease_until = now() + make_interval(secs => p_ttl) where document_id = p_document;
  return true;
end $$;
revoke execute on function public.renew_document_extract_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.renew_document_extract_lease(uuid, uuid, int) to service_role;

-- Document row lock + extract lease. Inserts the immutable extraction (candidates role/status
-- decided here, spec §7.3: hkexnews + HK + annual/interim + text layer → zh primary, else
-- comparison; everything else none/n/a) and every page (validated: pages 1..page_count exactly,
-- char_count = length(text) in code points, text_hash = sha256(utf8(text))); status extracted |
-- no_text_layer; current_extraction_id → the new version; lease cleared. Never deletes anything.
create or replace function public.finish_document_extract(p_document uuid, p_batch uuid, p_extraction jsonb, p_pages jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents; e public.document_extractions; v_role text;
        v_n int; v_distinct int; v_min int; v_max int; v_ok boolean;
begin
  if p_extraction is null or jsonb_typeof(p_extraction) <> 'object' then raise exception 'invalid_input: extraction' using errcode = '22023'; end if;
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then raise exception 'invalid_input: pages' using errcode = '22023'; end if;
  d := public.doc_extract_lock(p_document, p_batch);
  e := jsonb_populate_record(null::public.document_extractions, p_extraction);
  if e.extractor_version is null or e.table_algo_version is null or e.has_text_layer is null or e.page_count is null then
    raise exception 'invalid_input: extraction fields' using errcode = '22023';
  end if;
  if exists (select 1 from public.document_extractions x where x.document_id = p_document and x.extractor_version = e.extractor_version and x.table_algo_version = e.table_algo_version) then
    raise exception 'revision_exists' using errcode = 'P0001';
  end if;
  select count(*)::int, count(distinct p.page_no)::int, min(p.page_no), max(p.page_no),
         coalesce(bool_and(coalesce(p.char_count = length(p.text) and p.text_hash = encode(sha256(convert_to(p.text, 'UTF8')), 'hex'), false)), true)
  into v_n, v_distinct, v_min, v_max, v_ok
  from jsonb_populate_recordset(null::public.document_pages, p_pages) p;
  if v_n <> e.page_count or v_distinct <> v_n or (v_n > 0 and (v_min <> 1 or v_max <> v_n)) or not v_ok then
    raise exception 'invalid_input: pages do not match page_count, char_count or text_hash' using errcode = '22023';
  end if;
  v_role := case when d.source = 'hkexnews' and d.market = 'HK' and d.doc_class in ('annual_report','interim_report') and e.has_text_layer
                 then case when d.language = 'zh' then 'primary' else 'comparison' end
                 else 'none' end;
  e.extraction_id := gen_random_uuid(); e.document_id := p_document;
  e.candidates_role := v_role; e.candidates_status := case when v_role = 'none' then 'n/a' else 'pending' end;
  e.candidates_attempts := 0; e.candidates_lease_until := null; e.candidates_lease_batch_id := null;
  e.batch_id := p_batch; e.created_at := now();
  insert into public.document_extractions select (e).*;
  insert into public.document_pages (extraction_id, page_no, text, text_hash, char_count, width, height, line_count, has_tables)
  select e.extraction_id, p.page_no, p.text, p.text_hash, p.char_count, p.width, p.height, coalesce(p.line_count, 0), coalesce(p.has_tables, false)
  from jsonb_populate_recordset(null::public.document_pages, p_pages) p;
  update public.disclosure_documents
  set status = case when e.has_text_layer then 'extracted' else 'no_text_layer' end,
      current_extraction_id = e.extraction_id, extract_lease_until = null, extract_lease_batch_id = null
  where document_id = p_document;
  return e.extraction_id;
end $$;
revoke execute on function public.finish_document_extract(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finish_document_extract(uuid, uuid, jsonb, jsonb) to service_role;

-- Document row lock + extract lease. attempts >= 3 → extract_failed; lease cleared (no counting:
-- the attempt was counted at claim). p_code is recorded by the caller in the batch errors.
create or replace function public.fail_document_extract(p_document uuid, p_batch uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_code is null or length(p_code) = 0 then raise exception 'invalid_input: code' using errcode = '22023'; end if;
  d := public.doc_extract_lock(p_document, p_batch);
  update public.disclosure_documents
  set status = case when d.extract_attempts >= 3 then 'extract_failed' else status end,
      extract_lease_until = null, extract_lease_batch_id = null
  where document_id = p_document;
end $$;
revoke execute on function public.fail_document_extract(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_document_extract(uuid, uuid, text) to service_role;

-- Document row lock; admin authority. The caller passes the CURRENT extractor and table-algorithm
-- versions (TS constants): a version already extracted → revision_exists (versions are immutable);
-- otherwise extracted|no_text_layer|extract_failed → stored with attempts reset. Already stored →
-- no-op.
create or replace function public.request_document_extract(p_document uuid, p_actor uuid, p_extractor_version text, p_table_algo_version text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disclosure_documents;
begin
  if p_actor is null or p_extractor_version is null or p_table_algo_version is null then raise exception 'invalid_input: actor/versions' using errcode = '22023'; end if;
  select * into d from public.disclosure_documents where document_id = p_document for no key update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.document_extractions x where x.document_id = p_document and x.extractor_version = p_extractor_version and x.table_algo_version = p_table_algo_version) then
    raise exception 'revision_exists' using errcode = 'P0001';
  end if;
  if d.status <> 'stored' then
    update public.disclosure_documents set status = 'stored', extract_attempts = 0, extract_lease_until = null, extract_lease_batch_id = null
    where document_id = p_document;
  end if;
end $$;
revoke execute on function public.request_document_extract(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_document_extract(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------- 4.8 candidates scheduling
-- Extraction row lock. Requires candidates_status pending|failed and an unleased/expired/same-batch
-- lease; attempts >= 3 → exhausted, lease cleared, false (the third crash closes here); otherwise
-- lease and candidates_attempts + 1 (the only counting point), true.
create or replace function public.claim_candidates_lease(p_extraction uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found or e.candidates_status not in ('pending','failed') then return false; end if;
  if not (e.candidates_lease_batch_id is null or e.candidates_lease_until is null or e.candidates_lease_until <= now() or e.candidates_lease_batch_id = p_batch) then
    return false;
  end if;
  if e.candidates_attempts >= 3 then
    update public.document_extractions set candidates_status = 'exhausted', candidates_lease_until = null, candidates_lease_batch_id = null where extraction_id = p_extraction;
    return false;
  end if;
  update public.document_extractions
  set candidates_lease_batch_id = p_batch, candidates_lease_until = now() + make_interval(secs => p_ttl), candidates_attempts = candidates_attempts + 1
  where extraction_id = p_extraction;
  return true;
end $$;
revoke execute on function public.claim_candidates_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_candidates_lease(uuid, uuid, int) to service_role;

-- Extraction row lock. The holder extends its candidates lease without counting an attempt (P2-7);
-- candidates_status must still be pending|failed. Taken over or moved on → false.
create or replace function public.renew_candidates_lease(p_extraction uuid, p_batch uuid, p_ttl int)
returns boolean language plpgsql security definer set search_path = public as $$
declare e public.document_extractions;
begin
  if p_ttl is null or p_ttl < 1 then raise exception 'invalid_input: ttl' using errcode = '22023'; end if;
  select * into e from public.document_extractions where extraction_id = p_extraction for update;
  if not found or p_batch is null or e.candidates_status not in ('pending','failed') or e.candidates_lease_batch_id is distinct from p_batch then return false; end if;   -- F3 review fix: holder-only, never acquires
  update public.document_extractions set candidates_lease_until = now() + make_interval(secs => p_ttl) where extraction_id = p_extraction;
  return true;
end $$;
revoke execute on function public.renew_candidates_lease(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.renew_candidates_lease(uuid, uuid, int) to service_role;

-- Extraction row lock + candidates lease. pending|failed → done|failed; lease cleared.
create or replace function public.finish_candidates(p_extraction uuid, p_batch uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status is null or p_status not in ('done','failed') then raise exception 'invalid_input: status' using errcode = '22023'; end if;
  perform public.doc_candidates_lock(p_extraction, p_batch);
  update public.document_extractions set candidates_status = p_status, candidates_lease_until = null, candidates_lease_batch_id = null
  where extraction_id = p_extraction;
end $$;
revoke execute on function public.finish_candidates(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finish_candidates(uuid, uuid, text) to service_role;

-- Extraction row locks (the update takes them, extraction_id order); admin/script authority. Every
-- CURRENT extraction (= its document's current_extraction_id) with candidates_role <> 'none' and
-- status done|failed|exhausted, narrowed by p_filter {source?, issuer_id?, document_id?}, goes back
-- to pending with attempts 0. Returns the number reset.
create or replace function public.request_candidates_regen(p_filter jsonb, p_actor uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_filter jsonb := coalesce(p_filter, '{}'::jsonb);
begin
  if p_actor is null then raise exception 'invalid_input: actor' using errcode = '22023'; end if;
  if jsonb_typeof(v_filter) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_filter) k where k not in ('source','issuer_id','document_id')) then
    raise exception 'invalid_input: filter' using errcode = '22023';
  end if;
  perform 1 from public.document_extractions e
  join public.disclosure_documents d on d.document_id = e.document_id and d.current_extraction_id = e.extraction_id
  where e.candidates_role <> 'none' and e.candidates_status in ('done','failed','exhausted')
    and (v_filter ->> 'source' is null or d.source = v_filter ->> 'source')
    and (v_filter ->> 'issuer_id' is null or d.issuer_id = (v_filter ->> 'issuer_id')::uuid)
    and (v_filter ->> 'document_id' is null or d.document_id = (v_filter ->> 'document_id')::uuid)
  order by e.extraction_id
  for update of e;
  update public.document_extractions e
  set candidates_status = 'pending', candidates_attempts = 0, candidates_lease_until = null, candidates_lease_batch_id = null
  from public.disclosure_documents d
  where d.document_id = e.document_id and d.current_extraction_id = e.extraction_id
    and e.candidates_role <> 'none' and e.candidates_status in ('done','failed','exhausted')
    and (v_filter ->> 'source' is null or d.source = v_filter ->> 'source')
    and (v_filter ->> 'issuer_id' is null or d.issuer_id = (v_filter ->> 'issuer_id')::uuid)
    and (v_filter ->> 'document_id' is null or d.document_id = (v_filter ->> 'document_id')::uuid);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.request_candidates_regen(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.request_candidates_regen(jsonb, uuid) to service_role;

-- ---------------------------------------------------------------- 4.8 citations
-- No lock (pages are immutable). The page must belong to the extraction and the extraction to the
-- document; 0 <= char_start < char_end <= char_count; snippet = substr(text, char_start + 1,
-- char_end - char_start) (code points); text_hash = the page's text_hash. Else invalid_citation.
create or replace function public.insert_citation(p_row jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.document_citations; pg public.document_pages;
begin
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'invalid_citation: row' using errcode = '22023'; end if;
  c := jsonb_populate_record(null::public.document_citations, p_row);
  select p.* into pg from public.document_pages p
  join public.document_extractions e on e.extraction_id = p.extraction_id
  where p.extraction_id = c.extraction_id and p.page_no = c.page_no and e.document_id = c.document_id;
  if not found then raise exception 'invalid_citation: page' using errcode = '22023'; end if;
  if c.char_start is null or c.char_end is null or c.char_start < 0 or c.char_end <= c.char_start or c.char_end > pg.char_count then
    raise exception 'invalid_citation: range' using errcode = '22023';
  end if;
  if c.snippet is distinct from substr(pg.text, c.char_start + 1, c.char_end - c.char_start) then
    raise exception 'invalid_citation: snippet' using errcode = '22023';
  end if;
  if c.text_hash is distinct from pg.text_hash then raise exception 'invalid_citation: text_hash' using errcode = '22023'; end if;
  if c.created_by is null or c.created_ref is null then raise exception 'invalid_citation: creator' using errcode = '22023'; end if;
  c.citation_id := gen_random_uuid(); c.visibility := 'internal'; c.created_at := now();
  insert into public.document_citations select (c).*;
  return c.citation_id;
end $$;
revoke execute on function public.insert_citation(jsonb) from public, anon, authenticated;
grant execute on function public.insert_citation(jsonb) to service_role;

-- No lock. Every id must exist, be created_by human|module and belong to a public document, else
-- not_publishable (nothing changes). internal → public; returns the number that changed.
create or replace function public.publish_citations(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_ids uuid[] := coalesce(p_ids, '{}'::uuid[]); n int;
begin
  if exists (
    select 1 from unnest(v_ids) i(id)
    where not exists (
      select 1 from public.document_citations c join public.disclosure_documents d on d.document_id = c.document_id
      where c.citation_id = i.id and c.created_by in ('human','module') and d.permission = 'public')) then
    raise exception 'not_publishable' using errcode = 'P0001';
  end if;
  update public.document_citations set visibility = 'public' where citation_id = any(v_ids) and visibility = 'internal';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.publish_citations(uuid[]) from public, anon, authenticated;
grant execute on function public.publish_citations(uuid[]) to service_role;

-- ---------------------------------------------------------------- 4.8 candidates
-- Extraction row lock + candidates lease. Every citation id of every row must be a uuid of a
-- citation of THIS extraction (and so of its document), else invalid_citation; financial_fact rows
-- need value/label/unit and a non-empty period array, every kind needs value. Rows are inserted as
-- 'candidate' with empty decision fields (no inheritance here: write_candidate_checks applies it);
-- an existing (extraction, kind, extractor_ref, natural_key) is skipped. Returns {inserted}.
create or replace function public.insert_candidates(p_extraction uuid, p_batch uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.document_extractions; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  e := public.doc_candidates_lock(p_extraction, p_batch);
  if exists (
    select 1 from jsonb_array_elements(p_rows) x
    where jsonb_typeof(x -> 'citations') is distinct from 'object'
       or jsonb_typeof(x -> 'citations' -> 'value') is distinct from 'string'
       or (x ->> 'kind' = 'financial_fact' and (
            jsonb_typeof(x -> 'citations' -> 'label') is distinct from 'string'
            or jsonb_typeof(x -> 'citations' -> 'unit') is distinct from 'string'
            or jsonb_typeof(x -> 'citations' -> 'period') is distinct from 'array'
            or jsonb_array_length(x -> 'citations' -> 'period') = 0
            -- F3 review fix: every object element of period[] carries a permitted role (non-objects fall through to the reference check)
            or exists (select 1 from jsonb_array_elements(x -> 'citations' -> 'period') pe
                       where jsonb_typeof(pe) = 'object' and not coalesce((pe ->> 'role') = any (array['statement_title','column_header']), false))))) then
    raise exception 'invalid_citation: shape' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) x
    cross join lateral unnest(public.candidate_citation_ids(x -> 'citations')) as cid(id)
    where cid.id is null
       or cid.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from public.document_citations c where c.citation_id = cid.id::uuid and c.extraction_id = p_extraction and c.document_id = e.document_id)) then
    raise exception 'invalid_citation: reference' using errcode = '22023';
  end if;
  insert into public.extraction_candidates (candidate_id, document_id, extraction_id, kind, extractor_kind, extractor_ref, natural_key,
                                            citations, payload, fingerprint, checks, checks_passed, status, input_snapshot, batch_id, created_at)
  select gen_random_uuid(), e.document_id, p_extraction, x ->> 'kind', x ->> 'extractor_kind', x ->> 'extractor_ref', x ->> 'natural_key',
         x -> 'citations', x -> 'payload', x ->> 'fingerprint', '[]'::jsonb, false, 'candidate', x -> 'input_snapshot', p_batch, now()
  from jsonb_array_elements(p_rows) x
  on conflict on constraint extraction_candidates_key_uniq do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('inserted', n);
end $$;
revoke execute on function public.insert_candidates(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.insert_candidates(uuid, uuid, jsonb) to service_role;

-- Extraction row lock + candidates lease + each named candidate row FOR UPDATE (candidate_id order).
-- The only writer of checks: every row must be a 'candidate' of this extraction (else decided /
-- not_found). checks/checks_passed are persisted first; then, for rows that passed, a HUMAN decision
-- (confirmed|promoted) of the same document with the same fingerprint is inherited atomically:
-- confirmed, decision_kind human, decided_by of the source, decided_at now(), inherited_from.
-- Auto decisions are never inherited. Returns {written, inherited}.
create or replace function public.write_candidate_checks(p_extraction uuid, p_batch uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.document_extractions; x record; c public.extraction_candidates; src public.extraction_candidates;
        v_written int := 0; v_inherited int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_input: rows' using errcode = '22023'; end if;
  e := public.doc_candidates_lock(p_extraction, p_batch);
  for x in
    select (r ->> 'candidate_id')::uuid as candidate_id, r -> 'checks' as checks, (r ->> 'checks_passed')::boolean as checks_passed
    from jsonb_array_elements(p_rows) r order by (r ->> 'candidate_id')::uuid
  loop
    if jsonb_typeof(x.checks) is distinct from 'array' or x.checks_passed is null then raise exception 'invalid_input: checks' using errcode = '22023'; end if;
    select * into c from public.extraction_candidates where candidate_id = x.candidate_id and extraction_id = p_extraction for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if c.status <> 'candidate' then raise exception 'decided' using errcode = 'P0001'; end if;
    update public.extraction_candidates set checks = x.checks, checks_passed = x.checks_passed where candidate_id = c.candidate_id;
    v_written := v_written + 1;
    if x.checks_passed then
      select s.* into src from public.extraction_candidates s
      where s.document_id = c.document_id and s.fingerprint = c.fingerprint and s.candidate_id <> c.candidate_id
        and s.decision_kind = 'human' and s.status in ('confirmed','promoted')
      order by s.decided_at desc, s.candidate_id limit 1
      for share of s;   -- F3 review fix: the inheritance source cannot be un-decided concurrently
      if found then
        update public.extraction_candidates
        set status = 'confirmed', decision_kind = 'human', decided_by = src.decided_by, approval_id = null,
            decided_at = now(), inherited_from = src.candidate_id
        where candidate_id = c.candidate_id;
        v_inherited := v_inherited + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('written', v_written, 'inherited', v_inherited);
end $$;
revoke execute on function public.write_candidate_checks(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.write_candidate_checks(uuid, uuid, jsonb) to service_role;

-- Candidate row lock. Human: candidate→confirmed (requires checks_passed, else not_eligible),
-- candidate→rejected, confirmed→candidate (requires no candidate_publications row, else
-- not_eligible); the same status again is a no-op; any other transition → decided.
-- Auto: requires a rule candidate with checks_passed, an unrevoked approval (revoked →
-- approval_revoked) whose extractor_ref equals the candidate's, whose three versions equal the
-- candidate's document_extractions row, and whose concepts contain payload.concept → confirmed; a
-- row already confirmed by the same approval is a no-op; anything else → not_eligible.
-- Returns {status}.
create or replace function public.decide_candidate(p_candidate uuid, p_decision jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.extraction_candidates; e public.document_extractions; a public.extraction_approvals;
        v_kind text := p_decision ->> 'kind'; v_target text := p_decision ->> 'status'; v_by uuid; v_approval uuid;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' or v_kind is null or v_kind not in ('human','auto') then
    raise exception 'invalid_input: decision' using errcode = '22023';
  end if;
  select * into c from public.extraction_candidates where candidate_id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_kind = 'human' then
    v_by := (p_decision ->> 'decided_by')::uuid;
    if v_by is null or v_target is null or v_target not in ('confirmed','rejected','candidate') then raise exception 'invalid_input: human decision' using errcode = '22023'; end if;
    if c.status = v_target then return jsonb_build_object('status', c.status); end if;
    if c.status = 'candidate' and v_target = 'confirmed' then
      if not c.checks_passed then raise exception 'not_eligible' using errcode = 'P0001'; end if;
      update public.extraction_candidates set status = 'confirmed', decision_kind = 'human', decided_by = v_by, approval_id = null, decided_at = now(), inherited_from = null
      where candidate_id = p_candidate;
    elsif c.status = 'candidate' and v_target = 'rejected' then
      update public.extraction_candidates set status = 'rejected', decision_kind = 'human', decided_by = v_by, approval_id = null, decided_at = now(), inherited_from = null
      where candidate_id = p_candidate;
    elsif c.status = 'confirmed' and v_target = 'candidate' then
      if exists (select 1 from public.candidate_publications p where p.candidate_id = p_candidate) then raise exception 'not_eligible' using errcode = 'P0001'; end if;
      update public.extraction_candidates set status = 'candidate', decision_kind = null, decided_by = null, approval_id = null, decided_at = null, inherited_from = null
      where candidate_id = p_candidate;
    else
      raise exception 'decided' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', v_target);
  end if;
  v_approval := (p_decision ->> 'approval_id')::uuid;
  if v_approval is null then raise exception 'invalid_input: approval_id' using errcode = '22023'; end if;
  if c.status = 'confirmed' and c.decision_kind = 'auto' and c.approval_id = v_approval then return jsonb_build_object('status', c.status); end if;
  if c.status <> 'candidate' or c.extractor_kind <> 'rule' or not c.checks_passed then raise exception 'not_eligible' using errcode = 'P0001'; end if;
  select * into a from public.extraction_approvals where approval_id = v_approval for share;   -- F3 review fix: a concurrent revoke waits
  if not found then raise exception 'not_eligible' using errcode = 'P0001'; end if;
  if a.revoked_at is not null then raise exception 'approval_revoked' using errcode = 'P0001'; end if;
  select * into e from public.document_extractions where extraction_id = c.extraction_id;
  if a.extractor_ref <> c.extractor_ref or a.extractor_version <> e.extractor_version or a.table_algo_version <> e.table_algo_version
     or a.code_version <> e.code_version
     or (c.payload ->> 'concept') is null or array_position(a.concepts, null) is not null
     or not coalesce((c.payload ->> 'concept') = any(a.concepts), false) then   -- F3 review fix: concept membership must be explicitly TRUE
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;
  update public.extraction_candidates set status = 'confirmed', decision_kind = 'auto', decided_by = null, approval_id = v_approval, decided_at = now(), inherited_from = null
  where candidate_id = p_candidate;
  return jsonb_build_object('status', 'confirmed');
end $$;
revoke execute on function public.decide_candidate(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.decide_candidate(uuid, jsonb) to service_role;

-- Candidate row lock. Requires confirmed|promoted (else not_eligible). An auto-decided candidate
-- whose approval was revoked since: a confirmed one returns to 'candidate' and the call answers
-- {outcome:'approval_revoked'} WITHOUT raising (a raise would roll the reversion back; the TS
-- adapters turn the outcome into DocumentsDbError('approval_revoked')); a promoted one only answers
-- the outcome. Otherwise, under p_pub_gen: no row → insert staged; abandoned → staged with the new
-- run_id/fact_id; staged|published → already_staged. Returns {outcome:'staged'|'approval_revoked'}.
create or replace function public.stage_candidate_publication(p_candidate uuid, p_pub_gen int, p_run uuid, p_fact_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.extraction_candidates; p public.candidate_publications;
begin
  if p_pub_gen is null or p_pub_gen < 1 or p_run is null or p_fact_id is null then raise exception 'invalid_input: publication' using errcode = '22023'; end if;
  select * into c from public.extraction_candidates where candidate_id = p_candidate for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status not in ('confirmed','promoted') then raise exception 'not_eligible' using errcode = 'P0001'; end if;
  if c.decision_kind = 'auto' then   -- F3 review fix: share-lock the approval so a concurrent revoke is ordered against this call
    perform 1 from public.extraction_approvals a where a.approval_id = c.approval_id for share;
  end if;
  if c.decision_kind = 'auto' and exists (select 1 from public.extraction_approvals a where a.approval_id = c.approval_id and a.revoked_at is not null) then
    if c.status = 'confirmed' then
      update public.extraction_candidates set status = 'candidate', decision_kind = null, decided_by = null, approval_id = null, decided_at = null, inherited_from = null
      where candidate_id = p_candidate;
    end if;
    return jsonb_build_object('outcome', 'approval_revoked');
  end if;
  select * into p from public.candidate_publications where candidate_id = p_candidate and pub_gen = p_pub_gen for update;
  if not found then
    insert into public.candidate_publications (candidate_id, pub_gen, run_id, fact_id, state, created_at, updated_at)
    values (p_candidate, p_pub_gen, p_run, p_fact_id, 'staged', now(), now());
  elsif p.state = 'abandoned' then
    update public.candidate_publications set state = 'staged', run_id = p_run, fact_id = p_fact_id, updated_at = now()
    where candidate_id = p_candidate and pub_gen = p_pub_gen;
  else
    raise exception 'already_staged' using errcode = 'P0001';
  end if;
  return jsonb_build_object('outcome', 'staged');
end $$;
revoke execute on function public.stage_candidate_publication(uuid, int, uuid, uuid) from public, anon, authenticated;
grant execute on function public.stage_candidate_publication(uuid, int, uuid, uuid) to service_role;

-- ---------------------------------------------------------------- 4.8 read_documents (security invoker: RLS applies)
-- One statement, one jsonb envelope {rows, next_cursor, row_count}. Among the issuer's rows with
-- available_date <= p_as_of, the highest source_version per (source, source_ref) (every version
-- when p_all_versions), then source/doc_class/available_date window filters, ordered by
-- (available_at desc, document_id desc) after the keyset cursor {available_at, document_id};
-- 1 <= p_limit <= 1000. next_cursor names the last returned row when more rows follow.
create or replace function public.read_documents(
  p_issuer uuid, p_as_of date, p_source text, p_doc_class text, p_from date, p_to date,
  p_cursor jsonb, p_limit int, p_all_versions boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_at timestamptz; v_id uuid; v_rows jsonb; v_n int;
begin
  if p_issuer is null or p_as_of is null then raise exception 'invalid_input: issuer/as_of' using errcode = '22023'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid_input: limit' using errcode = '22023'; end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object' or p_cursor ->> 'available_at' is null or p_cursor ->> 'document_id' is null then
      raise exception 'invalid_input: cursor' using errcode = '22023';
    end if;
    v_at := (p_cursor ->> 'available_at')::timestamptz; v_id := (p_cursor ->> 'document_id')::uuid;
  end if;
  with visible as (
    select d.*, row_number() over (partition by d.source, d.source_ref order by d.source_version desc) as rn
    from public.disclosure_documents d
    where d.issuer_id = p_issuer and d.available_date <= p_as_of
  ), picked as (
    select v.* from visible v
    where (coalesce(p_all_versions, false) or v.rn = 1)
      and (p_source is null or v.source = p_source)
      and (p_doc_class is null or v.doc_class = p_doc_class)
      and (p_from is null or v.available_date >= p_from)
      and (p_to is null or v.available_date <= p_to)
      and (v_at is null or (v.available_at, v.document_id) < (v_at, v_id))
    order by v.available_at desc, v.document_id desc
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(to_jsonb(p) - 'rn' order by p.available_at desc, p.document_id desc), '[]'::jsonb), count(*)::int
  into v_rows, v_n from picked p;
  if v_n > p_limit then
    v_rows := v_rows - p_limit;   -- drop the look-ahead row (index p_limit, zero-based)
    return jsonb_build_object('rows', v_rows, 'row_count', p_limit,
      'next_cursor', jsonb_build_object('available_at', v_rows -> (p_limit - 1) -> 'available_at', 'document_id', v_rows -> (p_limit - 1) -> 'document_id'));
  end if;
  return jsonb_build_object('rows', v_rows, 'row_count', v_n, 'next_cursor', null);
end $$;
revoke execute on function public.read_documents(uuid, date, text, text, date, date, jsonb, int, boolean) from public;
grant execute on function public.read_documents(uuid, date, text, text, date, date, jsonb, int, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- service reads that need a join, a server clock or a POST body
-- security invoker (service_role reads every row); not executable by anon/authenticated.
-- status 'stored' with an empty or expired extract lease, oldest first; attempts are NOT filtered
-- (claim_document_extract_lease closes the third crash).
create or replace function public.documents_stored_due(p_limit int)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at, d.document_id), '[]'::jsonb)
  from (select * from public.disclosure_documents x
        where x.status = 'stored' and (x.extract_lease_until is null or x.extract_lease_until <= now())
        order by x.created_at, x.document_id limit greatest(coalesce(p_limit, 0), 0)) d
$$;
revoke execute on function public.documents_stored_due(int) from public, anon, authenticated;
grant execute on function public.documents_stored_due(int) to service_role;

-- candidates_status pending|failed, lease empty or expired, and the extraction is its document's
-- current one; attempts are NOT filtered (claim_candidates_lease closes the third crash).
create or replace function public.extractions_candidates_due(p_limit int)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.extraction_id), '[]'::jsonb)
  from (select x.* from public.document_extractions x
        join public.disclosure_documents d on d.document_id = x.document_id and d.current_extraction_id = x.extraction_id
        where x.candidates_status in ('pending','failed') and (x.candidates_lease_until is null or x.candidates_lease_until <= now())
        order by x.created_at, x.extraction_id limit greatest(coalesce(p_limit, 0), 0)) e
$$;
revoke execute on function public.extractions_candidates_due(int) from public, anon, authenticated;
grant execute on function public.extractions_candidates_due(int) to service_role;

-- The subset of p_refs (≤ 500 per call; a POST body, not a URL filter) already stored for this
-- issuer and source, any version.
create or replace function public.known_source_refs(p_issuer uuid, p_source text, p_refs text[])
returns text[] language sql stable security invoker set search_path = public as $$
  select coalesce(array_agg(distinct d.source_ref), '{}'::text[])
  from public.disclosure_documents d
  where d.issuer_id = p_issuer and d.source = p_source and d.source_ref = any(coalesce(p_refs, '{}'::text[]))
$$;
revoke execute on function public.known_source_refs(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.known_source_refs(uuid, text, text[]) to service_role;

-- Candidates by extraction, by status, or by issuer (+ optional status), keyset-paged on
-- (created_at, candidate_id) after p_cursor {created_at, candidate_id}. Envelope {rows, next_cursor}.
create or replace function public.list_candidates(p_extraction uuid, p_status text, p_issuer uuid, p_cursor jsonb, p_limit int)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_at timestamptz; v_id uuid; v_rows jsonb; v_n int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid_input: limit' using errcode = '22023'; end if;
  if p_extraction is null and p_status is null and p_issuer is null then raise exception 'invalid_input: where' using errcode = '22023'; end if;
  if p_cursor is not null then v_at := (p_cursor ->> 'created_at')::timestamptz; v_id := (p_cursor ->> 'candidate_id')::uuid; end if;
  with picked as (
    select c.* from public.extraction_candidates c
    where (p_extraction is null or c.extraction_id = p_extraction)
      and (p_status is null or c.status = p_status)
      and (p_issuer is null or exists (select 1 from public.disclosure_documents d where d.document_id = c.document_id and d.issuer_id = p_issuer))
      and (v_at is null or (c.created_at, c.candidate_id) > (v_at, v_id))
    order by c.created_at, c.candidate_id
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.candidate_id), '[]'::jsonb), count(*)::int into v_rows, v_n from picked p;
  if v_n > p_limit then
    v_rows := v_rows - p_limit;
    return jsonb_build_object('rows', v_rows, 'next_cursor', jsonb_build_object('created_at', v_rows -> (p_limit - 1) -> 'created_at', 'candidate_id', v_rows -> (p_limit - 1) -> 'candidate_id'));
  end if;
  return jsonb_build_object('rows', v_rows, 'next_cursor', null);
end $$;
revoke execute on function public.list_candidates(uuid, text, uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.list_candidates(uuid, text, uuid, jsonb, int) to service_role;

-- Publications by candidate ids (≤ 100), by run, or by issuer + pub_gen (+ optional state),
-- keyset-paged on (candidate_id, pub_gen) after p_cursor {candidate_id, pub_gen}.
create or replace function public.list_candidate_publications(p_candidate_ids uuid[], p_run uuid, p_issuer uuid, p_pub_gen int, p_state text, p_cursor jsonb, p_limit int)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_cid uuid; v_gen int; v_rows jsonb; v_n int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid_input: limit' using errcode = '22023'; end if;
  if p_candidate_ids is null and p_run is null and (p_issuer is null or p_pub_gen is null) then raise exception 'invalid_input: where' using errcode = '22023'; end if;
  if cardinality(p_candidate_ids) > 100 then raise exception 'invalid_input: candidate_ids' using errcode = '22023'; end if;
  if p_cursor is not null then v_cid := (p_cursor ->> 'candidate_id')::uuid; v_gen := (p_cursor ->> 'pub_gen')::int; end if;
  with picked as (
    select p.* from public.candidate_publications p
    where (p_candidate_ids is null or p.candidate_id = any(p_candidate_ids))
      and (p_run is null or p.run_id = p_run)
      and (p_issuer is null or exists (
            select 1 from public.extraction_candidates c join public.disclosure_documents d on d.document_id = c.document_id
            where c.candidate_id = p.candidate_id and d.issuer_id = p_issuer))
      and (p_pub_gen is null or p.pub_gen = p_pub_gen)
      and (p_state is null or p.state = p_state)
      and (v_cid is null or (p.candidate_id, p.pub_gen) > (v_cid, v_gen))
    order by p.candidate_id, p.pub_gen
    limit p_limit + 1
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.candidate_id, p.pub_gen), '[]'::jsonb), count(*)::int into v_rows, v_n from picked p;
  if v_n > p_limit then
    v_rows := v_rows - p_limit;
    return jsonb_build_object('rows', v_rows, 'next_cursor', jsonb_build_object('candidate_id', v_rows -> (p_limit - 1) -> 'candidate_id', 'pub_gen', v_rows -> (p_limit - 1) -> 'pub_gen'));
  end if;
  return jsonb_build_object('rows', v_rows, 'next_cursor', null);
end $$;
revoke execute on function public.list_candidate_publications(uuid[], uuid, uuid, int, text, jsonb, int) from public, anon, authenticated;
grant execute on function public.list_candidate_publications(uuid[], uuid, uuid, int, text, jsonb, int) to service_role;

-- ---------------------------------------------------------------- 4.12 privileges and policies
do $$ declare t text; begin
  foreach t in array array['disclosure_documents','document_assets','document_extractions','document_pages','document_citations',
                           'extraction_candidates','candidate_publications','extraction_approvals','document_sync_scope'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
  foreach t in array array['disclosure_documents','document_assets','document_extractions','document_pages','document_citations'] loop
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['extraction_candidates','candidate_publications','extraction_approvals','document_sync_scope'] loop
    execute format('grant select on public.%I to service_role', t);
  end loop;
end $$;
revoke all on public.disclosure_documents_public from public, anon, authenticated, service_role;
grant select on public.disclosure_documents_public to anon, authenticated, service_role;

drop policy if exists "disclosure_documents public read" on public.disclosure_documents;
create policy "disclosure_documents public read" on public.disclosure_documents for select to anon, authenticated
  using (permission = 'public');
drop policy if exists "document_assets public read" on public.document_assets;
create policy "document_assets public read" on public.document_assets for select to anon, authenticated
  using (exists (select 1 from public.disclosure_documents d where d.document_id = document_assets.document_id and d.permission = 'public'));
drop policy if exists "document_extractions public read" on public.document_extractions;
create policy "document_extractions public read" on public.document_extractions for select to anon, authenticated
  using (exists (select 1 from public.disclosure_documents d where d.document_id = document_extractions.document_id and d.permission = 'public'));
drop policy if exists "document_pages public read" on public.document_pages;
create policy "document_pages public read" on public.document_pages for select to anon, authenticated
  using (exists (select 1 from public.document_extractions e join public.disclosure_documents d on d.document_id = e.document_id
                 where e.extraction_id = document_pages.extraction_id and d.permission = 'public'));
-- Migration one: a citation is public when its document is public and it was published
-- (visibility). Migration two replaces this policy (same name) adding the fact_citations clause.
drop policy if exists "document_citations public read" on public.document_citations;
create policy "document_citations public read" on public.document_citations for select to anon, authenticated
  using (visibility = 'public' and exists (select 1 from public.disclosure_documents d where d.document_id = document_citations.document_id and d.permission = 'public'));

-- extraction_approvals: the one direct write (§4.12) — insert, and update of revoked_at only; the
-- trigger keeps every other column and an existing revocation immutable.
grant insert on public.extraction_approvals to service_role;
grant update (revoked_at) on public.extraction_approvals to service_role;
drop policy if exists "extraction_approvals service insert" on public.extraction_approvals;
create policy "extraction_approvals service insert" on public.extraction_approvals for insert to service_role with check (true);
drop policy if exists "extraction_approvals service revoke" on public.extraction_approvals;
create policy "extraction_approvals service revoke" on public.extraction_approvals for update to service_role using (true) with check (true);
