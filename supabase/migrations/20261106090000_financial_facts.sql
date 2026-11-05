-- supabase/migrations/20261106090000_financial_facts.sql
-- F2-0 (data foundation plan 2 spec §4): the disclosure log. A sync run per issuer+market is the
-- unit of publication (fact_sync_runs); filings are the documents; financial_facts is an
-- append-only log of "which filing, available on which date, disclosed which value for which
-- concept/period/unit"; financial_metrics is a derived cache replaced atomically per issuer;
-- fact_sync_scope holds the schedule, the lease and the fact-state version (state_rev).
-- Write path (§4.5, §4.7): NO role may insert/update/delete these tables — service_role included;
-- every change goes through the security definer functions below. Every function that changes
-- fact visibility starts by locking the issuer's fact_sync_scope row (`select … for update`), so
-- publish, quarantine membership, resolution/promotion and materialisation serialise (§5.4);
-- collector functions additionally verify the lease (lease_batch_id = batch and
-- lease_until > now(), else `lease_lost`). Two explicit exceptions: service_role may update
-- filings.document_ref/document_url/link_attempts (cninfo linking; column-level grant) and may
-- call reconcile_fact_sync_scope (schedule inputs, no lease).
-- Errors carry the code as the message: lease_lost (55P03); run_pending, run_published,
-- mapping_gen_regression, stale_computation (P0001); run_abandoned, item_not_open (P0001, bug
-- paths); run_not_found (P0002); invalid_* (22023). Triggers refuse with 23514, prefix `append_only:`.
-- The hosted `postgres` role is not a superuser: functions keep the migration role as owner (no
-- `alter function … owner`), `set search_path = public`, and qualify every relation.
-- Replayable: guarded creates, create or replace, drop-then-create policies and triggers,
-- insert … on conflict for the bucket. Only storage.buckets is referenced (local harness).

-- ---------------------------------------------------------------- 4.1 fact_sync_runs
create table if not exists public.fact_sync_runs (
  run_id        uuid primary key,
  issuer_id     uuid not null references public.issuers(issuer_id) on delete restrict,
  market        text not null check (market in ('US','CN')),
  batch_id      uuid not null references public.ingest_batches(batch_id) on delete restrict,
  mapping_gen   int not null check (mapping_gen >= 1),
  status        text not null default 'staged' check (status in ('staged','published','abandoned')),
  manifest      jsonb not null default '[]' check (jsonb_typeof(manifest) = 'array'),
  started_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint fact_sync_runs_published_iff check ((status = 'published') = (published_at is not null))
);
create index if not exists fact_sync_runs_issuer_status_idx on public.fact_sync_runs(issuer_id, market, status);
create index if not exists fact_sync_runs_batch_idx on public.fact_sync_runs(batch_id);

-- ---------------------------------------------------------------- 4.2 filings
create table if not exists public.filings (
  filing_id        uuid primary key,
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  source           text not null check (source in ('edgar','tushare')),
  origin           text not null check (origin in ('sec','sse','szse','bse')),
  form_type        text not null check (form_type in ('10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A','annual','semiannual','q1','q3','restatement','other')),
  fiscal_year      int,
  fiscal_period    text check (fiscal_period is null or fiscal_period in ('FY','Q1','Q2','Q3','H1','9M')),
  period_end       date,
  available_date   date not null,
  source_ref       text not null check (length(source_ref) between 1 and 256),
  url              text,
  document_ref     text,
  document_url     text,
  link_attempts    int not null default 0 check (link_attempts >= 0),
  mapping_gen      int not null default 0 check (mapping_gen >= 0),      -- active generation; 0 = no published run covers it yet
  run_id           uuid not null references public.fact_sync_runs(run_id) on delete restrict,   -- the run that created it
  created_at       timestamptz not null default now(),
  constraint filings_source_ref_uniq unique (source, source_ref),
  constraint filings_id_issuer_market_uniq unique (filing_id, issuer_id, market),
  constraint filings_id_available_uniq unique (filing_id, available_date)
);
create index if not exists filings_issuer_available_idx on public.filings(issuer_id, market, available_date desc);
create index if not exists filings_run_idx on public.filings(run_id);

