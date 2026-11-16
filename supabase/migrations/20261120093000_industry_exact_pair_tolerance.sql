-- Industry spec §6.4: compare the inclusive 1% tolerance without numeric division rounding.
-- rel_diff remains a display diagnostic; classification uses exact decimal cross multiplication.
-- This corrects staging arithmetic only. H, PB methodology and rights remain unresolved;
-- official/valuation jobs remain deferred_i3 and this migration grants no publication approval.
create or replace function public.stage_industry_valuation_pairs(p_run uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = pg_catalog, public as $$
declare v public.industry_valuation_runs; n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  v := public.industry_valuation_run_lock(p_run);
  if v.status <> 'building' then raise exception 'run_not_building' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x
             where not exists (select 1 from jsonb_array_elements_text(v.expected_dates) d where d::date = (x ->> 'trade_date')::date)) then
    raise exception 'invalid_trade_date' using errcode = '22023';
  end if;
  insert into public.industry_valuation_pairs (run_id, scheme, version, code, trade_date, metric, official_observation_id, official_value, rel_diff, pair_status)
  select p_run, v.scheme, v.version, d.code, d.trade_date, d.metric,
         case when d.state in ('within','outside','invalid_denominator') then d.obs_id end,
         case when d.state in ('within','outside','invalid_denominator') then d.official end,
         case when d.state in ('within','outside') then d.computed / d.official - 1 end,
         d.state
  from (
    select y.code, y.trade_date, y.metric, y.obs_id, y.official, y.computed,
           case when y.metric = 'market_cap' then 'not_applicable'
                when y.computed is null then 'no_computed'
                when y.obs_id is null then 'no_official'
                when y.official <= 0 then 'invalid_denominator'
                when abs(y.computed - y.official) <= y.official * 0.01 then 'within'
                else 'outside' end as state
    from (
      select x ->> 'code' as code, (x ->> 'trade_date')::date as trade_date, x ->> 'metric' as metric,
             o.observation_id as obs_id, o.value as official,
             (select val.value from public.industry_valuations val
              where val.run_id = p_run and val.scheme = v.scheme and val.version = v.version and val.code = x ->> 'code'
                and val.trade_date = (x ->> 'trade_date')::date and val.metric = x ->> 'metric' and val.status = 'ok') as computed
      from jsonb_array_elements(p_rows) x
      left join public.industry_official_valuations o
        on o.observation_id = nullif(x ->> 'official_observation_id', '')::uuid and o.status = 'ok'
       and o.scheme = v.scheme and o.version = v.version and o.code = x ->> 'code' and o.trade_date = (x ->> 'trade_date')::date
       and o.metric = case x ->> 'metric' when 'pe_ttm' then 'pe' when 'pe_static' then 'pe' when 'pb' then 'pb' end
    ) y
  ) d
  on conflict (run_id, scheme, version, code, trade_date, metric) do update
    set official_observation_id = excluded.official_observation_id, official_value = excluded.official_value, rel_diff = excluded.rel_diff, pair_status = excluded.pair_status;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.stage_industry_valuation_pairs(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stage_industry_valuation_pairs(uuid, jsonb) to service_role;
