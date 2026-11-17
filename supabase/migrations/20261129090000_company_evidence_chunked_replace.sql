-- Bound evidence validation per statement; preserve the old writer until the next code deploy.
-- Every chunk and the final prune use the same fence. Failed streams stay visible in freshness.
create or replace function public.upsert_company_fact_evidence(p_issuer uuid, p_market text, p_attempt_id bigint, p_based_on_rev bigint, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; n_up int; v_rev bigint;
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
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'invalid_evidence' using errcode = '22023', detail = 'rows: at most 500 per call';
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
  return jsonb_build_object('upserted', n_up);
end $$;

create or replace function public.prune_company_fact_evidence(p_issuer uuid, p_market text, p_attempt_id bigint, p_based_on_rev bigint, p_keep uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_del int; v_rev bigint;
begin
  select x.state_rev into v_rev from public.fact_sync_scope x where x.issuer_id = p_issuer and x.market = p_market for update;
  if not found then raise exception 'unknown_stream' using errcode = 'P0002'; end if;
  if p_based_on_rev is null or v_rev <> p_based_on_rev then raise exception 'stale_computation' using errcode = '55P03'; end if;
  if p_attempt_id is null or p_attempt_id < coalesce((select s.last_success_attempt_id from public.company_digest_state s where s.issuer_id = p_issuer and s.market = p_market), 0) then
    raise exception 'stale_attempt' using errcode = 'P0001';
  end if;
  if p_keep is null then
    raise exception 'invalid_evidence' using errcode = '22023', detail = 'keep: array expected';
  end if;
  delete from public.company_fact_evidence x
  where x.issuer_id = p_issuer and x.market = p_market
    and not exists (select 1 from unnest(p_keep) k(fact_id) where k.fact_id = x.fact_id);
  get diagnostics n_del = row_count;
  return jsonb_build_object('deleted', n_del);
end $$;

create or replace function public.company_digest_backlog_detail(p_limit int default 20)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'failedStreams', (select count(*) from public.company_digest_state where last_status = 'failed'),
    'activeStreams', (select count(*) from public.fact_sync_scope where state_rev > 0),
    'streams', (select coalesce(jsonb_agg(jsonb_build_object(
      'issuerId', x.issuer_id, 'market', x.market, 'consecutiveFailures', x.consecutive_failures,
      'lastAttemptAt', x.last_attempt_at, 'nextAttemptAt', x.next_attempt_at)
      order by x.consecutive_failures desc, x.issuer_id, x.market), '[]'::jsonb)
      from (select issuer_id, market, consecutive_failures, last_attempt_at, next_attempt_at
        from public.company_digest_state where last_status = 'failed'
        order by consecutive_failures desc, issuer_id, market
        limit greatest(least(coalesce(p_limit, 20), 100), 0)) x));
$$;

revoke execute on function public.upsert_company_fact_evidence(uuid,text,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.upsert_company_fact_evidence(uuid,text,bigint,bigint,jsonb) to service_role;

revoke execute on function public.prune_company_fact_evidence(uuid,text,bigint,bigint,uuid[]) from public, anon, authenticated;
grant execute on function public.prune_company_fact_evidence(uuid,text,bigint,bigint,uuid[]) to service_role;

revoke execute on function public.company_digest_backlog_detail(int) from public, anon, authenticated;
grant execute on function public.company_digest_backlog_detail(int) to service_role;
