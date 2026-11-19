-- Topic summary lifecycle. The draft lock serializes approval with edits and replacement.
begin;

create or replace function public.topic_claim_summary(p_actor uuid, p_request_id uuid, p_payload_hash text,
 p_topic_id uuid, p_draft_hash text, p_locale text, p_manifest jsonb, p_prompt_version text, p_validator_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.topic_summary_runs; v_id uuid; v_hash text;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
 select * into r from public.topic_summary_runs where actor = p_actor and request_id = p_request_id for share;
 if found then
  if r.payload_hash is distinct from p_payload_hash then raise exception 'payload_conflict'; end if;
  return to_jsonb(r) || jsonb_build_object('replayed', true, 'summary',
   (select to_jsonb(s) from public.topic_summaries s where run_id = r.run_id));
 end if;
 select draft_hash into v_hash from public.topic_drafts where topic_id = p_topic_id for share;
 if not found or v_hash is distinct from p_draft_hash then raise exception 'draft_changed'; end if;
 if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' or p_locale is null or p_locale not in ('zh','en')
  then raise exception 'invalid_parameter:summary'; end if;
 v_id := gen_random_uuid();
 insert into public.topic_summary_runs(run_id, usage_audit_key, actor, request_id, payload_hash, topic_id, draft_hash,
  locale, manifest, prompt_version, validator_version, state)
 values (v_id, v_id::text, p_actor, p_request_id, p_payload_hash, p_topic_id, p_draft_hash,
  p_locale, p_manifest, p_prompt_version, p_validator_version, 'running') returning * into r;
 perform public.topic_audit(p_topic_id, p_actor, 'summary_run', jsonb_build_object('run_id', v_id, 'state', r.state));
 return to_jsonb(r) || jsonb_build_object('replayed', false, 'summary', null);
end $$;

create or replace function public.topic_record_summary_completion(p_run_id uuid, p_raw_output jsonb, p_finalize_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r public.topic_summary_runs;
begin
 select * into r from public.topic_summary_runs where run_id = p_run_id for update;
 if not found or r.state <> 'running' then raise exception 'run_not_running'; end if;
 if nullif(p_finalize_payload, 'null'::jsonb) is null then raise exception 'invalid_transition'; end if;
 if r.finalize_payload is not null then
  if r.raw_output is distinct from p_raw_output or r.finalize_payload is distinct from p_finalize_payload then raise exception 'invalid_transition'; end if;
  return;
 end if;
 update public.topic_summary_runs set raw_output = p_raw_output, finalize_payload = p_finalize_payload where run_id = p_run_id;
 perform public.topic_audit(r.topic_id, r.actor, 'summary_run', jsonb_build_object('run_id', p_run_id, 'step', 'completion'));
end $$;

create or replace function public.topic_finish_summary(p_run_id uuid, p_state text, p_provider text, p_model text,
 p_raw_output jsonb, p_validation jsonb, p_rendered jsonb, p_finalize_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.topic_summary_runs; s public.topic_summaries;
begin
 select * into r from public.topic_summary_runs where run_id = p_run_id for update;
 if not found then raise exception 'not_found'; end if;
 if nullif(p_finalize_payload, 'null'::jsonb) is null or (r.finalize_payload is not null and
  (r.raw_output is distinct from p_raw_output or r.finalize_payload is distinct from p_finalize_payload)) then raise exception 'invalid_transition'; end if;
 if r.state = 'running' then
  if p_state is null or p_state not in ('accepted','rejected','failed') then raise exception 'invalid_state'; end if;
  if r.validator_version <> p_validation->>'validator_version' or r.validator_version <> p_rendered->>'validator_version'
   or r.validator_version <> p_raw_output->>'validator_version' or r.validator_version <> r.raw_output->>'validator_version' then
   p_state := 'failed';
   p_validation := jsonb_build_object('code', 'validator_version_changed', 'failure_codes', jsonb_build_array('validator_version_changed'));
  end if;
  if p_state = 'accepted' and nullif(p_rendered, 'null'::jsonb) is null then raise exception 'rendered_required'; end if;
  update public.topic_summary_runs set state = p_state, provider = p_provider, model = p_model, raw_output = p_raw_output,
   validation = p_validation, finalize_payload = p_finalize_payload, finished_at = now() where run_id = p_run_id returning * into r;
  if p_state = 'accepted' then
   insert into public.topic_summaries(run_id, topic_id, draft_hash, locale, rendered)
   values (r.run_id, r.topic_id, r.draft_hash, r.locale, p_rendered) returning * into s;
  end if;
  perform public.topic_audit(r.topic_id, r.actor, 'summary_run', jsonb_build_object('run_id', p_run_id, 'state', r.state));
 elsif r.state = 'abandoned' and r.finalize_payload is null then
  -- A late completion still needs a durable settlement payload.
  update public.topic_summary_runs set raw_output = p_raw_output, finalize_payload = p_finalize_payload, provider = p_provider,
   model = p_model where run_id = p_run_id returning * into r;
  perform public.topic_audit(r.topic_id, r.actor, 'summary_run', jsonb_build_object('run_id', p_run_id, 'step', 'late_completion'));
 else
  select * into s from public.topic_summaries where run_id = p_run_id;
 end if;
 return to_jsonb(r) || jsonb_build_object('summary', case when s.summary_id is not null then to_jsonb(s) end);
end $$;

create or replace function public.topic_mark_summary_finalized(p_run_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.topic_summary_runs;
begin
 select * into r from public.topic_summary_runs where run_id = p_run_id for update;
 if not found then raise exception 'not_found'; end if;
 if r.finalize_payload is null then raise exception 'invalid_transition'; end if;
 if r.finalized then return; end if;
 update public.topic_summary_runs set finalized = true where run_id = p_run_id;
 perform public.topic_audit(r.topic_id, r.actor, 'summary_run', jsonb_build_object('run_id', p_run_id, 'step', 'finalized'));
end $$;

create or replace function public.topic_expire_summaries(p_actor uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_count integer := 0;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 for r in update public.topic_summary_runs set state = 'abandoned', finished_at = now()
  where state = 'running' and claimed_at < now() - interval '10 minutes' returning run_id, topic_id loop
  perform public.topic_audit(r.topic_id, p_actor, 'summary_run', jsonb_build_object('run_id', r.run_id, 'state', 'abandoned'));
  v_count := v_count + 1;
 end loop;
 return v_count;
end $$;

create or replace function public.topic_approve_summary(p_summary_id uuid, p_decision text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.topic_summaries; v_hash text;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 if p_decision is null or p_decision not in ('approve','discard') then raise exception 'invalid_decision'; end if;
 select d.draft_hash into v_hash from public.topic_drafts d join public.topic_summaries t on d.topic_id = t.topic_id
 where t.summary_id = p_summary_id for update of d;
 select * into s from public.topic_summaries where summary_id = p_summary_id for update;
 if not found then raise exception 'not_found'; end if;
 if p_decision = 'approve' then
  if v_hash is distinct from s.draft_hash or not exists (select 1 from public.topic_summary_runs where run_id = s.run_id and state = 'accepted')
   then raise exception 'summary_mismatch'; end if;
  update public.topic_summaries set status = 'discarded', approved_by = null, approved_at = null
  where topic_id = s.topic_id and draft_hash = s.draft_hash and locale = s.locale and status = 'approved' and summary_id <> p_summary_id;
  update public.topic_summaries set status = 'approved', approved_by = p_actor, approved_at = now() where summary_id = p_summary_id;
 else
  update public.topic_summaries set status = 'discarded', approved_by = null, approved_at = null where summary_id = p_summary_id;
 end if;
 perform public.topic_audit(s.topic_id, p_actor, 'summary_approve', jsonb_build_object('summary_id', p_summary_id, 'decision', p_decision));
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('topic_claim_summary','topic_record_summary_completion','topic_finish_summary',
   'topic_mark_summary_finalized','topic_expire_summaries','topic_approve_summary') loop
  execute format('revoke execute on function %s from public, anon, authenticated, service_role', f.signature);
  execute format('grant execute on function %s to service_role', f.signature);
 end loop;
end $$;
commit;
