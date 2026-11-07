-- supabase/migrations/20261111091000_industry_research_functions.sql
-- I-0 (industry research spec 6th draft §4.3 function table, §4.5, §5.4, §6.1, §6.4, V2/V7/V8):
-- every write path of the industry tables, the lifecycle/immutability/freeze triggers, and the
-- EXECUTE privileges. The three read-only licence helpers live in 20261111090000 (policies call them).
-- All functions: security definer, `set search_path = pg_catalog, public`, every relation
-- `public.`-qualified, owner = the migration role = the table owner (V1; no alter … owner). After
-- each function: revoke EXECUTE from public, anon, authenticated (and service_role for internal
-- helpers), then grant only the listed roles. anon/authenticated may execute exactly four
-- functions: industry_dataset_is_public, industry_metric_run_visible, industry_valuation_run_visible,
-- industry_freshness.
-- Common rule (V2): every stage_*/publish_*/activate_*/fail_*/set_*_coverage function locks the same
-- parent run row (`select … for update`) before it checks the status and keeps the lock until it has
-- written. Legal run transitions: aggregate building→active|failed; valuation building→published|failed,
-- published→active|failed; active→superseded (written by activate_*). Run metadata never changes
-- after insert (industry_runs_immutable). Rows of a run that left `building` are frozen
-- (industry_*_frozen): the only update is activate_* stamping updated_at = run.activated_at, the only
-- delete is prune_industry_runs on a superseded/failed run (V8).
-- Errors carry the code as the message: membership_conflict, membership_overlap (23P01),
-- same_day_change, incomplete_run, obsolete_run, dependencies_incomplete, dependency_regression,
-- pairs_mismatch, illegal_transition, run_not_building, fetch_event_payload_changed (P0001);
-- run_not_found, issuer_not_found, fetch_event_not_found (P0002); invalid_* (22023). Triggers refuse
-- with 23514 and the prefix `append_only:`.
-- Advisory-lock keys (hashtext) are namespaced strings: 'industry-run:<kind>:<scheme>:<version>:<level>'
-- (create/activate), 'industry-obs:<kind>:<natural_key>' (apply_observations),
-- 'industry-src:<source>:<ts_code>:<l3_code>:<in_date>' (upsert_industry_source_memberships).

-- ================================================================ triggers
-- issuer_industry_memberships lifecycle (§4.3): insert as ok; update may only (a) close an open
-- window (valid_to null→date > valid_from, valid_to_available_date >= valid_from, together),
-- (b) move status ok→quarantined, quarantined→ok, ok→superseded (superseded_by written in the same
-- update), (c) add provenance keys; delete is refused.
create or replace function public.issuer_industry_memberships_lifecycle() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'ok' or new.superseded_by is not null then
      raise exception 'append_only: issuer_industry_memberships rows are inserted as ok' using errcode = '23514';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    raise exception 'append_only: issuer_industry_memberships rows are never deleted' using errcode = '23514';
  end if;
  if (new.membership_id, new.issuer_id, new.scheme, new.version, new.code, new.level, new.valid_from, new.available_date,
      new.source, new.source_membership_id, new.batch_id)
     is distinct from
     (old.membership_id, old.issuer_id, old.scheme, old.version, old.code, old.level, old.valid_from, old.available_date,
      old.source, old.source_membership_id, old.batch_id) then
    raise exception 'append_only: issuer_industry_memberships identity columns are immutable' using errcode = '23514';
  end if;
  if (new.valid_to, new.valid_to_available_date) is distinct from (old.valid_to, old.valid_to_available_date) then
    if old.valid_to is not null or new.valid_to is null or new.valid_to <= new.valid_from
       or new.valid_to_available_date is null or new.valid_to_available_date < new.valid_from then
      raise exception 'append_only: issuer_industry_memberships valid_to may only go from null to a date after valid_from' using errcode = '23514';
    end if;
  end if;
  if new.status is distinct from old.status then
    if not ((old.status, new.status) in (('ok','quarantined'), ('quarantined','ok'), ('ok','superseded'))) then
      raise exception 'append_only: issuer_industry_memberships status % -> % is not allowed', old.status, new.status using errcode = '23514';
    end if;
  end if;
  if new.superseded_by is distinct from old.superseded_by
     and not (old.status = 'ok' and new.status = 'superseded' and old.superseded_by is null and new.superseded_by is not null) then
    raise exception 'append_only: issuer_industry_memberships superseded_by is written only with ok -> superseded' using errcode = '23514';
  end if;
  if not (new.provenance @> old.provenance) then
    raise exception 'append_only: issuer_industry_memberships provenance may only gain keys' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists issuer_industry_memberships_lifecycle on public.issuer_industry_memberships;
create trigger issuer_industry_memberships_lifecycle before insert or update or delete on public.issuer_industry_memberships
  for each row execute function public.issuer_industry_memberships_lifecycle();

-- industry_source_memberships are immutable import evidence: only status current→superseded (with
-- superseded_by), the resolution columns (issuer_id null→value or unchanged, resolution,
-- resolution_error) may change; delete is refused.
create or replace function public.industry_source_memberships_immutable() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: industry_source_memberships rows are never deleted' using errcode = '23514';
  end if;
  if (new.id, new.scheme, new.version, new.source, new.ts_code, new.name, new.l1_code, new.l2_code, new.l3_code, new.in_date,
      new.out_date, new.observed_at, new.batch_id, new.raw_hash, new.locator, new.created_at)
     is distinct from
     (old.id, old.scheme, old.version, old.source, old.ts_code, old.name, old.l1_code, old.l2_code, old.l3_code, old.in_date,
      old.out_date, old.observed_at, old.batch_id, old.raw_hash, old.locator, old.created_at) then
    raise exception 'append_only: industry_source_memberships evidence columns are immutable' using errcode = '23514';
  end if;
  if (new.status, new.superseded_by) is distinct from (old.status, old.superseded_by)
     and not (old.status = 'current' and new.status = 'superseded' and old.superseded_by is null) then
    raise exception 'append_only: industry_source_memberships status may only go current -> superseded' using errcode = '23514';
  end if;
  if old.issuer_id is not null and new.issuer_id is distinct from old.issuer_id then
    raise exception 'append_only: industry_source_memberships issuer_id is set once' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists industry_source_memberships_immutable on public.industry_source_memberships;
create trigger industry_source_memberships_immutable before update or delete on public.industry_source_memberships
  for each row execute function public.industry_source_memberships_immutable();

-- Run headers (V2): metadata is frozen from insert on; status moves only along the legal transitions;
-- coverage_summary changes only while building or in the building→failed update; reconciliation only
-- in building→published, building→failed or published→failed; activated_at/published_at only in the
-- update that enters active/published; reused_from_run/carried_from_run only to null (FK set null
-- when prune deletes the referenced run). Delete only for superseded/failed runs (prune, V8).
create or replace function public.industry_runs_immutable() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare v_old jsonb; v_new jsonb; v_meta text[]; v_ref text; v_extra text; v_legal boolean;
begin
  if tg_op = 'DELETE' then
    if old.status not in ('superseded','failed') then
      raise exception 'append_only: % run % is % and cannot be deleted', tg_table_name, old.run_id, old.status using errcode = '23514';
    end if;
    return old;
  end if;
  v_old := to_jsonb(old); v_new := to_jsonb(new);
  if tg_table_name = 'industry_metric_runs' then
    v_meta := array['run_id','scheme','version','level','generation','facts_as_of','knowledge_date','history_class','method_version',
                    'config_hash','formula_version','code_version','expected_grid','fingerprint_at','batch_id','created_at'];
    v_ref := 'reused_from_run'; v_extra := 'coverage_summary';
  else
    v_meta := array['run_id','scheme','version','level','generation','method_version','config_hash','formula_version','code_version',
                    'expected_dates','comparator_basis','recompute_from','fingerprint_at','batch_id','created_at'];
    v_ref := 'carried_from_run'; v_extra := 'reconciliation';
  end if;
  if exists (select 1 from unnest(v_meta) k where v_new -> k is distinct from v_old -> k) then
    raise exception 'append_only: % metadata is immutable', tg_table_name using errcode = '23514';
  end if;
  if v_new -> v_ref is distinct from v_old -> v_ref and v_new ->> v_ref is not null then
    raise exception 'append_only: % % may only be cleared', tg_table_name, v_ref using errcode = '23514';
  end if;
  if v_new ->> 'status' is distinct from v_old ->> 'status' then
    if tg_table_name = 'industry_metric_runs' then
      v_legal := (v_old ->> 'status', v_new ->> 'status') in (('building','active'), ('building','failed'), ('active','superseded'));
    else
      v_legal := (v_old ->> 'status', v_new ->> 'status') in (('building','published'), ('building','failed'), ('published','active'), ('published','failed'), ('active','superseded'));
    end if;
    if not v_legal then
      raise exception 'append_only: illegal_transition % -> % on %', v_old ->> 'status', v_new ->> 'status', tg_table_name using errcode = '23514';
    end if;
  end if;
  if v_new -> 'activated_at' is distinct from v_old -> 'activated_at' and not (v_new ->> 'status' = 'active' and v_old ->> 'status' <> 'active') then
    raise exception 'append_only: % activated_at is written only on activation', tg_table_name using errcode = '23514';
  end if;
  if tg_table_name = 'industry_valuation_runs' and v_new -> 'published_at' is distinct from v_old -> 'published_at'
     and not (v_new ->> 'status' = 'published' and v_old ->> 'status' = 'building') then
    raise exception 'append_only: industry_valuation_runs published_at is written only on publication' using errcode = '23514';
  end if;
  if v_new -> v_extra is distinct from v_old -> v_extra
     and not (v_old ->> 'status' = 'building' or (v_new ->> 'status' = 'failed' and v_old ->> 'status' <> 'failed')) then
    raise exception 'append_only: % % is frozen once the run left building', tg_table_name, v_extra using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists industry_runs_immutable on public.industry_metric_runs;
create trigger industry_runs_immutable before update or delete on public.industry_metric_runs
  for each row execute function public.industry_runs_immutable();
drop trigger if exists industry_runs_immutable on public.industry_valuation_runs;
create trigger industry_runs_immutable before update or delete on public.industry_valuation_runs
  for each row execute function public.industry_runs_immutable();