-- ---------------------------------------------------------------- 4.3 financial_facts
create table if not exists public.financial_facts (
  fact_id          uuid primary key,
  issuer_id        uuid not null,
  market           text not null check (market in ('US','CN')),
  filing_id        uuid not null,
  run_id           uuid not null references public.fact_sync_runs(run_id) on delete restrict,
  concept          text not null check (length(concept) between 1 and 64),
  source_concept   text not null check (length(source_concept) between 1 and 256),
  statement        text not null check (statement in ('IS','BS','CF','DEI')),
  period_start     date,
  period_end       date not null,
  duration         text not null check (duration in ('3M','6M','9M','12M','INSTANT')),
  value            numeric not null,
  value_text       text generated always as (value::text) stored,
  unit             text not null check (length(unit) between 1 and 16),
  consolidation    text not null default 'consolidated' check (consolidation in ('consolidated','parent')),
  available_date   date not null,
  mapping_gen      int not null check (mapping_gen >= 1),
  mapping_version  text not null check (length(mapping_version) between 1 and 64),
  status           text not null default 'staged' check (status in ('staged','ok','quarantined')),
  raw_hash         text not null check (length(raw_hash) between 1 and 128),
  created_at       timestamptz not null default now(),
  constraint financial_facts_filing_fkey foreign key (filing_id, issuer_id, market) references public.filings(filing_id, issuer_id, market) on delete restrict,
  constraint financial_facts_filing_date_fkey foreign key (filing_id, available_date) references public.filings(filing_id, available_date) on delete restrict,
  constraint financial_facts_period check (period_start is null or period_start < period_end),
  constraint financial_facts_instant check ((period_start is null) = (duration = 'INSTANT')),
  constraint financial_facts_candidate_key unique nulls not distinct (issuer_id, concept, period_start, period_end, consolidation, unit, filing_id, mapping_gen)
);
create index if not exists financial_facts_read_idx on public.financial_facts(issuer_id, market, concept, period_end, available_date);
create index if not exists financial_facts_run_idx on public.financial_facts(run_id);
create index if not exists financial_facts_filing_idx on public.financial_facts(filing_id);
-- publish/promote look items up by member fact id (payload.fact_ids ? id)
create index if not exists dq_quarantine_fact_ids_idx on public.dq_quarantine using gin ((payload -> 'fact_ids')) where table_name = 'financial_facts';

-- ---------------------------------------------------------------- 4.4 financial_metrics
create table if not exists public.financial_metrics (
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  metric           text not null check (length(metric) between 1 and 64),
  period_start     date not null,
  period_end       date not null,
  duration         text not null check (duration in ('3M','6M','9M','12M','TTM','INSTANT')),
  value            numeric not null,
  value_text       text generated always as (value::text) stored,
  unit             text not null check (length(unit) between 1 and 16),
  input_unit       text not null check (length(input_unit) between 1 and 16),
  basis            text not null check (basis in ('us_standard','cn_standard','cn_incl_intangibles','cn_incl_bonds')),
  formula_version  text not null check (length(formula_version) between 1 and 64),
  inputs           jsonb not null check (jsonb_typeof(inputs) = 'array'),
  based_on_rev     bigint not null check (based_on_rev >= 0),
  as_of            date not null,
  computed_at      timestamptz not null default now(),
  primary key (issuer_id, market, metric, period_start, period_end, input_unit, basis, formula_version)
);
create index if not exists financial_metrics_read_idx on public.financial_metrics(issuer_id, market, metric, period_end desc);

-- ---------------------------------------------------------------- 4.5 fact_sync_scope
create table if not exists public.fact_sync_scope (
  issuer_id        uuid not null references public.issuers(issuer_id) on delete restrict,
  market           text not null check (market in ('US','CN')),
  reasons          jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array'),
  priority         int not null default 0 check (priority >= 0),
  fetch_key        text not null check (length(fetch_key) between 1 and 32),
  next_due_at      timestamptz not null default now(),
  lease_until      timestamptz,
  lease_batch_id   uuid,
  state_rev        bigint not null default 0 check (state_rev >= 0),   -- +1 on every publish or promotion (audit R4-6)
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  last_batch_id    uuid,
  last_status      text check (last_status is null or last_status in ('success','failed')),
  updated_at       timestamptz not null default now(),
  primary key (issuer_id, market),
  constraint fact_sync_scope_lease_pair check ((lease_until is null) = (lease_batch_id is null))
);
create index if not exists fact_sync_scope_due_idx on public.fact_sync_scope(market, next_due_at, priority desc, issuer_id) where priority > 0;

