-- supabase/migrations/20261112090000_company_research.sql
-- Company research and tracking (spec 2026-11-04 company research §4, §0 #64, §0.1 item 2; plan
-- 2026-11-06 Task 1): six tables. Public/materialized tables — issuer_events (fact event timeline),
-- issuer_coverage (counts and dates per issuer+market), company_digest_state (materialisation cursor
-- and attempt ownership), company_fact_evidence (verified fact → raw snapshot index) — accept NO
-- direct insert/update/delete from any role, service_role included; every write goes through the
-- security definer functions of 20261112091000_company_research_functions.sql. issuer_events,
-- company_digest_state and company_fact_evidence are readable by service_role only (§0 #64: routes
-- assemble events and evidence server-side behind the evidence gate); issuer_coverage holds no
-- financial values and is public read. Per-user tables company_watches / company_event_reads are
-- RLS own-rows for authenticated (service_role: all, for tests and operations). The watch cap
-- (MAX_COMPANY_WATCHES = 200) and the receipt/issuer consistency are triggers.
-- Supabase grants ALL on new tables to anon/authenticated by default and RLS does not stop TRUNCATE,
-- so every table starts with revoke all. Functions keep the migration role as owner (hosted postgres
-- is not a superuser). Replayable: guarded creates, create or replace, drop-then-create policies and
-- triggers.

-- ---------------------------------------------------------------- 4.1 issuer_events
create table if not exists public.issuer_events (
  event_id           text primary key check (event_id ~ '^[0-9a-f]{64}$'),   -- sha256(canonical({issuer_id, market, kind, natural_key})), server-computed
  issuer_id          uuid not null references public.issuers(issuer_id) on delete restrict,
  market             text not null check (market in ('US','CN')),
  kind               text not null check (kind in ('filing_published','period_first_seen','fact_revised')),
  natural_key        text not null check (length(natural_key) between 1 and 256),           -- never contains a fact_id
  occurred_on        date not null,                                                          -- availability date
  period_end         date,
  concept            text check (concept is null or length(concept) between 1 and 64),
  filing_id          uuid references public.filings(filing_id) on delete restrict,
  payload            jsonb not null check (jsonb_typeof(payload) = 'object'),                -- economic content, hashed
  meta               jsonb not null default '{}' check (jsonb_typeof(meta) = 'object'),      -- display metadata, not hashed
  payload_hash       text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  based_on_rev       bigint not null check (based_on_rev >= 0),
  first_seen_at      timestamptz not null default now(),                                     -- kept across rebuilds and revivals
  payload_changed_at timestamptz,                                                            -- set only when payload_hash changes
  retired_at         timestamptz,                                                            -- tombstone
  rebuilt_at         timestamptz not null default now(),
  rebuild_id         uuid not null,                                                          -- one per replace call
  rebuild_batch_id   uuid not null references public.ingest_batches(batch_id) on delete restrict,
  constraint issuer_events_key_uniq unique (issuer_id, market, kind, natural_key)
);
create index if not exists issuer_events_timeline_idx on public.issuer_events(issuer_id, market, occurred_on desc, event_id) where retired_at is null;
create index if not exists issuer_events_seen_idx on public.issuer_events(first_seen_at desc, event_id) where retired_at is null;
create index if not exists issuer_events_issuer_seen_idx on public.issuer_events(issuer_id, first_seen_at desc, event_id desc) where retired_at is null;   -- inbox: issuer_id = any(watched)
create index if not exists issuer_events_filing_idx on public.issuer_events(filing_id);                                                                  -- FK checks on filings

-- ---------------------------------------------------------------- 4.2 issuer_coverage
create table if not exists public.issuer_coverage (
  issuer_id              uuid not null references public.issuers(issuer_id) on delete restrict,
  market                 text not null check (market in ('US','CN')),
  filings_count          int not null check (filings_count >= 0),
  facts_count            int not null check (facts_count >= 0),
  concepts_covered       int not null check (concepts_covered >= 0),
  earliest_period_end    date,
  latest_period_end      date,
  latest_available_date  date,
  citation_summary       jsonb not null check (jsonb_typeof(citation_summary) = 'object'),   -- {linked, pending, edgar}
  scope_last_success_at  timestamptz,
  scope_last_status      text check (scope_last_status in ('success','failed')),
  based_on_rev           bigint not null check (based_on_rev >= 0),
  rebuilt_at             timestamptz not null default now(),
  rebuild_id             uuid not null,
  rebuild_batch_id       uuid not null references public.ingest_batches(batch_id) on delete restrict,
  primary key (issuer_id, market)
);
create index if not exists issuer_coverage_latest_idx on public.issuer_coverage(latest_available_date desc);

