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
-- Lock order everywhere: reconcile cursor row (fenced calls) → fact_sync_scope rows ordered by
-- (issuer_id, market) → issuers rows → dq_quarantine rows → fact rows.
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
