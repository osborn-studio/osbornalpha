-- supabase/migrations/20261107091000_facts_extensions.sql
-- F3-4 (data foundation plan 3 spec §3.2, §4.4–§4.6, §5.5–§5.6): extensions of the plan-2 facts
-- layer (20261106090000; that file is locked and is never edited).
--  1. filings.accepted_at / acceptance_source: set once (null → value) and only by
--     set_filing_acceptance (transaction-local facts.allow_acceptance_write); no role has a column
--     grant; the plan-2 link columns and the function-only, increase-only mapping_gen are kept (T11).
--  2. financial_metrics.based_on_lineage: added and backfilled ONCE (guarded block); never empty.
--  3. replace_financial_metrics_lineage: locks every member scope row in (issuer_id, market) order,
--     re-reads the lineage under the locks, compares the set and every state_rev; the plan-2
--     replace_financial_metrics is a wrapper (signature unchanged).
--  4. read_filing_facts: evidence reader, every generation and status of one filing (+ run status).
--  5. read_facts_lineage: read_facts over a set of issuers; with more than one member, ok rows of
--     the same (K, available_date) from different issuers with different values leave the current
--     value and are listed in conflicts. read_facts is now a wrapper over it (identical output).
--  6. set_merge / set_dissolved: the only topology writers. They switch the transaction-local
--     entities.allow_topology_write that the migration-one trigger issuers_topology_guard requires,
--     and restore the previous value on every path (normal return and exception handler, S1).
--  (8b) fact_promote_rows predicates; adopt_candidate; restore_reconciled; resolve_lineage_conflict.
--  (8c) reconcile cursor claim/complete/fail and apply_reconcile_result.
-- Lock order everywhere: the pair's cycle advisory lock first (set_merge, open_reconcile_cycle: any
-- function taking a dq_reconcile_cycle:* advisory lock takes it before every row lock) → reconcile
-- cursor row (fenced calls) → fact_sync_scope rows ordered by (issuer_id, market) → issuers rows →
-- dq_quarantine rows (apply_reconcile_result also takes a per-item-key advisory lock just before it
-- creates a review / lineage item; it holds no other member's row) → fact rows → dq_reconcile_cycles
-- row (last).
-- Errors carry the code as the message: verdict / fence codes P0001; invalid_* 22023; triggers 23514.
-- The hosted postgres role is not a superuser: functions keep the migration role as owner, set
-- search_path = public and qualify every relation. Every function is followed by an explicit
-- revoke (Supabase grants EXECUTE on new functions to anon/authenticated by default) and the grant
-- it needs. Replayable: guarded add-column/backfill and constraints, create or replace.

-- ---------------------------------------------------------------- 1. filings acceptance (spec §4.5, T11)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'filings' and column_name = 'accepted_at') then
    alter table public.filings add column accepted_at timestamptz, add column acceptance_source text;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.filings'::regclass and conname = 'filings_acceptance_source_check') then
    alter table public.filings add constraint filings_acceptance_source_check check (acceptance_source is null or acceptance_source in ('sec_submissions'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.filings'::regclass and conname = 'filings_acceptance_pair') then
    alter table public.filings add constraint filings_acceptance_pair check ((accepted_at is null) = (acceptance_source is null));
  end if;
end $$;

-- Same rules as plan 2 (document_ref/document_url/link_attempts/mapping_gen mutable, mapping_gen
-- never decreases, delete only under facts.allow_filing_delete) plus: accepted_at/acceptance_source
-- go null → value once, and only while set_filing_acceptance has facts.allow_acceptance_write on.
create or replace function public.filings_limited_update() returns trigger
language plpgsql set search_path = public as $$
declare v_mutable text[] := array['document_ref','document_url','link_attempts','mapping_gen','accepted_at','acceptance_source'];
begin
  if tg_op = 'DELETE' then
    if current_setting('facts.allow_filing_delete', true) is distinct from 'on' then
      raise exception 'append_only: filings are never deleted (begin_sync_run prunes empty gen-0 filings of abandoned runs)' using errcode = '23514';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - v_mutable) <> (to_jsonb(old) - v_mutable) then
    raise exception 'append_only: filings allow document_ref, document_url, link_attempts, mapping_gen, accepted_at and acceptance_source changes only' using errcode = '23514';
  end if;
  if new.mapping_gen < old.mapping_gen then
    raise exception 'append_only: filings.mapping_gen may only increase (% -> %)', old.mapping_gen, new.mapping_gen using errcode = '23514';
  end if;
  if (new.accepted_at, new.acceptance_source) is distinct from (old.accepted_at, old.acceptance_source) then
    if old.accepted_at is not null or old.acceptance_source is not null then
      raise exception 'append_only: filings.accepted_at is set once (null -> value)' using errcode = '23514';
    end if;
    if current_setting('facts.allow_acceptance_write', true) is distinct from 'on' then
      raise exception 'append_only: filings.accepted_at is written only by set_filing_acceptance' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- accepted_at is null → write, true; the same value and source → false; another value → acceptance_conflict.
create or replace function public.set_filing_acceptance(p_filing uuid, p_accepted timestamptz, p_source text)
returns boolean language plpgsql security definer set search_path = public as $$
declare g public.filings;
begin
  if p_accepted is null or p_source is distinct from 'sec_submissions' then raise exception 'invalid_acceptance' using errcode = '22023'; end if;
  select * into g from public.filings where filing_id = p_filing for update;
  if not found then raise exception 'filing_not_found' using errcode = 'P0001'; end if;
  if g.source <> 'edgar' then raise exception 'invalid_acceptance' using errcode = '22023'; end if;
  if g.accepted_at is null then
    perform set_config('facts.allow_acceptance_write', 'on', true);
    update public.filings set accepted_at = p_accepted, acceptance_source = p_source where filing_id = p_filing;
    perform set_config('facts.allow_acceptance_write', 'off', true);
    return true;
  end if;
  if g.accepted_at = p_accepted and g.acceptance_source = p_source then return false; end if;
  raise exception 'acceptance_conflict' using errcode = 'P0001';
end $$;
revoke execute on function public.set_filing_acceptance(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_filing_acceptance(uuid, timestamptz, text) to service_role;

-- ---------------------------------------------------------------- 2. financial_metrics.based_on_lineage (spec §3.2)
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financial_metrics' and column_name = 'based_on_lineage') then
    alter table public.financial_metrics add column based_on_lineage jsonb not null default '[]';
    update public.financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev));
    alter table public.financial_metrics add constraint financial_metrics_lineage_nonempty
      check (jsonb_typeof(based_on_lineage) = 'array' and jsonb_array_length(based_on_lineage) >= 1);
  end if;
end $$;

-- ---------------------------------------------------------------- 3. lineage materialisation (spec §3.2, §4.4)
-- p_based_on = [{issuer_id, state_rev}]: issuer ids unique and containing p_issuer. Every member's
-- scope row is locked in (issuer_id, market) order (a missing one → scope_missing); under the
-- locks the lineage {p_issuer} ∪ {merged_into = p_issuer} must equal the member set and every
-- state_rev must match, else stale_computation. Stored vector: issuer_id ascending.
create or replace function public.replace_financial_metrics_lineage(p_issuer uuid, p_market text, p_based_on jsonb, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_members uuid[]; v_norm jsonb; v_locked int; v_lineage uuid[]; v_rev bigint; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_issuer is null or p_market is null or p_market not in ('US','CN') then raise exception 'invalid_based_on' using errcode = '22023'; end if;
  if p_based_on is null or jsonb_typeof(p_based_on) <> 'array' or jsonb_array_length(p_based_on) = 0
     or exists (select 1 from jsonb_array_elements(p_based_on) e
                where jsonb_typeof(e) <> 'object'
                   or coalesce(jsonb_typeof(e -> 'issuer_id'), '') <> 'string'
                   or coalesce(jsonb_typeof(e -> 'state_rev'), '') <> 'number'
                   or (e ->> 'issuer_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   or (e ->> 'state_rev') !~ '^[0-9]+$') then
    raise exception 'invalid_based_on' using errcode = '22023';
  end if;
  select array_agg((e ->> 'issuer_id')::uuid order by (e ->> 'issuer_id')::uuid),
         jsonb_agg(jsonb_build_object('issuer_id', (e ->> 'issuer_id')::uuid, 'state_rev', (e ->> 'state_rev')::bigint) order by (e ->> 'issuer_id')::uuid)
    into v_members, v_norm
  from jsonb_array_elements(p_based_on) e;
  if cardinality(v_members) <> (select count(distinct m) from unnest(v_members) m) or not (p_issuer = any(v_members)) then
    raise exception 'invalid_based_on' using errcode = '22023';
  end if;
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_members) and s.market = p_market order by s.issuer_id for update) x;
  if v_locked <> cardinality(v_members) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  -- a merged / dissolved issuer is no longer a materialisation target: the caller re-resolves T(i) and retries
  if not exists (select 1 from public.issuers where issuer_id = p_issuer and status = 'active') then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  select array_agg(l.i order by l.i) into v_lineage
  from (select p_issuer as i union select issuer_id from public.issuers where merged_into = p_issuer) l;
  if v_lineage is distinct from v_members then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(v_norm) e
             join public.fact_sync_scope s on s.issuer_id = (e ->> 'issuer_id')::uuid and s.market = p_market
             where s.state_rev <> (e ->> 'state_rev')::bigint) then
    raise exception 'stale_computation' using errcode = 'P0001';
  end if;
  select state_rev into v_rev from public.fact_sync_scope where issuer_id = p_issuer and market = p_market;
  delete from public.financial_metrics where issuer_id = p_issuer and market = p_market;
  insert into public.financial_metrics (issuer_id, market, metric, period_start, period_end, duration, value, unit, input_unit, basis, formula_version, inputs, based_on_rev, based_on_lineage, as_of)
  select p_issuer, p_market, x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', (x ->> 'value')::numeric,
         x ->> 'unit', x ->> 'input_unit', x ->> 'basis', x ->> 'formula_version', coalesce(x -> 'inputs', '[]'::jsonb), v_rev, v_norm, (x ->> 'as_of')::date
  from jsonb_array_elements(p_rows) x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_financial_metrics_lineage(uuid, text, jsonb, jsonb) to service_role;

