-- Cold strategy reads: compact histories for at most 64 series, under the caller's table RLS.
-- Keep this positional projection in sync with strategy/history-rpc.ts. availability_basis is
-- constrained to first_seen on the table and status is filtered to ok, so neither needs transport.
create or replace function public.macro_strategy_histories(
  p_series text[], p_as_of timestamptz, p_from date default null, p_to date default null
) returns json
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_series is null or cardinality(p_series) = 0 or cardinality(p_series) > 64 then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  return (
    select json_agg(result.body)
    from (
      select json_build_object(
        'series_id', requested.series_id,
        -- Count every visible vintage, exactly like the legacy counted table read. A separate
        -- index scan avoids materializing/sorting all raw rows just to obtain this count.
        'raw_count', (
          select count(*) from public.macro_observations o
          where o.series_id = requested.series_id and o.status = 'ok'
            and o.available_at <= p_as_of
            and (p_from is null or o.period_end >= p_from)
            and (p_to is null or o.period_end <= p_to)
        ),
        'rows', (
          select coalesce(json_agg(json_build_array(
            latest.observation_id, latest.period_end, latest.value_text, latest.version,
            latest.available_at, latest.ingested_at, latest.retrieval_id,
            latest.derived_from, latest.transform
          )), '[]'::json)
          from (
            select distinct on (o.period_end)
              o.observation_id, o.period_end, o.value_text, o.version, o.available_at,
              o.ingested_at, o.retrieval_id, o.derived_from, o.transform
            from public.macro_observations o
            where o.series_id = requested.series_id and o.status = 'ok'
              and o.available_at <= p_as_of
              and (p_from is null or o.period_end >= p_from)
              and (p_to is null or o.period_end <= p_to)
            order by o.period_end, o.version desc
          ) latest
        )
      ) as body
      from unnest(p_series) with ordinality as requested(series_id, ordinal)
      order by requested.ordinal
    ) result
  );
end;
$$;

revoke execute on function public.macro_strategy_histories(text[],timestamptz,date,date) from public;
grant execute on function public.macro_strategy_histories(text[],timestamptz,date,date) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
