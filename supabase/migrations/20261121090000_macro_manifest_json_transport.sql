-- PostgREST passes a single unnamed JSONB argument directly, avoiding json_to_record's
-- materialized large argument tuple. Preserve the original RPC and all its checks.
-- PL/pgSQL prevents SQL-function inlining from duplicating payload parsing/extraction.
create or replace function public.macro_put_manifest_json(jsonb)
returns uuid language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_keys constant text[] := array[
  'p_kind','p_body','p_manifest_hash','p_cutoff','p_method_version','p_code_version','p_catalog_version'
];
begin
  if jsonb_typeof($1) is distinct from 'object' or not ($1 ?& v_keys) then
    raise exception 'invalid_argument';
  end if;
  -- Named PostgREST dispatch rejects unknown parameters; raw JSON must do so too.
  if ($1 - v_keys) <> '{}'::jsonb then
    raise exception 'invalid_argument';
  end if;
  return public.macro_put_manifest(
    $1->>'p_kind', nullif($1->'p_body', 'null'::jsonb), $1->>'p_manifest_hash',
    ($1->>'p_cutoff')::timestamptz, $1->>'p_method_version', $1->>'p_code_version', $1->>'p_catalog_version'
  );
end $$;
revoke execute on function public.macro_put_manifest_json(jsonb) from public, anon, authenticated;
grant execute on function public.macro_put_manifest_json(jsonb) to service_role;
notify pgrst, 'reload schema';