-- Plan-2 signature kept: a one-member vector [{p_issuer, p_based_on_rev}]. No scope row keeps the
-- plan-2 answer for a non-zero rev (stale_computation; "no scope row ⇒ rev 0"); rev 0 without a
-- scope row is scope_missing (the lineage function must lock the row).
create or replace function public.replace_financial_metrics(p_issuer uuid, p_market text, p_based_on_rev bigint, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_based_on_rev is null then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.fact_sync_scope where issuer_id = p_issuer and market = p_market) then
    if p_based_on_rev <> 0 then raise exception 'stale_computation' using errcode = 'P0001'; end if;
    raise exception 'scope_missing' using errcode = 'P0001';
  end if;
  if p_based_on_rev < 0 then raise exception 'stale_computation' using errcode = 'P0001'; end if;
  return public.replace_financial_metrics_lineage(p_issuer, p_market, jsonb_build_array(jsonb_build_object('issuer_id', p_issuer, 'state_rev', p_based_on_rev)), p_rows);
end $$;
revoke execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.replace_financial_metrics(uuid, text, bigint, jsonb) to service_role;

-- ---------------------------------------------------------------- 4. evidence reader (spec §3.2 read_filing_facts, S2/T1)
-- Every generation and status of one filing (p_include_non_ok = false: ok only), no window
-- computation; binding to the active generation / published runs is the caller's job.
create or replace function public.read_filing_facts(p_filing uuid, p_include_non_ok boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg((to_jsonb(f) - 'value') || jsonb_build_object('value', f.value_text, 'run_status', r.status)
           order by f.mapping_gen, f.concept collate "C", f.period_end, f.period_start nulls first, f.unit collate "C", f.created_at, f.fact_id), '[]'::jsonb))
  from public.financial_facts f
  join public.fact_sync_runs r on r.run_id = f.run_id
  where f.filing_id = p_filing and (f.status = 'ok' or coalesce(p_include_non_ok, false))
$$;
revoke execute on function public.read_filing_facts(uuid, boolean) from public, anon, authenticated;
grant execute on function public.read_filing_facts(uuid, boolean) to service_role;

