-- WP-D: BIS evidence and an explicit, auditable methodology retirement RPC.
do $$
declare
  v_names text[];
  v_path text;
  v_ok boolean;
begin
  select pg_catalog.array_agg(c.conname) into v_names
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.macro_evidence_objects'::pg_catalog.regclass
    and c.contype = 'c' and c.conname <> 'macro_evidence_path'
    and pg_catalog.pg_get_constraintdef(c.oid) ~ '(^|[^a-z_])adapter([^a-z_]|$)';
  if coalesce(pg_catalog.cardinality(v_names), 0) <> 1 then
    raise exception 'expected exactly one macro evidence adapter check';
  end if;
  execute pg_catalog.format('alter table public.macro_evidence_objects drop constraint %I', v_names[1]);
  alter table public.macro_evidence_objects add constraint macro_evidence_objects_adapter_check
    check (adapter in ('fred_csv','akshare','bis_sdmx_csv'));

  -- Evaluate the existing path predicate against a BIS row; do not replace its protection.
  select pg_catalog.pg_get_expr(c.conbin,c.conrelid) into v_path
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.macro_evidence_objects'::pg_catalog.regclass and c.conname = 'macro_evidence_path' and c.contype = 'c';
  if v_path is null then raise exception 'macro_evidence_path missing'; end if;
  execute 'select ' || v_path || ' from (select ''bis_sdmx_csv''::text adapter, pg_catalog.repeat(''a'',64) sha256, ''bis_sdmx_csv/'' || pg_catalog.repeat(''a'',64) || ''.csv'' object_path) s' into v_ok;
  if v_ok is distinct from true then raise exception 'macro_evidence_path does not admit BIS CSV'; end if;
end $$;

create or replace function public.retire_methodology(p_methodology_id text, p_version text, p_actor text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.judgment_methodologies;
  v_seq integer;
begin
  if p_reason is null or pg_catalog.btrim(p_reason) = '' then raise exception 'invalid_parameter: reason' using errcode = '22023'; end if;
  select m.* into v_old from public.judgment_methodologies m
  where m.methodology_id = p_methodology_id and m.version = p_version for update;
  if not found then raise exception 'methodology_unavailable' using errcode = 'P0001'; end if;
  if v_old.status = 'retired' then return pg_catalog.jsonb_build_object('changed',false); end if;
  select coalesce(pg_catalog.max(e.seq),0) + 1 into v_seq from public.judgment_methodology_events e
  where e.methodology_id = p_methodology_id and e.version = p_version;
  update public.judgment_methodologies m set status = 'retired', synced_at = pg_catalog.now()
  where m.methodology_id = p_methodology_id and m.version = p_version;
  insert into public.judgment_methodology_events (event_id,methodology_id,version,seq,event,status,publishable,formula_hash,code_version,actor,reason,occurred_at)
  values (pg_catalog.gen_random_uuid(),p_methodology_id,p_version,v_seq,'status_changed','retired',v_old.publishable,v_old.formula_hash,v_old.code_version,p_actor,p_reason,pg_catalog.now());
  return pg_catalog.jsonb_build_object('changed',true,'seq',v_seq);
end $$;
revoke all on function public.retire_methodology(text,text,text,text) from public, anon, authenticated;
grant execute on function public.retire_methodology(text,text,text,text) to service_role;
