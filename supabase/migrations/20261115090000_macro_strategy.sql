-- supabase/migrations/20261115090000_macro_strategy.sql
-- Macro workbench P3+P4 storage (spec 2026-11-07-macro-workbench-p3-p4-design.md §4.4, draft 3).
-- Six tables and eight security definer RPCs. No reference to P1 / F4 tables (no foreign keys out of
-- this module), so the branch replays on its own before P1+P2 merge. Every write goes through an RPC
-- granted to service_role only; no role has a direct insert/update/delete privilege.
--   macro_strategy_manifests  frozen strategy manifests; identity = manifest_hash (sha256 of the canonical body)
--   macro_review_results      immutable monthly review results, unique (region, month, manifest_hash)
--   macro_review_current      current pointer per (region, month) with a generation CAS
--   macro_review_attempts     service-only attempt log (ok / replayed / insufficient / failed / stale)
--   macro_explanation_runs    service-only LLM run rows (raw output, finalize payload, validation, accounting, finalized)
--   macro_explanations        user-readable projection (RLS user_id = auth.uid())
-- Errors are raised with the code as the message: not_found, payload_conflict, invalid_transition,
-- invalid_status, invalid_argument, cutoff_mismatch (src/lib/macro/strategy/db.ts maps them). A claim left running for more than five
-- minutes is turned into abandoned by the next claim of the same (user_id, request_id) or by
-- macro_expire_explanations(user_id) (GET /explanations runs it before reading) — unless its completion is recorded
-- (raw_output is a json object): such a row is finished later from the stored output by the server's completion
-- recovery, never abandoned. Accounting is durable before anything else can fail: macro_record_completion stores the
-- raw output and the exact finalizeUsageRun payload right after the provider returns; macro_finish_explanation stores
-- the same payload when none is recorded yet (never overwrites one); macro_mark_finalized needs a payload. Every RPC
-- that changes a run row first locks it (select … for update), so an expiring claim never overwrites a concurrent finish.

-- ---------------------------------------------------------------- tables
create table if not exists public.macro_strategy_manifests (
  manifest_id uuid primary key default gen_random_uuid(),
  kind text not null constraint macro_strategy_manifests_kind check (kind in ('transmission','policy_response','cycle_table','review','explain_facts')),
  body jsonb not null constraint macro_strategy_manifests_body check ((jsonb_typeof(body) = 'object' and body->>'kind' = kind) is true),
  manifest_hash text not null constraint macro_strategy_manifests_hash check (manifest_hash ~ '^[0-9a-f]{64}$'),
  cutoff timestamptz not null,
  method_version text not null constraint macro_strategy_manifests_method check (length(method_version) between 1 and 128),
  code_version text not null constraint macro_strategy_manifests_code check (length(code_version) between 1 and 128),
  catalog_version text not null constraint macro_strategy_manifests_catalog check (length(catalog_version) between 1 and 128),
  created_at timestamptz not null default now(),
  constraint macro_strategy_manifests_hash_key unique (manifest_hash)
);

create table if not exists public.macro_review_results (
  result_id uuid primary key default gen_random_uuid(),
  region text not null constraint macro_review_results_region check (region in ('US','CN')),
  month text not null constraint macro_review_results_month check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null constraint macro_review_results_status check (status in ('ok','insufficient')),
  manifest_id uuid not null references public.macro_strategy_manifests(manifest_id),
  manifest_hash text not null constraint macro_review_results_hash check (manifest_hash ~ '^[0-9a-f]{64}$'),
  facts jsonb not null constraint macro_review_results_facts check (jsonb_typeof(facts) = 'object'),
  method_version text not null,
  code_version text not null,
  created_at timestamptz not null default now(),
  constraint macro_review_results_identity unique (region, month, manifest_hash)
);

create table if not exists public.macro_review_current (
  region text not null constraint macro_review_current_region check (region in ('US','CN')),
  month text not null constraint macro_review_current_month check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  result_id uuid not null references public.macro_review_results(result_id),
  generation bigint not null constraint macro_review_current_generation check (generation >= 1),
  cutoff timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (region, month)
);