-- ---------------------------------------------------------------- 5. lineage read (spec §3.2 read_facts_lineage, §4.4, T7)
-- The plan-2 read_facts statement over a member set: partitions carry no issuer_id; only qualified
-- ok rows take part in sequences; non-ok rows carry disclosure_seq null / false flags and appear only
-- with p_history; active-generation filter, key ranking and limit, the 10,000-row cap (truncated ⇒
-- no rows), decimal strings and RLS (security invoker) are unchanged. Cross-issuer suppression only
-- with more than one member and only over ok rows: a (K, available_date) whose ok rows come from
-- different issuers with different values takes no part in sequences and is listed in conflicts.
-- Envelope {state_revs (issuer_id asc), lineage (asc), rows, conflicts, truncated, row_count}.
create or replace function public.read_facts_lineage(
  p_issuers uuid[], p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
with members as (
  select distinct u.m as issuer_id from unnest(coalesce(p_issuers, '{}'::uuid[])) as u(m) where u.m is not null
), base as (
  select f.fact_id, f.issuer_id, f.market, f.filing_id, f.run_id, f.concept, f.source_concept, f.statement,
         f.period_start, f.period_end, f.duration, f.value, f.value_text, f.unit, f.consolidation, f.available_date,
         f.mapping_gen, f.mapping_version, f.status, f.raw_hash, f.created_at
  from public.financial_facts f
  join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
  where f.issuer_id in (select issuer_id from members) and f.market = p_market
    and (p_concepts is null or f.concept = any(p_concepts))
    and f.available_date <= p_as_of
    and (p_from is null or f.period_end >= p_from)
    and (p_to is null or f.period_end <= p_to)
    and (f.status = 'ok' or coalesce(p_include_non_ok, false))
), clash as (
  select b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date,
         jsonb_agg(to_jsonb(b.fact_id::text) order by b.fact_id) as fact_ids
  from base b
  where b.status = 'ok' and (select count(*) from members) > 1
  group by b.concept, b.period_start, b.period_end, b.consolidation, b.unit, b.available_date
  having count(distinct b.issuer_id) > 1 and count(distinct b.value) > 1
), eligible as (
  select b.* from base b
  where b.status <> 'ok' or not exists (
    select 1 from clash c
    where c.concept = b.concept and c.period_start is not distinct from b.period_start and c.period_end = b.period_end
      and c.consolidation = b.consolidation and c.unit = b.unit and c.available_date = b.available_date)
), seq as (
  select b.*,
         row_number() over w as disclosure_seq,
         (row_number() over w = count(*) over (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit)) as is_current,
         (lag(b.value) over w is not null and b.value <> lag(b.value) over w) as is_revision
  from eligible b
  where b.status = 'ok'
  window w as (partition by b.concept, b.period_start, b.period_end, b.consolidation, b.unit order by b.available_date, b.created_at, b.fact_id)
  union all
  select b.*, null::bigint, false, false from eligible b where b.status <> 'ok'
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
  'state_revs', (select coalesce(jsonb_agg(jsonb_build_object('issuer_id', m.issuer_id, 'state_rev', public.fact_state_rev(m.issuer_id, p_market)) order by m.issuer_id), '[]'::jsonb) from members m),
  'lineage', (select coalesce(jsonb_agg(to_jsonb(m.issuer_id::text) order by m.issuer_id), '[]'::jsonb) from members m),
  'conflicts', (select coalesce(jsonb_agg(jsonb_build_object(
                   'key', jsonb_build_object('concept', c.concept, 'period_start', c.period_start, 'period_end', c.period_end, 'consolidation', c.consolidation, 'unit', c.unit),
                   'available_date', c.available_date, 'fact_ids', c.fact_ids)
                 order by c.available_date, c.concept collate "C", c.period_end, c.period_start nulls first, c.consolidation collate "C", c.unit collate "C"), '[]'::jsonb) from clash c),
  'truncated', (select n from counted) > 10000,
  'row_count', case when (select n from counted) > 10000 then 0 else (select n from counted) end,
  'rows', case when (select n from counted) > 10000 then '[]'::jsonb
               else coalesce((select jsonb_agg((to_jsonb(c) - 'key_rank' - 'value') || jsonb_build_object('value', c.value_text) order by c.key_rank, c.available_date, c.created_at, c.fact_id) from capped c), '[]'::jsonb) end)
$$;
revoke execute on function public.read_facts_lineage(uuid[], text, text[], date, date, date, boolean, int, boolean) from public;
grant execute on function public.read_facts_lineage(uuid[], text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;

-- Plan-2 signature and envelope {state_rev, rows, truncated, row_count}: one member, so the
-- suppression never applies and the output is that of the plan-2 statement.
create or replace function public.read_facts(
  p_issuer uuid, p_market text, p_concepts text[], p_as_of date,
  p_from date, p_to date, p_history boolean, p_limit int, p_include_non_ok boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'state_rev', coalesce(x.v -> 'state_revs' -> 0 -> 'state_rev', to_jsonb(public.fact_state_rev(p_issuer, p_market))),
    'truncated', x.v -> 'truncated', 'row_count', x.v -> 'row_count', 'rows', x.v -> 'rows')
  from (select public.read_facts_lineage(array[p_issuer], p_market, p_concepts, p_as_of, p_from, p_to, p_history, p_limit, p_include_non_ok) as v) x
$$;
revoke execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) from public;
grant execute on function public.read_facts(uuid, text, text[], date, date, date, boolean, int, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 6. topology writers (spec §3.1 guard, §3.2 set_merge / set_dissolved, R3, T12)
-- Placeholder scope rows (priority 0, reasons [], fetch_key 'topology' — the plan-2 check needs
-- 1..32 characters) for every issuer of the set in both markets, never overwriting an existing row,
-- then every scope row of the set locked in (issuer_id, market) order.
create or replace function public.fact_topology_lock(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.fact_sync_scope (issuer_id, market, reasons, priority, fetch_key)
  select i, mk.m, '[]'::jsonb, 0, 'topology'
  from unnest(p_ids) as i cross join (values ('US'), ('CN')) as mk(m)
  on conflict (issuer_id, market) do nothing;
  perform 1 from public.fact_sync_scope s where s.issuer_id = any(p_ids) order by s.issuer_id, s.market for update;
end $$;
revoke execute on function public.fact_topology_lock(uuid[]) from public, anon, authenticated, service_role;

-- Body of set_merge (runs with entities.allow_topology_write on). Affected set = {source, target}
-- ∪ referrers of both; scope rows locked; issuers rows locked; the set re-read under the locks
-- (changed → lineage_changed); referrers of the source re-pointed to the target (row_count = n);
-- the source retired (row_count = 1, else source_not_active); the plan-1 triggers check the target
-- is active and the source holds no open security (errors pass through); every affected scope
-- state_rev + 1; the target joins the next facts.lineage_same_day cycle — entry {issuer_id:T, market,
-- source:S} appended under the cycle lock open_reconcile_cycle also takes (plan audit Q2), so a cycle
-- creation never overwrites or half-consumes it; audit row.
-- Lock order (plan audit R1): the cycle advisory lock is taken FIRST, before the scope rows
-- (fact_topology_lock) and the issuers rows. open_reconcile_cycle holds the same advisory lock while
-- its cursor inserts take KEY SHARE on issuers rows (cursor → issuers FK); taking the advisory lock
-- after the issuer locks would let a merge hold FOR UPDATE on the target while waiting for the
-- advisory lock that a creator holds while waiting for that row — a deadlock. Global rule: any
-- function that takes a dq_reconcile_cycle:* advisory lock takes it before any row lock.
create or replace function public.fact_set_merge_body(p_source uuid, p_target uuid, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_set uuid[]; v_now uuid[]; v_refs uuid[]; n int;
begin
  if p_source is null or p_target is null or p_source = p_target then raise exception 'invalid_merge' using errcode = '22023'; end if;
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  if not exists (select 1 from public.issuers where issuer_id = p_source) then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.issuers where issuer_id = p_target) then
    raise exception 'merge_target_not_active: issuer % cannot merge into % (status missing)', p_source, p_target using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'));   -- FIRST, before any row lock (plan audit R1); serialises with open_reconcile_cycle (plan audit Q2)
  v_set := array(select distinct x from unnest(array[p_source, p_target] || array(select issuer_id from public.issuers where merged_into in (p_source, p_target))) as x order by x);
  perform public.fact_topology_lock(v_set);
  perform 1 from public.issuers where issuer_id = any(v_set) order by issuer_id for update;
  v_now := array(select distinct x from unnest(array[p_source, p_target] || array(select issuer_id from public.issuers where merged_into in (p_source, p_target))) as x order by x);
  if v_now <> v_set then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.issuers where issuer_id = p_source and status = 'active') then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  v_refs := array(select issuer_id from public.issuers where merged_into = p_source order by issuer_id);
  update public.issuers set merged_into = p_target, updated_at = now() where merged_into = p_source;
  get diagnostics n = row_count;
  if n <> cardinality(v_refs) then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  update public.issuers set status = 'merged', merged_into = p_target, updated_at = now() where issuer_id = p_source and status = 'active';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_set);
  -- the cycle advisory lock is already held (taken first, above)
  -- Registration is best effort: with no facts.lineage_same_day cycle row the UPDATE below affects 0 rows and
  -- nothing else happens (no cycle row is created here). Alignment decision #6: the runner's first cycle
  -- re-enumerates every issuer with merged_into not null, so no merge target is lost.
  update public.dq_reconcile_cycles c
  set detail = jsonb_set(c.detail, '{pending_members}',
        coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
        || coalesce((select jsonb_agg(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source) order by mk.m)
                     from (values ('CN'), ('US')) as mk(m)
                     where not (coalesce(case when jsonb_typeof(c.detail -> 'pending_members') = 'array' then c.detail -> 'pending_members' end, '[]'::jsonb)
                                @> jsonb_build_array(jsonb_build_object('issuer_id', p_target, 'market', mk.m, 'source', p_source)))), '[]'::jsonb), true)
  where c.pair = 'facts.lineage_same_day'
    and c.cycle_id = (select y.cycle_id from public.dq_reconcile_cycles y where y.pair = 'facts.lineage_same_day' order by (y.status = 'running') desc, y.started_at desc limit 1);
  insert into public.research_audit_log (user_id, actor, action, object_type, object_id, detail)
  values (p_resolved_by, 'user', 'entities.merge', 'issuer', p_source, jsonb_build_object('source', p_source, 'target', p_target, 'repointed', cardinality(v_refs)));
  return jsonb_build_object('repointed', cardinality(v_refs));
