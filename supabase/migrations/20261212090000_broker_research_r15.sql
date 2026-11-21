-- A retraction and its access record must commit together.
create or replace function public.broker_report_unpublish_logged(p_report_id uuid, p_by uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.broker_report_unpublish(p_report_id, p_by, p_reason);
  insert into public.broker_report_access_log(document_id, user_id, action, detail)
    select document_id, p_by, 'unpublish', jsonb_build_object('report_id', p_report_id, 'reason', p_reason)
    from public.broker_research_reports where report_id = p_report_id;
end $$;
revoke execute on function public.broker_report_unpublish_logged(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.broker_report_unpublish_logged(uuid, uuid, text) to service_role;

-- Serialize approvals on the parent before touching siblings.
create or replace function public.broker_summary_approve(p_summary_id uuid, p_by uuid, p_check jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.broker_report_summaries;
begin
  perform 1 from public.broker_research_reports where report_id =
    (select report_id from public.broker_report_summaries where summary_id = p_summary_id) for update;
  select * into s from public.broker_report_summaries where summary_id = p_summary_id for update;
  if not found then raise exception 'summary_not_found' using errcode = 'P0002'; end if;
  update public.broker_report_summaries set status = 'draft', approved_by = null
    where report_id = s.report_id and lang = s.lang and summary_id <> p_summary_id and status = 'approved';
  update public.broker_report_summaries set status = 'approved', disclosure_check = p_check, approved_by = p_by where summary_id = p_summary_id;
end $$;
revoke execute on function public.broker_summary_approve(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.broker_summary_approve(uuid, uuid, jsonb) to service_role;

-- Keep draft edits, analyst evidence and materialization in one transaction.
create or replace function public.broker_report_bind(p_report_id uuid, p_patch jsonb, p_analyst jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.broker_research_reports;
begin
  select * into r from public.broker_research_reports where report_id = p_report_id for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'invalid_payload:patch'; end if;
  if p_patch - array['institution_id','scope','report_type','primary_target_key','supersedes_report_id','title_public','title_public_by'] <> '{}'::jsonb then
    raise exception 'invalid_payload:patch';
  end if;
  if p_patch <> '{}'::jsonb then
    r := jsonb_populate_record(r, p_patch);
    update public.broker_research_reports set institution_id = r.institution_id, scope = r.scope, report_type = r.report_type,
      primary_target_key = r.primary_target_key, supersedes_report_id = r.supersedes_report_id, title_public = r.title_public,
      title_public_by = r.title_public_by where report_id = p_report_id;
  end if;
  if p_analyst is not null and p_analyst <> 'null'::jsonb then
    insert into public.broker_report_analysts(report_id, analyst_id, role, field_id)
      values (p_report_id, (p_analyst->>'analyst_id')::uuid, p_analyst->>'role', (p_analyst->>'field_id')::uuid)
      on conflict (report_id, analyst_id) do update set role = excluded.role, field_id = excluded.field_id;
  end if;
  return public.broker_report_materialize(p_report_id);
end $$;
revoke execute on function public.broker_report_bind(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.broker_report_bind(uuid, jsonb, jsonb) to service_role;

-- Verify the frozen JSON with the publisher's serialization.
create or replace function public.broker_publication_snapshot_ok(p_publication uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.broker_sha256(snapshot::text) = snapshot_hash from public.broker_report_publications where publication_id = p_publication;
$$;
revoke execute on function public.broker_publication_snapshot_ok(uuid) from public, anon, authenticated;
grant execute on function public.broker_publication_snapshot_ok(uuid) to service_role;
