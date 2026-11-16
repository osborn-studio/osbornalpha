-- Public filing visibility mirrors company_read_snapshot: published mapping_gen and as-of date.
-- Exact filing binding is applied before read_documents' (source, source_ref) version choice.
-- The invoker's RLS makes hidden documents indistinguishable from absent documents.
create or replace function public.read_documents_by_filing(p_filing uuid, p_as_of date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_filing public.filings%rowtype; v_source text; v_rows jsonb;
begin
 if p_filing is null or p_as_of is null then
  raise exception 'invalid_input: filing/as_of' using errcode = '22023';
 end if;
 select * into v_filing from public.filings g
 where g.filing_id=p_filing and g.mapping_gen>0 and g.available_date<=p_as_of;
 if not found then return jsonb_build_object('filing_found',false,'rows','[]'::jsonb); end if;
 v_source := case v_filing.source
  when 'edgar' then 'edgar'
  when 'tushare' then 'cninfo'
  when 'hkex' then 'hkexnews'
  else null end;
 if v_source is null then raise exception 'unsupported_filing_source: %',v_filing.source using errcode='22023'; end if;
 with bound as (
  select d.* from public.disclosure_documents d
  where d.issuer_id=v_filing.issuer_id and d.source=v_source and d.available_date<=p_as_of
   and (case when v_filing.source='hkex' then exists
     (select 1 from public.filing_documents fd where fd.filing_id=v_filing.filing_id and fd.document_id=d.document_id)
    else d.filing_source_ref=v_filing.source_ref end)
 ), versioned as (
  select b.*,row_number() over (partition by b.source,b.source_ref order by b.source_version desc) rn from bound b
 ), picked as (
  select v.* from versioned v where v.rn=1 and v.permission='public'
  order by v.available_at desc,v.document_id desc limit 2
 ) select coalesce(jsonb_agg(to_jsonb(p)-'rn' order by p.available_at desc,p.document_id desc),'[]'::jsonb)
 into v_rows from picked p;
 return jsonb_build_object('filing_found',true,'rows',v_rows);
end $$;
revoke execute on function public.read_documents_by_filing(uuid,date) from public;
grant execute on function public.read_documents_by_filing(uuid,date) to anon,authenticated,service_role;
