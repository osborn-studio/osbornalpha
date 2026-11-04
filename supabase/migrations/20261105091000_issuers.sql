-- supabase/migrations/20261105091000_issuers.sql
-- WP-F1a (data foundation spec §3.1): one global issuer per company; securities in
-- stocks_universe hang off an issuer with validity windows. Public reference data: anon and
-- authenticated may SELECT four tables (explicit grants — Supabase grants ALL by default and
-- RLS does not stop TRUNCATE, so client roles get SELECT only); identifier claims
-- (pending merges/conflicts) are service-role only. Replayable: guarded create statements,
-- drop-then-create policies.
-- Deletes: link FKs and child FKs are RESTRICT by design — retire with status='merged'/'dissolved',
-- never delete. Ownership windows are half-open [valid_from, valid_to) and may not overlap
-- (btree_gist exclusion constraints); merges may only target an active issuer, and only an active
-- issuer may hold an open (valid_to is null) security row.
-- provenance (issuers, issuer_securities, issuer_industry_memberships) is PUBLIC (anon SELECT):
-- writers must store only source names, ids and dates — never URLs with tokens or internal notes.

create extension if not exists btree_gist;

create table if not exists public.issuers (
  issuer_id               uuid primary key,
  canonical_name_zh       text,
  canonical_name_en       text,
  country_code            text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  lei                     text check (lei is null or lei ~ '^[A-Z0-9]{18}[0-9]{2}$'),
  cik                     text check (cik is null or cik ~ '^[1-9][0-9]{0,9}$'),
  usci                    text check (usci is null or usci ~ '^[0-9A-HJ-NP-RTUW-Y]{18}$'),
  cninfo_org_id           text check (cninfo_org_id is null or length(btrim(cninfo_org_id)) > 0),
  hkex_stock_code_primary text check (hkex_stock_code_primary is null or hkex_stock_code_primary ~ '^[0-9]{5}$'),
  status                  text not null default 'active' check (status in ('active','merged','dissolved')),
  merged_into             uuid references public.issuers(issuer_id) on delete restrict,
  provenance              jsonb not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint issuers_has_name check (canonical_name_zh is not null or canonical_name_en is not null),
  constraint issuers_provenance_object check (jsonb_typeof(provenance) = 'object'),
  constraint issuers_merged_not_self check (merged_into is null or merged_into <> issuer_id),
  constraint issuers_merged_iff_status check ((status = 'merged') = (merged_into is not null))
);
create unique index if not exists issuers_lei_idx on public.issuers(lei) where lei is not null;
create unique index if not exists issuers_cik_idx on public.issuers(cik) where cik is not null;
create unique index if not exists issuers_usci_idx on public.issuers(usci) where usci is not null;
create unique index if not exists issuers_cninfo_idx on public.issuers(cninfo_org_id) where cninfo_org_id is not null;
create index if not exists issuers_merged_into_idx on public.issuers(merged_into) where merged_into is not null;

-- A merge may only point at an active issuer: blocks cycles (A->B then B->A) and chains (A->B->C).
create or replace function public.issuers_merge_target_active() returns trigger
language plpgsql set search_path = '' as $$
declare target_status text;
begin
  if new.merged_into is not null then
    select i.status into target_status from public.issuers i where i.issuer_id = new.merged_into for share;
    if target_status is distinct from 'active' then
      raise exception 'merge_target_not_active: issuer % cannot merge into % (status %)', new.issuer_id, new.merged_into, coalesce(target_status, 'missing')
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists issuers_merge_target_active on public.issuers;
create trigger issuers_merge_target_active before insert or update of merged_into, status on public.issuers
  for each row execute function public.issuers_merge_target_active();

create table if not exists public.issuer_securities (
  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
  ticker      text not null references public.stocks_universe(ticker) on delete restrict,
  isin        text check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  figi        text check (figi is null or figi ~ '^BBG[A-Z0-9]{9}$'),
  share_class text not null default 'unknown' check (share_class in ('A','H','ADR','common','preferred','other','unknown')),
  is_primary  boolean not null default false,
  valid_from  date not null,
  valid_to    date,
  source      text not null check (length(source) between 1 and 64),
  provenance  jsonb not null default '{}',
  primary key (issuer_id, ticker, valid_from),
  unique (ticker, valid_from),
  constraint issuer_securities_window check (valid_to is null or valid_to > valid_from),
  constraint issuer_securities_provenance_object check (jsonb_typeof(provenance) = 'object')
);
-- (ticker, valid_from) UNIQUE already serves ticker lookups; no standalone ticker index.
create unique index if not exists issuer_securities_open_owner_idx on public.issuer_securities(ticker) where valid_to is null;
create unique index if not exists issuer_securities_isin_idx on public.issuer_securities(isin, valid_from) where isin is not null;
-- Added after open_owner_idx on purpose: index checks run in creation order, so an open/open clash
-- reports the clearer issuer_securities_open_owner_idx name; every other overlap reports this one.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.issuer_securities'::regclass and conname = 'issuer_securities_no_overlap') then
    alter table public.issuer_securities add constraint issuer_securities_no_overlap
      exclude using gist (ticker with =, daterange(valid_from, valid_to, '[)') with &&);
  end if;