-- ---------------------------------------------------------------- 4.3 company_watches / company_event_reads
create table if not exists public.company_watches (
  user_id     uuid not null references auth.users(id) on delete cascade,
  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
  note        text check (note is null or char_length(note) <= 2000),
  muted       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, issuer_id)
);
create index if not exists company_watches_user_updated_idx on public.company_watches(user_id, updated_at desc);
create index if not exists company_watches_issuer_idx on public.company_watches(issuer_id);

create table if not exists public.company_event_reads (
  user_id    uuid not null references auth.users(id) on delete cascade,
  issuer_id  uuid not null,
  event_id   text not null references public.issuer_events(event_id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (user_id, event_id),
  constraint company_event_reads_watch_fkey foreign key (user_id, issuer_id) references public.company_watches(user_id, issuer_id) on delete cascade
);
create index if not exists company_event_reads_user_issuer_idx on public.company_event_reads(user_id, issuer_id);
create index if not exists company_event_reads_event_idx on public.company_event_reads(event_id);

-- ---------------------------------------------------------------- 4.4 company_digest_state
create table if not exists public.company_digest_state (
  issuer_id               uuid not null references public.issuers(issuer_id) on delete cascade,
  market                  text not null check (market in ('US','CN')),
  digested_rev            bigint not null default 0 check (digested_rev >= 0),
  attempt_seq             bigint not null default 0 check (attempt_seq >= 0),
  last_attempt_id         bigint,
  last_success_attempt_id bigint,
  last_failed_attempt_id  bigint,          -- largest accepted failed attempt (monotone, §0 #70)
  last_attempt_at         timestamptz,
  last_status             text check (last_status in ('success','failed')),
  consecutive_failures    int not null default 0 check (consecutive_failures >= 0),
  next_attempt_at         timestamptz not null default 'epoch',
  swept_at                timestamptz,
  updated_at              timestamptz not null default now(),
  primary key (issuer_id, market)
);
create index if not exists company_digest_state_next_idx on public.company_digest_state(next_attempt_at);
create index if not exists company_digest_state_swept_idx on public.company_digest_state(swept_at nulls first);

-- ---------------------------------------------------------------- §0.1 item 2 company_fact_evidence
-- One verified association fact → raw snapshot. raw_hash = sha256(snapshot_sha256 || '\n' || hash_locator)
-- (it is NOT the object hash). issuer_id/market are denormalised from the fact (the writer function
-- checks them) so a stream can be replaced as a whole.
create table if not exists public.company_fact_evidence (
  fact_id          uuid primary key references public.financial_facts(fact_id) on delete cascade,
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  raw_hash         text not null check (raw_hash ~ '^[0-9a-f]{64}$'),
  snapshot_sha256  text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_path    text not null check (length(snapshot_path) between 1 and 512),
  hash_locator     text not null check (length(hash_locator) between 1 and 1024),
  json_pointer     text not null check (json_pointer ~ '^/' and length(json_pointer) <= 1024),
  field            text check (field is null or length(field) between 1 and 64),
  source           text not null check (source in ('edgar','tushare')),
  api              text check (api is null or length(api) between 1 and 64),
  url              text check (url is null or length(url) between 1 and 2048),
  params           jsonb check (params is null or jsonb_typeof(params) = 'object'),   -- never a token
  captured_at      timestamptz,                                                        -- sidecar first-write time ("snapshot first fetched")
  http_status      int check (http_status is null or http_status between 100 and 599),
  page             int check (page is null or page >= 0),
  index_version    text not null check (length(index_version) between 1 and 64),
  verified_at      timestamptz not null default now()
);
create index if not exists company_fact_evidence_stream_idx on public.company_fact_evidence(issuer_id, market);

-- ---------------------------------------------------------------- triggers
-- MAX_COMPANY_WATCHES = 200 (decision F). Serialised per user by a transaction-scoped advisory lock;
-- an existing (user_id, issuer_id) is let through so the primary key / on conflict decides; rows an
-- outer multi-row insert already wrote are visible to the count. security definer: the count must
-- see every row of the user whatever the caller's RLS.
create or replace function public.company_watches_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('company_watches:' || new.user_id::text));
  new.created_at := now();   -- server time: clients cannot supply their own timestamps
  new.updated_at := now();
  if exists (select 1 from public.company_watches w where w.user_id = new.user_id and w.issuer_id = new.issuer_id) then
    return new;
  end if;
  select count(*) into n from public.company_watches w where w.user_id = new.user_id;
  if n >= 200 then
    raise exception 'watch_limit' using errcode = '23514', detail = 'MAX_COMPANY_WATCHES = 200';
  end if;
  return new;
end $$;
revoke execute on function public.company_watches_limit() from public, anon, authenticated, service_role;
drop trigger if exists company_watches_limit on public.company_watches;
create trigger company_watches_limit before insert on public.company_watches
  for each row execute function public.company_watches_limit();

-- updated_at is server time; the key never changes (receipts hang off it).
create or replace function public.company_watches_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.user_id, new.issuer_id, new.created_at) is distinct from (old.user_id, old.issuer_id, old.created_at) then
    raise exception 'immutable_watch_key' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.company_watches_touch() from public, anon, authenticated, service_role;