create table if not exists public.macro_review_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  region text not null constraint macro_review_attempts_region check (region in ('US','CN')),
  month text not null constraint macro_review_attempts_month check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null constraint macro_review_attempts_status check (status in ('ok','replayed','insufficient','failed','stale')),
  result_id uuid null,
  error jsonb null,
  created_at timestamptz not null default now()
);
create index if not exists macro_review_attempts_region_month on public.macro_review_attempts (region, month, created_at);

create table if not exists public.macro_explanation_runs (
  explanation_id uuid primary key,
  user_id uuid not null,
  request_id uuid not null,
  payload_hash text not null constraint macro_explanation_runs_payload check (payload_hash ~ '^[0-9a-f]{64}$'),
  subject_kind text not null constraint macro_explanation_runs_subject_kind check (subject_kind in ('snapshot','review')),
  subject_id text not null constraint macro_explanation_runs_subject_id check (length(subject_id) between 1 and 200),
  locale text not null constraint macro_explanation_runs_locale check (locale in ('zh','en')),
  manifest_id uuid not null references public.macro_strategy_manifests(manifest_id),
  state text not null constraint macro_explanation_runs_state check (state in ('running','accepted','rejected','failed','abandoned')),
  claimed_at timestamptz not null default now(),
  finished_at timestamptz null,
  provider text null,
  model text null,
  prompt_version text null,
  validator_version text null,
  raw_output jsonb null,
  validation jsonb null,
  usage_audit_key text not null,
  accounting jsonb null,
  finalize_payload jsonb null constraint macro_explanation_runs_finalize_payload check (finalize_payload is null or ((jsonb_typeof(finalize_payload) = 'object' and finalize_payload->>'status' in ('completed','failed')) is true)),
  finalized boolean not null default false,
  late_output jsonb null,
  constraint macro_explanation_runs_request unique (user_id, request_id),
  constraint macro_explanation_runs_audit_key unique (usage_audit_key),
  constraint macro_explanation_runs_audit_key_form check (usage_audit_key = explanation_id::text)
);
create index if not exists macro_explanation_runs_unfinalized on public.macro_explanation_runs (claimed_at) where finalized = false and finalize_payload is not null;
create index if not exists macro_explanation_runs_running on public.macro_explanation_runs (user_id, claimed_at) where state = 'running';

create table if not exists public.macro_explanations (
  explanation_id uuid primary key references public.macro_explanation_runs(explanation_id),
  user_id uuid not null,
  subject_kind text not null constraint macro_explanations_subject_kind check (subject_kind in ('snapshot','review')),
  subject_id text not null,
  locale text not null constraint macro_explanations_locale check (locale in ('zh','en')),
  manifest_id uuid not null references public.macro_strategy_manifests(manifest_id),
  state text not null constraint macro_explanations_state check (state in ('running','accepted','rejected','failed')),
  rendered jsonb null,
  failure_codes text[] not null default '{}',
  provider text null,
  model text null,
  prompt_version text null,
  validator_version text null,
  created_at timestamptz not null default now(),
  finished_at timestamptz null,
  constraint macro_explanations_rendered check ((state = 'accepted') = (rendered is not null))
);
create index if not exists macro_explanations_subject on public.macro_explanations (user_id, subject_kind, subject_id, created_at desc);

