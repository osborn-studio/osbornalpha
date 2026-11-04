-- supabase/migrations/20261105091000_issuers.sql
-- WP-F1a (data foundation spec §3.1): one global issuer per company; securities in
-- stocks_universe hang off an issuer with validity windows. Public reference data: anon and
-- authenticated may SELECT four tables (explicit grants — Supabase grants ALL by default and
-- RLS does not stop TRUNCATE, so client roles get SELECT only); identifier claims
-- (pending merges/conflicts) are service-role only. Replayable: guarded create statements,
-- drop-then-create policies.

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
  merged_into             uuid references public.issuers(issuer_id),
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

create table if not exists public.issuer_securities (
  issuer_id   uuid not null references public.issuers(issuer_id) on delete cascade,
  ticker      text not null references public.stocks_universe(ticker) on delete cascade,
  isin        text check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  figi        text check (figi is null or figi ~ '^BBG[A-Z0-9]{9}$'),
  share_class text not null default 'unknown' check (share_class in ('A','H','ADR','common','preferred','other','unknown')),
  is_primary  boolean not null default false,
  valid_from  date not null,
  valid_to    date check (valid_to is null or valid_to > valid_from),
  source      text not null check (length(source) between 1 and 64),
  provenance  jsonb not null default '{}',
  primary key (issuer_id, ticker, valid_from),
  unique (ticker, valid_from),
  constraint issuer_securities_provenance_object check (jsonb_typeof(provenance) = 'object')
);
create index if not exists issuer_securities_ticker_idx on public.issuer_securities(ticker);
create unique index if not exists issuer_securities_open_owner_idx on public.issuer_securities(ticker) where valid_to is null;
create unique index if not exists issuer_securities_isin_idx on public.issuer_securities(isin, valid_from) where isin is not null;

create table if not exists public.issuer_identifier_claims (
  id          uuid primary key,
  issuer_id   uuid not null references public.issuers(issuer_id) on delete cascade,
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
  constraint industry_classifications_has_name check (name_zh is not null or name_en is not null)
);

create table if not exists public.issuer_industry_memberships (
  issuer_id   uuid not null references public.issuers(issuer_id) on delete cascade,
  scheme      text not null,
  version     text not null,
  code        text not null,
  valid_from  date not null,
  valid_to    date check (valid_to is null or valid_to > valid_from),
  source      text not null check (length(source) between 1 and 64),
  provenance  jsonb not null default '{}',
  primary key (issuer_id, scheme, version, code, valid_from),
  foreign key (scheme, version, code) references public.industry_classifications(scheme, version, code),
  constraint issuer_industry_memberships_provenance_object check (jsonb_typeof(provenance) = 'object')
);
create index if not exists issuer_industry_memberships_code_idx on public.issuer_industry_memberships(scheme, version, code);

alter table public.research_entity_keys add column if not exists issuer_id uuid references public.issuers(issuer_id);
alter table public.research_entity_securities add column if not exists ticker text references public.stocks_universe(ticker);

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
