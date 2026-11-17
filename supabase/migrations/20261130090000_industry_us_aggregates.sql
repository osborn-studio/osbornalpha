-- US SIC snapshot aggregates (§19). Additive and replayable; legacy grids keep the exact CN branch.
-- Audited create_industry_metric_run, stage_industry_metrics (the metric-row staging RPC),
-- industry_candidate_members, visibility/RLS: no other changes needed. They already accept SIC,
-- arbitrary unit strings (including USD), 12M bucket periods, and the extra expected_grid keys.
-- CREATE OR REPLACE preserves the original owner; EXECUTE ACLs are restated below unchanged.
alter table public.industry_metrics drop constraint if exists industry_metrics_metric_check;
alter table public.industry_metrics add constraint industry_metrics_metric_check
  check (metric in ('revenue_sum','net_income_parent_sum','gross_margin','net_margin','roe','revenue_yoy','net_income_yoy','member_count'));

create or replace function public.activate_industry_metric_run(p_run uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.industry_metric_runs; a public.industry_metric_runs; v_t timestamptz;
begin
  select * into r from public.industry_metric_runs where run_id = p_run;
  if not found then raise exception 'run_not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('industry-run:aggregate:' || r.scheme || ':' || r.version || ':' || r.level));
  r := public.industry_metric_run_lock(p_run);
  if r.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  if r.expected_grid ->> 'membership_on' is not null then
    if (r.expected_grid ->> 'membership_on')::date > r.facts_as_of or r.history_class <> 'reconstruction' or r.scheme <> 'sic' then
      raise exception 'invalid_membership_basis' using errcode = 'P0001';
    end if;
  end if;
  if r.expected_grid ->> 'cell_rule' = 'fiscal_year_bucket/1' and r.expected_grid ->> 'membership_on' is null then
    raise exception 'invalid_membership_basis' using errcode = 'P0001';
  end if;
  if r.expected_grid ->> 'cell_rule' is null then
  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(r.expected_grid -> 'codes', '[]'::jsonb)) c(code)
    cross join jsonb_array_elements_text(coalesce(r.expected_grid -> 'period_ends', '[]'::jsonb)) p(period_end)
    cross join jsonb_array_elements_text(coalesce(r.expected_grid -> 'metrics', '[]'::jsonb)) m(metric)
    join (values ('revenue_sum','3M',false),('revenue_sum','12M',true),('net_income_parent_sum','3M',false),('net_income_parent_sum','12M',true),
                 ('gross_margin','12M',true),('roe','TTM',false),('revenue_yoy','3M',false),('revenue_yoy','12M',true),
                 ('net_income_yoy','3M',false),('net_income_yoy','12M',true),('member_count','INSTANT',false)) s(metric, duration, dec_only)
      on s.metric = m.metric
    where (not s.dec_only or to_char(p.period_end::date, 'MM-DD') = '12-31')
      and not exists (select 1 from public.industry_metrics x where x.run_id = p_run and x.code = c.code and x.metric = m.metric
                        and x.duration = s.duration and x.period_end = p.period_end::date)) then
    raise exception 'incomplete_run' using errcode = 'P0001';
  end if;
  elsif r.expected_grid ->> 'cell_rule' = 'fiscal_year_bucket/1' then
    if exists (
      select 1
      from jsonb_array_elements_text(coalesce(r.expected_grid -> 'codes', '[]'::jsonb)) c(code)
      cross join jsonb_array_elements_text(coalesce(r.expected_grid -> 'period_ends', '[]'::jsonb)) p(period_end)
      cross join jsonb_array_elements_text(coalesce(r.expected_grid -> 'metrics', '[]'::jsonb)) m(metric)
      where not exists (select 1 from public.industry_metrics x where x.run_id = p_run and x.code = c.code and x.metric = m.metric
        and x.duration = case when m.metric = 'member_count' then 'INSTANT' else '12M' end and x.period_end = p.period_end::date)) then
      raise exception 'incomplete_run' using errcode = 'P0001';
    end if;
  else
    raise exception 'invalid_cell_rule' using errcode = 'P0001';
  end if;
  -- dependency set equality (Codex review P1): per cell the dependency issuers equal the candidate members (ok memberships
  -- that are members on period_end as known by facts_as_of), in both directions; no dependency of a cell without rows
  if exists (
    select 1 from (select code, period_end, max(n_members) n from public.industry_metrics where run_id = p_run group by code, period_end) g
    where g.n <> (select count(*) from public.industry_run_dependencies d where d.run_kind = 'aggregate' and d.run_id = p_run
                  and d.cell_key = g.code || ':' || to_char(g.period_end, 'YYYY-MM-DD'))) then
    raise exception 'dependencies_incomplete' using errcode = 'P0001';
  end if;
  if exists (
    with cells as (select distinct code, period_end from public.industry_metrics where run_id = p_run),
    want as (select c.code || ':' || to_char(c.period_end, 'YYYY-MM-DD') as cell_key, w.issuer_id
             from cells c cross join lateral public.industry_candidate_members(r.scheme, r.version, r.level, c.code, coalesce((r.expected_grid ->> 'membership_on')::date, c.period_end), r.facts_as_of) as w(issuer_id)),
    have as (select d.cell_key, d.issuer_id from public.industry_run_dependencies d where d.run_kind = 'aggregate' and d.run_id = p_run)
    select 1 from ((select * from want except select * from have) union all (select * from have except select * from want)) diff) then
    raise exception 'dependencies_incomplete' using errcode = 'P0001';
  end if;
  select * into a from public.industry_metric_runs where scheme = r.scheme and version = r.version and level = r.level and status = 'active' for update;
  if found then
    if r.generation <= a.generation or r.facts_as_of < a.facts_as_of then raise exception 'obsolete_run' using errcode = 'P0001'; end if;
    if exists (select 1 from public.industry_run_dependencies o join public.industry_run_dependencies n
                 on n.run_kind = 'aggregate' and n.run_id = p_run and n.cell_key = o.cell_key and n.issuer_id = o.issuer_id
               where o.run_kind = 'aggregate' and o.run_id = a.run_id and n.state_rev < o.state_rev) then
      raise exception 'dependency_regression' using errcode = 'P0001';
    end if;
    update public.industry_metric_runs set status = 'superseded' where run_id = a.run_id;
  end if;
  v_t := clock_timestamp();
  update public.industry_metric_runs set status = 'active', activated_at = v_t where run_id = p_run;
  update public.industry_metrics set updated_at = v_t where run_id = p_run;
  return jsonb_build_object('activated_at', v_t);
end $$;
revoke execute on function public.activate_industry_metric_run(uuid) from public, anon, authenticated;
grant execute on function public.activate_industry_metric_run(uuid) to service_role;