-- ---------------------------------------------------------------- privileges and RLS
do $$
declare t text;
begin
  foreach t in array array['macro_strategy_manifests','macro_review_results','macro_review_current','macro_review_attempts','macro_explanation_runs','macro_explanations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s service read" on public.%I', t, t);
    execute format('create policy "%s service read" on public.%I for select to service_role using (true)', t, t);
  end loop;
  foreach t in array array['macro_strategy_manifests','macro_review_results','macro_review_current'] loop
    execute format('grant select on public.%I to anon, authenticated, service_role', t);
    execute format('drop policy if exists "%s public read" on public.%I', t, t);
    execute format('create policy "%s public read" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
  foreach t in array array['macro_review_attempts','macro_explanation_runs'] loop
    execute format('grant select on public.%I to service_role', t);
  end loop;
end $$;
grant select on public.macro_explanations to authenticated, service_role;
drop policy if exists "macro_explanations own read" on public.macro_explanations;
create policy "macro_explanations own read" on public.macro_explanations for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- RPC 1: macro_put_manifest
-- Idempotent by manifest_hash (the TS side computes sha256Hex(canonicalJson(body))). The same hash with a
-- different body is a caller bug → payload_conflict.
create or replace function public.macro_put_manifest(p_kind text, p_body jsonb, p_manifest_hash text, p_cutoff timestamptz,
  p_method_version text, p_code_version text, p_catalog_version text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_body jsonb;
begin
  insert into public.macro_strategy_manifests (kind, body, manifest_hash, cutoff, method_version, code_version, catalog_version)
  values (p_kind, p_body, p_manifest_hash, p_cutoff, p_method_version, p_code_version, p_catalog_version)
  on conflict (manifest_hash) do nothing
  returning manifest_id into v_id;
  if v_id is not null then return v_id; end if;
  select manifest_id, body into v_id, v_body from public.macro_strategy_manifests where manifest_hash = p_manifest_hash;
  if v_body is distinct from p_body then raise exception 'payload_conflict'; end if;
  return v_id;
end $$;
revoke execute on function public.macro_put_manifest(text, jsonb, text, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.macro_put_manifest(text, jsonb, text, timestamptz, text, text, text) to service_role;

-- ---------------------------------------------------------------- RPC 2: macro_publish_review
-- Transaction-level advisory lock on (region, month); get-or-insert the immutable result by
-- (region, month, manifest_hash); then: pointer already on this result → replayed (whatever the expected
-- generation); generation is distinct from expected → stale; cutoff older than the current cutoff → stale; else advance
-- (an absent pointer is generation 0, so the first publish yields 1). Every call logs one attempt row.
-- stale is a return value, never an exception. A null expected generation → invalid_argument; p_cutoff must equal the
-- stored manifest's cutoff, otherwise cutoff_mismatch (the pointer's cutoff always is its frozen evidence's cutoff).
create or replace function public.macro_publish_review(p_region text, p_month text, p_expected_generation bigint, p_cutoff timestamptz,
  p_status text, p_manifest_id uuid, p_manifest_hash text, p_facts jsonb, p_method_version text, p_code_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result uuid; v_cur_result uuid; v_cur_cutoff timestamptz; v_gen bigint := 0; v_outcome text;
declare v_man_cutoff timestamptz;
begin
  if p_expected_generation is null then raise exception 'invalid_argument'; end if;
  perform pg_advisory_xact_lock(hashtextextended('macro_review:' || p_region || ':' || p_month, 0));
  select cutoff into v_man_cutoff from public.macro_strategy_manifests where manifest_id = p_manifest_id and manifest_hash = p_manifest_hash and kind = 'review';
  if not found then raise exception 'not_found'; end if;
  if v_man_cutoff is distinct from p_cutoff then raise exception 'cutoff_mismatch'; end if;
  insert into public.macro_review_results (region, month, status, manifest_id, manifest_hash, facts, method_version, code_version)
  values (p_region, p_month, p_status, p_manifest_id, p_manifest_hash, p_facts, p_method_version, p_code_version)
  on conflict (region, month, manifest_hash) do nothing
  returning result_id into v_result;
  if v_result is null then
    select result_id into v_result from public.macro_review_results where region = p_region and month = p_month and manifest_hash = p_manifest_hash;
  end if;
  select result_id, generation, cutoff into v_cur_result, v_gen, v_cur_cutoff from public.macro_review_current where region = p_region and month = p_month;
  v_gen := coalesce(v_gen, 0);
  if v_cur_result = v_result then
    v_outcome := 'replayed';
  elsif v_gen is distinct from p_expected_generation then
    v_outcome := 'stale';
  elsif v_cur_cutoff is not null and p_cutoff < v_cur_cutoff then
    v_outcome := 'stale';
  else
    v_gen := v_gen + 1;
    insert into public.macro_review_current (region, month, result_id, generation, cutoff, updated_at)
    values (p_region, p_month, v_result, v_gen, p_cutoff, now())
    on conflict (region, month) do update set result_id = excluded.result_id, generation = excluded.generation, cutoff = excluded.cutoff, updated_at = excluded.updated_at;
    v_outcome := 'advanced';
  end if;
  insert into public.macro_review_attempts (region, month, status, result_id)
  values (p_region, p_month, case v_outcome when 'advanced' then 'ok' else v_outcome end, v_result);
  return jsonb_build_object('result_id', v_result, 'generation', v_gen, 'outcome', v_outcome);
end $$;
revoke execute on function public.macro_publish_review(text, text, bigint, timestamptz, text, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.macro_publish_review(text, text, bigint, timestamptz, text, uuid, text, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------- RPC 3: macro_record_review_attempt
-- Failed attempts only (an exception in the compute or manifest stage).
create or replace function public.macro_record_review_attempt(p_region text, p_month text, p_status text, p_error jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status is distinct from 'failed' then raise exception 'invalid_status'; end if;
  insert into public.macro_review_attempts (region, month, status, error) values (p_region, p_month, p_status, p_error);
end $$;
revoke execute on function public.macro_record_review_attempt(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.macro_record_review_attempt(text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- projection helper (not callable by any API role)
create or replace function public.macro_explanation_projection(p_explanation_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('explanation_id', e.explanation_id, 'subject_kind', e.subject_kind, 'subject_id', e.subject_id, 'locale', e.locale,
    'manifest_id', e.manifest_id, 'state', e.state, 'rendered', e.rendered, 'failure_codes', to_jsonb(e.failure_codes), 'provider', e.provider,
    'model', e.model, 'prompt_version', e.prompt_version, 'validator_version', e.validator_version, 'created_at', e.created_at, 'finished_at', e.finished_at)
  from public.macro_explanations e where e.explanation_id = p_explanation_id
$$;
revoke execute on function public.macro_explanation_projection(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- RPC 4: macro_claim_explanation
-- Advisory lock on (user_id, request_id), then the existing run row is locked FOR UPDATE before its state is
-- read (finish, record_completion and expire lock the same row). Existing row: different payload_hash →
-- payload_conflict; running, claimed more than five minutes ago and without a recorded completion (raw_output not a
-- json object) → abandoned (projection failed, failure_codes {abandoned}); return outcome existing. New: generate explanation_id and usage_audit_key, insert the running run and projection,
-- return outcome claimed. Only a 'claimed' caller may bill or call the model.
create or replace function public.macro_claim_explanation(p_user_id uuid, p_request_id uuid, p_payload_hash text, p_subject_kind text,
  p_subject_id text, p_locale text, p_manifest_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_key text; v_hash text; v_state text; v_claimed timestamptz; v_raw jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('macro_explain:' || p_user_id::text || ':' || p_request_id::text, 0));
  select explanation_id, usage_audit_key, payload_hash, state, claimed_at, raw_output into v_id, v_key, v_hash, v_state, v_claimed, v_raw
  from public.macro_explanation_runs where user_id = p_user_id and request_id = p_request_id for update;
  if found then
    if v_hash <> p_payload_hash then raise exception 'payload_conflict'; end if;
    if v_state = 'running' and v_claimed < now() - interval '5 minutes' and jsonb_typeof(v_raw) is distinct from 'object' then
      update public.macro_explanation_runs set state = 'abandoned', finished_at = now() where explanation_id = v_id;
      update public.macro_explanations set state = 'failed', failure_codes = array['abandoned'], finished_at = now() where explanation_id = v_id and state = 'running';
    end if;
    return jsonb_build_object('outcome', 'existing', 'explanation_id', v_id, 'usage_audit_key', v_key, 'projection', public.macro_explanation_projection(v_id));
  end if;
  if not exists (select 1 from public.macro_strategy_manifests where manifest_id = p_manifest_id and kind = 'explain_facts') then
    raise exception 'not_found';
  end if;
  v_id := gen_random_uuid();
  v_key := v_id::text;   -- begin_usage_run / finalize_usage_run take p_idempotency_key uuid
  insert into public.macro_explanation_runs (explanation_id, user_id, request_id, payload_hash, subject_kind, subject_id, locale, manifest_id, state, usage_audit_key)
  values (v_id, p_user_id, p_request_id, p_payload_hash, p_subject_kind, p_subject_id, p_locale, p_manifest_id, 'running', v_key);
  insert into public.macro_explanations (explanation_id, user_id, subject_kind, subject_id, locale, manifest_id, state)
  values (v_id, p_user_id, p_subject_kind, p_subject_id, p_locale, p_manifest_id, 'running');
  return jsonb_build_object('outcome', 'claimed', 'explanation_id', v_id, 'usage_audit_key', v_key, 'projection', public.macro_explanation_projection(v_id));
end $$;
revoke execute on function public.macro_claim_explanation(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.macro_claim_explanation(uuid, uuid, text, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------- RPC 5: macro_record_completion
-- Called right after the provider returned (or threw, or beginUsageRun failed), before validation and finish: stores
-- the raw output and the exact finalizeUsageRun payload ({status, provider, model, tokens, cost, pricingVersion,
-- usdCnyMicros, usageEstimated, byo}) so accounting survives any later failure. Allowed on running and abandoned
-- rows only (the state is checked first: a terminal row is invalid_transition even when the stored values match); a
-- repeat with the same values is a no-op; a different payload or output once one is stored → invalid_transition.
create or replace function public.macro_record_completion(p_explanation_id uuid, p_raw_output jsonb, p_finalize_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_state text; v_raw jsonb; v_payload jsonb;
begin
  if p_finalize_payload is null then raise exception 'invalid_transition'; end if;
  select state, raw_output, finalize_payload into v_state, v_raw, v_payload from public.macro_explanation_runs where explanation_id = p_explanation_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_state not in ('running','abandoned') then raise exception 'invalid_transition'; end if;
  if v_payload is not null then
    if v_payload is distinct from p_finalize_payload or v_raw is distinct from p_raw_output then raise exception 'invalid_transition'; end if;
    return;
  end if;
  update public.macro_explanation_runs set raw_output = p_raw_output, finalize_payload = p_finalize_payload where explanation_id = p_explanation_id;
end $$;
revoke execute on function public.macro_record_completion(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.macro_record_completion(uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- RPC 6: macro_finish_explanation
-- running → accepted / rejected / failed (run row + projection). Same final state and same raw_output →
-- idempotent (returns the projection unchanged). Another final state, or the same state with a different
-- raw_output → invalid_transition. abandoned → only late_output and accounting are written; the
-- projection stays failed. A completion recorded by macro_record_completion is evidence: a running row with a
-- recorded finalize payload accepts only a finish whose raw_output equals the recorded one (null included), otherwise
-- invalid_transition and the recorded envelope is untouched. p_finalize_payload is stored in every non-error branch when the row has
-- none yet (macro_record_completion failed), never overwriting a recorded one, so recovery can still settle it.
create or replace function public.macro_finish_explanation(p_explanation_id uuid, p_state text, p_provider text, p_model text,
  p_prompt_version text, p_validator_version text, p_raw_output jsonb, p_validation jsonb, p_rendered jsonb, p_failure_codes text[], p_accounting jsonb,
  p_finalize_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_state text; v_raw jsonb; v_payload jsonb;
begin
  if p_state is null or p_state not in ('accepted','rejected','failed') then raise exception 'invalid_transition'; end if;
  select state, raw_output, finalize_payload into v_state, v_raw, v_payload from public.macro_explanation_runs where explanation_id = p_explanation_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_state = 'running' then
    if v_payload is not null and v_raw is distinct from p_raw_output then raise exception 'invalid_transition'; end if;
    update public.macro_explanation_runs set state = p_state, finished_at = now(), provider = p_provider, model = p_model,
      prompt_version = p_prompt_version, validator_version = p_validator_version, raw_output = p_raw_output, validation = p_validation, accounting = p_accounting,
      finalize_payload = coalesce(finalize_payload, p_finalize_payload)
    where explanation_id = p_explanation_id;
    update public.macro_explanations set state = p_state,
      rendered = case when p_state = 'accepted' then p_rendered else null end,
      failure_codes = case when p_state = 'accepted' then '{}'::text[] else coalesce(p_failure_codes, '{}'::text[]) end,
      provider = p_provider, model = p_model, prompt_version = p_prompt_version, validator_version = p_validator_version, finished_at = now()
    where explanation_id = p_explanation_id;
  elsif v_state = 'abandoned' then
    update public.macro_explanation_runs set accounting = p_accounting, finalize_payload = coalesce(finalize_payload, p_finalize_payload),
      late_output = jsonb_build_object('state', p_state, 'provider', p_provider, 'model', p_model, 'prompt_version', p_prompt_version,
        'validator_version', p_validator_version, 'raw_output', p_raw_output, 'validation', p_validation, 'rendered', p_rendered,
        'failure_codes', to_jsonb(coalesce(p_failure_codes, '{}'::text[])), 'received_at', now())
    where explanation_id = p_explanation_id;
  elsif v_state = p_state and v_raw is not distinct from p_raw_output then
    update public.macro_explanation_runs set finalize_payload = p_finalize_payload
    where explanation_id = p_explanation_id and finalize_payload is null and p_finalize_payload is not null;
  else
    raise exception 'invalid_transition';
  end if;
  return public.macro_explanation_projection(p_explanation_id);
end $$;
revoke execute on function public.macro_finish_explanation(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.macro_finish_explanation(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, text[], jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- RPC 7: macro_mark_finalized
-- After finalizeUsageRun(finalize_payload) succeeded: finalized = true (idempotent), in any state. A row without a
-- recorded finalize payload cannot be finalized (nothing was settled from it).
create or replace function public.macro_mark_finalized(p_explanation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_payload jsonb;
begin
  select finalize_payload into v_payload from public.macro_explanation_runs where explanation_id = p_explanation_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_payload is null then raise exception 'invalid_transition'; end if;
  update public.macro_explanation_runs set finalized = true where explanation_id = p_explanation_id;
end $$;
revoke execute on function public.macro_mark_finalized(uuid) from public, anon, authenticated;
grant execute on function public.macro_mark_finalized(uuid) to service_role;

-- ---------------------------------------------------------------- RPC 8: macro_expire_explanations
-- GET /explanations runs this (service role) before reading, so a reload resolves a run whose worker died: every
-- running row of the user claimed more than five minutes ago without a recorded completion (raw_output not a json
-- object) → abandoned, projection failed {abandoned}. Rows are locked in a stable order; returns the number expired.
create or replace function public.macro_expire_explanations(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n integer := 0;
begin
  for v_id in select explanation_id from public.macro_explanation_runs
    where user_id = p_user_id and state = 'running' and claimed_at < now() - interval '5 minutes'
      and jsonb_typeof(raw_output) is distinct from 'object'
    order by explanation_id for update
  loop
    update public.macro_explanation_runs set state = 'abandoned', finished_at = now() where explanation_id = v_id and state = 'running';
    if found then
      update public.macro_explanations set state = 'failed', failure_codes = array['abandoned'], finished_at = now() where explanation_id = v_id and state = 'running';
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.macro_expire_explanations(uuid) from public, anon, authenticated;
grant execute on function public.macro_expire_explanations(uuid) to service_role;