-- Row freeze (U5, U6, V8) for industry_metrics, industry_valuations, industry_valuation_pairs. While the
-- run is building anything goes (staging upserts). Afterwards: update only when the run is active, the
-- only changed column is updated_at, it was null and becomes run.activated_at (activate_* stamping);
-- delete only when the run is superseded or failed, or already gone (cascade from prune).
-- Generated columns (value_text, mcap_coverage_text) are excluded: they are not computed for NEW in a
-- BEFORE trigger.
create or replace function public.industry_rows_frozen() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare v_status text; v_activated timestamptz; v_found boolean := false;
begin
  if tg_table_name = 'industry_metrics' then
    select r.status, r.activated_at, true into v_status, v_activated, v_found from public.industry_metric_runs r where r.run_id = old.run_id;
  else
    select r.status, r.activated_at, true into v_status, v_activated, v_found from public.industry_valuation_runs r where r.run_id = old.run_id;
  end if;
  if tg_op = 'DELETE' then
    if v_found is not true or v_status in ('superseded','failed') then return old; end if;
    raise exception 'append_only: % rows of a % run cannot be deleted', tg_table_name, v_status using errcode = '23514';
  end if;
  if v_status = 'building' then return new; end if;
  if v_status = 'active' and tg_table_name <> 'industry_valuation_pairs'
     and (to_jsonb(new) - 'updated_at' - 'value_text' - 'mcap_coverage_text') = (to_jsonb(old) - 'updated_at' - 'value_text' - 'mcap_coverage_text')
     and (to_jsonb(old) ->> 'updated_at') is null and (to_jsonb(new) ->> 'updated_at')::timestamptz = v_activated then
    return new;
  end if;
  raise exception 'append_only: % rows are frozen once the run is % (only activation stamps updated_at)', tg_table_name, coalesce(v_status, 'missing') using errcode = '23514';
end $$;
drop trigger if exists industry_metrics_frozen on public.industry_metrics;
create trigger industry_metrics_frozen before update or delete on public.industry_metrics
  for each row execute function public.industry_rows_frozen();
drop trigger if exists industry_valuations_frozen on public.industry_valuations;
create trigger industry_valuations_frozen before update or delete on public.industry_valuations
  for each row execute function public.industry_rows_frozen();
drop trigger if exists industry_valuation_pairs_frozen on public.industry_valuation_pairs;
create trigger industry_valuation_pairs_frozen before update or delete on public.industry_valuation_pairs
  for each row execute function public.industry_rows_frozen();

-- ================================================================ internal helpers (no client role may execute)
create or replace function public.industry_metric_run_lock(p_run uuid)
returns public.industry_metric_runs language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_metric_runs;
begin
  select * into r from public.industry_metric_runs where run_id = p_run for update;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  return r;
end $$;
revoke execute on function public.industry_metric_run_lock(uuid) from public, anon, authenticated, service_role;

create or replace function public.industry_valuation_run_lock(p_run uuid)
returns public.industry_valuation_runs language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_valuation_runs;
begin
  select * into r from public.industry_valuation_runs where run_id = p_run for update;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  return r;
end $$;
revoke execute on function public.industry_valuation_run_lock(uuid) from public, anon, authenticated, service_role;

-- A manifest is unreferenced when no metric/valuation row (any run) and no F4 judgment (when that
-- table exists; conservative text match on 'manifest:<hash>') points at it.
create or replace function public.industry_manifest_unreferenced(p_hash text)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_ref boolean := false;
begin
  if exists (select 1 from public.industry_metrics m where m.manifest_hash = p_hash)
     or exists (select 1 from public.industry_valuations v where v.manifest_hash = p_hash) then
    return false;
  end if;
  if to_regclass('public.judgments') is not null then
    execute 'select exists (select 1 from public.judgments j where strpos(to_jsonb(j)::text, $1) > 0)' into v_ref using 'manifest:' || p_hash;
  end if;
  return not v_ref;
end $$;
revoke execute on function public.industry_manifest_unreferenced(text) from public, anon, authenticated, service_role;

-- Candidate members of one cell (Codex review P1, dependency set equality): distinct issuers with an ok membership of
-- (scheme, version, level, code) that is a member on p_on as known by p_known_by (spec K3: available_date <= knownBy,
-- valid_from <= on, effective valid_to null or > on, where the window end counts only when its availability date is
-- known: valid_to_available_date <= knownBy). Identical to memberships.ts::isMemberAt. Aggregate cells: on = period_end,
-- knownBy = run.facts_as_of; valuation cells: on = knownBy = trade_date. activate_* requires the per-cell dependency
-- rows to equal exactly this set.
create or replace function public.industry_candidate_members(p_scheme text, p_version text, p_level int, p_code text, p_on date, p_known_by date)
returns setof uuid language sql stable security definer set search_path = pg_catalog, public as $$
  select distinct m.issuer_id from public.issuer_industry_memberships m
  where m.scheme = p_scheme and m.version = p_version and m.level = p_level and m.code = p_code and m.status = 'ok'
    and m.available_date <= p_known_by and m.valid_from <= p_on
    and (m.valid_to is null or m.valid_to_available_date > p_known_by or m.valid_to > p_on)
$$;
revoke execute on function public.industry_candidate_members(text, text, int, text, date, date) from public, anon, authenticated, service_role;

-- ================================================================ licences and freshness
-- The licence switch and its audit row (research_audit_log, action 'industry.license_set') are ONE transaction: a failing
-- audit insert (p_by must be an auth.users id) rolls the switch back, so no publication decision exists without its audit.
create or replace function public.set_industry_dataset_license(p_key text, p_status text, p_by text, p_note text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_from text;
begin
  if p_status is null or p_status not in ('internal','public') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_by is null or length(btrim(p_by)) = 0 then raise exception 'invalid_decided_by' using errcode = '22023'; end if;
  select status into v_from from public.industry_dataset_licenses where dataset_key = p_key for update;
  if not found then raise exception 'invalid_dataset_key' using errcode = '22023'; end if;
  update public.industry_dataset_licenses set status = p_status, decided_by = p_by, decided_at = now(), note = p_note where dataset_key = p_key;
  insert into public.research_audit_log (user_id, actor, action, object_type, object_id, detail)
  values (p_by::uuid, p_by, 'industry.license_set', 'industry', null,
          jsonb_build_object('object_ref', p_key, 'from', v_from, 'to', p_status, 'note', p_note));
end $$;
revoke execute on function public.set_industry_dataset_license(text, text, text, text) from public, anon, authenticated;
grant execute on function public.set_industry_dataset_license(text, text, text, text) to service_role;

-- Only {dataset, status, last_ok_at} of dq_freshness rows named industry.* (stored status).
create or replace function public.industry_freshness()
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('dataset', f.dataset, 'status', f.status, 'last_ok_at', f.last_ok_at) order by f.dataset), '[]'::jsonb)
  from public.dq_freshness f where f.dataset like 'industry.%'
$$;
revoke execute on function public.industry_freshness() from public, anon, authenticated, service_role;
grant execute on function public.industry_freshness() to anon, authenticated, service_role;

