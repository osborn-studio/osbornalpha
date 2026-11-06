-- supabase/migrations/20261107090000_identifiers_and_dq.sql
-- Data foundation 3, migration one (spec 2026-11-04-data-foundation-3 §3.1; plan 3 Tasks 1a/1b).
-- issuer_securities gains evidence methods for both window ends; issuer_identifier_claims becomes
-- the claim/1 review queue (op, target_key, detail, resolution columns); dq_reconciliations gains
-- pair/kind/outcome/detail and the cycle-result columns; new tables hold reconcile cycles and
-- cursors, calendar passes and their frozen members, filer categories, filing expectations and
-- filing profiles; dq_freshness accepts 'weekly'; bucket reconcile-raw stores raw evidence.
-- Replayable: every column added to an existing table is added together with its one-time backfill
-- inside a guard on information_schema.columns, so a replay never rewrites evidence written after
-- the first run (spec §3). Constraints are dropped-if-exists then added (old rows satisfy them).
-- New tables are service-role only (RLS on, client roles revoked; service_role gets only what its
-- writers need — function-written tables are SELECT only). Business writes go through the security
-- definer functions in the second half (Task 1b); errors carry the code as the message.
-- The hosted postgres role is not a superuser: no `alter function … owner`; search_path = public.
-- Only the buckets table is referenced (local harness).

-- ---------------------------------------------------------------- issuer_securities: window-end methods (§3.1, §4.3.1)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_securities' and column_name = 'valid_from_method') then
    alter table public.issuer_securities
      add column valid_from_method text not null default 'first_observed',
      add column valid_to_method text;
    -- One-time backfill: curated rows were entered by hand; a closed row of any other source has no
    -- evidence for its end (an observation bound, 'unrecorded').
    update public.issuer_securities set valid_from_method = 'curated' where source = 'curated';
    update public.issuer_securities set valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end where valid_to is not null;
  end if;
end $$;
alter table public.issuer_securities
  drop constraint if exists issuer_securities_valid_from_method_check,
  drop constraint if exists issuer_securities_valid_to_method_check,
  drop constraint if exists issuer_securities_to_method_iff_to,
  add constraint issuer_securities_valid_from_method_check check (valid_from_method in ('first_observed','listing_date','ticker_change','curated')),
  add constraint issuer_securities_valid_to_method_check check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded')),
  add constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null));

-- ---------------------------------------------------------------- issuer_identifier_claims: claim/1 (§3.1, §4.2.1)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_identifier_claims' and column_name = 'op') then
    -- Existing rows become op='legacy', target_key='', detail='{}' through the defaults: they cannot be
    -- resolved by the route, only by runbook §4 SQL or rejection.
    alter table public.issuer_identifier_claims
      add column op text not null default 'legacy',
      add column target_key text not null default '',
      add column detail jsonb not null default '{}',
      add column resolved_by uuid,
      add column resolved_at timestamptz;
  end if;
end $$;
alter table public.issuer_identifier_claims alter column confidence drop not null;
alter table public.issuer_identifier_claims
  drop constraint if exists issuer_identifier_claims_id_type_check,
  drop constraint if exists issuer_identifier_claims_op_check,
  drop constraint if exists issuer_identifier_claims_target_key_check,
  drop constraint if exists issuer_identifier_claims_target_key_required,
  drop constraint if exists issuer_identifier_claims_detail_object,
  drop constraint if exists issuer_identifier_claims_pending_has_no_resolution,
  add constraint issuer_identifier_claims_id_type_check check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id','ticker')),
  add constraint issuer_identifier_claims_op_check check (op in ('legacy','evidence_only','set_identifier','correct_identifier','attach_security','close_security','backdate_window')),
  add constraint issuer_identifier_claims_target_key_check check (length(target_key) <= 256),
  add constraint issuer_identifier_claims_target_key_required check (op = 'legacy' or length(target_key) > 0),
  add constraint issuer_identifier_claims_detail_object check (jsonb_typeof(detail) = 'object'),
  add constraint issuer_identifier_claims_pending_has_no_resolution check (status <> 'pending' or resolved_at is null);