drop trigger if exists company_watches_touch on public.company_watches;
create trigger company_watches_touch before update on public.company_watches
  for each row execute function public.company_watches_touch();

-- A receipt names an event of its own issuer (either market). security definer: authenticated
-- cannot read issuer_events (§0 #64).
create or replace function public.company_event_reads_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.issuer_events e where e.event_id = new.event_id and e.issuer_id = new.issuer_id) then
    raise exception 'invalid_read' using errcode = '23514', detail = 'event does not belong to the issuer';
  end if;
  return new;
end $$;
revoke execute on function public.company_event_reads_check() from public, anon, authenticated, service_role;
drop trigger if exists company_event_reads_check on public.company_event_reads;
create trigger company_event_reads_check before insert on public.company_event_reads
  for each row execute function public.company_event_reads_check();

-- ---------------------------------------------------------------- privileges and policies (§4.6 + §0 #64)
do $$ declare t text; begin
  foreach t in array array['issuer_events','issuer_coverage','company_watches','company_event_reads','company_digest_state','company_fact_evidence'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['issuer_events','company_digest_state','company_fact_evidence'] loop
    execute format('grant select on public.%I to service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
end $$;
grant select on public.issuer_coverage to anon, authenticated, service_role;
drop policy if exists "issuer_coverage public read" on public.issuer_coverage;
create policy "issuer_coverage public read" on public.issuer_coverage for select using (true);

grant select, insert, update, delete on public.company_watches to authenticated, service_role;
drop policy if exists "company_watches own select" on public.company_watches;
create policy "company_watches own select" on public.company_watches for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "company_watches own insert" on public.company_watches;
create policy "company_watches own insert" on public.company_watches for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "company_watches own update" on public.company_watches;
create policy "company_watches own update" on public.company_watches for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "company_watches own delete" on public.company_watches;
create policy "company_watches own delete" on public.company_watches for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "company_watches service all" on public.company_watches;
create policy "company_watches service all" on public.company_watches for all to service_role using (true) with check (true);

grant select, insert, delete on public.company_event_reads to authenticated, service_role;
drop policy if exists "company_event_reads own select" on public.company_event_reads;
create policy "company_event_reads own select" on public.company_event_reads for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "company_event_reads own insert" on public.company_event_reads;
create policy "company_event_reads own insert" on public.company_event_reads for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "company_event_reads own delete" on public.company_event_reads;
create policy "company_event_reads own delete" on public.company_event_reads for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "company_event_reads service all" on public.company_event_reads;
create policy "company_event_reads service all" on public.company_event_reads for all to service_role using (true) with check (true);