end $$;
revoke execute on function public.fact_set_merge_body(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.set_merge(p_source uuid, p_target uuid, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev text := current_setting('entities.allow_topology_write', true); v_out jsonb;
begin
  perform set_config('entities.allow_topology_write', 'on', true);
  begin
    v_out := public.fact_set_merge_body(p_source, p_target, p_resolved_by);
  exception when others then
    perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
    raise;
  end;
  perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
  return v_out;
end $$;
revoke execute on function public.set_merge(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_merge(uuid, uuid, uuid) to service_role;

-- Body of set_dissolved: same lock set (issuer + referrers); referrers → has_referrers (re-point
-- them with set_merge first); active → dissolved (row_count = 1, else source_not_active); the
-- plan-1 trigger refuses an issuer with open securities; state_rev + 1; audit row.
-- Lock order (plan audit R1): set_dissolved registers no pending member and takes NO cycle advisory
-- lock, so it never waits for anything open_reconcile_cycle holds — a creator inserting a cursor for
-- this issuer may wait behind its FOR UPDATE (one-way wait, no cycle). If it ever needs the cycle
-- lock, it must take it first, as set_merge does.
create or replace function public.fact_set_dissolved_body(p_issuer uuid, p_resolved_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_set uuid[]; v_now uuid[]; n int;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  if p_issuer is null or not exists (select 1 from public.issuers where issuer_id = p_issuer) then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  v_set := array(select distinct x from unnest(array[p_issuer] || array(select issuer_id from public.issuers where merged_into = p_issuer)) as x order by x);
  perform public.fact_topology_lock(v_set);
  perform 1 from public.issuers where issuer_id = any(v_set) order by issuer_id for update;
  v_now := array(select distinct x from unnest(array[p_issuer] || array(select issuer_id from public.issuers where merged_into = p_issuer)) as x order by x);
  if v_now <> v_set then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  if cardinality(v_set) > 1 then raise exception 'has_referrers' using errcode = 'P0001'; end if;
  update public.issuers set status = 'dissolved', updated_at = now() where issuer_id = p_issuer and status = 'active';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'source_not_active' using errcode = 'P0001'; end if;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = p_issuer;
  insert into public.research_audit_log (user_id, actor, action, object_type, object_id, detail)
  values (p_resolved_by, 'user', 'entities.dissolve', 'issuer', p_issuer, jsonb_build_object('issuer', p_issuer));
end $$;
revoke execute on function public.fact_set_dissolved_body(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.set_dissolved(p_issuer uuid, p_resolved_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text := current_setting('entities.allow_topology_write', true);
begin
  perform set_config('entities.allow_topology_write', 'on', true);
  begin
    perform public.fact_set_dissolved_body(p_issuer, p_resolved_by);
  exception when others then
    perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
    raise;
  end;
  perform set_config('entities.allow_topology_write', coalesce(v_prev, ''), true);
end $$;
revoke execute on function public.set_dissolved(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_dissolved(uuid, uuid) to service_role;

-- ---------------------------------------------------------------- 7. promotion eligibility (spec §3.2, T6)
-- The plan-2 helper with every landed predicate kept verbatim, plus two: (a) a RESOLVED
-- lineage_conflict binds its members — payload.fact_ids and the rows it quarantined
-- (detail.quarantined_fact_ids) — to detail.chosen_fact_ids; (b) a reconcile_mismatch that
-- references the row blocks unless it is resolved_accept with latest_result.passed = true (open,
-- rejected, or accepted without a passing latest result all block; restoring goes through
-- restore_reconciled). Callers hold the scope lock (promote_quarantined, resolve_facts_quarantine,
-- restore_reconciled).
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
        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text))
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'lineage_conflict' and q.status <> 'open'
        and ((jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text)
             or (jsonb_typeof(q.detail -> 'quarantined_fact_ids') = 'array' and q.detail -> 'quarantined_fact_ids' ? f.fact_id::text))
        and not (coalesce(q.detail -> 'chosen_fact_ids', '[]'::jsonb) ? f.fact_id::text))
    and not exists (
      select 1 from public.dq_quarantine q
      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch'
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? f.fact_id::text
        and (q.status <> 'resolved_accept' or (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fact_promote_rows(uuid, text, uuid[]) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 8. adopt a quarantined candidate (spec §3.2 adopt_candidate, §4.6, T1, T5, U3)
-- The item is an open ambiguous_value of facts.us / facts.cn; the persisted candidate is the plan-2
-- FactCandidate (camelCase) and is mapped field by field (anything missing or ill-typed →
-- invalid_candidate). The filing comes from (source by market, source_ref = filingRef) and gives
-- issuer, market and available_date (the payload is not trusted). The generation is the anchor
-- run's (payload.run_id) and must equal the natural key's last segment and filings.mapping_gen
-- (> 0), else generation_moved. mapping_version = the one distinct value retained by the anchor
-- run's rows (none → by the same filing and generation); zero or several → replay_required (the
-- current default is never used). The batch must be running for the item's dataset. Under the
-- filing's scope lock: state_rev = p_expected_rev (stale_evaluation); the full plan-2 candidate key
-- (K + filing + generation) in any status → duplicate (an old generation alone is no duplicate);
-- a visible ok row of (K, available_date) with another value OR an open same_day_conflict /
-- lineage_conflict on it → conflict_exists. Then one transaction: a management run (published, no
-- manifest, activates nothing), the fact staged → ok, the item resolved with
-- chosen_candidate_index / adopted_fact_id / run_id / issuer_id / market / batch_id and
-- hook = pending, state_rev + 1.
create or replace function public.adopt_candidate(p_item uuid, p_index int, p_batch uuid, p_expected_rev bigint, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; c jsonb; g public.filings; r public.fact_sync_runs; b public.ingest_batches;
        v_source text; v_market text; v_gen int; v_nk_gen int; v_versions text[]; v_rev bigint;
        v_ps date; v_pe date; v_value numeric; v_run uuid := gen_random_uuid(); v_fact uuid := gen_random_uuid(); v_t uuid; v_k text;
        v_lineage uuid[]; v_now uuid[]; v_locked int;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if q.table_name <> 'financial_facts' or q.reason_code <> 'ambiguous_value' or q.dataset not in ('facts.us','facts.cn') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(q.payload -> 'candidates'), '') <> 'array' or p_index is null or p_index < 0 or p_index >= jsonb_array_length(q.payload -> 'candidates') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  c := q.payload -> 'candidates' -> p_index;
  if jsonb_typeof(c) <> 'object'
     or coalesce(jsonb_typeof(c -> 'concept'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'sourceConcept'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'unit'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'filingRef'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'rawHash'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'value'), '') <> 'string'
     or coalesce(jsonb_typeof(c -> 'periodEnd'), '') <> 'string' or coalesce(jsonb_typeof(c -> 'periodStart'), 'missing') not in ('null', 'string')
     or coalesce(c ->> 'statement', '') not in ('IS','BS','CF','DEI')
     or coalesce(c ->> 'duration', '') not in ('3M','6M','9M','12M','INSTANT')
     or coalesce(c ->> 'consolidation', '') not in ('consolidated','parent') then
    raise exception 'invalid_candidate' using errcode = '22023';
  end if;
  if length(c ->> 'concept') not between 1 and 64 or length(c ->> 'sourceConcept') not between 1 and 256
     or length(c ->> 'unit') not between 1 and 16 or length(c ->> 'rawHash') not between 1 and 128
     or (c ->> 'value') !~ '^-?[0-9]+(\.[0-9]+)?$' or (c ->> 'periodEnd') !~ '^\d{4}-\d{2}-\d{2}$'
     or (jsonb_typeof(c -> 'periodStart') = 'string' and (c ->> 'periodStart') !~ '^\d{4}-\d{2}-\d{2}$')
     or ((jsonb_typeof(c -> 'periodStart') = 'null') <> ((c ->> 'duration') = 'INSTANT')) then
    raise exception 'invalid_candidate' using errcode = '22023';
  end if;
  begin
    v_pe := (c ->> 'periodEnd')::date;
    v_ps := (c ->> 'periodStart')::date;
    v_value := (c ->> 'value')::numeric;
  exception when others then
    raise exception 'invalid_candidate' using errcode = '22023';
  end;
  if v_ps is not null and not (v_ps < v_pe) then raise exception 'invalid_candidate' using errcode = '22023'; end if;
  v_market := case q.dataset when 'facts.us' then 'US' else 'CN' end;
  v_source := case q.dataset when 'facts.us' then 'edgar' else 'tushare' end;
  select * into g from public.filings where source = v_source and source_ref = c ->> 'filingRef';
  if not found or g.market <> v_market then raise exception 'filing_not_found' using errcode = 'P0001'; end if;
  if coalesce(q.payload ->> 'run_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'generation_moved' using errcode = 'P0001';
  end if;
  select * into r from public.fact_sync_runs where run_id = (q.payload ->> 'run_id')::uuid;
  if not found then raise exception 'generation_moved' using errcode = 'P0001'; end if;
  v_gen := r.mapping_gen;
  v_nk_gen := substring(q.natural_key from ':([0-9]+)$')::int;
  if v_nk_gen is distinct from v_gen or g.mapping_gen is distinct from v_gen or v_gen <= 0 or r.market <> g.market then
    raise exception 'generation_moved' using errcode = 'P0001';
  end if;
  select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.run_id = r.run_id;
  if v_versions is null then
    select array_agg(distinct f.mapping_version) into v_versions from public.financial_facts f where f.filing_id = g.filing_id and f.mapping_gen = v_gen;
  end if;
  if v_versions is null or cardinality(v_versions) <> 1 then raise exception 'replay_required' using errcode = 'P0001'; end if;
  select * into b from public.ingest_batches where batch_id = p_batch;
  if not found or b.status <> 'running' or b.dataset <> q.dataset then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
  -- lock the whole lineage of the filing issuer's target (sorted by issuer_id; no cycle lock is taken here), then revalidate membership
  v_t := coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id);
  v_lineage := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = g.market order by s.issuer_id for update) x;
  if v_locked <> cardinality(v_lineage) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  v_now := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  if v_now <> v_lineage or not (g.issuer_id = any(v_now))
     or v_t is distinct from coalesce((select i.merged_into from public.issuers i where i.issuer_id = g.issuer_id), g.issuer_id)
     or not exists (select 1 from public.issuers i where i.issuer_id = v_t and i.status = 'active') then
    raise exception 'lineage_changed' using errcode = 'P0001';
  end if;
  select s.state_rev into v_rev from public.fact_sync_scope s where s.issuer_id = g.issuer_id and s.market = g.market;
  if not found then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  if v_rev is distinct from p_expected_rev then raise exception 'stale_evaluation' using errcode = 'P0001'; end if;
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if exists (select 1 from public.financial_facts f
             where f.issuer_id = g.issuer_id and f.concept = c ->> 'concept' and f.period_start is not distinct from v_ps and f.period_end = v_pe
               and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit' and f.filing_id = g.filing_id and f.mapping_gen = v_gen) then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;
  v_k := (c ->> 'concept') || ':' || coalesce(c ->> 'periodStart', '') || ':' || (c ->> 'periodEnd') || ':' || (c ->> 'consolidation') || ':' || (c ->> 'unit');
  if exists (select 1 from public.financial_facts f join public.filings fg on fg.filing_id = f.filing_id and fg.mapping_gen = f.mapping_gen
             where f.issuer_id = any(v_lineage) and f.market = g.market and f.status = 'ok' and f.concept = c ->> 'concept'
               and f.period_start is not distinct from v_ps and f.period_end = v_pe and f.consolidation = c ->> 'consolidation' and f.unit = c ->> 'unit'
               and f.available_date = g.available_date and f.value <> v_value)
     or exists (select 1 from public.dq_quarantine d
                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'same_day_conflict'
                  and d.payload -> 'key' ->> 'issuer_id' in (select l::text from unnest(v_lineage) l) and d.payload -> 'key' ->> 'market' = g.market
                  and d.payload -> 'key' ->> 'concept' = c ->> 'concept'
                  and coalesce(d.payload -> 'key' ->> 'period_start', '') = coalesce(c ->> 'periodStart', '')
                  and d.payload -> 'key' ->> 'period_end' = c ->> 'periodEnd'
                  and d.payload -> 'key' ->> 'consolidation' = c ->> 'consolidation' and d.payload -> 'key' ->> 'unit' = c ->> 'unit'
                  and (d.payload -> 'key' ->> 'available_date') ~ '^\d{4}-\d{2}-\d{2}$' and (d.payload -> 'key' ->> 'available_date')::date = g.available_date)
     or exists (select 1 from public.dq_quarantine d
                where d.table_name = 'financial_facts' and d.status = 'open' and d.reason_code = 'lineage_conflict'
                  and d.natural_key = v_t::text || ':' || v_k || ':' || to_char(g.available_date, 'YYYY-MM-DD')) then
    raise exception 'conflict_exists' using errcode = 'P0001';
  end if;
  insert into public.fact_sync_runs (run_id, issuer_id, market, batch_id, mapping_gen, status, manifest, started_at, published_at)
  values (v_run, g.issuer_id, g.market, p_batch, v_gen, 'published', '[]'::jsonb, now(), now());
  insert into public.financial_facts (fact_id, issuer_id, market, filing_id, run_id, concept, source_concept, statement, period_start, period_end, duration, value, unit, consolidation, available_date, mapping_gen, mapping_version, raw_hash)
  values (v_fact, g.issuer_id, g.market, g.filing_id, v_run, c ->> 'concept', c ->> 'sourceConcept', c ->> 'statement', v_ps, v_pe, c ->> 'duration', v_value,
          c ->> 'unit', c ->> 'consolidation', g.available_date, v_gen, v_versions[1], c ->> 'rawHash');
  update public.financial_facts set status = 'ok' where fact_id = v_fact;
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('chosen_candidate_index', p_index, 'adopted_fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id,
                                            'market', g.market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
  where id = p_item;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = g.issuer_id and market = g.market;
  return jsonb_build_object('fact_id', v_fact, 'run_id', v_run, 'issuer_id', g.issuer_id, 'market', g.market);
end $$;
revoke execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.adopt_candidate(uuid, int, uuid, bigint, uuid) to service_role;

-- ---------------------------------------------------------------- 9. restore after a passing re-run (spec §3.2 restore_reconciled, §5.6, R1)
-- Open reconcile_mismatch only; p_batch running. Scope lock (issuer of the first member row by
-- fact_id, else detail.issuer_id/market), item re-read under it. latest_result.passed must be
-- true and latest_result.inputs_hash must equal p_inputs_hash_now (computed by the caller from the
-- CURRENT inputs with the same function the runner uses), else not_passing. The item is closed
-- FIRST (it no longer blocks its own rows; other open items still do), then payload.fact_ids go
-- through fact_promote_rows; state_rev + 1; hook = pending. skipped lists every member not
-- promoted: missing / not_quarantined / ineligible.
create or replace function public.restore_reconciled(p_item uuid, p_batch uuid, p_inputs_hash_now text, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_issuer uuid; v_market text; v_ids uuid[]; v_before uuid[]; v_promoted int := 0; v_skipped jsonb;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' or q.reason_code <> 'reconcile_mismatch' then
    raise exception 'item_not_open' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  select f.issuer_id, f.market into v_issuer, v_market from public.financial_facts f where f.fact_id = any(v_ids) order by f.fact_id limit 1;
  if v_issuer is null and coalesce(q.detail ->> 'issuer_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_issuer := (q.detail ->> 'issuer_id')::uuid; v_market := q.detail ->> 'market';
  end if;
  if v_issuer is not null then
    perform 1 from public.fact_sync_scope where issuer_id = v_issuer and market = v_market for update;
  end if;
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if (q.detail -> 'latest_result' -> 'passed') is distinct from 'true'::jsonb
     or p_inputs_hash_now is null or (q.detail -> 'latest_result' ->> 'inputs_hash') is distinct from p_inputs_hash_now then
    raise exception 'not_passing' using errcode = 'P0001';
  end if;
  v_ids := public.fact_item_members(q.payload);
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('restored_by_batch', p_batch, 'chosen_fact_ids', to_jsonb(v_ids),
                                            'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
  where id = p_item;
  v_before := array(select f.fact_id from public.financial_facts f where f.fact_id = any(v_ids) and f.status = 'quarantined');
  if v_issuer is not null then
    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_ids);
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('fact_id', x.id,
           'reason', case when f.fact_id is null then 'missing' when not (x.id = any(v_before)) then 'not_quarantined' else 'ineligible' end) order by x.id), '[]'::jsonb)
    into v_skipped
  from unnest(v_ids) as x(id) left join public.financial_facts f on f.fact_id = x.id
  where f.fact_id is null or not (x.id = any(v_before)) or f.status <> 'ok';
  return jsonb_build_object('promoted', v_promoted, 'skipped', v_skipped);
end $$;
revoke execute on function public.restore_reconciled(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.restore_reconciled(uuid, uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------- 10. lineage verdict (spec §3.2 resolve_lineage_conflict, §4.4)
-- natural_key = <T>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<available_date>.
-- The current lineage of T (T ∪ merged_into = T) is computed, every member's scope row locked in
-- (issuer_id, market) order (missing → scope_missing), the lineage re-read under the locks
-- (changed → lineage_changed); payload rows must belong to it (else lineage_changed); p_keep must
-- be a payload member (else invalid_choice). Every OTHER visible ok row of (K, date) in the lineage
-- — re-queried under the locks, not only the payload — becomes quarantined; afterwards exactly one
-- visible ok row must remain (else unresolved, rolled back). Verdict persisted
-- (chosen_fact_ids, quarantined_fact_ids, issuer_id = T, market, hook pending); every member
-- state_rev + 1.
create or replace function public.resolve_lineage_conflict(p_item uuid, p_keep uuid, p_batch uuid, p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_parts text[]; v_t uuid; v_market text; v_lineage uuid[]; v_now uuid[]; v_locked int; v_ids uuid[];
        v_concept text; v_ps date; v_pe date; v_cons text; v_unit text; v_date date; v_q uuid[]; v_ok int;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  if q.table_name <> 'financial_facts' or q.reason_code <> 'lineage_conflict' or q.dataset not in ('facts.us','facts.cn') then
    raise exception 'invalid_choice' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ingest_batches where batch_id = p_batch and status = 'running') then raise exception 'batch_mismatch' using errcode = 'P0001'; end if;
  v_parts := string_to_array(q.natural_key, ':');
  if cardinality(v_parts) <> 7 then raise exception 'invalid_choice' using errcode = '22023'; end if;
  begin
    v_t := v_parts[1]::uuid; v_concept := v_parts[2]; v_ps := nullif(v_parts[3], '')::date; v_pe := v_parts[4]::date;
    v_cons := v_parts[5]; v_unit := v_parts[6]; v_date := v_parts[7]::date;
  exception when others then
    raise exception 'invalid_choice' using errcode = '22023';
  end;
  v_market := case q.dataset when 'facts.us' then 'US' else 'CN' end;
  v_lineage := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  select count(*) into v_locked from (
    select 1 from public.fact_sync_scope s where s.issuer_id = any(v_lineage) and s.market = v_market order by s.issuer_id for update) x;
  if v_locked <> cardinality(v_lineage) then raise exception 'scope_missing' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.issuers i where i.issuer_id = v_t and i.status = 'active') then raise exception 'target_not_active' using errcode = 'P0001'; end if;
  v_now := array(select l.i from (select v_t as i union select issuer_id from public.issuers where merged_into = v_t) l order by l.i);
  if v_now <> v_lineage then raise exception 'lineage_changed' using errcode = 'P0001'; end if;
  select * into q from public.dq_quarantine where id = p_item for update;
  if q.status <> 'open' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  v_ids := public.fact_item_members(q.payload);
  if p_keep is null or not (p_keep = any(v_ids)) then raise exception 'invalid_choice' using errcode = '22023'; end if;
  if exists (select 1 from public.financial_facts f where f.fact_id = any(v_ids) and not (f.issuer_id = any(v_lineage))) then
    raise exception 'lineage_changed' using errcode = 'P0001';
  end if;
  with hit as (
    update public.financial_facts f set status = 'quarantined'
    from public.filings g
    where g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
      and f.issuer_id = any(v_lineage) and f.market = v_market and f.status = 'ok' and f.fact_id <> p_keep
      and f.concept = v_concept and f.period_start is not distinct from v_ps and f.period_end = v_pe
      and f.consolidation = v_cons and f.unit = v_unit and f.available_date = v_date
    returning f.fact_id)
  select coalesce(array_agg(hit.fact_id order by hit.fact_id), '{}'::uuid[]) into v_q from hit;
  select count(*) into v_ok
  from public.financial_facts f join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
  where f.issuer_id = any(v_lineage) and f.market = v_market and f.status = 'ok'
    and f.concept = v_concept and f.period_start is not distinct from v_ps and f.period_end = v_pe
    and f.consolidation = v_cons and f.unit = v_unit and f.available_date = v_date;
  if v_ok <> 1 then raise exception 'unresolved' using errcode = 'P0001'; end if;
  update public.dq_quarantine
  set status = 'resolved_accept', resolved_by = p_resolved_by, resolved_at = now(),
      detail = detail || jsonb_build_object('chosen_fact_ids', jsonb_build_array(p_keep), 'quarantined_fact_ids', to_jsonb(v_q), 'issuer_id', v_t,
                                            'market', v_market, 'batch_id', p_batch, 'hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
  where id = p_item;
  update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = any(v_lineage) and market = v_market;
  return jsonb_build_object('quarantined', cardinality(v_q));
end $$;
revoke execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_lineage_conflict(uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------- 11. generic resolver guard (Codex 8b P1)
-- The plan-2 body verbatim plus one guard: reconcile_mismatch and lineage_conflict items never close here.
create or replace function public.resolve_facts_quarantine(p_item uuid, p_chosen uuid[], p_resolved_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.dq_quarantine; v_ids uuid[]; v_issuer uuid; v_market text; v_chosen uuid[]; v_promoted int := 0; v_run uuid;
begin
  if p_resolved_by is null then raise exception 'invalid_resolver' using errcode = '22023'; end if;
  select * into q from public.dq_quarantine where id = p_item;
  if not found or q.status <> 'open' or q.table_name <> 'financial_facts' then raise exception 'item_not_open' using errcode = 'P0001'; end if;
  -- migration two: these two reasons close only through restore_reconciled / resolve_lineage_conflict
  if q.reason_code in ('reconcile_mismatch', 'lineage_conflict') then raise exception 'use_dedicated_resolver' using errcode = '22023'; end if;
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
        || case when q.reason_code in ('same_day_conflict', 'identity_bs', 'identity_gp')
                then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(now())))
                else '{}'::jsonb end
  where id = p_item;
  if v_issuer is not null then
    v_promoted := public.fact_promote_rows(v_issuer, v_market, v_chosen);
    update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = v_issuer and market = v_market;
  end if;
  return jsonb_build_object('promoted', v_promoted, 'skipped', cardinality(v_chosen) - v_promoted, 'chosen_fact_ids', to_jsonb(v_chosen));
end $$;
revoke execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.resolve_facts_quarantine(uuid, uuid[], uuid) to service_role;

-- ---------------------------------------------------------------- 12. reconcile cursor (spec §3.1, §3.2, §5.5, S4, S5, T2)
-- fence = {pair, cycle_id, issuer_id, market, batch_id, attempt}. A fenced call locks the cursor row
-- and requires state = 'claimed', claimed_by = batch_id, attempts = attempt and claim_until > now
-- (clock_timestamp), else fence_failed with nothing written (P0001: 55P03 would read as lease_lost).
create or replace function public.reconcile_fence_lock(p_fence jsonb)
returns public.dq_reconcile_cursor language plpgsql security definer set search_path = public as $$
declare c public.dq_reconcile_cursor;
begin
  if p_fence is null or jsonb_typeof(p_fence) <> 'object'
     or coalesce(jsonb_typeof(p_fence -> 'pair'), '') <> 'string' or coalesce(jsonb_typeof(p_fence -> 'cycle_id'), '') <> 'string'
     or coalesce(jsonb_typeof(p_fence -> 'market'), '') <> 'string'
     or coalesce(p_fence ->> 'issuer_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_fence ->> 'batch_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(jsonb_typeof(p_fence -> 'attempt'), '') <> 'number' or (p_fence ->> 'attempt') !~ '^[0-9]{1,9}$' then
    raise exception 'fence_failed' using errcode = 'P0001';
  end if;
  select * into c from public.dq_reconcile_cursor
  where pair = p_fence ->> 'pair' and cycle_id = p_fence ->> 'cycle_id' and issuer_id = (p_fence ->> 'issuer_id')::uuid and market = p_fence ->> 'market'
  for update;
  if not found or c.state <> 'claimed' or c.claimed_by is distinct from (p_fence ->> 'batch_id')::uuid
     or c.attempts <> (p_fence ->> 'attempt')::int or c.claim_until is null or c.claim_until <= clock_timestamp() then
    raise exception 'fence_failed' using errcode = 'P0001';
  end if;
  return c;
end $$;
revoke execute on function public.reconcile_fence_lock(jsonb) from public, anon, authenticated, service_role;

-- The member's frozen expected natural keys (dq_reconcile_cycles.members[].expected_keys, each element
-- {naturalKey,...} or a bare string), as text[]; null when the member is not in the cycle. Internal.
create or replace function public.reconcile_frozen_keys(p_pair text, p_cycle_id text, p_issuer uuid, p_market text)
returns text[] language sql stable security definer set search_path = public as $$
  select (select coalesce(array_agg(case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end), '{}'::text[])
          from jsonb_array_elements(m -> 'expected_keys') k)
  from public.dq_reconcile_cycles y, jsonb_array_elements(y.members) m
  where y.pair = p_pair and y.cycle_id = p_cycle_id
    and (case when m ->> 'issuer_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (m ->> 'issuer_id')::uuid end) = p_issuer and m ->> 'market' = p_market
    and jsonb_typeof(m -> 'expected_keys') = 'array'
  limit 1
$$;
revoke execute on function public.reconcile_frozen_keys(text, text, uuid, text) from public, anon, authenticated, service_role;

-- Claimable iff pending, or claimed with an expired lease, or failed with attempts < 3 (failed at
-- 3 is terminal), and the cycle is running. One atomic update; the post-claim attempts is the fence.
create or replace function public.claim_reconcile_member(p_pair text, p_cycle_id text, p_issuer uuid, p_market text, p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_attempt int;
begin
  if p_batch is null then raise exception 'invalid_batch' using errcode = '22023'; end if;
  update public.dq_reconcile_cursor c
  set state = 'claimed', claimed_by = p_batch, claim_until = clock_timestamp() + interval '10 minutes', attempts = c.attempts + 1, last_error = null
  where c.pair = p_pair and c.cycle_id = p_cycle_id and c.issuer_id = p_issuer and c.market = p_market
    and (c.state = 'pending' or (c.state = 'claimed' and c.claim_until < clock_timestamp()) or (c.state = 'failed' and c.attempts < 3))
    and exists (select 1 from public.dq_reconcile_cycles y where y.pair = c.pair and y.cycle_id = c.cycle_id and y.status = 'running')
  returning c.attempts into v_attempt;
  if not found then return null; end if;
  return jsonb_build_object('pair', p_pair, 'cycle_id', p_cycle_id, 'issuer_id', p_issuer, 'market', p_market, 'batch_id', p_batch, 'attempt', v_attempt);
end $$;
revoke execute on function public.claim_reconcile_member(text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_reconcile_member(text, text, uuid, text, uuid) to service_role;

-- Counts derived from the member's accepted result rows of this cycle (compared ∧ passed /
-- compared ∧ ¬passed / any other outcome); their sum must equal expected, else member_incomplete.
create or replace function public.complete_reconcile_member(p_fence jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.dq_reconcile_cursor; v_p int; v_f int; v_n int; v_keys text[];
begin
  c := public.reconcile_fence_lock(p_fence);
  select count(*) filter (where r.outcome = 'compared' and r.passed), count(*) filter (where r.outcome = 'compared' and not r.passed), count(*) filter (where r.outcome <> 'compared')
    into v_p, v_f, v_n
  from public.dq_reconciliations r
  where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market;
  if v_p + v_f + v_n <> c.expected then raise exception 'member_incomplete' using errcode = 'P0001'; end if;
  -- exact coverage of the frozen key set: every frozen key has an accepted result and nothing else does
  v_keys := public.reconcile_frozen_keys(c.pair, c.cycle_id, c.issuer_id, c.market);
  if v_keys is null
     or exists (select 1 from unnest(v_keys) k where not exists (select 1 from public.dq_reconciliations r
                where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market and r.natural_key = k))
     or exists (select 1 from public.dq_reconciliations r
                where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market and r.natural_key <> all (v_keys)) then
    raise exception 'member_incomplete' using errcode = 'P0001';
  end if;
  update public.dq_reconcile_cursor
  set state = 'done', done_at = clock_timestamp(), claim_until = null, compared_passed = v_p, compared_failed = v_f, not_compared = v_n
  where pair = c.pair and cycle_id = c.cycle_id and issuer_id = c.issuer_id and market = c.market;
  return jsonb_build_object('compared_passed', v_p, 'compared_failed', v_f, 'not_compared', v_n);
end $$;
revoke execute on function public.complete_reconcile_member(jsonb) from public, anon, authenticated;
grant execute on function public.complete_reconcile_member(jsonb) to service_role;

create or replace function public.fail_reconcile_member(p_fence jsonb, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.dq_reconcile_cursor;
begin
  c := public.reconcile_fence_lock(p_fence);
  update public.dq_reconcile_cursor
  set state = 'failed', claim_until = null, last_error = left(coalesce(p_error, 'unknown'), 2000)
  where pair = c.pair and cycle_id = c.cycle_id and issuer_id = c.issuer_id and market = c.market;
end $$;
revoke execute on function public.fail_reconcile_member(jsonb, text) from public, anon, authenticated;
grant execute on function public.fail_reconcile_member(jsonb, text) to service_role;

-- ---------------------------------------------------------------- 13. per-key atomic reconciliation write (spec §3.2 apply_reconcile_result, §5.6, T2, U2)
-- The only entry for reconciliation-derived writes; one expected key per call, one transaction:
-- fence check → (pair, cycle_id, natural_key) already accepted → that row is returned (reused,
-- nothing written) → else, by action:
--  quarantine_left (left_fact_id of the fence member required; any outcome / passed — 接口对齐记录 #5):
--   opens the item only when outcome = 'compared' AND passed = false AND the left row is ok or already
--   quarantined (another reason) and its run published; only an ok row is quarantined by it: under the member's scope lock, open reconcile_mismatch
--   item (reused by natural key <pair>:<natural_key>:<fact_id>) with payload {key, fact_ids,
--   left_value, right_value, right_locator} and detail {pair, reconciliation_id, inputs_hash,
--   latest_result, issuer_id, market, hook pending}; the row → quarantined; state_rev + 1;
--   materialize = {issuer_id, market}.
--  any action with a left_fact_id whose row is already quarantined and a COMPARED result (passed or not): the
--   OPEN reconcile_mismatch items of this pair that reference it get detail.latest_result = {passed,
--   reconciliation_id, at, inputs_hash} — this is how a passing re-run makes an item restorable.
--  quarantine_left otherwise (passed, or not compared, left ok): the result row only.
--  review_item / lineage_item: an open reconcile_review / lineage_conflict item (reused by natural
--   key) from result.item; no visibility change.
--  record: the result row only.
-- The result row carries cycle_id / issuer_id / market / attempt from the fence and detail.item_id.
create or replace function public.apply_reconcile_result(p_fence jsonb, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.dq_reconcile_cursor; v_existing public.dq_reconciliations; f public.financial_facts; v_run text;
        v_rid uuid := gen_random_uuid(); v_item uuid; v_q int := 0; v_mat jsonb; v_action text; v_nk text; v_left uuid;
        v_dataset text; v_nk_item text; v_latest jsonb; v_now timestamptz := now(); v_reason text;
        v_lv numeric; v_rv numeric; v_ad numeric; v_rd numeric; v_tol numeric; v_keys text[];
begin
  c := public.reconcile_fence_lock(p_fence);
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or coalesce(jsonb_typeof(p_result -> 'natural_key'), '') <> 'string'
     or coalesce(p_result ->> 'kind', '') not in ('numeric','text','date')
     or coalesce(p_result ->> 'outcome', '') not in ('compared','left_missing','left_unlinked','left_ambiguous','right_missing','unsupported','right_ambiguous','incomplete_gold')
     or coalesce(jsonb_typeof(p_result -> 'passed'), '') <> 'boolean'
     or coalesce(p_result ->> 'action', '') not in ('record','quarantine_left','review_item','lineage_item')
     or coalesce(jsonb_typeof(p_result -> 'left_source'), '') <> 'string' or coalesce(jsonb_typeof(p_result -> 'right_source'), '') <> 'string'
     or coalesce(jsonb_typeof(p_result -> 'detail'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'tolerance'), '') <> 'string' then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  v_action := p_result ->> 'action'; v_nk := p_result ->> 'natural_key';
  if length(v_nk) not between 1 and 400 then raise exception 'invalid_result' using errcode = '22023'; end if;
  -- a pass is only meaningful for a compared pair of values
  if (p_result -> 'passed') = 'true'::jsonb and p_result ->> 'outcome' <> 'compared' then raise exception 'invalid_result' using errcode = '22023'; end if;
  -- the key must belong to the member's frozen expected set
  v_keys := public.reconcile_frozen_keys(c.pair, c.cycle_id, c.issuer_id, c.market);
  if v_keys is null or not (v_nk = any (v_keys)) then raise exception 'invalid_result' using errcode = '22023'; end if;
  begin
    v_lv := (p_result ->> 'left_value')::numeric; v_rv := (p_result ->> 'right_value')::numeric;
    v_ad := (p_result ->> 'abs_diff')::numeric; v_rd := (p_result ->> 'rel_diff')::numeric;
    v_tol := (p_result ->> 'tolerance')::numeric; v_left := (p_result ->> 'left_fact_id')::uuid;
  exception when others then
    raise exception 'invalid_result' using errcode = '22023';
  end;
  if (v_action = 'quarantine_left' and v_left is null)
     or (v_action in ('review_item','lineage_item')
         and (coalesce(jsonb_typeof(p_result -> 'item'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'item' -> 'natural_key'), '') <> 'string'
              or coalesce(jsonb_typeof(p_result -> 'item' -> 'payload'), '') <> 'object' or length(p_result -> 'item' ->> 'natural_key') not between 1 and 512)) then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
  if found then
    if v_existing.issuer_id is distinct from c.issuer_id or v_existing.market is distinct from c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    return jsonb_build_object('reused', true, 'reconciliation_id', v_existing.id, 'item_id', coalesce(v_existing.detail -> 'item_id', 'null'::jsonb), 'quarantined', 0, 'materialize', 'null'::jsonb);
  end if;
  v_dataset := case c.market when 'US' then 'facts.us' else 'facts.cn' end;
  v_latest := jsonb_build_object('passed', p_result -> 'passed', 'reconciliation_id', v_rid, 'at', to_jsonb(v_now), 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb));
  if v_left is not null then
    perform 1 from public.fact_sync_scope where issuer_id = c.issuer_id and market = c.market for update;
    select * into f from public.financial_facts where fact_id = v_left;
    if not found or f.issuer_id <> c.issuer_id or f.market <> c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    select r.status into v_run from public.fact_sync_runs r where r.run_id = f.run_id;
  end if;
  -- a failing compare on a published left row that is ok OR already quarantined (for another reason, with no
  -- open item of this pair yet) opens the reconcile_mismatch item, so fact_promote_rows blocks a later generic
  -- promotion; only an ok row changes visibility (status, state_rev, hook, materialize).
  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
     and p_result ->> 'outcome' = 'compared' and (p_result -> 'passed') = 'false'::jsonb then
    v_nk_item := c.pair || ':' || v_nk || ':' || v_left::text;
    if length(v_nk_item) > 512 then raise exception 'invalid_result' using errcode = '22023'; end if;
    select q.id into v_item from public.dq_quarantine q
    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = v_nk_item and q.reason_code = 'reconcile_mismatch' and q.status = 'open'
    for update;
    if v_item is null then
      v_item := gen_random_uuid();
      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
      values (v_item, v_dataset, 'financial_facts', v_nk_item, 'reconcile_mismatch',
              jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb), 'latest_result', v_latest,
                                 'issuer_id', c.issuer_id, 'market', c.market)
                || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end,
              jsonb_build_object('key', jsonb_build_object('issuer_id', f.issuer_id, 'market', f.market, 'concept', f.concept, 'period_start', f.period_start, 'period_end', f.period_end,
                                                           'consolidation', f.consolidation, 'unit', f.unit, 'available_date', f.available_date),
                                 'fact_ids', jsonb_build_array(v_left), 'left_value', coalesce(p_result -> 'left_value', 'null'::jsonb), 'right_value', coalesce(p_result -> 'right_value', 'null'::jsonb),
                                 'right_locator', coalesce(p_result -> 'detail' -> 'right' -> 'locator', 'null'::jsonb)),
              c.claimed_by, 'open');
    else
      update public.dq_quarantine
      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest)
        || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end
      where id = v_item;
    end if;
    if f.status = 'ok' then
      update public.financial_facts set status = 'quarantined' where fact_id = v_left and status = 'ok';
      v_q := 1;
      update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = c.issuer_id and market = c.market;
      v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
    end if;
  elsif v_left is not null and f.status = 'quarantined' and p_result ->> 'outcome' = 'compared' then
    with upd as (
      update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch' and q.status = 'open' and q.detail ->> 'pair' = c.pair
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? v_left::text
      returning q.id)
    select upd.id into v_item from upd order by upd.id limit 1;
  end if;
  if v_action in ('review_item','lineage_item') then
    v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
    -- two members creating the same item key serialise here, the second reuses the open item (no 23505 on the open-key index)
    perform pg_advisory_xact_lock(hashtext('dq_item:' || v_dataset || ':' || v_reason || ':' || (p_result -> 'item' ->> 'natural_key')));
    select q.id into v_item from public.dq_quarantine q
    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = p_result -> 'item' ->> 'natural_key' and q.reason_code = v_reason and q.status = 'open';
    if v_item is null then
      v_item := gen_random_uuid();
      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
      values (v_item, v_dataset, 'financial_facts', p_result -> 'item' ->> 'natural_key', v_reason,
              (case when jsonb_typeof(p_result -> 'item' -> 'detail') = 'object' then p_result -> 'item' -> 'detail' else '{}'::jsonb end)
                || jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'issuer_id', c.issuer_id, 'market', c.market),
              p_result -> 'item' -> 'payload', c.claimed_by, 'open');
    end if;
  end if;
  insert into public.dq_reconciliations (id, dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed, batch_id,
                                         pair, kind, outcome, detail, cycle_id, issuer_id, market, attempt)
  values (v_rid, 'reconcile.' || c.pair, p_result ->> 'left_source', p_result ->> 'right_source', v_nk, v_lv, v_rv, v_ad, v_rd, v_tol, (p_result ->> 'passed')::boolean, c.claimed_by,
          c.pair, p_result ->> 'kind', p_result ->> 'outcome',
          (p_result -> 'detail') || jsonb_build_object('item_id', v_item, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb)),
          c.cycle_id, c.issuer_id, c.market, c.attempts);
  return jsonb_build_object('reused', false, 'reconciliation_id', v_rid, 'item_id', v_item, 'quarantined', v_q, 'materialize', coalesce(v_mat, 'null'::jsonb));
end $$;
revoke execute on function public.apply_reconcile_result(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_reconcile_result(jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- 14. atomic cycle creation (spec §3.1, §5.5; plan audit Q2)
-- The only writer of new dq_reconcile_cycles rows. Under the pair's cycle lock — the advisory lock
-- set_merge takes right before it registers a pending member (section 8a) — in one transaction:
--  a running cycle of the pair → returned unchanged (created false, nothing consumed);
--  else p_members [{issuer_id, market, expected_keys[]}] (distinct (issuer, market), keys resolved by the
--  runner) and p_pending [{issuer_id, market, source}] (the runner's snapshot; each entry's (issuer,
--  market) must be a member, i.e. its keys were resolved AFTER the merge was visible) are checked; the
--  cycle row (expected_total = Σ keys) and one pending cursor per member are inserted; exactly the
--  p_pending entries leave every cycle row's detail.pending_members (an entry registered after the
--  snapshot stays and joins the next cycle); the new row's detail records pending_merged_from /
--  pending_transferred. A writer that bypassed the lock hits the running partial unique index:
--  unique_violation → the winner is returned (created false). Lock order: advisory lock, then cursor
--  inserts (KEY SHARE on issuers via the FK), then cycle rows; set_merge takes the same advisory lock
--  FIRST, before its scope/issuer locks (plan audit R1) — so neither side holds a row the other needs
--  while waiting for the advisory lock; set_dissolved takes no advisory lock (one-way wait) — no cycle.
create or replace function public.open_reconcile_cycle(p_pair text, p_cycle_id text, p_started_at timestamptz, p_members jsonb, p_pending jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.dq_reconcile_cycles; r record; v_members jsonb; v_keep jsonb; v_take jsonb; v_from text[] := '{}'; v_moved jsonb := '[]'::jsonb;
begin
  if p_pair is null or p_cycle_id is null or p_started_at is null then raise exception 'invalid_members' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:' || p_pair));
  select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
  if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_typeof(p_pending) is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_members) m
                where jsonb_typeof(m) <> 'object' or coalesce(m ->> 'issuer_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   or coalesce(m ->> 'market', '') not in ('US', 'CN')
                   or jsonb_typeof(m -> 'expected_keys') is distinct from 'array')
     or exists (select 1 from jsonb_array_elements(p_pending) p where jsonb_typeof(p) <> 'object' or (p ->> 'source') is null)
  then raise exception 'invalid_members' using errcode = '22023'; end if;
  -- freeze issuer_id as canonical (lower-case) uuid text
  select coalesce(jsonb_agg(jsonb_set(m, '{issuer_id}', to_jsonb(((m ->> 'issuer_id')::uuid)::text)) order by o), '[]'::jsonb)
    into v_members from jsonb_array_elements(p_members) with ordinality as t(m, o);
  if exists (select 1 from jsonb_array_elements(v_members) m
             where exists (select 1 from jsonb_array_elements(m -> 'expected_keys') k
                           where (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' when 'string' then k #>> '{}' end) is null))
     or (select count(*) from jsonb_array_elements(v_members))
        <> (select count(distinct (m ->> 'issuer_id', m ->> 'market')) from jsonb_array_elements(v_members) m)
     -- natural keys are unique across the whole cycle: results are accepted per (pair, cycle, natural_key)
     or (select count(*) from jsonb_array_elements(v_members) m, jsonb_array_elements(m -> 'expected_keys') k)
        <> (select count(distinct (case jsonb_typeof(k) when 'object' then k ->> 'naturalKey' else k #>> '{}' end))
            from jsonb_array_elements(v_members) m, jsonb_array_elements(m -> 'expected_keys') k)
     or exists (select 1 from jsonb_array_elements(p_pending) p
                where not exists (select 1 from jsonb_array_elements(v_members) m
                                  where m ->> 'issuer_id' = lower(p ->> 'issuer_id') and m ->> 'market' = p ->> 'market'))
  then raise exception 'invalid_members' using errcode = '22023'; end if;
  begin
    insert into public.dq_reconcile_cycles (pair, cycle_id, started_at, finished_at, members, status, expected_total, detail)
    values (p_pair, p_cycle_id, p_started_at, null, v_members, 'running',
            (select coalesce(sum(jsonb_array_length(m -> 'expected_keys')), 0) from jsonb_array_elements(v_members) m), '{}'::jsonb);
  exception when unique_violation then
    select * into v_row from public.dq_reconcile_cycles where pair = p_pair and status = 'running';
    if found then return jsonb_build_object('created', false, 'cycle', to_jsonb(v_row), 'transferred', '[]'::jsonb); end if;
    raise;
  end;
  insert into public.dq_reconcile_cursor (pair, cycle_id, issuer_id, market, expected)
  select p_pair, p_cycle_id, (m ->> 'issuer_id')::uuid, m ->> 'market', jsonb_array_length(m -> 'expected_keys')
  from jsonb_array_elements(v_members) m;
  for r in select c.cycle_id, c.detail from public.dq_reconcile_cycles c
           where c.pair = p_pair and c.cycle_id <> p_cycle_id and jsonb_typeof(c.detail -> 'pending_members') = 'array'
           order by c.cycle_id for update loop
    select coalesce(jsonb_agg(e) filter (where not (p_pending @> jsonb_build_array(e))), '[]'::jsonb),
           coalesce(jsonb_agg(e) filter (where p_pending @> jsonb_build_array(e)), '[]'::jsonb)
      into v_keep, v_take
    from jsonb_array_elements(r.detail -> 'pending_members') e;
    if jsonb_array_length(v_take) > 0 then
      update public.dq_reconcile_cycles
      set detail = jsonb_set(r.detail, '{pending_members}', v_keep) || jsonb_build_object('pending_consumed_by', p_cycle_id)
      where pair = p_pair and cycle_id = r.cycle_id;
      v_from := v_from || r.cycle_id::text; v_moved := v_moved || v_take;
    end if;
  end loop;
  update public.dq_reconcile_cycles
  set detail = jsonb_build_object('pending_merged_from', to_jsonb(v_from), 'pending_transferred', v_moved)
  where pair = p_pair and cycle_id = p_cycle_id
  returning * into v_row;
  return jsonb_build_object('created', true, 'cycle', to_jsonb(v_row), 'transferred', v_moved);
end $$;
revoke execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.open_reconcile_cycle(text, text, timestamptz, jsonb, jsonb) to service_role;
