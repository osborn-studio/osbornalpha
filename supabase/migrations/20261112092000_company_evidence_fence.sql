-- supabase/migrations/20261112092000_company_evidence_fence.sql
-- Evidence writer fence (Task 2 review): replace_company_fact_evidence now carries the digest's
-- (attempt id, based-on state_rev) fence like replace_company_digest — stale_computation (55P03) when
-- the facts moved, stale_attempt (P0001) when a newer attempt already succeeded. company_evidence_check
-- also rejects a token key at any depth of params, requires an ISO captured_at before casting, and
-- checks nullable strings explicitly. Replayable: drop-if-exists + create or replace.

drop function if exists public.replace_company_fact_evidence(uuid, text, jsonb);

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
    select x.* into f from public.financial_facts x where x.fact_id = (r ->> 'fact_id')::uuid and x.issuer_id = p_issuer and x.market = p_market;
    if not found then v_bad := 'fact_id: not a fact of this stream'; end if;
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

create or replace function public.replace_company_fact_evidence(p_issuer uuid, p_market text, p_attempt_id bigint, p_based_on_rev bigint, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; n_up int; n_del int; v_rev bigint;
begin
  select x.state_rev into v_rev from public.fact_sync_scope x where x.issuer_id = p_issuer and x.market = p_market for update;
  if not found then raise exception 'unknown_stream' using errcode = 'P0002'; end if;
  if p_based_on_rev is null or v_rev <> p_based_on_rev then raise exception 'stale_computation' using errcode = '55P03'; end if;
  if p_attempt_id is null or p_attempt_id < coalesce((select s.last_success_attempt_id from public.company_digest_state s where s.issuer_id = p_issuer and s.market = p_market), 0) then
    raise exception 'stale_attempt' using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_evidence' using errcode = '22023', detail = 'rows: array expected';
  end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    perform public.company_evidence_check(p_issuer, p_market, r);
  end loop;
  if exists (select 1 from jsonb_array_elements(p_rows) x group by x ->> 'fact_id' having count(*) > 1) then
    raise exception 'invalid_evidence' using errcode = '22023', detail = 'rows: duplicate fact_id';
  end if;
  with up as (
    insert into public.company_fact_evidence as t (fact_id, issuer_id, market, raw_hash, snapshot_sha256, snapshot_path, hash_locator, json_pointer, field,
      source, api, url, params, captured_at, http_status, page, index_version, verified_at)
    select (x ->> 'fact_id')::uuid, p_issuer, p_market, x ->> 'raw_hash', x ->> 'snapshot_sha256', x ->> 'snapshot_path', x ->> 'hash_locator', x ->> 'json_pointer',
           x ->> 'field', x ->> 'source', x ->> 'api', x ->> 'url', case when jsonb_typeof(x -> 'params') = 'object' then x -> 'params' end,
           (x ->> 'captured_at')::timestamptz, (x ->> 'http_status')::int, (x ->> 'page')::int, x ->> 'index_version', now()
    from jsonb_array_elements(p_rows) x
    on conflict (fact_id) do update set
      issuer_id = excluded.issuer_id, market = excluded.market, raw_hash = excluded.raw_hash, snapshot_sha256 = excluded.snapshot_sha256,
      snapshot_path = excluded.snapshot_path, hash_locator = excluded.hash_locator, json_pointer = excluded.json_pointer, field = excluded.field,
      source = excluded.source, api = excluded.api, url = excluded.url, params = excluded.params, captured_at = excluded.captured_at,
      http_status = excluded.http_status, page = excluded.page, index_version = excluded.index_version, verified_at = excluded.verified_at
    returning 1
  )
  select count(*)::int into n_up from up;
  delete from public.company_fact_evidence x
  where x.issuer_id = p_issuer and x.market = p_market
    and not exists (select 1 from jsonb_array_elements(p_rows) y where (y ->> 'fact_id')::uuid = x.fact_id);
  get diagnostics n_del = row_count;
  return jsonb_build_object('upserted', n_up, 'deleted', n_del);
end $$;


revoke execute on function public.company_evidence_check(uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.replace_company_fact_evidence(uuid,text,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.replace_company_fact_evidence(uuid,text,bigint,bigint,jsonb) to service_role;
