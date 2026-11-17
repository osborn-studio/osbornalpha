-- Large canonical manifests travel as gzip bytes. Identity remains SHA-256 of canonical JSON.
-- No rewrite of existing JSONB rows, and no change to either existing manifest RPC.
alter table public.macro_strategy_manifests
  add column if not exists body_gz bytea,
  add column if not exists body_bytes integer;
alter table public.macro_strategy_manifests alter column body_gz set storage external;
alter table public.macro_strategy_manifests alter column body drop not null;
alter table public.macro_strategy_manifests drop constraint if exists macro_strategy_manifests_body;
alter table public.macro_strategy_manifests add constraint macro_strategy_manifests_body
  check (body is null or (jsonb_typeof(body) = 'object' and body->>'kind' = kind) is true);
alter table public.macro_strategy_manifests drop constraint if exists macro_strategy_manifests_encoding;
alter table public.macro_strategy_manifests add constraint macro_strategy_manifests_encoding check ((
  (body is not null and body_gz is null and body_bytes is null) or
  (body is null and body_gz is not null and body_bytes > 0 and body_bytes <= 134217728
    and octet_length(body_gz) between 20 and 16777216
    and substring(body_gz from 1 for 2) = decode('1f8b','hex'))
) is true);

create or replace function public.macro_put_manifest_gz(jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_keys constant text[] := array['p_kind','p_body_gz','p_body_bytes','p_manifest_hash',
    'p_cutoff','p_method_version','p_code_version','p_catalog_version'];
  v_gz bytea;
  v_bytes integer;
  v_id uuid;
  v_row public.macro_strategy_manifests%rowtype;
begin
  if jsonb_typeof($1) is distinct from 'object' or not ($1 ?& v_keys) then
    raise exception 'invalid_argument';
  end if;
  if ($1 - v_keys) <> '{}'::jsonb or jsonb_typeof($1->'p_body_gz') is distinct from 'string' then
    raise exception 'invalid_argument';
  end if;
  v_gz := decode($1->>'p_body_gz','base64');
  v_bytes := ($1->>'p_body_bytes')::integer;
  insert into public.macro_strategy_manifests(kind,body,body_gz,body_bytes,manifest_hash,cutoff,
    method_version,code_version,catalog_version)
  values ($1->>'p_kind',null,v_gz,v_bytes,$1->>'p_manifest_hash',($1->>'p_cutoff')::timestamptz,
    $1->>'p_method_version',$1->>'p_code_version',$1->>'p_catalog_version')
  on conflict (manifest_hash) do nothing returning manifest_id into v_id;
  if v_id is not null then
    return jsonb_build_object('manifest_id',v_id,'outcome','inserted');
  end if;
  select * into strict v_row from public.macro_strategy_manifests where manifest_hash = $1->>'p_manifest_hash';
  if v_row.body is null and v_row.body_gz = v_gz and v_row.body_bytes = v_bytes
    and v_row.kind = $1->>'p_kind' and v_row.cutoff = ($1->>'p_cutoff')::timestamptz
    and v_row.method_version = $1->>'p_method_version' and v_row.code_version = $1->>'p_code_version'
    and v_row.catalog_version = $1->>'p_catalog_version' then
    return jsonb_build_object('manifest_id',v_row.manifest_id,'outcome','replayed');
  end if;
  return jsonb_build_object('manifest_id',v_row.manifest_id,'outcome','compare');
end $$;
revoke execute on function public.macro_put_manifest_gz(jsonb) from public, anon, authenticated;
grant execute on function public.macro_put_manifest_gz(jsonb) to service_role;
notify pgrst, 'reload schema';
