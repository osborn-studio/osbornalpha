-- WP-A2: entity keys (implementation plan 2026-09-22 §5.2).
-- One company-key row per COMPANY entity and one row per listed security.
-- Master data, so owners may revise it; the S4 runtime only reads it.
-- Check digits (ISIN/LEI/USCI) are verified in src/lib/research/entity-keys/identifiers.ts;
-- the database constrains shape only. Replayable: guarded create statements.

create unique index if not exists research_entities_owner_id on public.research_entities(user_id,id);

create table if not exists public.research_entity_keys (
  user_id        uuid not null references auth.users(id) on delete cascade,
  entity_id      uuid not null,
  lei            text check (lei is null or lei ~ '^[A-Z0-9]{18}[0-9]{2}$'),
  usci           text check (usci is null or usci ~ '^[0-9A-HJ-NP-RTUW-Y]{18}$'),
  cninfo_org_id  text check (cninfo_org_id is null or length(btrim(cninfo_org_id)) > 0),
  cik            text check (cik is null or cik ~ '^[1-9][0-9]{0,9}$'),
  names_zh       jsonb not null default '[]',
  names_en       jsonb not null default '[]',
  aliases        jsonb not null default '[]',
  home_market    text not null check (home_market in ('A','HK','US','other')),
  in_scope       boolean not null default false,
  cohort         text,
  provenance     jsonb not null default '{}',
  missing        jsonb not null default '[]',
  updated_at     timestamptz not null default now(),
  primary key (user_id,entity_id),
  foreign key (user_id,entity_id) references public.research_entities(user_id,id) on delete cascade
);
create unique index if not exists research_entity_keys_lei_idx on public.research_entity_keys(user_id,lei) where lei is not null;
create unique index if not exists research_entity_keys_usci_idx on public.research_entity_keys(user_id,usci) where usci is not null;
create unique index if not exists research_entity_keys_cik_idx on public.research_entity_keys(user_id,cik) where cik is not null;

create table if not exists public.research_entity_securities (
  user_id        uuid not null references auth.users(id) on delete cascade,
  id             uuid not null,
  entity_id      uuid not null,
  exchange_code  text not null check (exchange_code ~ '^[A-Z0-9.\-]{1,20}$'),
  mic            text check (mic is null or mic ~ '^[A-Z0-9]{4}$'),
  isin           text check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  market         text not null check (market in ('A','HK','US','other')),
  security_type  text not null default 'common' check (security_type in ('common','adr','preferred','other')),
  is_primary     boolean not null default true,
  valid_from     date not null,
  valid_to       date check (valid_to is null or valid_to > valid_from),
  provenance     jsonb not null default '{}',
  primary key (user_id,id),
  foreign key (user_id,entity_id) references public.research_entities(user_id,id) on delete cascade
);
create unique index if not exists research_entity_securities_code_idx on public.research_entity_securities(user_id,exchange_code,valid_from);
create unique index if not exists research_entity_securities_isin_idx on public.research_entity_securities(user_id,isin,valid_from) where isin is not null;
create index if not exists research_entity_securities_entity_idx on public.research_entity_securities(user_id,entity_id);

do $$ declare t text; begin
  foreach t in array array['research_entity_keys','research_entity_securities'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists "%s self select" on public.%I',t,t);
    execute format('create policy "%s self select" on public.%I for select to authenticated using (auth.uid() = user_id)',t,t);
    execute format('drop policy if exists "%s self insert" on public.%I',t,t);
    execute format('create policy "%s self insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)',t,t);
    execute format('drop policy if exists "%s self update" on public.%I',t,t);
    execute format('create policy "%s self update" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',t,t);
    execute format('drop policy if exists "%s self delete" on public.%I',t,t);
    execute format('create policy "%s self delete" on public.%I for delete to authenticated using (auth.uid() = user_id)',t,t);
    execute format('drop policy if exists s4_owner on public.%I',t);
    execute format('create policy s4_owner on public.%I for select to alpha_s4_runtime using (user_id = auth.uid())',t);
    execute format('grant select on public.%I to alpha_s4_runtime',t);
  end loop;
end $$;