-- {taken_at, revs:[{issuer_id, state_rev}]} of fact_sync_scope for the market (orchestration metadata, U4).
create or replace function public.industry_state_fingerprint(p_market text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('taken_at', clock_timestamp(),
    'revs', coalesce((select jsonb_agg(jsonb_build_object('issuer_id', s.issuer_id, 'state_rev', s.state_rev) order by s.issuer_id)
                      from public.fact_sync_scope s where s.market = p_market), '[]'::jsonb))
$$;
revoke execute on function public.industry_state_fingerprint(text) from public, anon, authenticated;
grant execute on function public.industry_state_fingerprint(text) to service_role;

-- ================================================================ source records (§4.4)
-- Rows: SourceMembershipInput[] (scheme sw2021, version 2021). Key (source, ts_code, l3_code, in_date):
-- no current record → insert; same content (name, l1_code, l2_code, out_date) → duplicate; any
-- difference → the old record becomes superseded (superseded_by = the new id, deferred FK) and the new
-- record is inserted current and unresolved. Returns {inserted, superseded, duplicates, changed:[{old_id,
-- new_id, null_to_date}]}; the caller quarantines source_membership_changed for null_to_date=false.
create or replace function public.upsert_industry_source_memberships(p_batch uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare x jsonb; cur public.industry_source_memberships; v_new uuid; v_ins int := 0; v_sup int := 0; v_dup int := 0; v_changed jsonb := '[]'::jsonb;
  v_out date; v_l1 text; v_l2 text; v_name text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  for x in select e from jsonb_array_elements(p_rows) e
           order by e ->> 'source', e ->> 'ts_code', e ->> 'l3_code', e ->> 'in_date' loop
    perform pg_advisory_xact_lock(hashtext('industry-src:' || (x ->> 'source') || ':' || (x ->> 'ts_code') || ':' || (x ->> 'l3_code') || ':' || (x ->> 'in_date')));
    v_out := (x ->> 'out_date')::date; v_l1 := x ->> 'l1_code'; v_l2 := x ->> 'l2_code'; v_name := x ->> 'name';
    select * into cur from public.industry_source_memberships s
    where s.scheme = 'sw2021' and s.version = '2021' and s.source = x ->> 'source' and s.ts_code = x ->> 'ts_code'
      and s.l3_code = x ->> 'l3_code' and s.in_date = (x ->> 'in_date')::date and s.status = 'current'
    for update;
    if found and (cur.name, cur.l1_code, cur.l2_code, cur.out_date) is not distinct from (v_name, v_l1, v_l2, v_out) then
      v_dup := v_dup + 1;
      continue;
    end if;
    v_new := gen_random_uuid();
    if found then
      update public.industry_source_memberships set status = 'superseded', superseded_by = v_new where id = cur.id;
      v_sup := v_sup + 1;
      v_changed := v_changed || jsonb_build_array(jsonb_build_object('old_id', cur.id, 'new_id', v_new,
        'null_to_date', cur.out_date is null and v_out is not null and (cur.name, cur.l1_code, cur.l2_code) is not distinct from (v_name, v_l1, v_l2)));
    else
      v_ins := v_ins + 1;
    end if;
    insert into public.industry_source_memberships (id, scheme, version, source, ts_code, name, l1_code, l2_code, l3_code, in_date, out_date,
      observed_at, batch_id, raw_hash, locator, status)
    values (v_new, 'sw2021', '2021', x ->> 'source', x ->> 'ts_code', v_name, v_l1, v_l2, x ->> 'l3_code', (x ->> 'in_date')::date, v_out,
      (x ->> 'observed_at')::timestamptz, p_batch, x ->> 'raw_hash', coalesce(x -> 'locator', '{}'::jsonb), 'current');
  end loop;
  return jsonb_build_object('inserted', v_ins, 'superseded', v_sup, 'duplicates', v_dup, 'changed', v_changed);
end $$;
revoke execute on function public.upsert_industry_source_memberships(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_industry_source_memberships(uuid, jsonb) to service_role;

-- Records the latest resolution/apply failure on current, unresolved records; returns the count.
create or replace function public.record_industry_source_resolution_error(p_ids uuid[], p_error jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare n int;
begin
  if p_error is null or jsonb_typeof(p_error) <> 'object' or coalesce(p_error ->> 'code', '') = '' then raise exception 'invalid_error' using errcode = '22023'; end if;
  update public.industry_source_memberships set resolution_error = p_error
  where id = any(coalesce(p_ids, '{}'::uuid[])) and status = 'current' and issuer_id is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.record_industry_source_resolution_error(uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.record_industry_source_resolution_error(uuid[], jsonb) to service_role;

-- ================================================================ memberships (§4.5, §4.4 SIC)
-- One transaction, fixed statement order (U1): lock the issuer row; check the source records
-- (current, scheme p_scheme, unresolved or already resolved to p_issuer, else membership_conflict);
-- 1 preallocate a membership_id per target; 2 supersede: every ok row of p_issuer that came from a
-- record superseded (transitively) by one of p_source_ids is set superseded with superseded_by = the
-- preallocated id of the target of the SAME SOURCE LINEAGE (target provenance.source_membership_id = the
-- current descendant of the old row's record along superseded_by) at the same level, in ONE update (Codex
-- plan audit round 1 #5: several records of one issuer corrected in one call keep their own chains); 3 close: a target whose key
-- (issuer, scheme, version, code, valid_from) matches an open ok row and carries a valid_to closes it;
-- 4 insert the remaining targets: same key + same values → duplicate, same key + other values →
-- membership_conflict, exclusion violation → membership_overlap; a successor id that was neither
-- inserted nor matched → membership_conflict; 5 resolve the source records (issuer_id, resolution ∪
-- {membership_ids}, resolution_error = null). The source records are locked (id order) before they are validated.
-- Any raise rolls everything back. (The source records' own version is not compared with p_version: source records
-- carry the fixed import version '2021' while memberships may carry a private test version.)
-- Rows: MembershipTarget[] {code, level, valid_from, valid_to, available_date, valid_to_available_date,
-- source, provenance}. Returns {inserted, closed, superseded, duplicates, membership_ids}.
create or replace function public.apply_industry_memberships(p_batch uuid, p_issuer uuid, p_scheme text, p_version text, p_rows jsonb, p_source_ids uuid[], p_resolution jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_sources uuid[] := coalesce(p_source_ids, '{}'::uuid[]); v_old_sources uuid[]; v_targets jsonb; t jsonb; ex public.issuer_industry_memberships;
  v_id uuid; v_code text; v_level int; v_from date; v_to date; v_avail date; v_to_avail date; v_source text; v_prov jsonb;
  v_ins int := 0; v_closed int := 0; v_sup int := 0; v_dup int := 0; v_ids uuid[] := '{}'::uuid[]; v_used uuid[] := '{}'::uuid[]; v_succ uuid[];
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_resolution is not null and jsonb_typeof(p_resolution) <> 'object' then raise exception 'invalid_resolution' using errcode = '22023'; end if;
  perform 1 from public.issuers where issuer_id = p_issuer for update;
  if not found then raise exception 'issuer_not_found' using errcode = 'P0002'; end if;
  -- lock the source records (fixed id order) BEFORE validating them and keep the locks through the resolution
  -- bookkeeping: a concurrent refresh (upsert_industry_source_memberships) that supersedes a record either committed
  -- first (the validation below then sees it) or waits for this transaction (Codex review P2)
  perform 1 from public.industry_source_memberships where id = any(v_sources) order by id for update;
  if exists (select 1 from unnest(v_sources) s(id)
             left join public.industry_source_memberships m on m.id = s.id
             where m.id is null or m.status <> 'current' or m.scheme <> p_scheme or (m.issuer_id is not null and m.issuer_id <> p_issuer)) then
    raise exception 'membership_conflict: source records must be current, of scheme %, and unresolved or resolved to this issuer', p_scheme using errcode = 'P0001';
  end if;
  -- 1 preallocate one membership_id per target (input order kept in "ord")
  select coalesce(jsonb_agg(x || jsonb_build_object('membership_id', gen_random_uuid(), 'ord', o) order by o), '[]'::jsonb) into v_targets
  from jsonb_array_elements(p_rows) with ordinality as e(x, o);
  -- 2 supersede: one statement writes status and successor together (deferred FK checks the successor at commit)
  with recursive back(id) as (
    select m.id from public.industry_source_memberships m where m.superseded_by = any(v_sources)
    union
    select m.id from public.industry_source_memberships m join back b on m.superseded_by = b.id
  ) select coalesce(array_agg(id), '{}'::uuid[]) into v_old_sources from back;
  with recursive fwd(origin, cur) as (
    select m.id, m.superseded_by from public.industry_source_memberships m where m.id = any(v_old_sources)
    union
    select f.origin, m.superseded_by from fwd f join public.industry_source_memberships m on m.id = f.cur
    where not (f.cur = any(v_sources))
  ), heir as (
    select origin, cur as new_source from fwd where cur = any(v_sources)
  ), succ as (
    select o.membership_id as old_id,
           (select (t2 ->> 'membership_id')::uuid from jsonb_array_elements(v_targets) t2
            where (t2 ->> 'level')::int = o.level
              and (t2 -> 'provenance' ->> 'source_membership_id') = h.new_source::text
            order by (t2 ->> 'ord')::int limit 1) as new_id
    from public.issuer_industry_memberships o
    join heir h on h.origin = o.source_membership_id
    where o.issuer_id = p_issuer and o.scheme = p_scheme and o.version = p_version and o.status = 'ok'
  )
  update public.issuer_industry_memberships m set status = 'superseded', superseded_by = s.new_id
  from succ s where m.membership_id = s.old_id and s.new_id is not null;
  get diagnostics v_sup = row_count;
  select coalesce(array_agg(distinct m.superseded_by), '{}'::uuid[]) into v_succ
  from public.issuer_industry_memberships m
  where m.issuer_id = p_issuer and m.scheme = p_scheme and m.version = p_version and m.status = 'superseded'
    and m.superseded_by in (select (t2 ->> 'membership_id')::uuid from jsonb_array_elements(v_targets) t2);
  -- 3 close / 4 insert
  for t in select e from jsonb_array_elements(v_targets) e order by (e ->> 'ord')::int loop
    v_id := (t ->> 'membership_id')::uuid; v_code := t ->> 'code'; v_level := (t ->> 'level')::int; v_from := (t ->> 'valid_from')::date;
    v_to := (t ->> 'valid_to')::date; v_avail := (t ->> 'available_date')::date; v_to_avail := (t ->> 'valid_to_available_date')::date;
    v_source := t ->> 'source'; v_prov := coalesce(t -> 'provenance', '{}'::jsonb);
    select * into ex from public.issuer_industry_memberships e
    where e.issuer_id = p_issuer and e.scheme = p_scheme and e.version = p_version and e.code = v_code and e.valid_from = v_from and e.status = 'ok';
    if found then
      if ex.valid_to is null and v_to is not null and ex.level = v_level then
        -- the closing evidence (provenance.delisting: delist_date, raw_hash, batch_id, observed_at) is merged in; provenance may only gain keys
        update public.issuer_industry_memberships set valid_to = v_to, valid_to_available_date = v_to_avail,
          provenance = case when v_prov ? 'delisting' and not (provenance ? 'delisting') then provenance || jsonb_build_object('delisting', v_prov -> 'delisting') else provenance end
        where membership_id = ex.membership_id;
        v_closed := v_closed + 1; v_ids := v_ids || ex.membership_id; v_used := v_used || v_id;
      elsif (ex.level, ex.valid_to, ex.available_date, ex.valid_to_available_date, ex.source)
            is not distinct from (v_level, v_to, v_avail, v_to_avail, v_source) then
        v_dup := v_dup + 1; v_ids := v_ids || ex.membership_id; v_used := v_used || v_id;
      else
        raise exception 'membership_conflict: % % % level % from % differs from the stored row', p_issuer, p_scheme, v_code, v_level, v_from using errcode = 'P0001';
      end if;
      continue;
    end if;
    begin
      insert into public.issuer_industry_memberships (membership_id, issuer_id, scheme, version, code, level, valid_from, valid_to,
        available_date, valid_to_available_date, source, provenance, source_membership_id, batch_id, status)
      values (v_id, p_issuer, p_scheme, p_version, v_code, v_level, v_from, v_to, v_avail, v_to_avail, v_source, v_prov,
        nullif(v_prov ->> 'source_membership_id', '')::uuid, p_batch, 'ok');
    exception when exclusion_violation then
      raise exception 'membership_overlap: % % level % from % overlaps an ok row', p_issuer, p_scheme, v_level, v_from using errcode = '23P01';
    end;
    v_ins := v_ins + 1; v_ids := v_ids || v_id;
  end loop;
  if exists (select 1 from unnest(v_succ) s(id) where s.id = any(v_used)) then
    raise exception 'membership_conflict: a superseded row would point at a replacement that was not inserted' using errcode = 'P0001';
  end if;
  -- 5 resolution bookkeeping
  update public.industry_source_memberships
  set issuer_id = p_issuer,
      resolution = coalesce(p_resolution, '{}'::jsonb) || jsonb_build_object('membership_ids', to_jsonb(v_ids)),
      resolution_error = null
  where id = any(v_sources);
  return jsonb_build_object('inserted', v_ins, 'closed', v_closed, 'superseded', v_sup, 'duplicates', v_dup, 'membership_ids', to_jsonb(v_ids));
end $$;
revoke execute on function public.apply_industry_memberships(uuid, uuid, text, text, jsonb, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.apply_industry_memberships(uuid, uuid, text, text, jsonb, uuid[], jsonb) to service_role;

-- Window correction of ONE current, resolved source record's ok rows (Codex plan audit round 2 R2-2: a delisting
-- learned after the window was closed must not leave an incorrect ok row eligible). Issuer row lock; the record must be
-- current and resolved to p_issuer (else membership_conflict); per target (one per level, provenance.source_membership_id
-- = p_source, same code and valid_from as the stored ok row of that level from this record): same window → duplicate;
-- otherwise the stored row becomes superseded (superseded_by = the new row) and a new ok row with the corrected
-- valid_to / valid_to_available_date is inserted — lineage kept (same source_membership_id, history kept). A corrected
-- window that is empty (valid_to <= valid_from: delisted on or before the window start; Codex round 3 R3-1) leaves no
-- valid interval: the stored row moves ok → quarantined in the same transaction (provenance gains
-- quarantine{reason:'membership_after_delist', valid_to, batch_id}), so aggregation no longer counts it. Returns
-- {inserted, closed:0, superseded, duplicates, quarantined, membership_ids}.
create or replace function public.correct_industry_membership_windows(p_batch uuid, p_issuer uuid, p_scheme text, p_version text, p_source uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare t jsonb; v_old public.issuer_industry_memberships; v_id uuid; v_to date; v_to_avail date;
  v_ins int := 0; v_sup int := 0; v_dup int := 0; v_q int := 0; v_ids uuid[] := '{}'::uuid[];
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  perform 1 from public.issuers where issuer_id = p_issuer for update;
  if not found then raise exception 'issuer_not_found' using errcode = 'P0002'; end if;
  perform 1 from public.industry_source_memberships where id = p_source for update;   -- lock before validating (Codex review P2)
  if not exists (select 1 from public.industry_source_memberships m
                 where m.id = p_source and m.status = 'current' and m.scheme = p_scheme and m.issuer_id = p_issuer) then
    raise exception 'membership_conflict: source record % is not current and resolved to issuer %', p_source, p_issuer using errcode = 'P0001';
  end if;
  for t in select e from jsonb_array_elements(p_rows) e loop
    if (t -> 'provenance' ->> 'source_membership_id') is distinct from p_source::text then
      raise exception 'membership_conflict: correction targets must carry source record %', p_source using errcode = 'P0001';
    end if;
    select * into v_old from public.issuer_industry_memberships
    where issuer_id = p_issuer and scheme = p_scheme and version = p_version and status = 'ok' and source_membership_id = p_source
      and level = (t ->> 'level')::int and code = t ->> 'code' and valid_from = (t ->> 'valid_from')::date
    for update;
    if not found then
      raise exception 'membership_conflict: no ok row of source % at level % from %', p_source, t ->> 'level', t ->> 'valid_from' using errcode = 'P0001';
    end if;
    v_to := (t ->> 'valid_to')::date; v_to_avail := (t ->> 'valid_to_available_date')::date;
    if v_to is not null and v_to <= v_old.valid_from then
      update public.issuer_industry_memberships set status = 'quarantined',
        provenance = provenance || jsonb_build_object('quarantine', jsonb_build_object('reason', 'membership_after_delist', 'valid_to', v_to, 'batch_id', p_batch))
          || case when (t -> 'provenance') ? 'delisting' and not (provenance ? 'delisting') then jsonb_build_object('delisting', t -> 'provenance' -> 'delisting') else '{}'::jsonb end
      where membership_id = v_old.membership_id;
      v_q := v_q + 1; v_ids := v_ids || v_old.membership_id; continue;
    end if;
    if (v_old.valid_to, v_old.valid_to_available_date) is not distinct from (v_to, v_to_avail) then
      v_dup := v_dup + 1; v_ids := v_ids || v_old.membership_id; continue;
    end if;
    v_id := gen_random_uuid();
    update public.issuer_industry_memberships set status = 'superseded', superseded_by = v_id where membership_id = v_old.membership_id;
    begin
      insert into public.issuer_industry_memberships (membership_id, issuer_id, scheme, version, code, level, valid_from, valid_to,
        available_date, valid_to_available_date, source, provenance, source_membership_id, batch_id, status)
      values (v_id, p_issuer, p_scheme, p_version, v_old.code, v_old.level, v_old.valid_from, v_to, v_old.available_date, v_to_avail,
        coalesce(t ->> 'source', v_old.source), coalesce(t -> 'provenance', v_old.provenance), p_source, p_batch, 'ok');
    exception when exclusion_violation then
      raise exception 'membership_overlap: % % level % from %', p_issuer, p_scheme, v_old.level, v_old.valid_from using errcode = '23P01';
    end;
    v_sup := v_sup + 1; v_ins := v_ins + 1; v_ids := v_ids || v_id;
  end loop;
  return jsonb_build_object('inserted', v_ins, 'closed', 0, 'superseded', v_sup, 'duplicates', v_dup, 'quarantined', v_q, 'membership_ids', to_jsonb(v_ids));
end $$;
revoke execute on function public.correct_industry_membership_windows(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.correct_industry_membership_windows(uuid, uuid, text, text, uuid, jsonb) to service_role;

-- Quarantines the ok rows of the PREDECESSORS of the given current source records (Codex batch 3 P1): when a replacement record
-- (a current record that supersedes an already-resolved one) is rejected (no issuer, membership_after_delist, …) the
-- predecessor's rows would otherwise stay ok and eligible. p_sources = the replacement records (current, unresolved: else
-- membership_conflict); the supersession chain is followed backwards (as apply_industry_memberships step 2); every ok row of the
-- scheme/version whose source_membership_id is on that chain moves ok -> quarantined in ONE statement (provenance gains
-- quarantine{reason, batch_id, replacement_source_ids}). Issuer rows of the affected memberships are locked in id order first.
-- Returns {quarantined, membership_ids}.
create or replace function public.quarantine_industry_membership_lineage(p_batch uuid, p_scheme text, p_version text, p_sources uuid[], p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_sources uuid[] := coalesce(p_sources, '{}'::uuid[]); v_old uuid[]; v_ids uuid[];
begin
  if p_reason is null or length(p_reason) = 0 then raise exception 'invalid_rows' using errcode = '22023'; end if;
  perform 1 from public.industry_source_memberships where id = any(v_sources) order by id for update;
  if exists (select 1 from unnest(v_sources) s(id) left join public.industry_source_memberships m on m.id = s.id
             where m.id is null or m.status <> 'current' or m.scheme <> p_scheme or m.issuer_id is not null) then
    raise exception 'membership_conflict: replacement records must be current, of scheme %, and unresolved', p_scheme using errcode = 'P0001';
  end if;
  with recursive back(id) as (
    select m.id from public.industry_source_memberships m where m.superseded_by = any(v_sources)
    union
    select m.id from public.industry_source_memberships m join back b on m.superseded_by = b.id
  ) select coalesce(array_agg(id), '{}'::uuid[]) into v_old from back;
  perform 1 from public.issuers where issuer_id in (
    select issuer_id from public.issuer_industry_memberships where source_membership_id = any(v_old) and scheme = p_scheme and version = p_version and status = 'ok')
  order by issuer_id for update;
  with q as (
    update public.issuer_industry_memberships set status = 'quarantined',
      provenance = provenance || jsonb_build_object('quarantine', jsonb_build_object('reason', p_reason, 'batch_id', p_batch, 'replacement_source_ids', to_jsonb(v_sources)))
    where source_membership_id = any(v_old) and scheme = p_scheme and version = p_version and status = 'ok'
    returning membership_id
  ) select coalesce(array_agg(membership_id order by membership_id), '{}'::uuid[]) into v_ids from q;
  return jsonb_build_object('quarantined', coalesce(array_length(v_ids, 1), 0), 'membership_ids', to_jsonb(v_ids));
end $$;
revoke execute on function public.quarantine_industry_membership_lineage(uuid, text, text, uuid[], text) from public, anon, authenticated;
grant execute on function public.quarantine_industry_membership_lineage(uuid, text, text, uuid[], text) to service_role;

-- SIC (§4.4): issuer row lock; the open ok sic row of the version: same code → duplicate; another code →
-- close it at p_observed (valid_to = valid_to_available_date = p_observed) and open the new code from
-- p_observed (same_day_change when the open row started on p_observed or later); none → insert.
-- level comes from the classification node. Returns {outcome:'inserted'|'duplicate'|'changed'|'none', membership_id}.
-- Lease fence (Codex plan audit round 2 R2-3): in the SAME transaction, the caller's SIC scope row must still be
-- leased to p_lease_batch and unexpired — it is locked FOR UPDATE through commit, so a worker whose lease expired
-- and was taken over cannot write membership data or provenance (raises lease_lost). p_sec_submissions (when not
-- null) is merged into issuers.provenance.sec_submissions under the same fence; p_code null = provenance only.
create or replace function public.apply_sic_memberships(p_batch uuid, p_issuer uuid, p_version text, p_observed date, p_code text, p_provenance jsonb,
  p_lease_batch uuid, p_sec_submissions jsonb default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare cur public.issuer_industry_memberships; v_level int; v_id uuid := gen_random_uuid(); v_outcome text := 'inserted';
  v_lease_batch uuid; v_lease_until timestamptz;
begin
  if p_observed is null then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_provenance is not null and jsonb_typeof(p_provenance) <> 'object' then raise exception 'invalid_provenance' using errcode = '22023'; end if;
  if p_sec_submissions is not null and jsonb_typeof(p_sec_submissions) <> 'object' then raise exception 'invalid_provenance' using errcode = '22023'; end if;
  perform 1 from public.issuers where issuer_id = p_issuer for update;
  if not found then raise exception 'issuer_not_found' using errcode = 'P0002'; end if;
  -- lease fence (Codex round 3 R3-2): lock the scope row first, then validate owner and expiry against the wall clock
  -- (clock_timestamp(), not the transaction-start now()), so a call that waited on a lock past the lease end is rejected
  select lease_batch_id, lease_until into v_lease_batch, v_lease_until from public.industry_sync_scope
  where issuer_id = p_issuer and job = 'sic' for update;
  if not found or v_lease_batch is distinct from p_lease_batch or v_lease_until is null or v_lease_until <= clock_timestamp() then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
  if p_sec_submissions is not null then
    update public.issuers set provenance = coalesce(provenance, '{}'::jsonb) || jsonb_build_object('sec_submissions', p_sec_submissions), updated_at = now()
    where issuer_id = p_issuer;
  end if;
  if p_code is null then return jsonb_build_object('outcome', 'none', 'membership_id', null); end if;
  select level into v_level from public.industry_classifications where scheme = 'sic' and version = p_version and code = p_code;
  if not found then raise exception 'unknown_sic_code: %', p_code using errcode = 'P0001'; end if;
  select * into cur from public.issuer_industry_memberships
  where issuer_id = p_issuer and scheme = 'sic' and version = p_version and status = 'ok' and valid_to is null
  order by valid_from desc limit 1;
  if found then
    if cur.code = p_code then
      return jsonb_build_object('outcome', 'duplicate', 'membership_id', cur.membership_id);
    end if;
    if cur.valid_from >= p_observed then
      raise exception 'same_day_change: issuer % sic % -> % on %', p_issuer, cur.code, p_code, p_observed using errcode = 'P0001';
    end if;
    update public.issuer_industry_memberships set valid_to = p_observed, valid_to_available_date = p_observed where membership_id = cur.membership_id;
    v_outcome := 'changed';
  end if;
  begin
    insert into public.issuer_industry_memberships (membership_id, issuer_id, scheme, version, code, level, valid_from, valid_to,
      available_date, valid_to_available_date, source, provenance, source_membership_id, batch_id, status)
    values (v_id, p_issuer, 'sic', p_version, p_code, v_level, p_observed, null, p_observed, null, 'sec:submissions',
      coalesce(p_provenance, '{}'::jsonb) || jsonb_build_object('availability', 'observed'), null, p_batch, 'ok');
  exception when exclusion_violation then
    raise exception 'membership_overlap: issuer % sic level % from %', p_issuer, v_level, p_observed using errcode = '23P01';
  end;
  return jsonb_build_object('outcome', v_outcome, 'membership_id', v_id);
end $$;
revoke execute on function public.apply_sic_memberships(uuid, uuid, text, date, text, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_sic_memberships(uuid, uuid, text, date, text, jsonb, uuid, jsonb) to service_role;

-- ================================================================ observations (§6.1, §6.2, U2/U3/V7)
create or replace function public.begin_industry_fetch_event(p_job text, p_params jsonb, p_batch uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid := gen_random_uuid();
begin
  if p_params is null or jsonb_typeof(p_params) <> 'object' then raise exception 'invalid_params' using errcode = '22023'; end if;
  insert into public.industry_fetch_events (fetch_event_id, job, params, batch_id) values (v_id, p_job, p_params, p_batch);
  return v_id;
end $$;
revoke execute on function public.begin_industry_fetch_event(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.begin_industry_fetch_event(text, jsonb, uuid) to service_role;

create or replace function public.retry_industry_fetch_event(p_id uuid)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_attempt int;
begin
  update public.industry_fetch_events set attempt = attempt + 1 where fetch_event_id = p_id returning attempt into v_attempt;
  if not found then raise exception 'fetch_event_not_found' using errcode = 'P0002'; end if;
  return v_attempt;
end $$;
revoke execute on function public.retry_industry_fetch_event(uuid) from public, anon, authenticated;
grant execute on function public.retry_industry_fetch_event(uuid) to service_role;

-- The only write path of security_marks ('marks') and industry_official_valuations ('official'). Per row,
-- in natural-key order: transaction advisory lock on the natural key (also when no current row exists);
-- receipt of (event, kind, key) present → duplicate (no content comparison), or
-- fetch_event_payload_changed when this retry carries another payload; otherwise compare with the
-- CURRENT ok observation: equal → duplicate; different (A→B→A included) → current becomes superseded,
-- then the new ok observation is inserted (supersedes = old id) and an open mark_revised /
-- official_revised quarantine item is filed; no current → insert. A 'quarantined' mark input is stored
-- as quarantined evidence and never becomes current; it is COUNTED in `inserted` (the result shape has no separate
-- count: a quarantined input is a stored observation) and its receipt outcome is 'inserted'. Every branch writes the receipt in the same
-- transaction. payload_hash = sha256 of the canonical content (trim_scale of close, total_share, status,
-- free_share or ''). Mark content compared with the current observation = close, total_share, free_share.
-- Rows: MarkInput[] / OfficialInput[]. Returns {inserted, duplicates, superseded}.
create or replace function public.apply_observations(p_kind text, p_fetch_event uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare ev public.industry_fetch_events; x jsonb; v_key text; v_hash text; v_rc public.industry_observation_receipts;
  v_cur uuid; v_cur_a numeric; v_cur_b numeric; v_cur_f numeric; v_a numeric; v_b numeric; v_f numeric; v_new uuid; v_outcome text; v_status text;
  v_ins int := 0; v_dup int := 0; v_sup int := 0;
begin
  if p_kind is null or p_kind not in ('marks','official') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  select * into ev from public.industry_fetch_events where fetch_event_id = p_fetch_event;
  if not found then raise exception 'fetch_event_not_found' using errcode = 'P0002'; end if;
  for x in select e from jsonb_array_elements(p_rows) e
           order by case when p_kind = 'marks' then (e ->> 'ticker') || ':' || (e ->> 'trade_date')
                         else (e ->> 'scheme') || ':' || (e ->> 'version') || ':' || (e ->> 'code') || ':' || (e ->> 'trade_date') || ':' || (e ->> 'metric') end loop
    if p_kind = 'marks' then
      v_key := (x ->> 'ticker') || ':' || (x ->> 'trade_date');
      v_a := (x ->> 'close')::numeric; v_b := (x ->> 'total_share')::numeric; v_f := (x ->> 'free_share')::numeric; v_status := coalesce(x ->> 'status', 'ok');
      if v_status not in ('ok','quarantined') then raise exception 'invalid_status' using errcode = '22023'; end if;
      v_hash := encode(sha256(convert_to(trim_scale(v_a)::text || '|' || trim_scale(v_b)::text || '|' || v_status || '|' || coalesce(trim_scale(v_f)::text, ''), 'UTF8')), 'hex');
    else
      v_key := (x ->> 'scheme') || ':' || (x ->> 'version') || ':' || (x ->> 'code') || ':' || (x ->> 'trade_date') || ':' || (x ->> 'metric');
      v_a := (x ->> 'value')::numeric; v_b := null; v_f := null; v_status := 'ok';
      v_hash := encode(sha256(convert_to(trim_scale(v_a)::text, 'UTF8')), 'hex');
    end if;
    perform pg_advisory_xact_lock(hashtext('industry-obs:' || p_kind || ':' || v_key));
    select * into v_rc from public.industry_observation_receipts where fetch_event_id = p_fetch_event and kind = p_kind and natural_key = v_key;
    if found then
      if v_rc.payload_hash <> v_hash then
        raise exception 'fetch_event_payload_changed: % % in event %', p_kind, v_key, p_fetch_event using errcode = 'P0001';
      end if;
      v_dup := v_dup + 1;
      continue;
    end if;
    v_cur := null; v_new := null;
    if p_kind = 'marks' then
      if v_status = 'ok' then
        select observation_id, close, total_share, free_share into v_cur, v_cur_a, v_cur_b, v_cur_f from public.security_marks
        where ticker = x ->> 'ticker' and trade_date = (x ->> 'trade_date')::date and status = 'ok';
      end if;
      -- content = close, total_share, free_share (a free_share revision is a new observation)
      if v_cur is not null and v_cur_a = v_a and v_cur_b = v_b and v_cur_f is not distinct from v_f then
        v_outcome := 'duplicate'; v_new := v_cur; v_dup := v_dup + 1;
      else
        if v_cur is not null then
          update public.security_marks set status = 'superseded' where observation_id = v_cur;
        end if;
        insert into public.security_marks (ticker, trade_date, fetch_event_id, observed_at, close, total_share, free_share, source, upstream, raw_hash, locator, batch_id, status, supersedes)
        values (x ->> 'ticker', (x ->> 'trade_date')::date, p_fetch_event, now(), v_a, v_b, v_f, x ->> 'source', x ->> 'upstream', x ->> 'raw_hash',
                coalesce(x -> 'locator', '{}'::jsonb), ev.batch_id, v_status, v_cur)
        returning observation_id into v_new;
        if v_cur is not null then
          v_outcome := 'superseded_previous'; v_sup := v_sup + 1;
          insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id)
          values (gen_random_uuid(), 'industry.marks', 'security_marks', v_key, 'mark_revised',
                  jsonb_build_object('previous', v_cur, 'current', v_new, 'fetch_event_id', p_fetch_event), '{}'::jsonb, ev.batch_id)
          on conflict do nothing;
        else
          v_outcome := 'inserted'; v_ins := v_ins + 1;
        end if;
      end if;
    else
      select observation_id, value into v_cur, v_cur_a from public.industry_official_valuations
      where scheme = x ->> 'scheme' and version = x ->> 'version' and code = x ->> 'code' and trade_date = (x ->> 'trade_date')::date
        and metric = x ->> 'metric' and status = 'ok';
      if v_cur is not null and v_cur_a = v_a then
        v_outcome := 'duplicate'; v_new := v_cur; v_dup := v_dup + 1;
      else
        if v_cur is not null then
          update public.industry_official_valuations set status = 'superseded' where observation_id = v_cur;
        end if;
        insert into public.industry_official_valuations (scheme, version, code, trade_date, metric, fetch_event_id, value, observed_at, source, upstream, raw_hash, locator, batch_id, status, supersedes)
        values (x ->> 'scheme', x ->> 'version', x ->> 'code', (x ->> 'trade_date')::date, x ->> 'metric', p_fetch_event, v_a, now(),
                x ->> 'source', x ->> 'upstream', x ->> 'raw_hash', coalesce(x -> 'locator', '{}'::jsonb), ev.batch_id, 'ok', v_cur)
        returning observation_id into v_new;
        if v_cur is not null then
          v_outcome := 'superseded_previous'; v_sup := v_sup + 1;
          insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id)
          values (gen_random_uuid(), 'industry.official', 'industry_official_valuations', v_key, 'official_revised',
                  jsonb_build_object('previous', v_cur, 'current', v_new, 'fetch_event_id', p_fetch_event), '{}'::jsonb, ev.batch_id)
          on conflict do nothing;
        else
          v_outcome := 'inserted'; v_ins := v_ins + 1;
        end if;
      end if;
    end if;
    insert into public.industry_observation_receipts (fetch_event_id, kind, natural_key, payload_hash, outcome, observation_id)
    values (p_fetch_event, p_kind, v_key, v_hash, v_outcome, v_new);
  end loop;
  return jsonb_build_object('inserted', v_ins, 'duplicates', v_dup, 'superseded', v_sup);
end $$;
revoke execute on function public.apply_observations(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_observations(text, uuid, jsonb) to service_role;

-- ================================================================ runs: create / coverage / fail (V2)
create or replace function public.create_industry_metric_run(p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_run uuid := gen_random_uuid(); v_gen bigint;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_run' using errcode = '22023'; end if;
  if not exists (select 1 from public.ingest_batches where batch_id = (p ->> 'batch_id')::uuid) then raise exception 'invalid_batch' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('industry-run:aggregate:' || (p ->> 'scheme') || ':' || (p ->> 'version') || ':' || (p ->> 'level')));
  select coalesce(max(generation), 0) + 1 into v_gen from public.industry_metric_runs
  where scheme = p ->> 'scheme' and version = p ->> 'version' and level = (p ->> 'level')::int;
  insert into public.industry_metric_runs (run_id, scheme, version, level, generation, facts_as_of, knowledge_date, history_class, method_version,
    config_hash, formula_version, code_version, expected_grid, fingerprint_at, reused_from_run, batch_id, status)
  values (v_run, p ->> 'scheme', p ->> 'version', (p ->> 'level')::int, v_gen, (p ->> 'facts_as_of')::date, (p ->> 'knowledge_date')::date,
    p ->> 'history_class', p ->> 'method_version', p ->> 'config_hash', p ->> 'formula_version', p ->> 'code_version', p -> 'expected_grid',
    (p ->> 'fingerprint_at')::timestamptz, nullif(p ->> 'reused_from_run', '')::uuid, (p ->> 'batch_id')::uuid, 'building');
  return jsonb_build_object('run_id', v_run, 'generation', v_gen);
end $$;
revoke execute on function public.create_industry_metric_run(jsonb) from public, anon, authenticated;
grant execute on function public.create_industry_metric_run(jsonb) to service_role;

create or replace function public.create_industry_valuation_run(p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_run uuid := gen_random_uuid(); v_gen bigint;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_run' using errcode = '22023'; end if;
  if not exists (select 1 from public.ingest_batches where batch_id = (p ->> 'batch_id')::uuid) then raise exception 'invalid_batch' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('industry-run:valuation:' || (p ->> 'scheme') || ':' || (p ->> 'version') || ':' || (p ->> 'level')));
  select coalesce(max(generation), 0) + 1 into v_gen from public.industry_valuation_runs
  where scheme = p ->> 'scheme' and version = p ->> 'version' and level = (p ->> 'level')::int;
  insert into public.industry_valuation_runs (run_id, scheme, version, level, generation, method_version, config_hash, formula_version, code_version,
    expected_dates, comparator_basis, recompute_from, carried_from_run, fingerprint_at, batch_id, status)
  values (v_run, p ->> 'scheme', p ->> 'version', (p ->> 'level')::int, v_gen, p ->> 'method_version', p ->> 'config_hash', p ->> 'formula_version',
    p ->> 'code_version', coalesce(p -> 'expected_dates', '[]'::jsonb), p ->> 'comparator_basis', (p ->> 'recompute_from')::date,
    nullif(p ->> 'carried_from_run', '')::uuid, (p ->> 'fingerprint_at')::timestamptz, (p ->> 'batch_id')::uuid, 'building');
  return jsonb_build_object('run_id', v_run, 'generation', v_gen);
end $$;
revoke execute on function public.create_industry_valuation_run(jsonb) from public, anon, authenticated;
grant execute on function public.create_industry_valuation_run(jsonb) to service_role;

create or replace function public.set_industry_metric_run_coverage(p_run uuid, p_summary jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_metric_runs;
begin
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then raise exception 'invalid_summary' using errcode = '22023'; end if;
  r := public.industry_metric_run_lock(p_run);
  if r.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  update public.industry_metric_runs set coverage_summary = p_summary where run_id = p_run;
end $$;
revoke execute on function public.set_industry_metric_run_coverage(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_industry_metric_run_coverage(uuid, jsonb) to service_role;

create or replace function public.fail_industry_run(p_kind text, p_run uuid, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_metric_runs; v public.industry_valuation_runs;
begin
  if p_kind = 'aggregate' then
    r := public.industry_metric_run_lock(p_run);
    if r.status <> 'building' then raise exception 'illegal_transition: aggregate run % is %', p_run, r.status using errcode = 'P0001'; end if;
    update public.industry_metric_runs set status = 'failed', coverage_summary = coverage_summary || jsonb_build_object('failure_reason', p_reason) where run_id = p_run;
  elsif p_kind = 'valuation' then
    v := public.industry_valuation_run_lock(p_run);
    if v.status not in ('building','published') then raise exception 'illegal_transition: valuation run % is %', p_run, v.status using errcode = 'P0001'; end if;
    update public.industry_valuation_runs set status = 'failed', reconciliation = reconciliation || jsonb_build_object('failure_reason', p_reason) where run_id = p_run;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.fail_industry_run(text, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_industry_run(text, uuid, text) to service_role;

-- ================================================================ staging (U5)
-- GC protocol (Codex plan audit round 1 #4): rows referencing manifests take FOR SHARE locks on those index
-- rows (a concurrent GC claim, FOR UPDATE SKIP LOCKED, skips them; after commit they are referenced) and
-- refuse a hash that GC has already claimed.
create or replace function public.industry_manifests_lock_for_reference(p_rows jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.industry_manifests m
             where m.manifest_hash in (select distinct x ->> 'manifest_hash' from jsonb_array_elements(p_rows) x where x ->> 'manifest_hash' is not null)
               and m.gc_claimed_at is not null) then
    raise exception 'manifest_gc_in_progress' using errcode = 'P0001';
  end if;
  perform 1 from public.industry_manifests m
  where m.manifest_hash in (select distinct x ->> 'manifest_hash' from jsonb_array_elements(p_rows) x where x ->> 'manifest_hash' is not null)
  order by m.manifest_hash for share;
  if exists (select 1 from public.industry_manifests m
             where m.manifest_hash in (select distinct x ->> 'manifest_hash' from jsonb_array_elements(p_rows) x where x ->> 'manifest_hash' is not null)
               and m.gc_claimed_at is not null) then
    raise exception 'manifest_gc_in_progress' using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.industry_manifests_lock_for_reference(jsonb) from public, anon, authenticated, service_role;
-- Rows: StagedMetricCell[]; run must be building; updated_at is forced null; re-staging a cell replaces it.
create or replace function public.stage_industry_metrics(p_run uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_metric_runs; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  r := public.industry_metric_run_lock(p_run);
  if r.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  perform public.industry_manifests_lock_for_reference(p_rows);
  insert into public.industry_metrics (run_id, code, metric, period_start, period_end, duration, status, missing_reason, value, unit,
    n_members, n_with_data, n_unresolved, manifest_hash, updated_at)
  select p_run, x ->> 'code', x ->> 'metric', (x ->> 'period_start')::date, (x ->> 'period_end')::date, x ->> 'duration', x ->> 'status',
         x ->> 'missing_reason', (x ->> 'value')::numeric, x ->> 'unit', (x ->> 'n_members')::int, (x ->> 'n_with_data')::int,
         (x ->> 'n_unresolved')::int, x ->> 'manifest_hash', null
  from jsonb_array_elements(p_rows) x
  on conflict (run_id, code, metric, period_start, period_end) do update
    set duration = excluded.duration, status = excluded.status, missing_reason = excluded.missing_reason, value = excluded.value,
        unit = excluded.unit, n_members = excluded.n_members, n_with_data = excluded.n_with_data, n_unresolved = excluded.n_unresolved,
        manifest_hash = excluded.manifest_hash, updated_at = null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.stage_industry_metrics(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_industry_metrics(uuid, jsonb) to service_role;

-- Rows: RunDependency[] {cell_key, issuer_id, state_rev}; the run of p_kind must be building. The
-- per-cell set check (dependencies_incomplete) runs at activation, after every chunk is staged.
create or replace function public.stage_industry_run_dependencies(p_run uuid, p_kind text, p_rows jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_metric_runs; v public.industry_valuation_runs; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  if p_kind = 'aggregate' then
    r := public.industry_metric_run_lock(p_run);
    if r.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  elsif p_kind = 'valuation' then
    v := public.industry_valuation_run_lock(p_run);
    if v.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  insert into public.industry_run_dependencies (run_kind, run_id, cell_key, issuer_id, state_rev)
  select p_kind, p_run, x ->> 'cell_key', (x ->> 'issuer_id')::uuid, (x ->> 'state_rev')::bigint
  from jsonb_array_elements(p_rows) x
  on conflict (run_kind, run_id, cell_key, issuer_id) do update set state_rev = excluded.state_rev;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.stage_industry_run_dependencies(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.stage_industry_run_dependencies(uuid, text, jsonb) to service_role;

-- Rows: ValuationCellRow-like objects without run/scheme/version (taken from the run); published,
-- series_qualified forced false, updated_at null; trade_date must be one of the run's expected_dates
-- (invalid_trade_date); an ok row must carry a registered manifest_hash (invalid_manifest).
create or replace function public.stage_industry_valuations(p_run uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.industry_valuation_runs; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  v := public.industry_valuation_run_lock(p_run);
  if v.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x
             where not exists (select 1 from jsonb_array_elements_text(v.expected_dates) d where d::date = (x ->> 'trade_date')::date)) then
    raise exception 'invalid_trade_date' using errcode = '22023';
  end if;
  perform public.industry_manifests_lock_for_reference(p_rows);
  -- an ok cell carries a registered manifest (its evidence); the lock above has refused claimed hashes
  if exists (select 1 from jsonb_array_elements(p_rows) x
             where x ->> 'status' = 'ok'
               and (nullif(x ->> 'manifest_hash', '') is null or not exists (select 1 from public.industry_manifests mf where mf.manifest_hash = x ->> 'manifest_hash'))) then
    raise exception 'invalid_manifest' using errcode = '22023';
  end if;
  insert into public.industry_valuations (run_id, scheme, version, code, trade_date, metric, status, missing_reason, value, facts_as_of,
    n_members, n_with_data, n_unresolved, mcap_coverage, manifest_hash, updated_at, series_qualified, published)
  select p_run, v.scheme, v.version, x ->> 'code', (x ->> 'trade_date')::date, x ->> 'metric', x ->> 'status', x ->> 'missing_reason',
         (x ->> 'value')::numeric, (x ->> 'facts_as_of')::date, (x ->> 'n_members')::int, (x ->> 'n_with_data')::int, (x ->> 'n_unresolved')::int,
         (x ->> 'mcap_coverage')::numeric, x ->> 'manifest_hash', null, false, false
  from jsonb_array_elements(p_rows) x
  on conflict (run_id, scheme, version, code, trade_date, metric) do update
    set status = excluded.status, missing_reason = excluded.missing_reason, value = excluded.value, facts_as_of = excluded.facts_as_of,
        n_members = excluded.n_members, n_with_data = excluded.n_with_data, n_unresolved = excluded.n_unresolved,
        mcap_coverage = excluded.mcap_coverage, manifest_hash = excluded.manifest_hash, updated_at = null, series_qualified = false, published = false;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.stage_industry_valuations(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_industry_valuations(uuid, jsonb) to service_role;

-- Pair rows are DERIVED, never trusted (Codex review P1): the caller's pair_status / official_value / rel_diff are
-- ignored. Per row, in this order: market_cap -> not_applicable (no comparator); the staged valuation row of the cell is
-- missing or not ok -> no_computed; the referenced official observation is not a current ok observation of the same
-- scheme/version/code/trade_date and the comparator metric (pe_ttm, pe_static -> 'pe'; pb -> 'pb') -> no_official
-- (observation id, official_value and rel_diff null); official value <= 0 -> invalid_denominator (official_value kept,
-- rel_diff null); otherwise rel_diff = computed / official - 1, within iff |rel_diff| <= 0.01, else outside.
-- trade_date must be one of the run's expected_dates (invalid_trade_date).
create or replace function public.stage_industry_valuation_pairs(p_run uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.industry_valuation_runs; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  v := public.industry_valuation_run_lock(p_run);
  if v.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x
             where not exists (select 1 from jsonb_array_elements_text(v.expected_dates) d where d::date = (x ->> 'trade_date')::date)) then
    raise exception 'invalid_trade_date' using errcode = '22023';
  end if;
  insert into public.industry_valuation_pairs (run_id, scheme, version, code, trade_date, metric, official_observation_id, official_value, rel_diff, pair_status)
  select p_run, v.scheme, v.version, d.code, d.trade_date, d.metric,
         case when d.state in ('within','outside','invalid_denominator') then d.obs_id end,
         case when d.state in ('within','outside','invalid_denominator') then d.official end,
         case when d.state in ('within','outside') then d.computed / d.official - 1 end,
         d.state
  from (
    select y.code, y.trade_date, y.metric, y.obs_id, y.official, y.computed,
           case when y.metric = 'market_cap' then 'not_applicable'
                when y.computed is null then 'no_computed'
                when y.obs_id is null then 'no_official'
                when y.official <= 0 then 'invalid_denominator'
                when abs(y.computed / y.official - 1) <= 0.01 then 'within'
                else 'outside' end as state
    from (
      select x ->> 'code' as code, (x ->> 'trade_date')::date as trade_date, x ->> 'metric' as metric,
             o.observation_id as obs_id, o.value as official,
             (select val.value from public.industry_valuations val
              where val.run_id = p_run and val.scheme = v.scheme and val.version = v.version and val.code = x ->> 'code'
                and val.trade_date = (x ->> 'trade_date')::date and val.metric = x ->> 'metric' and val.status = 'ok') as computed
      from jsonb_array_elements(p_rows) x
      left join public.industry_official_valuations o
        on o.observation_id = nullif(x ->> 'official_observation_id', '')::uuid and o.status = 'ok'
       and o.scheme = v.scheme and o.version = v.version and o.code = x ->> 'code' and o.trade_date = (x ->> 'trade_date')::date
       and o.metric = case x ->> 'metric' when 'pe_ttm' then 'pe' when 'pe_static' then 'pe' when 'pb' then 'pb' end
    ) y
  ) d
  on conflict (run_id, scheme, version, code, trade_date, metric) do update
    set official_observation_id = excluded.official_observation_id, official_value = excluded.official_value, rel_diff = excluded.rel_diff, pair_status = excluded.pair_status;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.stage_industry_valuation_pairs(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_industry_valuation_pairs(uuid, jsonb) to service_role;

-- ================================================================ publish (valuation, §6.4, U5)
-- Lock the run; building only; every valuation row has its pair row and every pair row its valuation
-- row (pairs_mismatch); series qualification per (code, metric) over the full snapshot:
-- n_pairs = within + outside (distinct EXPECTED dates only) >= 0.9 × n_expected, within / n_pairs >= 0.95, n_pairs >= 24,
-- and the method gate (§6.4 K1): pb never qualifies (its comparator is unverified), pe_ttm only with comparator_basis
-- 'ttm', pe_static only with 'static', market_cap never (its pairs are not_applicable); every ok row carries a
-- registered manifest_hash (invalid_manifest); then once:
-- series_qualified, published = qualified and status ok and pair within; run → published.
-- Returns {qualified_series, published_rows}.
create or replace function public.publish_industry_valuations(p_run uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.industry_valuation_runs; v_expected int; v_series jsonb; v_q int; v_pub int;
begin
  v := public.industry_valuation_run_lock(p_run);
  if v.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  if exists (select 1 from public.industry_valuations x where x.run_id = p_run
             and not exists (select 1 from public.industry_valuation_pairs p where p.run_id = x.run_id and p.scheme = x.scheme and p.version = x.version
                             and p.code = x.code and p.trade_date = x.trade_date and p.metric = x.metric))
     or exists (select 1 from public.industry_valuation_pairs p where p.run_id = p_run
             and not exists (select 1 from public.industry_valuations x where x.run_id = p.run_id and x.scheme = p.scheme and x.version = p.version
                             and x.code = p.code and x.trade_date = p.trade_date and x.metric = p.metric)) then
    raise exception 'pairs_mismatch' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.industry_valuations x where x.run_id = p_run and x.status = 'ok'
             and (x.manifest_hash is null or not exists (select 1 from public.industry_manifests mf where mf.manifest_hash = x.manifest_hash))) then
    raise exception 'invalid_manifest' using errcode = '22023';
  end if;
  v_expected := jsonb_array_length(v.expected_dates);
  select coalesce(jsonb_agg(jsonb_build_object('code', q.code, 'metric', q.metric, 'n_expected', v_expected, 'n_pairs', q.n_pairs,
           'n_within', q.n_within, 'n_outside', q.n_outside, 'n_no_official', q.n_no_official,
           'qualified', (q.metric = 'pe_ttm' and v.comparator_basis = 'ttm' or q.metric = 'pe_static' and v.comparator_basis = 'static')
                        and q.n_pairs >= 24 and q.n_pairs >= 0.9 * v_expected and q.n_pairs > 0 and q.n_within::numeric / greatest(q.n_pairs, 1) >= 0.95)
         order by q.code, q.metric), '[]'::jsonb)
    into v_series
  from (select p.code, p.metric,
               (count(distinct p.trade_date) filter (where p.pair_status in ('within','outside')))::int as n_pairs,
               (count(distinct p.trade_date) filter (where p.pair_status = 'within'))::int as n_within,
               (count(distinct p.trade_date) filter (where p.pair_status = 'outside'))::int as n_outside,
               (count(distinct p.trade_date) filter (where p.pair_status = 'no_official'))::int as n_no_official
        from public.industry_valuation_pairs p
        where p.run_id = p_run and exists (select 1 from jsonb_array_elements_text(v.expected_dates) d where d::date = p.trade_date)
        group by p.code, p.metric) q;
  update public.industry_valuations x
  set series_qualified = s.qualified,
      published = s.qualified and x.status = 'ok' and exists (select 1 from public.industry_valuation_pairs p where p.run_id = x.run_id
        and p.scheme = x.scheme and p.version = x.version and p.code = x.code and p.trade_date = x.trade_date and p.metric = x.metric and p.pair_status = 'within')
  from jsonb_to_recordset(v_series) as s(code text, metric text, qualified boolean)
  where x.run_id = p_run and s.code = x.code and s.metric = x.metric;
  select count(*)::int into v_q from jsonb_array_elements(v_series) e where (e ->> 'qualified')::boolean;
  select count(*)::int into v_pub from public.industry_valuations where run_id = p_run and published;
  update public.industry_valuation_runs set status = 'published', published_at = now(),
         reconciliation = reconciliation || jsonb_build_object('series', v_series, 'published_rows', v_pub)
  where run_id = p_run;
  return jsonb_build_object('qualified_series', v_q, 'published_rows', v_pub);
end $$;
revoke execute on function public.publish_industry_valuations(uuid) from public, anon, authenticated;
grant execute on function public.publish_industry_valuations(uuid) to service_role;

-- ================================================================ activation (§5.4, §6.4, U4, U6)
-- Aggregate: advisory lock on the run family, then the run row (for update); building only
-- (run_not_building); completeness: every code × period_end × (metric, duration) of expected_grid has
-- a row — 3M at every period end for the sums and YoY, 12M only on December 31 (sums, YoY, gross_margin),
-- TTM for roe, INSTANT for member_count; identical to method.ts::cellSpecs (Task 10) — else
-- incomplete_run (spec §5.2); per cell
-- '<code>:<period_end>' the dependency rows number max(n_members) of the cell AND their issuers equal the cell's
-- candidate members (industry_candidate_members, knownBy = facts_as_of) else dependencies_incomplete; non-obsolete: generation > active.generation and facts_as_of >=
-- active.facts_as_of else obsolete_run; dependency non-regression per (cell_key, issuer_id) against the
-- active run else dependency_regression; then ONE database time t = clock_timestamp(): active →
-- superseded, this run → active with activated_at = t, every row updated_at = t. Returns {activated_at}.
create or replace function public.activate_industry_metric_run(p_run uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_metric_runs; a public.industry_metric_runs; v_t timestamptz;
begin
  select * into r from public.industry_metric_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('industry-run:aggregate:' || r.scheme || ':' || r.version || ':' || r.level));
  r := public.industry_metric_run_lock(p_run);
  if r.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(r.expected_grid -> 'codes', '[]'::jsonb)) c(code)
    cross join jsonb_array_elements_text(coalesce(r.expected_grid -> 'period_ends', '[]'::jsonb)) p(period_end)
    cross join jsonb_array_elements_text(coalesce(r.expected_grid -> 'metrics', '[]'::jsonb)) m(metric)
    join (values ('revenue_sum','3M',false),('revenue_sum','12M',true),('net_income_parent_sum','3M',false),('net_income_parent_sum','12M',true),
                 ('gross_margin','12M',true),('roe','TTM',false),('revenue_yoy','3M',false),('revenue_yoy','12M',true),
                 ('net_income_yoy','3M',false),('net_income_yoy','12M',true),('member_count','INSTANT',false)) s(metric, duration, dec_only)
      on s.metric = m.metric
    where (not s.dec_only or to_char(p.period_end::date, 'MM-DD') = '12-31')
      and not exists (select 1 from public.industry_metrics x where x.run_id = p_run and x.code = c.code and x.metric = m.metric
                        and x.duration = s.duration and x.period_end = p.period_end::date)) then
    raise exception 'incomplete_run' using errcode = 'P0001';
  end if;
  -- dependency set equality (Codex review P1): per cell the dependency issuers equal the candidate members (ok memberships
  -- that are members on period_end as known by facts_as_of), in both directions; no dependency of a cell without rows
  if exists (
    select 1 from (select code, period_end, max(n_members) n from public.industry_metrics where run_id = p_run group by code, period_end) g
    where g.n <> (select count(*) from public.industry_run_dependencies d where d.run_kind = 'aggregate' and d.run_id = p_run
                  and d.cell_key = g.code || ':' || to_char(g.period_end, 'YYYY-MM-DD'))) then
    raise exception 'dependencies_incomplete' using errcode = 'P0001';
  end if;
  if exists (
    with cells as (select distinct code, period_end from public.industry_metrics where run_id = p_run),
    want as (select c.code || ':' || to_char(c.period_end, 'YYYY-MM-DD') as cell_key, w.issuer_id
             from cells c cross join lateral public.industry_candidate_members(r.scheme, r.version, r.level, c.code, c.period_end, r.facts_as_of) as w(issuer_id)),
    have as (select d.cell_key, d.issuer_id from public.industry_run_dependencies d where d.run_kind = 'aggregate' and d.run_id = p_run)
    select 1 from ((select * from want except select * from have) union all (select * from have except select * from want)) diff) then
    raise exception 'dependencies_incomplete' using errcode = 'P0001';
  end if;
  select * into a from public.industry_metric_runs where scheme = r.scheme and version = r.version and level = r.level and status = 'active' for update;
  if found then
    if r.generation <= a.generation or r.facts_as_of < a.facts_as_of then raise exception 'obsolete_run' using errcode = 'P0001'; end if;
    if exists (select 1 from public.industry_run_dependencies o join public.industry_run_dependencies n
                 on n.run_kind = 'aggregate' and n.run_id = p_run and n.cell_key = o.cell_key and n.issuer_id = o.issuer_id
               where o.run_kind = 'aggregate' and o.run_id = a.run_id and n.state_rev < o.state_rev) then
      raise exception 'dependency_regression' using errcode = 'P0001';
    end if;
    update public.industry_metric_runs set status = 'superseded' where run_id = a.run_id;
  end if;
  v_t := clock_timestamp();
  update public.industry_metric_runs set status = 'active', activated_at = v_t where run_id = p_run;
  update public.industry_metrics set updated_at = v_t where run_id = p_run;
  return jsonb_build_object('activated_at', v_t);
end $$;
revoke execute on function public.activate_industry_metric_run(uuid) from public, anon, authenticated;
grant execute on function public.activate_industry_metric_run(uuid) to service_role;

-- Valuation: same lock order; published only (illegal_transition); publication invariant re-checked
-- (every published row has a within pair and series_qualified, else pairs_mismatch); completeness:
-- every level node of (scheme, version) × expected_dates × the four metrics has a row else
-- incomplete_run; dependencies per '<code>:<trade_date>' as above; generation > active.generation else
-- obsolete_run; dependency non-regression; one t for run and rows (carried rows included). Dependencies per
-- '<code>:<trade_date>' as for aggregates, candidate members known by the trade date itself.
create or replace function public.activate_industry_valuation_run(p_run uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_valuation_runs; a public.industry_valuation_runs; v_t timestamptz;
begin
  select * into r from public.industry_valuation_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('industry-run:valuation:' || r.scheme || ':' || r.version || ':' || r.level));
  r := public.industry_valuation_run_lock(p_run);
  if r.status <> 'published' then raise exception 'illegal_transition: valuation run % is %', p_run, r.status using errcode = 'P0001'; end if;
  if exists (select 1 from public.industry_valuations x where x.run_id = p_run and x.published
             and not (x.series_qualified and exists (select 1 from public.industry_valuation_pairs p where p.run_id = x.run_id and p.scheme = x.scheme
                 and p.version = x.version and p.code = x.code and p.trade_date = x.trade_date and p.metric = x.metric and p.pair_status = 'within'))) then
    raise exception 'pairs_mismatch' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.industry_classifications c
    cross join jsonb_array_elements_text(r.expected_dates) d(trade_date)
    cross join unnest(array['pe_ttm','pe_static','pb','market_cap']) m(metric)
    where c.scheme = r.scheme and c.version = r.version and c.level = r.level
      and not exists (select 1 from public.industry_valuations x where x.run_id = p_run and x.code = c.code and x.metric = m.metric and x.trade_date = d.trade_date::date)) then
    raise exception 'incomplete_run' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from (select code, trade_date, coalesce(max(n_members), 0) n from public.industry_valuations where run_id = p_run group by code, trade_date) g
    where g.n <> (select count(*) from public.industry_run_dependencies d where d.run_kind = 'valuation' and d.run_id = p_run
                  and d.cell_key = g.code || ':' || to_char(g.trade_date, 'YYYY-MM-DD'))) then
    raise exception 'dependencies_incomplete' using errcode = 'P0001';
  end if;
  if exists (
    with cells as (select distinct code, trade_date from public.industry_valuations where run_id = p_run),
    want as (select c.code || ':' || to_char(c.trade_date, 'YYYY-MM-DD') as cell_key, w.issuer_id
             from cells c cross join lateral public.industry_candidate_members(r.scheme, r.version, r.level, c.code, c.trade_date, c.trade_date) as w(issuer_id)),
    have as (select d.cell_key, d.issuer_id from public.industry_run_dependencies d where d.run_kind = 'valuation' and d.run_id = p_run)
    select 1 from ((select * from want except select * from have) union all (select * from have except select * from want)) diff) then
    raise exception 'dependencies_incomplete' using errcode = 'P0001';
  end if;
  select * into a from public.industry_valuation_runs where scheme = r.scheme and version = r.version and level = r.level and status = 'active' for update;
  if found then
    if r.generation <= a.generation then raise exception 'obsolete_run' using errcode = 'P0001'; end if;
    if exists (select 1 from public.industry_run_dependencies o join public.industry_run_dependencies n
                 on n.run_kind = 'valuation' and n.run_id = p_run and n.cell_key = o.cell_key and n.issuer_id = o.issuer_id
               where o.run_kind = 'valuation' and o.run_id = a.run_id and n.state_rev < o.state_rev) then
      raise exception 'dependency_regression' using errcode = 'P0001';
    end if;
    update public.industry_valuation_runs set status = 'superseded' where run_id = a.run_id;
  end if;
  v_t := clock_timestamp();
  update public.industry_valuation_runs set status = 'active', activated_at = v_t where run_id = p_run;
  update public.industry_valuations set updated_at = v_t where run_id = p_run;
  return jsonb_build_object('activated_at', v_t);
end $$;
revoke execute on function public.activate_industry_valuation_run(uuid) from public, anon, authenticated;
grant execute on function public.activate_industry_valuation_run(uuid) to service_role;

-- ================================================================ manifests index and pruning (§5.3, §7.1, V8)
-- GC claim/tombstone protocol (Codex plan audit round 1 #4). gc_industry_manifest_candidates CLAIMS what it
-- returns (gc_claimed_at = now(), rows taken FOR UPDATE SKIP LOCKED); while a row is claimed it can neither be
-- re-registered (put_industry_manifest raises manifest_gc_in_progress) nor referenced by staged rows (the
-- stage functions lock the referenced index rows FOR SHARE and raise manifest_gc_in_progress on a claim), so
-- GC's bucket delete can never remove an object a run has started to use; delete_industry_manifests then
-- removes the claimed, still-unreferenced rows. A claim older than 1 hour (GC died midway) is re-claimable.
-- The TS store registers FIRST and uploads after (Task 11), so a manifest whose registration succeeded is
-- young (created_at = now()) and cannot be claimed before its rows are staged.
-- Registers (or touches) the index row; true when the row is new. Raises manifest_gc_in_progress on a claim.
create or replace function public.put_industry_manifest(p_hash text, p_kind text, p_bytes int)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_new boolean; v_claim timestamptz; v_found boolean;
begin
  select gc_claimed_at, true into v_claim, v_found from public.industry_manifests where manifest_hash = p_hash for update;
  if v_found and v_claim is not null then raise exception 'manifest_gc_in_progress' using errcode = 'P0001'; end if;
  insert into public.industry_manifests (manifest_hash, kind, byte_length, object_path)
  values (p_hash, p_kind, p_bytes, 'sha256/' || p_hash || '/' || gen_random_uuid()::text || '.json.gz')   -- new incarnation (R2-1)
  on conflict (manifest_hash) do update set created_at = now()
  returning (xmax = 0) into v_new;
  return v_new;
end $$;
revoke execute on function public.put_industry_manifest(text, text, int) from public, anon, authenticated;
grant execute on function public.put_industry_manifest(text, text, int) to service_role;

-- GC candidates = CLAIMS: unreferenced, unclaimed (or claim older than 1 h) manifests whose index row is
-- older than p_min_age_seconds (default 24 h), taken FOR UPDATE SKIP LOCKED, re-checked for references in a second
-- statement (fresh snapshot) and only then marked gc_claimed_at = now() with a
-- fresh claim token. Returns [{hash, object_path, claim}] oldest first: the collector deletes exactly that object
-- path (an incarnation) and finalizes with that token, so a stale collector whose claim was taken over can neither
-- delete a later incarnation's object nor its index row (Codex plan audit round 2 R2-1). Volatile (it writes).
create or replace function public.gc_industry_manifest_candidates(p_limit int, p_min_age_seconds int default 86400)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v jsonb; v_locked text[];
begin
  if p_limit is null or p_limit < 1 then raise exception 'invalid_limit' using errcode = '22023'; end if;
  -- 1 lock the candidate index rows (a stage holding FOR SHARE makes them skip); the reference test here uses this
  -- statement's snapshot and is only a pre-filter
  select coalesce(array_agg(c.manifest_hash order by c.created_at, c.manifest_hash), '{}'::text[]) into v_locked from (
    select m.manifest_hash, m.created_at from public.industry_manifests m
    where m.created_at <= now() - make_interval(secs => coalesce(p_min_age_seconds, 86400))
      and (m.gc_claimed_at is null or m.gc_claimed_at <= now() - interval '1 hour')
      and public.industry_manifest_unreferenced(m.manifest_hash)
    order by m.created_at, m.manifest_hash limit p_limit
    for update skip locked
  ) c;
  -- 2 re-check the references in a SEPARATE statement (fresh snapshot, READ COMMITTED) while holding the locks: a stage
  -- that committed between the first snapshot and the lock is seen here and the row is left unclaimed (Codex review P1)
  with claimed as (
    update public.industry_manifests m set gc_claimed_at = now(), gc_claim = gen_random_uuid()
    where m.manifest_hash = any(v_locked) and public.industry_manifest_unreferenced(m.manifest_hash)
    returning m.manifest_hash, m.created_at, m.object_path, m.gc_claim
  ) select coalesce(jsonb_agg(jsonb_build_object('hash', c.manifest_hash, 'object_path', c.object_path, 'claim', c.gc_claim)
                              order by c.created_at, c.manifest_hash), '[]'::jsonb) into v from claimed c;
  return v;
end $$;
revoke execute on function public.gc_industry_manifest_candidates(int, int) from public, anon, authenticated;
grant execute on function public.gc_industry_manifest_candidates(int, int) to service_role;

-- Deletes index rows the TS GC already removed from the bucket: only rows still CLAIMED BY THE GIVEN TOKEN
-- (p_claims [{hash, claim}]), re-checking age and references.
create or replace function public.delete_industry_manifests(p_claims jsonb, p_min_age_seconds int default 86400)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare n int;
begin
  if p_claims is null or jsonb_typeof(p_claims) <> 'array' then raise exception 'invalid_claims' using errcode = '22023'; end if;
  delete from public.industry_manifests m
  using (select x ->> 'hash' as hash, (x ->> 'claim')::uuid as claim from jsonb_array_elements(p_claims) x) c
  where m.manifest_hash = c.hash and m.gc_claim = c.claim
    and m.gc_claimed_at is not null
    and m.created_at <= now() - make_interval(secs => coalesce(p_min_age_seconds, 86400))
    and public.industry_manifest_unreferenced(m.manifest_hash);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.delete_industry_manifests(jsonb, int) from public, anon, authenticated;
grant execute on function public.delete_industry_manifests(jsonb, int) to service_role;

-- The only delete path of runs and their rows (V8): per (kind, scheme, version, level) the superseded
-- runs ranked by generation beyond the newest p_keep, not referenced by an F4 judgment (when that table
-- exists; conservative text match on the run id). Each run is locked and re-checked, then its
-- dependency rows, its rows (the freeze triggers admit deletes of a superseded run) and the run are
-- deleted. p_scheme/p_version (optional) restrict the family, so tests prune only their own runs.
create or replace function public.prune_industry_runs(p_keep int, p_scheme text default null, p_version text default null)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare c record; n int := 0; v_ref boolean; v_status text;
begin
  if p_keep is null or p_keep < 1 then raise exception 'invalid_keep' using errcode = '22023'; end if;
  for c in
    select 'aggregate'::text kind, run_id from (
      select run_id, row_number() over (partition by scheme, version, level order by generation desc) rk
      from public.industry_metric_runs where status = 'superseded' and (p_scheme is null or scheme = p_scheme) and (p_version is null or version = p_version)) s
    where rk > p_keep
    union all
    select 'valuation', run_id from (
      select run_id, row_number() over (partition by scheme, version, level order by generation desc) rk
      from public.industry_valuation_runs where status = 'superseded' and (p_scheme is null or scheme = p_scheme) and (p_version is null or version = p_version)) s
    where rk > p_keep
    order by 1, 2
  loop
    v_ref := false;
    if to_regclass('public.judgments') is not null then
      execute 'select exists (select 1 from public.judgments j where strpos(to_jsonb(j)::text, $1) > 0)' into v_ref using c.run_id::text;
    end if;
    continue when v_ref;
    if c.kind = 'aggregate' then
      select status into v_status from public.industry_metric_runs where run_id = c.run_id for update;
      continue when v_status is distinct from 'superseded';
      delete from public.industry_run_dependencies where run_kind = 'aggregate' and run_id = c.run_id;
      delete from public.industry_metrics where run_id = c.run_id;
      delete from public.industry_metric_runs where run_id = c.run_id;
    else
      select status into v_status from public.industry_valuation_runs where run_id = c.run_id for update;
      continue when v_status is distinct from 'superseded';
      delete from public.industry_run_dependencies where run_kind = 'valuation' and run_id = c.run_id;
      delete from public.industry_valuation_pairs where run_id = c.run_id;
      delete from public.industry_valuations where run_id = c.run_id;
      delete from public.industry_valuation_runs where run_id = c.run_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.prune_industry_runs(int, text, text) from public, anon, authenticated;
grant execute on function public.prune_industry_runs(int, text, text) to service_role;
