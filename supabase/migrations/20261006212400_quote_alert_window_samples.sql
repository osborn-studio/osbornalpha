-- One bounded, statement-snapshot JSON value bypasses PostgREST row pagination.
-- Float8 projection matches JS Number decoding and removes arbitrary metadata.
create function public.quote_alert_number(p_value jsonb)
returns double precision language plpgsql immutable parallel safe
set search_path = '' as $$
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'number' then return null; end if;
  return (p_value #>> '{}')::double precision;
exception when numeric_value_out_of_range then return null;
end;
$$;

create function public.quote_alert_window_samples(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security invoker
set search_path = ''
set extra_float_digits = 3 as $$
declare samples jsonb;
begin
  if p_from is null or p_to is null or not pg_catalog.isfinite(p_from)
    or not pg_catalog.isfinite(p_to) or p_to - p_from <> interval '15 minutes' then
    raise exception 'quote alert window invalid' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(sample), '[]'::jsonb) into samples
  from (
    select pg_catalog.jsonb_build_object('event_name', event_name, 'metadata',
      pg_catalog.jsonb_build_object(
        'count', public.quote_alert_number(metadata -> 'count'),
        'stale', public.quote_alert_number(metadata -> 'stale'))) as sample
    from public.user_events
    where created_at >= p_from and created_at < p_to
      and event_name in ('quote_batch_loaded', 'quote_batch_degraded', 'quote_batch_failed')
    order by created_at, id
    limit 10001
  ) bounded;
  return samples;
end;
$$;

revoke all on function public.quote_alert_number(jsonb) from public, anon, authenticated;
revoke all on function public.quote_alert_window_samples(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.quote_alert_number(jsonb) to service_role;
grant execute on function public.quote_alert_window_samples(timestamptz,timestamptz) to service_role;
-- No table privileges or RLS policies changed; service_role needs existing SELECT.
