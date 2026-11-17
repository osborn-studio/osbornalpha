-- supabase/migrations/20261210091000_topics_functions.sql
-- Topic research (spec §4.2–§4.9): core writes and their internal audit helper.
create or replace function public.topic_publish(p_topic_id uuid, p_expected_draft_hash text, p_snapshot_text text, p_evidence jsonb,
  p_summary_id uuid, p_receipt_id uuid, p_cutoff timestamptz, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.topics; d public.topic_drafts; r public.topic_disclosure_receipts; v_snap jsonb; v_no int; v_id uuid; v_bad int;
begin
  if p_actor is null then raise exception 'invalid_actor'; end if;
  select * into t from public.topics where topic_id = p_topic_id for update;
  if not found then raise exception 'not_found'; end if;
  if t.status = 'retired' then raise exception 'topic_retired'; end if;
  select * into d from public.topic_drafts where topic_id = p_topic_id for update;
  if d.draft_hash is distinct from p_expected_draft_hash then raise exception 'publish_blocked:draft_changed'; end if;
  select * into r from public.topic_disclosure_receipts where receipt_id = p_receipt_id;
  if not found or r.topic_id <> p_topic_id or not r.passed or r.draft_hash <> d.draft_hash then raise exception 'publish_blocked:disclosure_receipt'; end if;
  if position('"admin_only"' in p_snapshot_text) > 0 then raise exception 'publish_blocked:admin_projection'; end if;
  v_snap := p_snapshot_text::jsonb;
  select count(*) into v_bad from jsonb_array_elements(v_snap -> 'evidence') e
   where e -> 'resolved' ->> 'state' <> 'ok' and coalesce(jsonb_typeof(e -> 'resolved' -> 'display' -> 'fact'), 'null') <> 'null';
  if v_bad > 0 then raise exception 'publish_blocked:restricted_value'; end if;
  if jsonb_array_length(p_evidence) <> jsonb_array_length(v_snap -> 'evidence') then raise exception 'publish_blocked:evidence_mismatch'; end if;
  select count(*) into v_bad
   from jsonb_array_elements(v_snap -> 'evidence') with ordinality as s(e, i)
   join jsonb_array_elements(p_evidence) with ordinality as p(e, i) using (i)
   where s.e ->> 'ref_hash' is distinct from p.e ->> 'ref_hash' or s.e ->> 'ordinal' is distinct from p.e ->> 'ordinal'
      or s.e -> 'resolved' ->> 'state' is distinct from p.e ->> 'state';
  if v_bad > 0 then raise exception 'publish_blocked:evidence_mismatch'; end if;
  if exists (select 1 from jsonb_array_elements(p_evidence) e where (e ->> 'as_of')::timestamptz > p_cutoff) then raise exception 'publish_blocked:as_of_after_cutoff'; end if;
  if p_summary_id is not null then
    if not (select summary_public_enabled from public.topic_settings where id = 1) then raise exception 'publish_blocked:summary_provider_unconfirmed'; end if;
    if not exists (select 1 from public.topic_summaries where summary_id = p_summary_id and topic_id = p_topic_id and status = 'approved' and draft_hash = d.draft_hash) then
      raise exception 'publish_blocked:summary_mismatch';
    end if;
  end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.topic_versions where topic_id = p_topic_id;
  insert into public.topic_versions (topic_id, version_no, contract_version, cutoff, snapshot, snapshot_text, snapshot_hash, summary_id,
    disclosure_receipt_id, promotion_id, published_by, supersedes_version_id)
  values (p_topic_id, v_no, 'evidence-ref/1', p_cutoff, v_snap, p_snapshot_text, encode(sha256(convert_to(p_snapshot_text, 'UTF8')), 'hex'), p_summary_id,
    p_receipt_id, (select promotion_id from public.topic_promotions where topic_id = p_topic_id order by created_at limit 1), p_actor, t.current_version_id)
  returning version_id into v_id;
  insert into public.topic_version_evidence (version_id, ordinal, kind, ref, ref_hash, as_of, state, digest, section_key)
  select v_id, (e ->> 'ordinal')::int, e ->> 'kind', e -> 'ref', e ->> 'ref_hash', (e ->> 'as_of')::timestamptz, e ->> 'state', e ->> 'digest', e ->> 'section_key'
  from jsonb_array_elements(p_evidence) e;
  update public.topics set current_version_id = v_id, status = 'published' where topic_id = p_topic_id;
  perform public.topic_audit(p_topic_id, p_actor, 'publish', jsonb_build_object('version_no', v_no, 'evidence', jsonb_array_length(p_evidence), 'receipt_id', p_receipt_id));
  return jsonb_build_object('version_id', v_id, 'version_no', v_no);
end $$;

create or replace function public.topic_unpublish(p_topic_id uuid, p_reason text, p_note text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.topics; v_prev public.topic_versions; v_no int;
begin
  if p_actor is null then raise exception 'invalid_actor'; end if;
  if p_note is not null and (length(p_note) > 200 or p_note ~* '[0-9a-f]{8}-[0-9a-f]{4}-' or p_note ~ '[0-9a-f]{64}') then raise exception 'invalid_note'; end if;
  select * into t from public.topics where topic_id = p_topic_id for update;
  if not found then raise exception 'not_found'; end if;
  if t.current_version_id is null then raise exception 'not_published'; end if;
  select version_no into v_no from public.topic_versions where version_id = t.current_version_id;
  update public.topic_versions set unpublished_at = now(), unpublish_reason = p_reason where version_id = t.current_version_id;
  select * into v_prev from public.topic_versions where topic_id = p_topic_id and unpublished_at is null order by version_no desc limit 1;
  if found then
    update public.topics set current_version_id = v_prev.version_id where topic_id = p_topic_id;
  elsif t.status = 'retired' then
    update public.topics set current_version_id = null where topic_id = p_topic_id;
  else
    update public.topics set current_version_id = null, status = 'unpublished' where topic_id = p_topic_id;
  end if;
  perform public.topic_audit(p_topic_id, p_actor, 'unpublish', jsonb_build_object('version_no', v_no, 'reason', p_reason, 'note', p_note));
  return jsonb_build_object('current_version_no', v_prev.version_no);
end $$;

create or replace function public.topic_audit(p_topic uuid, p_actor uuid, p_action text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 insert into public.topic_audit_log(topic_id, actor, action, detail) values (p_topic, p_actor, p_action, p_detail);
end $$;

create or replace function public.topic_create(p_slug text, p_category text, p_body_text text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_hash text;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 begin
  insert into public.topics(topic_slug, category, created_by) values (p_slug, p_category, p_actor) returning topic_id into v_id;
 exception when unique_violation then raise exception 'slug_taken';
 end;
 v_hash := encode(sha256(convert_to(p_body_text, 'UTF8')), 'hex');
 insert into public.topic_drafts(topic_id, revision, body, body_text, draft_hash, updated_by)
 values (v_id, 1, p_body_text::jsonb, p_body_text, v_hash, p_actor);
 perform public.topic_audit(v_id, p_actor, 'create', jsonb_build_object('revision', 1, 'draft_hash', v_hash));
 return jsonb_build_object('topic_id', v_id, 'revision', 1, 'draft_hash', v_hash);
end $$;

create or replace function public.topic_save_draft(p_topic_id uuid, p_expected_revision int, p_body_text text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.topics; d public.topic_drafts; v_hash text;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 select * into t from public.topics where topic_id = p_topic_id for update;
 if not found then raise exception 'not_found'; end if;
 if t.status = 'retired' then raise exception 'topic_retired'; end if;
 select * into d from public.topic_drafts where topic_id = p_topic_id for update;
 if not found then raise exception 'not_found'; end if;
 if d.revision is distinct from p_expected_revision then raise exception 'revision_conflict'; end if;
 v_hash := encode(sha256(convert_to(p_body_text, 'UTF8')), 'hex');
 update public.topic_drafts set revision = d.revision + 1, body = p_body_text::jsonb, body_text = p_body_text,
  draft_hash = v_hash, updated_by = p_actor, updated_at = now() where topic_id = p_topic_id;
 perform public.topic_audit(p_topic_id, p_actor, 'draft_save', jsonb_build_object('revision', d.revision + 1, 'draft_hash', v_hash));
 return jsonb_build_object('revision', d.revision + 1, 'draft_hash', v_hash);
end $$;

create or replace function public.topic_record_disclosure(p_topic_id uuid, p_draft_hash text, p_checks jsonb, p_passed boolean, p_code_version text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_blocked jsonb;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 insert into public.topic_disclosure_receipts(topic_id, draft_hash, checks, passed, code_version, actor)
 values (p_topic_id, p_draft_hash, p_checks, p_passed, p_code_version, p_actor) returning receipt_id into v_id;
 select coalesce(jsonb_agg(code order by c.i, codes.i), '[]'::jsonb) into v_blocked
 from jsonb_array_elements(p_checks) with ordinality c(check_item, i)
 cross join lateral jsonb_array_elements(c.check_item -> 'codes') with ordinality codes(code, i)
 where c.check_item ->> 'result' = 'block';
 perform public.topic_audit(p_topic_id, p_actor, 'disclosure_check', jsonb_build_object('receipt_id', v_id, 'passed', p_passed, 'blocked', v_blocked));
 return v_id;
end $$;

create or replace function public.topic_retire(p_topic_id uuid, p_reason text, p_note text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.topics;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 if p_note is not null and (length(p_note) > 200 or p_note ~* '[0-9a-f]{8}-[0-9a-f]{4}-' or p_note ~ '[0-9a-f]{64}') then raise exception 'invalid_note'; end if;
 select * into t from public.topics where topic_id = p_topic_id for update;
 if not found then raise exception 'not_found'; end if;
 if t.status = 'retired' then raise exception 'topic_retired'; end if;
 update public.topics set status = 'retired', retired_at = now(), retired_reason = p_reason where topic_id = p_topic_id;
 perform public.topic_audit(p_topic_id, p_actor, 'retire', jsonb_build_object('reason', p_reason, 'note', p_note));
end $$;

create or replace function public.topic_set_licence(p_licence_id uuid, p_fields jsonb, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 if p_licence_id is null then
  insert into public.topic_source_licences(source_title, publisher, source_url, terms_url, terms_read_at, terms_clause, permits, status, decided_by, note)
  values (p_fields ->> 'source_title', p_fields ->> 'publisher', p_fields ->> 'source_url', p_fields ->> 'terms_url',
   (p_fields ->> 'terms_read_at')::date, p_fields ->> 'terms_clause', p_fields -> 'permits', p_fields ->> 'status', p_actor, p_fields ->> 'note')
  returning licence_id into v_id;
 else
  update public.topic_source_licences set source_title = p_fields ->> 'source_title', publisher = p_fields ->> 'publisher',
   source_url = p_fields ->> 'source_url', terms_url = p_fields ->> 'terms_url', terms_read_at = (p_fields ->> 'terms_read_at')::date,
   terms_clause = p_fields ->> 'terms_clause', permits = p_fields -> 'permits', status = p_fields ->> 'status',
   decided_by = p_actor, decided_at = now(), note = p_fields ->> 'note'
  where licence_id = p_licence_id returning licence_id into v_id;
  if not found then raise exception 'not_found'; end if;
 end if;
 perform public.topic_audit(null, p_actor, 'licence_change', jsonb_build_object('licence_id', v_id, 'status', p_fields ->> 'status'));
 return v_id;
end $$;

create or replace function public.topic_set_public_enabled(p_public_enabled boolean, p_summary_public_enabled boolean,
 p_summary_provider_note text, p_licence_confirmations jsonb, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_settings public.topic_settings; v_key text;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 select * into v_settings from public.topic_settings where id = 1 for update;
 if p_public_enabled then
  for v_key in
   select distinct e -> 'resolved' -> 'drawer' ->> 'attribution_key'
   from public.topics t join public.topic_versions v on v.version_id = t.current_version_id
   cross join lateral jsonb_array_elements(v.snapshot -> 'evidence') e
   where t.status = 'published' and e -> 'resolved' ->> 'state' = 'ok'
  loop
   if v_key is null or coalesce(btrim(p_licence_confirmations -> v_key ->> 'terms_url'), '') = ''
    or coalesce(btrim(p_licence_confirmations -> v_key ->> 'confirmed_on'), '') = '' then
    raise exception 'licence_confirmation_missing';
   end if;
  end loop;
 end if;
 update public.topic_settings set public_enabled = p_public_enabled, summary_public_enabled = p_summary_public_enabled,
  summary_provider_note = p_summary_provider_note, updated_by = p_actor, updated_at = now() where id = 1 returning * into v_settings;
 perform public.topic_audit(null, p_actor, 'settings_change', jsonb_build_object('public_enabled', p_public_enabled,
  'summary_public_enabled', p_summary_public_enabled, 'summary_provider_note', p_summary_provider_note, 'licence_confirmations', p_licence_confirmations));
 return to_jsonb(v_settings);
end $$;

create or replace function public.topic_record_promotion(p_topic_id uuid, p_source_id uuid, p_source_content_hash text, p_copied jsonb, p_stripped jsonb, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 insert into public.topic_promotions(topic_id, source_kind, source_id, source_content_hash, copied, stripped, actor)
 values (p_topic_id, 'research_thesis', p_source_id, p_source_content_hash, p_copied, p_stripped, p_actor) returning promotion_id into v_id;
 perform public.topic_audit(p_topic_id, p_actor, 'promote', jsonb_build_object('promotion_id', v_id));
 return v_id;
end $$;

create or replace function public.topic_upsert_drift(p_rows jsonb, p_checked_at timestamptz, p_complete boolean, p_cursor jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
 insert into public.topic_evidence_drift(version_id, ordinal, checked_at, drift, current_identity)
 select (e ->> 'version_id')::uuid, (e ->> 'ordinal')::integer, p_checked_at, e ->> 'drift', nullif(e -> 'current_identity', 'null'::jsonb)
 from jsonb_array_elements(p_rows) e
 on conflict (version_id, ordinal) do update set checked_at = excluded.checked_at, drift = excluded.drift, current_identity = excluded.current_identity;
 get diagnostics v_count = row_count;
 if p_complete then
  update public.topic_settings set drift_checked_at = p_checked_at, drift_cursor = null where id = 1;
 else
  update public.topic_settings set drift_cursor = p_cursor where id = 1;
 end if;
 return v_count;
end $$;

create or replace function public.topic_record_event(p_topic_id uuid, p_actor uuid, p_action text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
 if p_actor is null then raise exception 'invalid_actor'; end if;
 if p_action is null or p_action not in ('preview', 'replay_verify') then raise exception 'invalid_action'; end if;
 perform public.topic_audit(p_topic_id, p_actor, p_action, p_detail);
end $$;

-- Internal audit is accessible only through the definer functions above.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'topic\_%' and p.prorettype <> 'trigger'::regtype loop
  execute format('revoke execute on function %s from public, anon, authenticated, service_role', f.signature);
  if f.proname <> 'topic_audit' then
   execute format('grant execute on function %s to service_role', f.signature);
  end if;
 end loop;
end $$;
