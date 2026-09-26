-- WP-A1: Source extension (implementation plan 2026-09-22 §5.1).
-- Replayable: every statement is idempotent or guarded; the backfills match no
-- rows on a second run. Only public rows may ever reach Jev; NOTE/MANUAL start
-- private, everything else public (owner decision 2026-09-25).

alter table public.research_source_documents
  add column if not exists event_time     timestamptz,
  add column if not exists available_at   timestamptz,
  add column if not exists source_version text not null default '1',
  add column if not exists cluster_id     uuid,
  add column if not exists cluster_first  boolean,
  add column if not exists origin_type    text,
  add column if not exists market         text,
  add column if not exists permission     text not null default 'public';

-- Backfill: first availability = ingestion time; permission by source type.
update public.research_source_documents set available_at = ingested_at where available_at is null;
update public.research_source_documents set permission = 'private'
  where source_type in ('NOTE','MANUAL') and permission = 'public';

alter table public.research_source_documents alter column available_at set not null;
-- No column defaults for available_at/permission: a BEFORE INSERT trigger derives
-- them from the row itself so every writer (ingestSource, the S4 import path,
-- scripts) gets ingestion-time availability and type-based permission without
-- code changes. now() would be the transaction start, not the ingestion instant.
alter table public.research_source_documents alter column available_at drop default;
alter table public.research_source_documents alter column permission drop default;
create or replace function public.research_source_insert_defaults() returns trigger as $$
begin
  if new.available_at is null then new.available_at := new.ingested_at; end if;
  if new.permission is null then
    new.permission := case when new.source_type in ('NOTE','MANUAL') then 'private' else 'public' end;
  end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists research_sources_insert_defaults on public.research_source_documents;
create trigger research_sources_insert_defaults before insert on public.research_source_documents
  for each row execute function public.research_source_insert_defaults();

alter table public.research_source_documents drop constraint if exists research_sources_origin_type_check;
alter table public.research_source_documents add constraint research_sources_origin_type_check
  check (origin_type is null or origin_type in ('filing','company_statement','third_party_data','analyst_or_media','retelling','private_observation','unknown'));
alter table public.research_source_documents drop constraint if exists research_sources_market_check;
alter table public.research_source_documents add constraint research_sources_market_check
  check (market is null or market in ('A','HK','US','other'));
alter table public.research_source_documents drop constraint if exists research_sources_permission_check;
alter table public.research_source_documents add constraint research_sources_permission_check
  check (permission in ('public','licensed','private'));
alter table public.research_source_documents drop constraint if exists research_sources_source_version_check;
alter table public.research_source_documents add constraint research_sources_source_version_check
  check (source_version ~ '^[1-9][0-9]{0,8}$');

create index if not exists research_sources_user_available_idx
  on public.research_source_documents (user_id, available_at desc);
create index if not exists research_sources_user_cluster_idx
  on public.research_source_documents (user_id, cluster_id) where cluster_id is not null;
create index if not exists research_sources_user_market_idx
  on public.research_source_documents (user_id, market, available_at desc) where market is not null;
create index if not exists research_sources_user_permission_idx
  on public.research_source_documents (user_id, permission);

-- Immutable facts: the original four raw fields plus first availability and vintage.
-- Enrichment fields (event_time, cluster_*, origin_type, market, permission) stay updatable.
create or replace function public.research_forbid_source_mutation() returns trigger as $$
begin
  if new.raw_text is distinct from old.raw_text
     or new.content_hash is distinct from old.content_hash
     or new.source_type is distinct from old.source_type
     or new.url is distinct from old.url
     or new.available_at is distinct from old.available_at
     or new.source_version is distinct from old.source_version then
    raise exception 'research source raw fields are immutable';
  end if;
  return new;
end; $$ language plpgsql;
