-- A fact_id is globally unique. Resolve it through the primary key before checking stream
-- ownership so a cached plan cannot repeatedly scan the issuer/market index for each row.
-- Preserve the same invalid_evidence guard, validator, RPC fence and grants.
create or replace function public.company_evidence_check(p_issuer uuid, p_market text, r jsonb)
returns void language plpgsql stable set search_path = '' as $$
declare
  c_keys constant text[] := array['fact_id','raw_hash','snapshot_sha256','snapshot_path','hash_locator','json_pointer','field','source','api','url','params','captured_at','http_status','page','index_version'];
  f public.financial_facts; v_source text; v_ts timestamptz; v_bad text;
begin
  if r is null or jsonb_typeof(r) <> 'object'
     or exists (select 1 from jsonb_object_keys(r) k where not (k = any(c_keys)))
     or exists (select 1 from unnest(c_keys) k where not (r ? k)) then
    v_bad := 'row: exactly the EvidenceIndexRow keys expected';
  elsif jsonb_typeof(r -> 'fact_id') <> 'string' or (r ->> 'fact_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_bad := 'fact_id: uuid expected';
  end if;
  if v_bad is null then
    select x.* into f from public.financial_facts x where x.fact_id = (r ->> 'fact_id')::uuid;
    if not found or f.issuer_id is distinct from p_issuer or f.market is distinct from p_market then v_bad := 'fact_id: not a fact of this stream'; end if;
  end if;
  if v_bad is null then
    select g.source into v_source from public.filings g where g.filing_id = f.filing_id;
    if jsonb_typeof(r -> 'snapshot_sha256') <> 'string' or (r ->> 'snapshot_sha256') !~ '^[0-9a-f]{64}$' then
      v_bad := 'snapshot_sha256: 64 lowercase hex expected';
    elsif jsonb_typeof(r -> 'hash_locator') <> 'string' or length(r ->> 'hash_locator') not between 1 and 1024 then
      v_bad := 'hash_locator: string of 1..1024 characters expected';
    elsif jsonb_typeof(r -> 'raw_hash') <> 'string' or (r ->> 'raw_hash') <> f.raw_hash then
      v_bad := 'raw_hash: differs from the fact';
    elsif f.raw_hash <> encode(sha256(convert_to((r ->> 'snapshot_sha256') || chr(10) || (r ->> 'hash_locator'), 'UTF8')), 'hex') then
      v_bad := 'raw_hash: not sha256(snapshot_sha256 \n hash_locator)';
    elsif jsonb_typeof(r -> 'source') <> 'string' or (r ->> 'source') is distinct from v_source then
      v_bad := 'source: differs from the filing';
    elsif (r ->> 'snapshot_path') is distinct from v_source || '/' || p_issuer::text || '/' || (r ->> 'snapshot_sha256') || '.json' then
      v_bad := 'snapshot_path: <source>/<issuer_id>/<snapshot_sha256>.json expected';
    elsif jsonb_typeof(r -> 'json_pointer') <> 'string' or (r ->> 'json_pointer') !~ '^/' or length(r ->> 'json_pointer') > 1024 then
      v_bad := 'json_pointer: JSON pointer expected';
    elsif jsonb_typeof(r -> 'field') not in ('null','string') or (jsonb_typeof(r -> 'field') = 'string' and length(r ->> 'field') not between 1 and 64) then
      v_bad := 'field: null or string of 1..64 characters expected';
    elsif jsonb_typeof(r -> 'api') not in ('null','string') or (jsonb_typeof(r -> 'api') = 'string' and length(r ->> 'api') not between 1 and 64) then
      v_bad := 'api: null or string of 1..64 characters expected';
    elsif jsonb_typeof(r -> 'url') not in ('null','string') or (jsonb_typeof(r -> 'url') = 'string' and length(r ->> 'url') not between 1 and 2048) then
      v_bad := 'url: null or string of 1..2048 characters expected';
    elsif jsonb_typeof(r -> 'params') not in ('null','object') then
      v_bad := 'params: null or object expected';
    elsif jsonb_typeof(r -> 'params') = 'object' and exists (
            select 1 from jsonb_path_query(r -> 'params', 'strict $.**') w,
              lateral jsonb_object_keys(case when jsonb_typeof(w) = 'object' then w else '{}'::jsonb end) k where k ilike '%token%') then
      v_bad := 'params: must not carry a token';
    elsif jsonb_typeof(r -> 'captured_at') not in ('null','string')
          or (jsonb_typeof(r -> 'captured_at') = 'string' and (r ->> 'captured_at') !~ '^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:?\d{2})$') then
      v_bad := 'captured_at: timestamp or null expected';
    elsif jsonb_typeof(r -> 'http_status') not in ('null','number')
          or (jsonb_typeof(r -> 'http_status') = 'number' and ((r ->> 'http_status')::numeric not between 100 and 599 or (r ->> 'http_status')::numeric <> trunc((r ->> 'http_status')::numeric))) then
      v_bad := 'http_status: integer 100..599 or null expected';
    elsif jsonb_typeof(r -> 'page') not in ('null','number')
          or (jsonb_typeof(r -> 'page') = 'number' and ((r ->> 'page')::numeric < 0 or (r ->> 'page')::numeric > 2147483647 or (r ->> 'page')::numeric <> trunc((r ->> 'page')::numeric))) then
      v_bad := 'page: non-negative integer or null expected';
    elsif jsonb_typeof(r -> 'index_version') <> 'string' or length(r ->> 'index_version') not between 1 and 64 then
      v_bad := 'index_version: string of 1..64 characters expected';
    end if;
  end if;
  if v_bad is null and jsonb_typeof(r -> 'captured_at') = 'string' then
    begin
      v_ts := (r ->> 'captured_at')::timestamptz;
    exception when others then
      v_bad := 'captured_at: timestamp or null expected';
    end;
  end if;
  if v_bad is not null then raise exception 'invalid_evidence' using errcode = '22023', detail = v_bad; end if;
end $$;

revoke execute on function public.company_evidence_check(uuid,text,jsonb) from public, anon, authenticated, service_role;