-- At most one PENDING claim per (issuer, id_type, value, op, target): fileClaim converges concurrent
-- filers on it (23505 → append evidence to the winner's detail.sources).
drop index if exists public.issuer_identifier_claims_pending_unique;
create unique index issuer_identifier_claims_pending_unique on public.issuer_identifier_claims(issuer_id, id_type, value, op, target_key) where status = 'pending';

-- ---------------------------------------------------------------- dq_reconciliations: pairs, kinds, outcomes, cycle rows (§3.1, T2)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dq_reconciliations' and column_name = 'pair') then
    alter table public.dq_reconciliations
      add column pair text not null default 'legacy',
      add column kind text not null default 'numeric',
      add column outcome text not null default 'compared',
      add column detail jsonb not null default '{}',
      add column cycle_id text,
      add column issuer_id uuid references public.issuers(issuer_id) on delete restrict,
      add column market text,
      add column attempt int;
    -- The table had no writer before this migration (production is empty); any row is legacy.
    update public.dq_reconciliations set outcome = 'legacy';
  end if;
end $$;
alter table public.dq_reconciliations
  drop constraint if exists dq_reconciliations_pair_check,
  drop constraint if exists dq_reconciliations_kind_check,
  drop constraint if exists dq_reconciliations_outcome_check,
  drop constraint if exists dq_reconciliations_detail_object,
  drop constraint if exists dq_reconciliations_market_check,
  drop constraint if exists dq_reconciliations_attempt_check,
  drop constraint if exists dq_reconciliations_cycle_cols,
  drop constraint if exists dq_reconciliations_numeric_sides,
  drop constraint if exists dq_reconciliations_nonnumeric_sides,
  add constraint dq_reconciliations_pair_check check (length(pair) between 1 and 64),
  add constraint dq_reconciliations_kind_check check (kind in ('numeric','text','date')),
  add constraint dq_reconciliations_outcome_check check (outcome in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold','legacy')),
  add constraint dq_reconciliations_detail_object check (jsonb_typeof(detail) = 'object'),
  add constraint dq_reconciliations_market_check check (market is null or market in ('US','CN')),
  add constraint dq_reconciliations_attempt_check check (attempt is null or attempt >= 1),
  -- Cycle result rows (T2) carry all four columns; old rows and out-of-cycle records carry none.
  add constraint dq_reconciliations_cycle_cols check ((cycle_id is null) = (issuer_id is null) and (cycle_id is null) = (market is null) and (cycle_id is null) = (attempt is null)),
  add constraint dq_reconciliations_numeric_sides check (kind <> 'numeric' or outcome <> 'compared' or (left_value is not null and right_value is not null)),
  -- text/date values live in detail.left_text/right_text; passed is string/date equality.
  add constraint dq_reconciliations_nonnumeric_sides check (kind = 'numeric' or (left_value is null and right_value is null and rel_diff is null and abs_diff is null));
create index if not exists dq_reconciliations_pair_created_idx on public.dq_reconciliations(pair, created_at desc);
-- The accepted-result marker: at most one row per cycle and key (apply_reconcile_result reuses it).
create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;

-- ---------------------------------------------------------------- dq_freshness: weekly cadence (§3.1)
alter table public.dq_freshness
  drop constraint if exists dq_freshness_expected_cadence_check,
  add constraint dq_freshness_expected_cadence_check check (expected_cadence in ('daily','weekly','monthly','quarterly','event'));

-- ---------------------------------------------------------------- reconcile cycles and cursor (§3.1, §5.5)
create table if not exists public.dq_reconcile_cycles (
  pair                text not null check (length(pair) between 1 and 64),
  cycle_id            text not null check (length(cycle_id) between 1 and 64),
  started_at          timestamptz not null,
  finished_at         timestamptz,
  members             jsonb not null,                                -- frozen [{issuer_id, market, expected_keys}]
  status              text not null check (status in ('running','complete','complete_with_gaps')),
  expected_total      int not null check (expected_total >= 0),
  compared_passed     int not null default 0 check (compared_passed >= 0),
  compared_failed     int not null default 0 check (compared_failed >= 0),
  not_compared        int not null default 0 check (not_compared >= 0),
  exec_failed_members int not null default 0 check (exec_failed_members >= 0),
  detail              jsonb not null default '{}',                   -- pending_members (set_merge, migration two) and settlement notes
  primary key (pair, cycle_id),
  constraint dq_reconcile_cycles_members_array check (jsonb_typeof(members) = 'array'),
  constraint dq_reconcile_cycles_detail_object check (jsonb_typeof(detail) = 'object'),
  constraint dq_reconcile_cycles_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
);
create unique index if not exists dq_reconcile_cycles_running_uniq on public.dq_reconcile_cycles(pair) where status = 'running';

create table if not exists public.dq_reconcile_cursor (
  pair             text not null,
  cycle_id         text not null,
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  expected         int not null,                                     -- this member's expected key count (frozen)
  state            text not null default 'pending' check (state in ('pending','claimed','done','failed')),
  claimed_by       uuid references public.ingest_batches(batch_id) on delete set null,
  claim_until      timestamptz,
  attempts         int not null default 0 check (attempts >= 0),
  last_error       text,
  done_at          timestamptz,
  compared_passed  int,
  compared_failed  int,
  not_compared     int,
  primary key (pair, cycle_id, issuer_id, market),
  constraint dq_reconcile_cursor_cycle_fkey foreign key (pair, cycle_id) references public.dq_reconcile_cycles(pair, cycle_id) on delete restrict,
  constraint drc_expected_nonneg check (expected >= 0),
  constraint drc_counters_nonneg check ((compared_passed is null or compared_passed >= 0) and (compared_failed is null or compared_failed >= 0) and (not_compared is null or not_compared >= 0)),
  -- S5: a done row has all three counters, non-null, summing to expected; settlement never coalesces.
  constraint drc_done_accounted check (state <> 'done' or (compared_passed is not null and compared_failed is not null and not_compared is not null and compared_passed + compared_failed + not_compared = expected))
);
create index if not exists dq_reconcile_cursor_state_idx on public.dq_reconcile_cursor(pair, cycle_id, state);

-- ---------------------------------------------------------------- calendar passes (§3.1, §6.2, T3/U1)
create table if not exists public.dq_calendar_passes (
  market       text not null check (market in ('US','CN')),
  pass_id      uuid not null,
  started_at   timestamptz not null,
  finished_at  timestamptz,
  claimed_by   uuid references public.ingest_batches(batch_id) on delete set null,   -- one leased worker per market and pass
  claim_until  timestamptz,
  status       text not null default 'running' check (status in ('running','complete','complete_with_failures')),
  primary key (market, pass_id),
  constraint dcp_finished_iff_terminal check ((finished_at is null) = (status = 'running'))
);
create unique index if not exists dq_calendar_passes_open_uniq on public.dq_calendar_passes(market) where finished_at is null;

-- Frozen when the pass is created (in-scope issuers); scope changes during a pass go to the next one.
create table if not exists public.dq_calendar_pass_members (
  market      text not null,
  pass_id     uuid not null,
  issuer_id   uuid not null references public.issuers(issuer_id) on delete restrict,
  state       text not null default 'pending' check (state in ('pending','done','failed')),
  attempts    int not null default 0 check (attempts >= 0),
  last_error  text,
  done_at     timestamptz,
  primary key (market, pass_id, issuer_id),
  constraint dq_calendar_pass_members_pass_fkey foreign key (market, pass_id) references public.dq_calendar_passes(market, pass_id) on delete restrict
);
create index if not exists dq_calendar_pass_members_state_idx on public.dq_calendar_pass_members(market, pass_id, state);

-- ---------------------------------------------------------------- filer categories, expectations, profiles (§3.1, §6.1)
-- Per fiscal year, from that year's 10-K cover page (iXBRL dei), never from submissions.category.
create table if not exists public.issuer_filer_categories (
  issuer_id          uuid not null references public.issuers(issuer_id) on delete restrict,
  fiscal_year        int not null,
  acceleration       text not null check (acceleration in ('large_accelerated','accelerated','non_accelerated')),
  smaller_reporting  boolean,
  category_raw       text not null check (length(category_raw) between 1 and 256),
  source             text not null check (source in ('ixbrl_dei')),
  accession          text not null check (length(accession) between 1 and 32),
  evidence_sha256    text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  as_of              date not null,
  primary key (issuer_id, fiscal_year)
);

create table if not exists public.dq_filing_expectations (
  issuer_id            uuid not null references public.issuers(issuer_id) on delete restrict,
  market               text not null check (market in ('US','CN')),
  report_kind          text not null check (report_kind in ('10-K','10-Q','20-F','40-F','annual','semiannual','q1','q3')),
  period_end           date not null,
  period_end_estimated boolean not null default false,
  deadline_state       text not null check (deadline_state in ('statutory','estimated','no_rule')),
  due_date             date,
  due_rule             text not null check (length(due_rule) between 1 and 64),
  expected_date        date,                                            -- CN appointment date (same period)
  upstream_lookup      text not null check (upstream_lookup in ('ok','unavailable','not_applicable')),
  upstream_filed_date  date,
  disclosure_state     text not null check (disclosure_state in ('pending','overdue','filed_not_ingested','received','received_late','unknown_upstream')),
  received_filing_id   uuid,
  received_date        date,
  profile_as_of        date,
  detail               jsonb not null default '{}',
  computed_at          timestamptz not null,
  batch_id             uuid not null references public.ingest_batches(batch_id) on delete restrict,
  primary key (issuer_id, market, report_kind, period_end),
  constraint dq_filing_expectations_detail_object check (jsonb_typeof(detail) = 'object'),
  -- deadline_state and disclosure_state are orthogonal: a no_rule row may still be received.
  constraint dfe_due_iff_known check ((due_date is null) = (deadline_state = 'no_rule')),
  constraint dfe_received_iff check ((disclosure_state in ('received','received_late')) = (received_filing_id is not null and received_date is not null)),
  constraint dfe_late_requires_due check (disclosure_state <> 'received_late' or due_date is not null),
  -- estimated rows are never overdue: past due they stay pending with detail.estimated_due_passed=true
  constraint dfe_overdue_requires_statutory check (disclosure_state <> 'overdue' or deadline_state = 'statutory'),
  constraint dfe_unknown_upstream_iff check ((disclosure_state = 'unknown_upstream') = (upstream_lookup = 'unavailable' and received_filing_id is null))
);
-- received_filing_id and received_date travel together, whatever the state (Codex round 1 P2)
alter table public.dq_filing_expectations drop constraint if exists dfe_received_pair, add constraint dfe_received_pair check ((received_filing_id is null) = (received_date is null));
create index if not exists dq_filing_expectations_state_idx on public.dq_filing_expectations(market, disclosure_state, due_date);

create table if not exists public.issuer_filing_profiles (
  issuer_id             uuid not null references public.issuers(issuer_id) on delete restrict,
  market                text not null check (market in ('US','CN')),
  category_raw_current  text,                                           -- submissions.category as written; reference only, never decides a deadline
  regime                text not null check (regime in ('10-K','20-F','40-F','cn')),
  fiscal_year_end       text check (fiscal_year_end ~ '^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'),
  week52_pattern        boolean not null default false,
  source                text not null check (length(source) between 1 and 64),
  source_sha256         text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  as_of                 date not null,
  updated_at            timestamptz not null default now(),
  primary key (issuer_id, market)
);

-- ---------------------------------------------------------------- privileges (service-role only)
do $$ declare t text; begin
  foreach t in array array['dq_reconcile_cycles','dq_reconcile_cursor','dq_calendar_passes','dq_calendar_pass_members','issuer_filer_categories','dq_filing_expectations','issuer_filing_profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
-- run.ts creates and settles cycles and inserts the frozen cursor rows; claiming, completing and
-- failing a cursor row happen only in migration two's functions (fenced).
grant select, insert, update on public.dq_reconcile_cycles to service_role;
grant select, insert on public.dq_reconcile_cursor to service_role;
-- Written only by the pass functions below (fenced): read-only for every client role.
grant select on public.dq_calendar_passes, public.dq_calendar_pass_members, public.dq_filing_expectations to service_role;
-- Plain registries written by the calendar sync and filer-category scripts through TableClient.
grant select, insert, update, delete on public.issuer_filer_categories, public.issuer_filing_profiles to service_role;

-- ---------------------------------------------------------------- bucket reconcile-raw (§3.1)
-- Content-addressed raw evidence (<kind>/<sha256>.<ext>), private, no object-level policy, so only
-- the service role reaches it. Uploads use upsert:false; 409 means the bytes are already stored.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reconcile-raw', 'reconcile-raw', false, 52428800,
        array['application/json','text/html','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
