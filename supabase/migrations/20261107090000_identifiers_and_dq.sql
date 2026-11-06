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

-- ================================================================ functions (plan 3 Task 1b)
-- ---------------------------------------------------------------- claim/1 helpers (internal; §4.2.1)
-- claims.ts::validateClaimDetail mirrors identifier_claim_problem: keep the two in step.
create or replace function public.claim_text_is_date(p text) returns boolean
language plpgsql immutable set search_path = public as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform p::date;                                   -- rejects 2026-02-30
  return true;
exception when others then return false;
end $$;
revoke execute on function public.claim_text_is_date(text) from public, anon, authenticated, service_role;

create or replace function public.claim_keys_within(p jsonb, p_allowed text[]) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(bool_and(k = any(p_allowed)), true) from jsonb_object_keys(p) k
$$;
revoke execute on function public.claim_keys_within(jsonb, text[]) from public, anon, authenticated, service_role;

create or replace function public.claim_evidence_ok(e jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(e is not null and jsonb_typeof(e) = 'object'
    and jsonb_typeof(e -> 'source') = 'string' and length(e ->> 'source') between 1 and 64
    and public.claim_text_is_date(e ->> 'as_of')
    and coalesce(e ->> 'evidence_sha256', '') ~ '^[0-9a-f]{64}$'
    and (not (e ? 'locator') or jsonb_typeof(e -> 'locator') = 'string')
    and (not (e ? 'note') or jsonb_typeof(e -> 'note') = 'string'), false)
$$;
revoke execute on function public.claim_evidence_ok(jsonb) from public, anon, authenticated, service_role;

-- Recursive public-provenance guard (mirrors the TS sanitizeProvenance rules): no secret-like keys, no
-- URL query strings / fragments, no key=/token= assignments, no UUIDs, bounded depth and length.
-- Claim evidence may hold private notes; only what passes here may reach a public provenance column.
create or replace function public.claim_provenance_safe(p jsonb, p_depth int default 0) returns boolean
language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; s text;
begin
  if p is null or p_depth > 4 then return false; end if;
  case jsonb_typeof(p)
    when 'object' then
      for k, v in select * from jsonb_each(p) loop
        if k ~* '(secret|token|passw|api[_-]?key|authorization|user_?id|cookie|credential|private)' then return false; end if;
        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
      end loop;
    when 'array' then
      for v in select * from jsonb_array_elements(p) loop
        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
      end loop;
    when 'string' then
      s := p #>> '{}';
      if length(s) > 500 then return false; end if;
      if s ~* '[a-z][a-z0-9+.-]*://[^[:space:]]*[?#]' or s ~ '\?[^[:space:]]*=' then return false; end if;
      if s ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then return false; end if;
      if s ~* '(token|secret|passw[a-z]*|api[_-]?key|\mkey)\s*[=:]' then return false; end if;
    else null;
  end case;
  return true;
end $$;
revoke execute on function public.claim_provenance_safe(jsonb, int) from public, anon, authenticated, service_role;

-- target_key = op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (claims.ts::claimTargetKey).
create or replace function public.identifier_claim_target_key(p_op text, p_target jsonb) returns text
language sql immutable set search_path = public as $$
  select p_op || ':' || case when p_target ? 'ticker'
    then coalesce(p_target ->> 'issuer_id', '') || '|' || coalesce(p_target ->> 'ticker', '') || '|' || coalesce(p_target ->> 'valid_from', '')
    else coalesce(p_target ->> 'issuer_id', '') end
$$;
revoke execute on function public.identifier_claim_target_key(text, jsonb) from public, anon, authenticated, service_role;

-- null when the (op, id_type, value, detail) is a valid claim/1 for issuer p_issuer, else the field at fault.
create or replace function public.identifier_claim_problem(p_op text, p_id_type text, p_value text, p_issuer uuid, p_detail jsonb)
returns text language plpgsql stable set search_path = public as $$
declare t jsonb; pa jsonb; pw jsonb; s jsonb; full_target boolean; allowed text[];
begin
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' or p_detail ->> 'schema' is distinct from 'claim/1' then return 'schema'; end if;
  if coalesce(p_detail ->> 'evidence_kind', '') not in ('hard_identifier','official_list','name_match','filing_form','provider_mapping') then return 'evidence_kind'; end if;
  t := p_detail -> 'target'; pa := p_detail -> 'params'; pw := p_detail -> 'provenance_written';
  if t is null or jsonb_typeof(t) <> 'object' or t ->> 'issuer_id' is distinct from p_issuer::text then return 'target.issuer_id'; end if;
  if pa is null or jsonb_typeof(pa) <> 'object' then return 'params'; end if;
  if not public.claim_evidence_ok(p_detail -> 'evidence') then return 'evidence'; end if;
  if jsonb_typeof(p_detail -> 'sources') is distinct from 'array' then return 'sources'; end if;
  for s in select x from jsonb_array_elements(p_detail -> 'sources') x loop
    if not public.claim_evidence_ok(s) then return 'sources'; end if;
  end loop;
  if pw is not null and jsonb_typeof(pw) <> 'object' then return 'provenance_written'; end if;
  full_target := t ? 'ticker' or t ? 'valid_from';
  if full_target then
    if jsonb_typeof(t -> 'ticker') is distinct from 'string' or length(t ->> 'ticker') not between 1 and 32
       or not public.claim_text_is_date(t ->> 'valid_from')
       or not public.claim_keys_within(t, array['issuer_id','ticker','valid_from']) then return 'target'; end if;
  elsif not public.claim_keys_within(t, array['issuer_id']) then
    return 'target';
  end if;
  if p_op in ('set_identifier','correct_identifier') then
    if p_id_type in ('lei','cik','usci','cninfo_org_id') then
      if full_target then return 'target'; end if;
    elsif p_id_type in ('isin','figi') then
      if not full_target then return 'target'; end if;
    else
      return 'op_id_type';
    end if;
    if p_op = 'set_identifier' then
      if not public.claim_keys_within(pa, array['candidates','note'])
         or (pa ? 'candidates' and jsonb_typeof(pa -> 'candidates') <> 'array')
         or (pa ? 'note' and jsonb_typeof(pa -> 'note') <> 'string') then return 'params'; end if;
    else
      if not public.claim_keys_within(pa, array['expected_current','new_value','candidates','note'])
         or jsonb_typeof(pa -> 'expected_current') is distinct from 'string' or length(pa ->> 'expected_current') not between 1 and 64
         or jsonb_typeof(pa -> 'new_value') is distinct from 'string' or length(pa ->> 'new_value') not between 1 and 64
         or pa ->> 'expected_current' = pa ->> 'new_value' then return 'params'; end if;
      if pa ->> 'new_value' is distinct from p_value then return 'params.new_value'; end if;
    end if;
    allowed := array[p_id_type];
  elsif p_op = 'attach_security' then
    if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
    if not public.claim_keys_within(pa, array['share_class','valid_from','valid_from_method','source','isin','note','ticker'])
       or coalesce(pa ->> 'share_class', '') not in ('A','H','ADR','common','preferred','other','unknown')
       or not public.claim_text_is_date(pa ->> 'valid_from')
       or coalesce(pa ->> 'valid_from_method', '') not in ('first_observed','listing_date','ticker_change','curated')
       or jsonb_typeof(pa -> 'source') is distinct from 'string' or length(pa ->> 'source') not between 1 and 64
       or (pa ? 'isin' and coalesce(jsonb_typeof(pa -> 'isin'), '') not in ('string','null'))
       or (pa ? 'ticker' and (jsonb_typeof(pa -> 'ticker') is distinct from 'string' or (pa ->> 'ticker') !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$')) then return 'params'; end if;
    -- the inserted ticker is params.ticker, else the claim value (which an evidence_only amendment leaves as the accession)
    if not (pa ? 'ticker') and p_value !~ '^[A-Z0-9][A-Z0-9.-]{0,31}$' then return 'params.ticker'; end if;
    if jsonb_typeof(pa -> 'isin') = 'string' and (pa ->> 'isin') !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' then return 'params'; end if;
    allowed := array['isin','figi','valid_from'];
  elsif p_op in ('close_security','backdate_window') then
    if p_id_type <> 'ticker' or not full_target then return 'op_id_type'; end if;
    if t ->> 'ticker' is distinct from p_value then return 'target.ticker'; end if;
    if p_op = 'close_security' then
      if not public.claim_keys_within(pa, array['valid_to','valid_to_method','note'])
         or not public.claim_text_is_date(pa ->> 'valid_to')
         or coalesce(pa ->> 'valid_to_method', '') not in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded') then return 'params'; end if;
      if (pa ->> 'valid_to')::date <= (t ->> 'valid_from')::date then return 'params'; end if;
      allowed := array['valid_to'];
    else
      if not public.claim_keys_within(pa, array['new_valid_from','valid_from_method','note'])
         or not public.claim_text_is_date(pa ->> 'new_valid_from')
         or coalesce(pa ->> 'valid_from_method', '') not in ('listing_date','ticker_change','curated') then return 'params'; end if;
      if (pa ->> 'new_valid_from')::date >= (t ->> 'valid_from')::date then return 'params'; end if;
      allowed := array['valid_from'];
    end if;
  elsif p_op = 'evidence_only' then
    if p_id_type <> 'ticker' or full_target then return 'op_id_type'; end if;
    if pa ? 'suggested_op' and coalesce(pa ->> 'suggested_op', '') not in ('attach_security','close_security','backdate_window') then return 'params.suggested_op'; end if;
    allowed := array[]::text[];
  else
    return 'op';
  end if;
  if pw is not null and (not public.claim_keys_within(pw, allowed) or not public.claim_provenance_safe(pw)) then return 'provenance_written'; end if;
  return null;
end $$;
revoke execute on function public.identifier_claim_problem(text, text, text, uuid, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- resolve_identifier_claim (§3.1, §4.2.1, §7.1)
-- Locks the claim; refuses non-pending (already_resolved), legacy (legacy_claim) and evidence_only
-- acceptance without an amend (amend_required); validates claim/1 and the stored target_key
-- (invalid_claim); 'rejected' only flips the status. 'accepted' performs the op's business write in
-- the same transaction with static SQL under a guard that must hit exactly one row of an active
-- issuer, merges detail.provenance_written (or, absent, the claim's evidence under the op's key) into
-- the target row's provenance, then records status/resolved_by/resolved_at. Any failure raises and
-- rolls back everything, so the claim stays pending.
create or replace function public.resolve_identifier_claim(p_id uuid, p_status text, p_resolved_by uuid, p_amend jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.issuer_identifier_claims;
  v_op text; v_value text; v_detail jsonb; v_amended boolean := false; v_problem text;
  t jsonb; pa jsonb; v_pw jsonb; v_key text; v_status text; n int; v_ev jsonb; v_safe jsonb; v_ticker text;
begin
  if p_status is null or p_status not in ('accepted','rejected') or p_resolved_by is null then
    raise exception 'invalid_claim' using errcode = '22023';
  end if;
  select * into c from public.issuer_identifier_claims where id = p_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if c.status <> 'pending' then raise exception 'already_resolved' using errcode = 'P0001'; end if;
  if c.op = 'legacy' then raise exception 'legacy_claim' using errcode = 'P0001'; end if;
  v_op := c.op; v_value := c.value; v_detail := c.detail;
  if p_amend is not null then
    -- Only an evidence_only claim is amended, only on acceptance, only into a ticker op (§4.2.1).
    if c.op <> 'evidence_only' or p_status <> 'accepted' or jsonb_typeof(p_amend) <> 'object'
       or coalesce(p_amend ->> 'op', '') not in ('attach_security','close_security','backdate_window')
       or jsonb_typeof(p_amend -> 'target') is distinct from 'object' or jsonb_typeof(p_amend -> 'params') is distinct from 'object' then
      raise exception 'invalid_claim' using errcode = '22023';
    end if;
    v_op := p_amend ->> 'op';
    v_detail := c.detail || jsonb_build_object('target', p_amend -> 'target', 'params', p_amend -> 'params',
      'original_op', c.op, 'original_target', c.detail -> 'target', 'original_params', c.detail -> 'params',
      'amended_by', p_resolved_by, 'amended_at', clock_timestamp());
    if (p_amend -> 'target') ? 'ticker' then v_value := p_amend -> 'target' ->> 'ticker'; end if;
    v_amended := true;
  elsif c.op = 'evidence_only' and p_status = 'accepted' then
    raise exception 'amend_required' using errcode = 'P0001';
  end if;
  v_problem := public.identifier_claim_problem(v_op, c.id_type, v_value, c.issuer_id, v_detail);
  if v_problem is not null then raise exception 'invalid_claim' using errcode = '22023', detail = v_problem; end if;
  if c.target_key is distinct from public.identifier_claim_target_key(c.op, c.detail -> 'target') then
    raise exception 'invalid_claim' using errcode = '22023', detail = 'target_key';
  end if;

  if p_status = 'rejected' then
    update public.issuer_identifier_claims set status = 'rejected', resolved_by = p_resolved_by, resolved_at = clock_timestamp() where id = p_id;
    return jsonb_build_object('op', c.op, 'applied', false, 'amended', false);
  end if;

  select status into v_status from public.issuers where issuer_id = c.issuer_id for update;
  if v_status is distinct from 'active' then raise exception 'issuer_not_active' using errcode = 'P0001'; end if;
  t := v_detail -> 'target'; pa := v_detail -> 'params';
  v_key := case when v_op in ('set_identifier','correct_identifier') then c.id_type when v_op = 'close_security' then 'valid_to' else 'valid_from' end;
  -- Fallback provenance carries only source / as_of / evidence_sha256 (+ a safe locator): the claim's
  -- free-form note and any unsafe locator never reach a public column.
  v_ev := v_detail -> 'evidence';
  v_safe := jsonb_build_object('source', v_ev -> 'source', 'as_of', v_ev -> 'as_of', 'evidence_sha256', v_ev -> 'evidence_sha256');
  if coalesce(v_ev ->> 'locator', '') ~ '^[A-Za-z0-9_.:/ ,=\[\]-]{1,200}$' and v_ev ->> 'locator' !~* '(\?|token|secret|passw|key=)' then
    v_safe := v_safe || jsonb_build_object('locator', v_ev -> 'locator');
  end if;
  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_safe));
  if not public.claim_provenance_safe(v_pw) then raise exception 'invalid_claim' using errcode = '22023', detail = 'provenance_written'; end if;

  begin
    if v_op = 'set_identifier' and c.id_type = 'lei' then
      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei is null;
    elsif v_op = 'set_identifier' and c.id_type = 'cik' then
      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik is null;
    elsif v_op = 'set_identifier' and c.id_type = 'usci' then
      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci is null;
    elsif v_op = 'set_identifier' and c.id_type = 'cninfo_org_id' then
      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id is null;
    elsif v_op = 'correct_identifier' and c.id_type = 'lei' then
      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei = pa ->> 'expected_current';
    elsif v_op = 'correct_identifier' and c.id_type = 'cik' then
      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik = pa ->> 'expected_current';
    elsif v_op = 'correct_identifier' and c.id_type = 'usci' then
      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci = pa ->> 'expected_current';
    elsif v_op = 'correct_identifier' and c.id_type = 'cninfo_org_id' then
      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id = pa ->> 'expected_current';
    elsif v_op = 'set_identifier' and c.id_type = 'isin' then
      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and isin is null;
    elsif v_op = 'set_identifier' and c.id_type = 'figi' then
      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi is null;
    elsif v_op = 'correct_identifier' and c.id_type = 'isin' then
      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and isin = pa ->> 'expected_current';
    elsif v_op = 'correct_identifier' and c.id_type = 'figi' then
      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and figi = pa ->> 'expected_current';
    elsif v_op = 'attach_security' then
      v_ticker := coalesce(pa ->> 'ticker', v_value);
      if not exists (select 1 from public.stocks_universe where ticker = v_ticker) then
        raise exception 'invalid_claim' using errcode = '22023', detail = 'params.ticker';
      end if;
      insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
      values (c.issuer_id, v_ticker, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
    elsif v_op = 'close_security' then
      update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date and valid_to is null;
    elsif v_op = 'backdate_window' then
      update public.issuer_securities set valid_from = (pa ->> 'new_valid_from')::date, valid_from_method = pa ->> 'valid_from_method', provenance = provenance || v_pw
      where issuer_id = c.issuer_id and ticker = t ->> 'ticker' and valid_from = (t ->> 'valid_from')::date;
    else
      raise exception 'invalid_claim' using errcode = '22023';
    end if;
    get diagnostics n = row_count;
  exception
    when unique_violation or exclusion_violation then
      -- an issuer identifier held by another issuer; a security key/window/ISIN held by another row
      if v_op in ('set_identifier','correct_identifier') and c.id_type in ('lei','cik','usci','cninfo_org_id') then
        raise exception 'value_conflict' using errcode = 'P0001';
      end if;
      raise exception 'ownership_conflict' using errcode = 'P0001';
    when check_violation or foreign_key_violation or invalid_text_representation or not_null_violation then
      raise exception 'invalid_claim' using errcode = '22023';
  end;
  if n <> 1 then
    if v_op = 'close_security' then raise exception 'already_closed' using errcode = 'P0001'; end if;
    raise exception 'value_conflict' using errcode = 'P0001';
  end if;
  update public.issuer_identifier_claims
  set status = 'accepted', op = v_op, value = v_value, detail = v_detail,
      target_key = public.identifier_claim_target_key(v_op, v_detail -> 'target'),
      resolved_by = p_resolved_by, resolved_at = clock_timestamp()
  where id = p_id;
  return jsonb_build_object('op', v_op, 'applied', true, 'amended', v_amended);
end $$;
revoke execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_identifier_claim(uuid, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------- calendar passes (§3.1, §6.2, T3/U1)
-- The pass token {market, pass_id, batch_id} fences every pass write: the pass row is locked and must
-- be leased to token.batch_id, unexpired and unfinished, else fence_failed with no write.
create or replace function public.dq_calendar_lock_pass(p_token jsonb) returns public.dq_calendar_passes
language plpgsql set search_path = public as $$
declare p public.dq_calendar_passes;
begin
  if p_token is null or jsonb_typeof(p_token) <> 'object'
     or coalesce(p_token ->> 'market', '') not in ('US','CN')
     or coalesce(p_token ->> 'pass_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_token ->> 'batch_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'fence_failed' using errcode = 'P0001';
  end if;
  select * into p from public.dq_calendar_passes where market = p_token ->> 'market' and pass_id = (p_token ->> 'pass_id')::uuid for update;
  if not found or p.claimed_by is distinct from (p_token ->> 'batch_id')::uuid
     or p.claim_until is null or p.claim_until <= clock_timestamp() or p.finished_at is not null then
    raise exception 'fence_failed' using errcode = 'P0001';
  end if;
  return p;
end $$;
revoke execute on function public.dq_calendar_lock_pass(jsonb) from public, anon, authenticated, service_role;

-- U1: creation is serialised per market by a transaction advisory lock. No unfinished pass → create
-- it, freeze the in-scope active issuers as members, lease it to p_batch. An unfinished pass whose
-- lease is free, expired, or already p_batch's → (re)lease it to p_batch. Otherwise null.
create or replace function public.claim_calendar_pass(p_market text, p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; v_pass uuid;
begin
  if p_market is null or p_market not in ('US','CN') then raise exception 'invalid_market' using errcode = '22023'; end if;
  if p_batch is null then raise exception 'invalid_batch' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('dq_calendar_pass:' || p_market));
  select * into p from public.dq_calendar_passes where market = p_market and finished_at is null for update;
  if not found then
    v_pass := gen_random_uuid();
    insert into public.dq_calendar_passes(market, pass_id, started_at, claimed_by, claim_until, status)
    values (p_market, v_pass, clock_timestamp(), p_batch, clock_timestamp() + interval '10 minutes', 'running');
    insert into public.dq_calendar_pass_members(market, pass_id, issuer_id)
    select p_market, v_pass, s.issuer_id
    from public.fact_sync_scope s join public.issuers i on i.issuer_id = s.issuer_id
    where s.market = p_market and s.priority > 0 and i.status = 'active';
    return jsonb_build_object('market', p_market, 'pass_id', v_pass, 'batch_id', p_batch);
  end if;
  if p.claimed_by is null or p.claim_until is null or p.claim_until < clock_timestamp() or p.claimed_by = p_batch then
    update public.dq_calendar_passes set claimed_by = p_batch, claim_until = clock_timestamp() + interval '10 minutes'
    where market = p.market and pass_id = p.pass_id;
    return jsonb_build_object('market', p_market, 'pass_id', p.pass_id, 'batch_id', p_batch);
  end if;
  return null;
end $$;
revoke execute on function public.claim_calendar_pass(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_calendar_pass(text, uuid) to service_role;

-- The only signature (no 3-arg overload). The member must belong to the pass and be pending, or
-- failed with attempts < 3; its rows for (issuer, market) are replaced atomically and it becomes done.
-- Rows carry the ExpectationRow columns (src/lib/dq/calendar.ts); computed_at and batch_id are set here.
create or replace function public.replace_filing_expectations(p_issuer uuid, p_market text, p_rows jsonb, p_pass_token jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; m public.dq_calendar_pass_members; n int;
begin
  p := public.dq_calendar_lock_pass(p_pass_token);
  if p_market is distinct from p.market then raise exception 'fence_failed' using errcode = 'P0001'; end if;
  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
    raise exception 'member_not_claimable' using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_rows) x
                where jsonb_typeof(x) <> 'object'
                   or (x ? 'issuer_id' and x ->> 'issuer_id' is distinct from p_issuer::text)
                   or (x ? 'market' and x ->> 'market' is distinct from p_market)) then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;
  begin
    delete from public.dq_filing_expectations where issuer_id = p_issuer and market = p_market;
    insert into public.dq_filing_expectations(issuer_id, market, report_kind, period_end, period_end_estimated, deadline_state,
      due_date, due_rule, expected_date, upstream_lookup, upstream_filed_date, disclosure_state, received_filing_id, received_date,
      profile_as_of, detail, computed_at, batch_id)
    select p_issuer, p_market, x ->> 'report_kind', (x ->> 'period_end')::date, coalesce((x ->> 'period_end_estimated')::boolean, false),
      x ->> 'deadline_state', (x ->> 'due_date')::date, x ->> 'due_rule', (x ->> 'expected_date')::date, x ->> 'upstream_lookup',
      (x ->> 'upstream_filed_date')::date, x ->> 'disclosure_state', (x ->> 'received_filing_id')::uuid, (x ->> 'received_date')::date,
      (x ->> 'profile_as_of')::date, coalesce(x -> 'detail', '{}'::jsonb), clock_timestamp(), p.claimed_by
    from jsonb_array_elements(p_rows) x;
    get diagnostics n = row_count;
  exception when check_violation or not_null_violation or unique_violation or foreign_key_violation
              or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or invalid_parameter_value then
    raise exception 'invalid_rows' using errcode = '22023';
  end;
  update public.dq_calendar_pass_members set state = 'done', done_at = clock_timestamp()
  where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer;
  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
  return n;
end $$;
revoke execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_filing_expectations(uuid, text, jsonb, jsonb) to service_role;

create or replace function public.fail_calendar_member(p_pass_token jsonb, p_issuer uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; m public.dq_calendar_pass_members;
begin
  p := public.dq_calendar_lock_pass(p_pass_token);
  select * into m from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer for update;
  if not found or not (m.state = 'pending' or (m.state = 'failed' and m.attempts < 3)) then
    raise exception 'member_not_claimable' using errcode = 'P0001';
  end if;
  update public.dq_calendar_pass_members set state = 'failed', attempts = attempts + 1, last_error = left(coalesce(p_error, 'unknown'), 1000)
  where market = p.market and pass_id = p.pass_id and issuer_id = p_issuer;
  update public.dq_calendar_passes set claim_until = clock_timestamp() + interval '10 minutes' where market = p.market and pass_id = p.pass_id;
end $$;
revoke execute on function public.fail_calendar_member(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_calendar_member(jsonb, uuid, text) to service_role;

-- Settles only from persisted member state: anything still processable → pass_incomplete; else all
-- done → complete, otherwise complete_with_failures; both terminal states write finished_at.
create or replace function public.finish_calendar_pass(p_pass_token jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare p public.dq_calendar_passes; v_status text;
begin
  p := public.dq_calendar_lock_pass(p_pass_token);
  if exists (select 1 from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id
             and (state = 'pending' or (state = 'failed' and attempts < 3))) then
    raise exception 'pass_incomplete' using errcode = 'P0001';
  end if;
  v_status := case when exists (select 1 from public.dq_calendar_pass_members where market = p.market and pass_id = p.pass_id and state <> 'done')
                   then 'complete_with_failures' else 'complete' end;
  update public.dq_calendar_passes set status = v_status, finished_at = clock_timestamp() where market = p.market and pass_id = p.pass_id;
  return v_status;
end $$;
revoke execute on function public.finish_calendar_pass(jsonb) from public, anon, authenticated;
grant execute on function public.finish_calendar_pass(jsonb) to service_role;

-- ---------------------------------------------------------------- row-locked jsonb patches (plan audit round 1, P3/P4)
-- append_claim_evidence is the only writer of a pending claim's detail.sources after filing (claims.ts
-- fileClaim). It locks the pending row of the five-column key, drops evidence that already is the claim's
-- evidence or one of its sources (same source + evidence_sha256) and appends the rest with jsonb_set on
-- detail.sources alone: two concurrent filers both keep their evidence (the old read-then-replace lost
-- one). 'not_found' = no pending row any more (resolved meanwhile); nothing is written then.
create or replace function public.append_claim_evidence(p_issuer uuid, p_id_type text, p_value text, p_op text, p_target_key text, p_evidence jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_detail jsonb; v_sources jsonb;
begin
  if not public.claim_evidence_ok(p_evidence) then
    raise exception 'invalid_evidence' using errcode = '22023';
  end if;
  select id, detail into v_id, v_detail from public.issuer_identifier_claims
  where issuer_id = p_issuer and id_type = p_id_type and value = p_value and op = p_op and target_key = p_target_key and status = 'pending'
  for update;
  if not found then return 'not_found'; end if;
  v_sources := case when jsonb_typeof(v_detail -> 'sources') = 'array' then v_detail -> 'sources' else '[]'::jsonb end;
  if coalesce(v_detail -> 'evidence' ->> 'source' = p_evidence ->> 'source' and v_detail -> 'evidence' ->> 'evidence_sha256' = p_evidence ->> 'evidence_sha256', false)
     or exists (select 1 from jsonb_array_elements(v_sources) s
                where s ->> 'source' = p_evidence ->> 'source' and s ->> 'evidence_sha256' = p_evidence ->> 'evidence_sha256') then
    return 'duplicate';
  end if;
  update public.issuer_identifier_claims set detail = jsonb_set(detail, '{sources}', v_sources || jsonb_build_array(p_evidence), true) where id = v_id;
  return 'appended';
end $$;
revoke execute on function public.append_claim_evidence(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_claim_evidence(uuid, text, text, text, text, jsonb) to service_role;

-- patch_quarantine_detail is the only TS-side writer of dq_quarantine.detail once an item exists (the
-- materialize hook state and the audit mark; quarantine.ts::patchQuarantineDetail). It locks the item and
-- replaces ONLY the named key, so a concurrent apply_reconcile_result / restore_reconciled / adoption that
-- rewrote latest_result, the chosen ids or the resolution columns is never rolled back to an older read.
-- Two keys only: 'hook' and 'audit_written'. false = no such item.
create or replace function public.patch_quarantine_detail(p_id uuid, p_key text, p_value jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or p_key not in ('hook', 'audit_written') or p_value is null then
    raise exception 'invalid_detail_key' using errcode = '22023';
  end if;
  perform 1 from public.dq_quarantine where id = p_id for update;
  if not found then return false; end if;
  update public.dq_quarantine set detail = detail || jsonb_build_object(p_key, p_value) where id = p_id;
  return true;
end $$;
revoke execute on function public.patch_quarantine_detail(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.patch_quarantine_detail(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------- guarded identifier write (plan audit round 3, R2)
-- set_security_identifier is the only writer of issuer_securities.isin/figi outside resolve_identifier_claim
-- (identifiers/apply.ts, Task 4a). It locks the open row (issuer, ticker, valid_from, valid_to null) and
-- in ONE UPDATE writes the column (only when empty) and merges the single provenance key with
-- `provenance || p_provenance` — never a whole-object replacement — so a concurrent write of the other
-- column, or a claim resolution (which also merges with ||), keeps its key. p_provenance must carry
-- exactly the key p_column. Outcomes: 'written' (the column was empty), 'duplicate' (the same value is
-- stored; a missing provenance key is completed in the same UPDATE), 'conflict' (another value is
-- stored; nothing written — the caller files correct_identifier), 'not_found' (no open row). ISIN
-- uniqueness / no-overlap violations (23505 / 23P01) pass through unchanged.
create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_cur text; v_prov jsonb;
begin
  if p_column is null or p_column not in ('isin', 'figi') or coalesce(p_value, '') = ''
     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array[p_column] then
    raise exception 'invalid_identifier_write' using errcode = '22023';
  end if;
  -- Same order as resolve_identifier_claim (issuer, then security row): FOR SHARE conflicts with its FOR UPDATE.
  perform 1 from public.issuers where issuer_id = p_issuer for share;
  if not found then return 'not_found'; end if;
  select case when p_column = 'isin' then s.isin else s.figi end, s.provenance into v_cur, v_prov
  from public.issuer_securities s
  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from and s.valid_to is null
  for update;
  if not found then return 'not_found'; end if;
  if v_cur is not null and v_cur <> p_value then return 'conflict'; end if;
  if v_cur = p_value and coalesce(v_prov ? p_column, false) then return 'duplicate'; end if;
  if p_column = 'isin' then
    update public.issuer_securities set isin = p_value, provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
  else
    update public.issuer_securities set figi = p_value, provenance = provenance || p_provenance
    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
  end if;
  return case when v_cur is null then 'written' else 'duplicate' end;
end $$;
revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- topology guard (§3.1, S1)
-- issuers.status/merged_into change only inside set_merge/set_dissolved (migration two), which switch
-- the transaction-local setting on and restore it on every exit path. A never-defined setting reads
-- NULL and the '' left after such a transaction both differ from 'on' and are refused (IS DISTINCT
-- FROM). The WHEN clause skips same-value writes. Named so it fires after the plan-1 lifecycle
-- triggers (BEFORE triggers run in name order), which keep reporting their own errors. A tripwire,
-- not a privilege boundary: any role can set the GUC. Inserts are guarded too (plan 3 接口对齐记录 #7):
-- an issuer born with status <> 'active' or merged_into set would add a lineage member without
-- set_merge's scope locks; plain active inserts pass.
create or replace function public.issuers_topology_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'active' or new.merged_into is not null then
      if current_setting('entities.allow_topology_write', true) is distinct from 'on' then
        raise exception 'topology_write_forbidden' using errcode = '23514';
      end if;
    end if;
  elsif old.status is distinct from new.status or old.merged_into is distinct from new.merged_into then
    if current_setting('entities.allow_topology_write', true) is distinct from 'on' then
      raise exception 'topology_write_forbidden' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists issuers_topology_guard on public.issuers;
create trigger issuers_topology_guard before insert or update of status, merged_into on public.issuers
  for each row execute function public.issuers_topology_guard();