-- ---------------------------------------------------------------- 4.7 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disclosure-raw', 'disclosure-raw', false, 52428800, array['application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- triggers (§4.2, §4.3)
-- Backstops for the function write path. financial_facts: inserted as staged; only the status may
-- change, along staged→ok, staged→quarantined, quarantined→ok, ok→quarantined; rows are deleted
-- only together with their abandoned run (the run is marked first, §4.5).
-- The immutable-field check lists the base columns explicitly: in a BEFORE UPDATE trigger the
-- generated column value_text is not yet computed for NEW (PostgreSQL 17 trigger docs), so a
-- to_jsonb(NEW) comparison would refuse every legitimate status change (audit round-1 #1).
create or replace function public.financial_facts_lifecycle() returns trigger
language plpgsql set search_path = public as $$
declare v_run_status text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'staged' then
      raise exception 'append_only: financial_facts rows are inserted as staged' using errcode = '23514';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if (new.fact_id, new.issuer_id, new.market, new.filing_id, new.run_id, new.concept, new.source_concept, new.statement,
        new.period_start, new.period_end, new.duration, new.value, new.unit, new.consolidation, new.available_date,
        new.mapping_gen, new.mapping_version, new.raw_hash, new.created_at)
       is distinct from
       (old.fact_id, old.issuer_id, old.market, old.filing_id, old.run_id, old.concept, old.source_concept, old.statement,
        old.period_start, old.period_end, old.duration, old.value, old.unit, old.consolidation, old.available_date,
        old.mapping_gen, old.mapping_version, old.raw_hash, old.created_at) then
      raise exception 'append_only: financial_facts allows status changes only' using errcode = '23514';
    end if;
    if not ((old.status, new.status) in (('staged','ok'), ('staged','quarantined'), ('quarantined','ok'), ('ok','quarantined'))) then
      raise exception 'append_only: financial_facts status % -> % is not allowed', old.status, new.status using errcode = '23514';
    end if;
    return new;
  end if;
  select status into v_run_status from public.fact_sync_runs where run_id = old.run_id;
  if v_run_status is distinct from 'abandoned' then
    raise exception 'append_only: financial_facts rows are deleted only with their abandoned run' using errcode = '23514';
  end if;
  return old;
end $$;
drop trigger if exists financial_facts_lifecycle on public.financial_facts;
create trigger financial_facts_lifecycle before insert or update or delete on public.financial_facts
  for each row execute function public.financial_facts_lifecycle();

-- filings: update may touch document_ref/document_url/link_attempts/mapping_gen only, and
-- mapping_gen never decreases; delete is admitted only under the transaction-local setting that
-- begin_sync_run switches on while pruning empty gen-0 filings of abandoned runs.
create or replace function public.filings_limited_update() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['document_ref','document_url','link_attempts','mapping_gen'];
begin
  if tg_op = 'DELETE' then
    if current_setting('facts.allow_filing_delete', true) is distinct from 'on' then
      raise exception 'append_only: filings are never deleted (begin_sync_run prunes empty gen-0 filings of abandoned runs)' using errcode = '23514';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: filings allow document_ref, document_url, link_attempts and mapping_gen changes only' using errcode = '23514';
  end if;
  if new.mapping_gen < old.mapping_gen then
    raise exception 'append_only: filings.mapping_gen may only increase (% -> %)', old.mapping_gen, new.mapping_gen using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists filings_limited_update on public.filings;
create trigger filings_limited_update before update or delete on public.filings
  for each row execute function public.filings_limited_update();

-- ---------------------------------------------------------------- internal helpers (no client role may execute)
-- Lock discipline: lock the scope row, then check the lease the caller claims to hold.
create or replace function public.fact_scope_lock(p_issuer uuid, p_market text, p_batch uuid)
returns public.fact_sync_scope language plpgsql security definer set search_path = public as $$
declare s public.fact_sync_scope;
begin
  select * into s from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  if not found then raise exception 'lease_lost' using errcode = '55P03'; end if;
  if s.lease_batch_id is distinct from p_batch or s.lease_until is null or s.lease_until <= now() then
    raise exception 'lease_lost' using errcode = '55P03';
  end if;
  return s;
end $$;
revoke execute on function public.fact_scope_lock(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Locks the run's scope row, verifies the run's batch still holds the lease, returns the run,
-- which must be staged (published → run_published; abandoned → run_abandoned).
create or replace function public.fact_run_lock(p_run uuid)
returns public.fact_sync_runs language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs;
begin
  select * into r from public.fact_sync_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  perform public.fact_scope_lock(r.issuer_id, r.market, r.batch_id);
  select * into r from public.fact_sync_runs where run_id = p_run for update;
  if r.status = 'published' then raise exception 'run_published' using errcode = 'P0001'; end if;
  if r.status = 'abandoned' then raise exception 'run_abandoned' using errcode = 'P0001'; end if;
  return r;
end $$;
revoke execute on function public.fact_run_lock(uuid) from public, anon, authenticated, service_role;

-- Abandon order (§4.5): mark first (the facts trigger admits the delete), delete the run's facts,
-- then — begin_sync_run only — prune filings this run created that carry no facts and were never
-- activated (mapping_gen = 0), under the transaction-local setting the filings trigger honours.
create or replace function public.fact_abandon_run(p_run uuid, p_prune_filings boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.fact_sync_runs set status = 'abandoned' where run_id = p_run and status = 'staged';
  delete from public.financial_facts where run_id = p_run;
  if p_prune_filings then
    perform set_config('facts.allow_filing_delete', 'on', true);
    delete from public.filings g
    where g.run_id = p_run and g.mapping_gen = 0
      and not exists (select 1 from public.financial_facts f where f.filing_id = g.filing_id);
    perform set_config('facts.allow_filing_delete', 'off', true);
  end if;
end $$;
revoke execute on function public.fact_abandon_run(uuid, boolean) from public, anon, authenticated, service_role;

-- payload.fact_ids of a quarantine item as uuid[] (empty when absent or not an array).
create or replace function public.fact_item_members(p_payload jsonb)
returns uuid[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(e::uuid), '{}'::uuid[])
  from jsonb_array_elements_text(case when jsonb_typeof(p_payload -> 'fact_ids') = 'array' then p_payload -> 'fact_ids' else '[]'::jsonb end) e
$$;
revoke execute on function public.fact_item_members(jsonb) from public, anon, authenticated, service_role;

-- Promotion eligibility (§4.5 promote_quarantined / §7.3). Caller holds the scope lock. A row is
-- promoted only if it is quarantined, its run is published, its filing's active generation is the
-- row's generation, no OPEN quarantine item references it, no OPEN same_day_conflict item disputes
-- its (K, available_date) — matched on the components stored in payload.key, whether or not the
-- row is in that item's member list (spec §4.5; audit round-1 #3) — and every RESOLVED
-- same_day_conflict item that references it chose it (detail.chosen_fact_ids). Returns the number promoted.
create or replace function public.fact_promote_rows(p_issuer uuid, p_market text, p_fact_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.financial_facts f set status = 'ok'
  from public.fact_sync_runs r, public.filings g
  where f.fact_id = any(p_fact_ids) and f.issuer_id = p_issuer and f.market = p_market and f.status = 'quarantined'
    and r.run_id = f.run_id and r.status = 'published'
    and g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.status = 'open'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status = 'open'
        and q.payload -> 'key' ->> 'issuer_id' = f.issuer_id::text and q.payload -> 'key' ->> 'market' = f.market
        and q.payload -> 'key' ->> 'concept' = f.concept
        and f.period_start is not distinct from nullif(q.payload -> 'key' ->> 'period_start', '')::date
        and (q.payload -> 'key' ->> 'period_end')::date = f.period_end
        and q.payload -> 'key' ->> 'consolidation' = f.consolidation and q.payload -> 'key' ->> 'unit' = f.unit
        and (q.payload -> 'key' ->> 'available_date')::date = f.available_date)
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status <> 'open'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fact_promote_rows(uuid, text, uuid[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.5 functions
-- Schedule inputs only: reasons/priority/fetch_key. Never touches next_due_at, lease_*, state_rev,
-- last_*. Returns the number of rows inserted or actually changed.
create or replace function public.reconcile_fact_sync_scope(p_market text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_market is null or p_market not in ('US','CN') then raise exception 'invalid_market' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
  select distinct on ((x ->> 'issuer_id')) (x ->> 'issuer_id')::uuid, p_market, coalesce(x -> 'reasons', '[]'::jsonb), (x ->> 'priority')::int, x ->> 'fetch_key'
  from jsonb_array_elements(p_rows) x
  on conflict (issuer_id, market) do update
    set reasons = excluded.reasons, priority = excluded.priority, fetch_key = excluded.fetch_key, updated_at = now()
    where (fact_sync_scope.reasons, fact_sync_scope.priority, fact_sync_scope.fetch_key)
          is distinct from (excluded.reasons, excluded.priority, excluded.fetch_key);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.reconcile_fact_sync_scope(text, jsonb) from public, anon, authenticated;
grant execute on function public.reconcile_fact_sync_scope(text, jsonb) to service_role;

-- Unleased, expired, or held by the same batch → (re)lease and true; otherwise false.
-- No scope row → false (nothing to lease; reconcile first).
create or replace function public.claim_fact_sync_lease(p_issuer uuid, p_market text, p_batch uuid, p_ttl_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare s public.fact_sync_scope;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 1 then raise exception 'invalid_ttl' using errcode = '22023'; end if;
  select * into s from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  if not found then return false; end if;
  if s.lease_batch_id is null or s.lease_until <= now() or s.lease_batch_id = p_batch then
    update public.fact_sync_scope
    set lease_batch_id = p_batch, lease_until = now() + make_interval(secs => p_ttl_seconds), updated_at = now()
    where issuer_id = p_issuer and market = p_market;
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.claim_fact_sync_lease(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.claim_fact_sync_lease(uuid, text, uuid, int) to service_role;

-- Lease check; abandons every staged run of this issuer+market (mark → delete facts → prune
-- empty gen-0 filings); inserts the new staged run and returns its id.
create or replace function public.begin_sync_run(p_issuer uuid, p_market text, p_batch uuid, p_mapping_gen int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_run uuid := gen_random_uuid(); v_old uuid;
begin
  if p_mapping_gen is null or p_mapping_gen < 1 then raise exception 'invalid_mapping_gen' using errcode = '22023'; end if;
  perform public.fact_scope_lock(p_issuer, p_market, p_batch);
  for v_old in select run_id from public.fact_sync_runs where issuer_id = p_issuer and market = p_market and status = 'staged' loop
    perform public.fact_abandon_run(v_old, true);
  end loop;
  insert into public.fact_sync_runs (run_id, issuer_id, market, batch_id, mapping_gen)
  values (v_run, p_issuer, p_market, p_batch, p_mapping_gen);
  return v_run;
end $$;
revoke execute on function public.begin_sync_run(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.begin_sync_run(uuid, text, uuid, int) to service_role;

-- Rows: [{filing_id, source, origin, form_type, fiscal_year, fiscal_period, period_end,
-- available_date, source_ref, url}]; issuer/market/run come from the run. Existing
-- (source, source_ref) rows are kept; returns {source_ref → filing_id} for every row of this
-- issuer+market, existing ones included.
create or replace function public.stage_filings(p_run uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; v_out jsonb;
begin
  r := public.fact_run_lock(p_run);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.filings (filing_id, issuer_id, market, source, origin, form_type, fiscal_year, fiscal_period, period_end, available_date, source_ref, url, run_id)
  select distinct on (x ->> 'source', x ->> 'source_ref')
         (x ->> 'filing_id')::uuid, r.issuer_id, r.market, x ->> 'source', x ->> 'origin', x ->> 'form_type',
         (x ->> 'fiscal_year')::int, x ->> 'fiscal_period', (x ->> 'period_end')::date, (x ->> 'available_date')::date,
         x ->> 'source_ref', x ->> 'url', p_run
  from jsonb_array_elements(p_rows) x
  on conflict (source, source_ref) do nothing;
  select coalesce(jsonb_object_agg(g.source_ref, g.filing_id), '{}'::jsonb) into v_out
  from public.filings g
  where g.issuer_id = r.issuer_id and g.market = r.market
    and (g.source, g.source_ref) in (select x ->> 'source', x ->> 'source_ref' from jsonb_array_elements(p_rows) x);
  return v_out;
end $$;
revoke execute on function public.stage_filings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_filings(uuid, jsonb) to service_role;

-- Rows: FactInsert objects (§共享契约); issuer/market/run/mapping_gen come from the run; status is
-- staged; an existing candidate key (any status, any run) is skipped. Returns the inserted count.
create or replace function public.stage_facts(p_run uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int;
begin
  r := public.fact_run_lock(p_run);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.financial_facts (fact_id, issuer_id, market, filing_id, run_id, concept, source_concept, statement, period_start, period_end, duration, value, unit, consolidation, available_date, mapping_gen, mapping_version, raw_hash)
  select (x ->> 'fact_id')::uuid, r.issuer_id, r.market, (x ->> 'filing_id')::uuid, p_run, x ->> 'concept', x ->> 'source_concept', x ->> 'statement',
         (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric, x ->> 'unit',
         coalesce(x ->> 'consolidation', 'consolidated'), (x ->> 'available_date')::date, r.mapping_gen, x ->> 'mapping_version', x ->> 'raw_hash'
  from jsonb_array_elements(p_rows) x
  on conflict on constraint financial_facts_candidate_key do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.stage_facts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_facts(uuid, jsonb) to service_role;

-- This run's staged rows among p_fact_ids → quarantined (count returned), and the ids are merged
-- into dq_quarantine(p_item).payload.fact_ids under the same lock (append-only, deduplicated,
-- order kept; audit R6-1). Public rows are never touched here. The item must be open.
create or replace function public.quarantine_facts(p_run uuid, p_fact_ids uuid[], p_item uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int; v_ids uuid[] := coalesce(p_fact_ids, '{}'::uuid[]);
begin
  r := public.fact_run_lock(p_run);
  update public.financial_facts set status = 'quarantined'
  where run_id = p_run and status = 'staged' and fact_id = any(v_ids);
  get diagnostics n = row_count;
  update public.dq_quarantine q
  set payload = jsonb_set(q.payload, '{fact_ids}',
        (case when jsonb_typeof(q.payload -> 'fact_ids') = 'array' then q.payload -> 'fact_ids' else '[]'::jsonb end)
        || (select coalesce(jsonb_agg(to_jsonb(u.id::text) order by u.ord), '[]'::jsonb)
            from (select distinct on (id) id, ord from unnest(v_ids) with ordinality as t(id, ord) order by id, ord) u
            where not ((case when jsonb_typeof(q.payload -> 'fact_ids') = 'array' then q.payload -> 'fact_ids' else '[]'::jsonb end) ? u.id::text)),
        true)
  where q.id = p_item and q.status = 'open';
  if not found then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  return n;
end $$;
revoke execute on function public.quarantine_facts(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.quarantine_facts(uuid, uuid[], uuid) to service_role;

-- One transaction (§5.4): this run staged→ok; contested groups — every OPEN same_day_conflict
-- item that references a row of this run takes all of its still-ok members down, whichever run
-- produced them (audit R5-1: derived from the items, not from run bookkeeping; ids of deleted rows
-- are simply absent); manifest filings activate run.mapping_gen (a filing already on a higher
-- generation → mapping_gen_regression, nothing changes); run → published with manifest;
-- state_rev + 1. Returns the number of rows that became ok.
create or replace function public.publish_sync_run(p_run uuid, p_manifest uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs; n int; v_manifest uuid[] := coalesce(p_manifest, '{}'::uuid[]);
begin
  r := public.fact_run_lock(p_run);
  update public.financial_facts set status = 'ok' where run_id = p_run and status = 'staged';
  get diagnostics n = row_count;
  update public.financial_facts f set status = 'quarantined'
  where f.status = 'ok' and f.issuer_id = r.issuer_id and f.market = r.market
    and exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'same_day_conflict' and q.status = 'open'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
        and exists (select 1 from public.financial_facts x where x.run_id = p_run and q.payload -> 'fact_ids' ? x.fact_id::text));
  if exists (select 1 from public.filings g where g.filing_id = any(v_manifest) and g.issuer_id = r.issuer_id and g.market = r.market and g.mapping_gen > r.mapping_gen) then
    raise exception 'mapping_gen_regression' using errcode = 'P0001';
  end if;
  update public.filings set mapping_gen = r.mapping_gen
  where filing_id = any(v_manifest) and issuer_id = r.issuer_id and market = r.market and mapping_gen < r.mapping_gen;
  update public.fact_sync_runs set status = 'published', published_at = now(), manifest = to_jsonb(v_manifest) where run_id = p_run;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = r.issuer_id and market = r.market;
  return n;
end $$;
revoke execute on function public.publish_sync_run(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.publish_sync_run(uuid, uuid[]) to service_role;

-- Lease check; published → run_published; already abandoned → no-op; staged → mark, delete facts
-- (this function never prunes filings: those the run created stay and a later run reuses them by
-- source_ref; only a begin_sync_run that itself abandons a still-staged run prunes its empty gen-0
-- filings). Published rows and open conflict items are untouched.
create or replace function public.abandon_sync_run(p_run uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.fact_sync_runs;
begin
  select * into r from public.fact_sync_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  perform public.fact_scope_lock(r.issuer_id, r.market, r.batch_id);
  select * into r from public.fact_sync_runs where run_id = p_run for update;
  if r.status = 'published' then raise exception 'run_published' using errcode = 'P0001'; end if;
  if r.status = 'abandoned' then return; end if;
  perform public.fact_abandon_run(p_run, false);
end $$;
revoke execute on function public.abandon_sync_run(uuid) from public, anon, authenticated;
grant execute on function public.abandon_sync_run(uuid) to service_role;

-- Holder check (batch only; an expired but unclaimed lease may still be released); clears the
-- lease and records the outcome and the next due time.
create or replace function public.release_fact_sync_lease(p_issuer uuid, p_market text, p_batch uuid, p_outcome text, p_next_due timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s public.fact_sync_scope;
begin
  if p_outcome is null or p_outcome not in ('success','failed') then raise exception 'invalid_outcome' using errcode = '22023'; end if;
  select * into s from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  if not found or s.lease_batch_id is distinct from p_batch then raise exception 'lease_lost' using errcode = '55P03'; end if;
  update public.fact_sync_scope
  set lease_until = null, lease_batch_id = null, last_attempt_at = now(),
      last_success_at = case when p_outcome = 'success' then now() else last_success_at end,
      last_batch_id = p_batch, last_status = p_outcome, next_due_at = coalesce(p_next_due, now()), updated_at = now()
  where issuer_id = p_issuer and market = p_market;
end $$;
revoke execute on function public.release_fact_sync_lease(uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.release_fact_sync_lease(uuid, text, uuid, text, timestamptz) to service_role;

-- Admin hook (§7.3): holds the scope lock, promotes eligible rows (fact_promote_rows), state_rev + 1
-- when anything was promoted. Returns the number promoted.
create or replace function public.promote_quarantined(p_issuer uuid, p_market text, p_fact_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform 1 from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  n := public.fact_promote_rows(p_issuer, p_market, coalesce(p_fact_ids, '{}'::uuid[]));
  if n > 0 then
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = p_issuer and market = p_market;
  end if;
  return n;
end $$;
revoke execute on function public.promote_quarantined(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.promote_quarantined(uuid, text, uuid[]) to service_role;

-- Admin hook (§4.5, §7.3; audits R6-1, R7-1; round-1 #2, #10). Lock order: scope row (derived
-- from a provisional read of the member rows, else from payload.run_id) then the item row — the
-- same order quarantine_facts uses. Under the lock the item is re-read and the member set is
-- REBUILT, so a quarantine_facts merge that committed while this call waited is validated too.
-- Any member row whose run is still staged, or an anchor run (payload.run_id) that is still
-- staged — the only run bookkeeping an item without fact rows has — → run_pending (item stays
-- open). Otherwise, in one transaction: item → resolved_accept with detail.chosen_fact_ids (the
-- verdict for same_day_conflict — must be a subset of payload.fact_ids — or all member ids
-- otherwise), promotion by the eligibility rules (the item itself is closed by then, so it no
-- longer blocks its members), state_rev + 1. Returns {promoted, skipped}.
create or replace function public.resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_ids uuid[]; v_issuer uuid; v_market text; v_chosen uuid[]; v_promoted int := 0; v_run uuid;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  -- 1. provisional member read, only to locate the scope row to lock
  v_ids := public.fact_item_members(q.payload);
  select f.issuer_id, f.market into v_issuer, v_market from public.financial_facts f where f.fact_id = any(v_ids) limit 1;
  if v_issuer is null then
    select r.issuer_id, r.market into v_issuer, v_market from public.fact_sync_runs r where r.run_id = (q.payload ->> 'run_id')::uuid;
  end if;
  if v_issuer is not null then
    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
  end if;
  -- 2. re-read and rebuild the member set under the lock (a concurrent merge is now visible)
  select * into q from public.dq_quarantine where id = p_item for update;
  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  -- 3. every member run, and the anchor run, must have left the staged state
  if exists (select 1 from public.financial_facts f join public.fact_sync_runs r on r.run_id = f.run_id where f.fact_id = any(v_ids) and r.status = 'staged') then
    raise exception 'run_pending' using errcode = 'P0001';
  end if;
  v_run := (q.payload ->> 'run_id')::uuid;
  if v_run is not null and exists (select 1 from public.fact_sync_runs r where r.run_id = v_run and r.status = 'staged') then
    raise exception 'run_pending' using errcode = 'P0001';
  end if;
  if q.reason_code = 'same_day_conflict' then
    v_chosen := coalesce(p_chosen, '{}'::uuid[]);
    if not (v_chosen <@ v_ids) then raise exception 'invalid_chosen' using errcode = '22023'; end if;
    -- spec 7.3: the chosen rows (those still existing) must all carry the same numeric value
    if (select count(distinct f.value) from public.financial_facts f where f.fact_id = any(v_chosen)) > 1 then raise exception 'invalid_chosen' using errcode = '22023'; end if;
  else
    v_chosen := v_ids;
  end if;
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('chosen_fact_ids', to_jsonb(v_chosen))
  where id = p_item;
  if v_issuer is not null then
    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_chosen);
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
  end if;
  return jsonb_build_object('promoted', v_promoted, 'skipped', cardinality(v_chosen) - v_promoted);
end $$;
revoke execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) to service_role;

-- Holds the scope lock; state_rev must equal p_based_on_rev (no scope row ⇒ 0) else
-- stale_computation; replaces every metric row of the issuer+market. Rows: MetricRow objects
-- without issuer/market (§共享契约). Returns the number inserted.
create or replace function public.replace_financial_metrics(p_issuer uuid, p_market text, p_based_on_rev bigint, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_rev bigint; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market for update;
  if not found then v_rev := 0; end if;
  if p_based_on_rev is null or v_rev <> p_based_on_rev then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  delete from public.financial_metrics where issuer_id = p_issuer and market = p_market;
  insert into public.financial_metrics (issuer_id, market, metric, period_start, period_end, duration, value, unit, input_unit, basis, formula_version, inputs, based_on_rev, as_of)
  select p_issuer, p_market, x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric,
         x ->> 'unit', x ->> 'input_unit', x ->> 'basis', x ->> 'formula_version', coalesce(x -> 'inputs', '[]'::jsonb), p_based_on_rev, (x ->> 'as_of')::date
  from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) to service_role;

-- Only the version number leaves fact_sync_scope (audit R5-2); callable by every client role so
-- read_facts can stamp its envelope within the same statement (snapshot).
create or replace function public.fact_state_rev(p_issuer uuid, p_market text)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select state_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market), 0)
$$;
revoke execute on function public.fact_state_rev(uuid, text) from public;
grant execute on function public.fact_state_rev(uuid, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.6 read_facts
-- One statement, one snapshot, one jsonb envelope {state_rev, rows, truncated, row_count}
-- (PostgREST max_rows truncates set-returning functions, not a scalar; audit R4-5).
-- Per filing only rows of the active generation; available_date <= p_as_of; period_end within
-- [p_from, p_to] when given; status ok (p_include_non_ok adds staged/quarantined rows — RLS keeps
-- anonymous callers on ok only). Sequences (§5.2) are computed over ok rows per natural key
-- (concept, period_start, period_end, consolidation, unit) ordered by available_date, created_at,
-- fact_id: disclosure_seq, is_current (last), is_revision (value differs from the previous
-- disclosure, numeric compare); non-ok rows carry null/false. p_history=false keeps current rows
-- only; p_limit caps the number of natural keys (ranked period_end desc, then concept,
-- period_start desc, consolidation, unit, C collation). More than 10,000 rows ⇒ truncated=true and
-- no rows at all (callers must refuse to plan or derive on a truncated envelope). value is
-- emitted as value_text so JSON clients never round it.
create or replace function public.read_facts(
  p_issuer uuid, p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
with base as (
  select f.fact_id, f.issuer_id, f.market, f.filing_id, f.run_id, f.concept, f.source_concept, f.statement,
         f.period_start, f.period_end, f.duration, f.value, f.value_text, f.unit, f.consolidation, f.available_date,
         f.mapping_gen, f.mapping_version, f.status, f.raw_hash, f.created_at
  from public.financial_facts f
  join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
  where f.issuer_id = p_issuer and f.market = p_market
    and (p_concepts is null or f.concept = any(p_concepts))
    and f.available_date <= p_as_of
    and (p_from is null or f.period_end >= p_from)
    and (p_to is null or f.period_end <= p_to)
    and (f.status = 'ok' or coalesce(p_include_non_ok, false))
), seq as (
  select b.*,
         row_number() over w as disclosure_seq,
         (row_number() over w = count(*) over (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit)) as is_current,
         (lag(b.value) over w is not null and b.value <> lag(b.value) over w) as is_revision
  from base b
  where b.status = 'ok'
  window w as (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit order by b.available_date, b.created_at, b.fact_id)
  union all
  select b.*, null::bigint, false, false from base b where b.status <> 'ok'
), keyed as (
  select s.*,
         dense_rank() over (order by s.period_end desc, s.concept collate "C", s.period_start desc nulls last, s.consolidation collate "C", s.unit collate "C") as key_rank
  from seq s
), picked as (
  select * from keyed k
  where (coalesce(p_history, false) or k.is_current) and (p_limit is null or k.key_rank <= p_limit)
), capped as (
  select * from picked order by key_rank, available_date, created_at, fact_id limit 10001
), counted as (
  select count(*)::int as n from capped
)
select jsonb_build_object(
  'state_rev', public.fact_state_rev(p_issuer, p_market),
  'truncated', (select n from counted) > 10000,
  'row_count', case when (select n from counted) > 10000 then 0 else (select n from counted) end,
  'rows', case when (select n from counted) > 10000 then '[]'::jsonb
               else coalesce((select jsonb_agg((to_jsonb(c) - 'key_rank' - 'value') || jsonb_build_object('value', c.value_text) order by c.key_rank, c.available_date, c.created_at, c.fact_id) from capped c), '[]'::jsonb) end)
$$;
revoke execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) from public;
grant execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 4.7 table privileges and policies
do $$ declare t text; begin
  foreach t in array array['fact_sync_runs','filings','financial_facts','financial_metrics','fact_sync_scope'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['filings','financial_metrics'] loop
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select using (true)', t, t);
  end loop;
  foreach t in array array['fact_sync_runs','fact_sync_scope'] loop
    execute format('grant select on public.%I to service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
end $$;
grant select on public.financial_facts to anon, authenticated, service_role;
drop policy if exists "financial_facts public read" on public.financial_facts;
create policy "financial_facts public read" on public.financial_facts for select to anon, authenticated using (status = 'ok');
drop policy if exists "financial_facts service read" on public.financial_facts;
create policy "financial_facts service read" on public.financial_facts for select to service_role using (true);
-- The one direct write: cninfo linking (§4.5 exception). Column-level; the trigger still forbids
-- anything else, and mapping_gen stays function-only.
grant update (document_ref, document_url, link_attempts) on public.filings to service_role;
drop policy if exists "filings service link update" on public.filings;
create policy "filings service link update" on public.filings for update to service_role using (true) with check (true);