end $$;

-- Only an active issuer may hold an open security row; closed historical rows are always allowed.
create or replace function public.issuer_securities_owner_active() returns trigger
language plpgsql set search_path = '' as $$
declare owner_status text;
begin
  if new.valid_to is null then
    select i.status into owner_status from public.issuers i where i.issuer_id = new.issuer_id for share;
    if owner_status is distinct from 'active' then
      raise exception 'issuer_not_active: issuer % (status %) cannot hold open security %', new.issuer_id, coalesce(owner_status, 'missing'), new.ticker
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists issuer_securities_owner_active on public.issuer_securities;
create trigger issuer_securities_owner_active before insert or update on public.issuer_securities
  for each row execute function public.issuer_securities_owner_active();

create table if not exists public.issuer_identifier_claims (
  id          uuid primary key,
  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
  id_type     text not null check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id')),
  value       text not null check (length(value) between 1 and 64),
  source      text not null check (length(source) between 1 and 64),
  confidence  numeric not null check (confidence >= 0 and confidence <= 1),
  status      text not null default 'pending' check (status in ('accepted','pending','rejected')),
  created_at  timestamptz not null default now()
);
create index if not exists issuer_identifier_claims_pending_idx on public.issuer_identifier_claims(created_at desc) where status = 'pending';
create index if not exists issuer_identifier_claims_issuer_idx on public.issuer_identifier_claims(issuer_id);
create unique index if not exists issuer_identifier_claims_pending_unique on public.issuer_identifier_claims(issuer_id, id_type, value) where status = 'pending';

create table if not exists public.industry_classifications (
  scheme      text not null check (scheme in ('sw2021','sw2014','gics','csrc','custom')),
  version     text not null check (length(version) between 1 and 32),
  code        text not null check (length(code) between 1 and 32),
  level       integer not null check (level between 1 and 4),
  name_zh     text,
  name_en     text,
  parent_code text,
  primary key (scheme, version, code),
  constraint industry_classifications_parent_fkey foreign key (scheme, version, parent_code)
    references public.industry_classifications(scheme, version, code),
  constraint industry_classifications_parent_not_self check (parent_code is null or parent_code <> code),
  constraint industry_classifications_has_name check (name_zh is not null or name_en is not null)
);

create table if not exists public.issuer_industry_memberships (
  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
  scheme      text not null,
  version     text not null,
  code        text not null,
  valid_from  date not null,
  valid_to    date,
  source      text not null check (length(source) between 1 and 64),
  provenance  jsonb not null default '{}',
  primary key (issuer_id, scheme, version, code, valid_from),
  foreign key (scheme, version, code) references public.industry_classifications(scheme, version, code),
  constraint issuer_industry_memberships_window check (valid_to is null or valid_to > valid_from),
  constraint issuer_industry_memberships_provenance_object check (jsonb_typeof(provenance) = 'object'),
  constraint issuer_industry_memberships_no_overlap exclude using gist
    (issuer_id with =, scheme with =, version with =, code with =, daterange(valid_from, valid_to, '[)') with &&)
);
create index if not exists issuer_industry_memberships_code_idx on public.issuer_industry_memberships(scheme, version, code);

alter table public.research_entity_keys add column if not exists issuer_id uuid references public.issuers(issuer_id) on delete restrict;
alter table public.research_entity_securities add column if not exists ticker text references public.stocks_universe(ticker) on delete restrict;
create index if not exists research_entity_keys_issuer_idx on public.research_entity_keys(issuer_id) where issuer_id is not null;
create index if not exists research_entity_securities_ticker_idx on public.research_entity_securities(ticker) where ticker is not null;

do $$ declare t text; begin
  foreach t in array array['issuers','issuer_securities','issuer_identifier_claims','industry_classifications','issuer_industry_memberships'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
  foreach t in array array['issuers','issuer_securities','industry_classifications','issuer_industry_memberships'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select using (true)', t, t);
  end loop;
end $$;
