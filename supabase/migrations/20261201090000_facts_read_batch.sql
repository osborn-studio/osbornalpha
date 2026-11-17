-- Set-based US aggregation envelopes: amortise read_facts planning/round trips to stay within
-- the API role's 8s statement timeout (811 per-issuer reads previously exhausted cron).
-- Contract: one envelope per distinct non-null issuer, ordered by UUID; each equals read_facts
-- with no period/key limit and include_non_ok=false. Windows and the 10,000-row cap are per issuer.
-- Concepts are required and at most 200 issuers are accepted; only service_role may execute.
create or replace function public.read_facts_batch(
  p_issuers uuid[], p_market text, p_concepts text[], p_as_of date, p_history boolean)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_members uuid[]; v_result jsonb;
begin
  if coalesce(cardinality(p_concepts), 0) = 0 then
    raise exception 'empty_concepts' using errcode = '22023';
  end if;
  select coalesce(array_agg(m order by m), '{}'::uuid[]) into v_members
  from (select distinct u.m from unnest(p_issuers) as u(m) where u.m is not null) members;
  if cardinality(v_members) > 200 then
    raise exception 'batch_too_large' using errcode = '22023';
  end if;
  if cardinality(v_members) = 0 then return '[]'::jsonb; end if;

  with base as (
    select f.fact_id, f.issuer_id, f.market, f.filing_id, f.run_id, f.concept, f.source_concept, f.statement,
           f.period_start, f.period_end, f.duration, f.value, f.value_text, f.unit, f.consolidation, f.available_date,
           f.mapping_gen, f.mapping_version, f.status, f.raw_hash, f.created_at
    from public.financial_facts f
    join public.filings g on g.filing_id = f.filing_id and g.mapping_gen = f.mapping_gen
    where f.issuer_id = any(v_members) and f.market = p_market
      and f.concept = any(p_concepts) and f.available_date <= p_as_of and f.status = 'ok'
  ), seq as (
    select b.*,
           row_number() over w as disclosure_seq,
           (row_number() over w = count(*) over (partition by b.issuer_id, b.concept, b.period_start, b.period_end, b.consolidation, b.unit)) as is_current,
           (lag(b.value) over w is not null and b.value <> lag(b.value) over w) as is_revision
    from base b
    window w as (partition by b.issuer_id, b.concept, b.period_start, b.period_end, b.consolidation, b.unit order by b.available_date, b.created_at, b.fact_id)
  ), keyed as (
    select s.*,
           dense_rank() over (partition by s.issuer_id order by s.period_end desc, s.concept collate "C", s.period_start desc nulls last, s.consolidation collate "C", s.unit collate "C") as key_rank
    from seq s
  ), picked as (
    select * from keyed k where coalesce(p_history, false) or k.is_current
  ), numbered as (
    select p.*, row_number() over (partition by p.issuer_id order by p.key_rank, p.available_date, p.created_at, p.fact_id) as batch_row
    from picked p
  ), capped as (
    select * from numbered where batch_row <= 10001
  ), counted as (
    select issuer_id, count(*)::int as n from capped group by issuer_id
  ), envelopes as (
    select c.issuer_id,
           jsonb_agg((to_jsonb(c) - 'key_rank' - 'batch_row' - 'value') || jsonb_build_object('value', c.value_text)
                     order by c.key_rank, c.available_date, c.created_at, c.fact_id) as rows
    from capped c join counted n on n.issuer_id = c.issuer_id and n.n <= 10000
    group by c.issuer_id
  )
  select jsonb_agg(jsonb_build_object(
    'issuer_id', m.issuer_id::text, 'state_rev', public.fact_state_rev(m.issuer_id, p_market),
    'truncated', coalesce(n.n, 0) > 10000,
    'row_count', case when n.n > 10000 then 0 else coalesce(n.n, 0) end,
    'rows', coalesce(e.rows, '[]'::jsonb)) order by m.issuer_id)
  into v_result
  from unnest(v_members) as m(issuer_id)
  left join counted n on n.issuer_id = m.issuer_id
  left join envelopes e on e.issuer_id = m.issuer_id;
  return v_result;
end $$;
revoke execute on function public.read_facts_batch(uuid[], text, text[], date, boolean) from public, anon, authenticated;
grant execute on function public.read_facts_batch(uuid[], text, text[], date, boolean) to service_role;
