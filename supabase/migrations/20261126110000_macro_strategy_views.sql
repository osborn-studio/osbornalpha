-- Immutable, service-only fact materializations. Identity is the existing schema-namespaced memo identity.
create table if not exists public.macro_strategy_views (
  view_key text primary key check (view_key ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('transmission','policy_response','cycle_table')),
  identity jsonb not null check (jsonb_typeof(identity) = 'object'),
  manifest_id uuid not null references public.macro_strategy_manifests(manifest_id),
  view_json text not null,
  view_sha256 text not null check (view_sha256 ~ '^[0-9a-f]{64}$'),
  code_version text not null check (length(code_version) between 1 and 128),
  created_at timestamptz not null default now()
);
alter table public.macro_strategy_views enable row level security;
revoke all on public.macro_strategy_views from public, anon, authenticated, service_role;
grant select on public.macro_strategy_views to service_role;
drop policy if exists "macro_strategy_views service read" on public.macro_strategy_views;
create policy "macro_strategy_views service read" on public.macro_strategy_views for select to service_role using (true);

create or replace function public.macro_put_strategy_view(jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a alias for $1;
  v_hash text;
  v_inserted text;
  keys constant text[] := array['p_view_key','p_kind','p_identity','p_manifest_id','p_view_json','p_view_sha256','p_code_version'];
begin
  if jsonb_typeof(a) is distinct from 'object' then raise exception 'invalid_argument'; end if;
  if not (a ?& keys) or (a - keys) <> '{}'::jsonb then raise exception 'invalid_argument'; end if;
  if jsonb_typeof(a->'p_view_key') is distinct from 'string' or (a->>'p_view_key') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(a->'p_kind') is distinct from 'string' or (a->>'p_kind') not in ('transmission','policy_response','cycle_table')
    or jsonb_typeof(a->'p_identity') is distinct from 'object'
    or jsonb_typeof(a->'p_manifest_id') is distinct from 'string' or (a->>'p_manifest_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(a->'p_view_json') is distinct from 'string'
    or jsonb_typeof(a->'p_view_sha256') is distinct from 'string' or (a->>'p_view_sha256') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(a->'p_code_version') is distinct from 'string' or length(a->>'p_code_version') not between 1 and 128
  then raise exception 'invalid_argument'; end if;
  if encode(sha256(convert_to(a->>'p_view_json','UTF8')),'hex') <> a->>'p_view_sha256' then raise exception 'invalid_argument'; end if;
  insert into public.macro_strategy_views (view_key,kind,identity,manifest_id,view_json,view_sha256,code_version)
    values (a->>'p_view_key',a->>'p_kind',a->'p_identity',(a->>'p_manifest_id')::uuid,a->>'p_view_json',a->>'p_view_sha256',a->>'p_code_version')
    on conflict (view_key) do nothing returning view_key into v_inserted;
  if v_inserted is not null then return jsonb_build_object('outcome','inserted'); end if;
  select view_sha256 into v_hash from public.macro_strategy_views where view_key = a->>'p_view_key';
  return jsonb_build_object('outcome',case when v_hash = a->>'p_view_sha256' then 'replayed' else 'conflict' end);
end $$;
revoke all on function public.macro_put_strategy_view(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.macro_put_strategy_view(jsonb) to service_role;
notify pgrst, 'reload schema';
