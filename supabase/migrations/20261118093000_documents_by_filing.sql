-- Exact filing binding under the caller's RLS, with the same as-of version choice as read_documents.
-- A hidden private row is indistinguishable from a missing row to anon.
create or replace function public.read_documents_by_filing(
 p_filing uuid, p_issuer uuid, p_source text, p_source_ref text, p_as_of date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_rows jsonb;
begin
 if p_filing is null or p_issuer is null or p_source is null or p_source_ref is null or p_as_of is null then
  raise exception 'invalid_input: filing binding' using errcode = '22023';
 end if;
 with visible as (
  select d.*, row_number() over (partition by d.source,d.source_ref order by d.source_version desc) rn
  from public.disclosure_documents d
  where d.issuer_id=p_issuer and d.available_date<=p_as_of
 ), picked as (
  select v.* from visible v where v.rn=1 and v.permission='public' and
   ((p_source='tushare' and v.source='cninfo' and v.filing_source_ref=p_source_ref)
    or (p_source='edgar' and v.source='edgar' and v.filing_source_ref=p_source_ref)
    or (p_source='hkex' and v.source='hkexnews' and exists
      (select 1 from public.filing_documents fd where fd.filing_id=p_filing and fd.document_id=v.document_id)))
  order by v.available_at desc,v.document_id desc limit 2
 ) select coalesce(jsonb_agg(to_jsonb(p)-'rn' order by p.available_at desc,p.document_id desc),'[]'::jsonb)
 into v_rows from picked p;
 return jsonb_build_object('rows',v_rows);
end $$;
revoke execute on function public.read_documents_by_filing(uuid,uuid,text,text,date) from public;
grant execute on function public.read_documents_by_filing(uuid,uuid,text,text,date) to anon,authenticated,service_role;
