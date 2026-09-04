-- Keep direct database writes aligned with the API alert-rule contract.
-- Preserve legacy rows while ensuring the constraint can be added on an
-- existing production database. Repaired rows are disabled so users must
-- explicitly review any rule whose original meaning was ambiguous.
update public.watchlist_alerts
set enabled = false
where
  jsonb_typeof(config) is distinct from 'object'
  or (alert_type in ('price', 'change_pct', 'volume_ratio', 'valuation') and (
    operator is null or threshold_numeric is null or abs(threshold_numeric) > 1000000000000000
    or (alert_type in ('price', 'volume_ratio', 'valuation') and threshold_numeric < 0)
  ))
  or (alert_type in ('event', 'rating', 'perspective') and (operator is not null or threshold_numeric is not null));

update public.watchlist_alerts
set operator = coalesce(operator, 'gte'),
    threshold_numeric = case
      when threshold_numeric is null then 0
      when alert_type in ('price', 'volume_ratio', 'valuation') then greatest(threshold_numeric, 0)
      else threshold_numeric
    end,
    config = case
      when alert_type = 'valuation' then jsonb_build_object(
        'metric', case when config ->> 'metric' in ('pe_ttm', 'pb') then config ->> 'metric' else 'pe_ttm' end
      )
      else '{}'::jsonb
    end
where alert_type in ('price', 'change_pct', 'volume_ratio', 'valuation');

update public.watchlist_alerts
set operator = null,
    threshold_numeric = null,
    enabled = case
      when alert_type = 'event' and config ? 'kinds' and not (
        jsonb_typeof(config -> 'kinds') = 'array'
        and (config -> 'kinds') <@ '["earnings_announce","earnings_guidance","dividend_ex_date","dividend_record","share_unlock"]'::jsonb
      ) then false
      when alert_type = 'rating' and config ? 'values' and not (
        jsonb_typeof(config -> 'values') = 'array'
        and (config -> 'values') <@ '["buy","hold","sell"]'::jsonb
      ) then false
      when alert_type = 'perspective' and config ? 'values' and not (
        jsonb_typeof(config -> 'values') = 'array'
        and (config -> 'values') <@ '["bullish","neutral","bearish"]'::jsonb
      ) then false
      else enabled
    end,
    config = case
      when alert_type = 'event' and config ? 'kinds'
        and jsonb_typeof(config -> 'kinds') = 'array'
        and (config -> 'kinds') <@ '["earnings_announce","earnings_guidance","dividend_ex_date","dividend_record","share_unlock"]'::jsonb
        then jsonb_build_object('kinds', config -> 'kinds')
      when alert_type = 'rating' and config ? 'values'
        and jsonb_typeof(config -> 'values') = 'array'
        and (config -> 'values') <@ '["buy","hold","sell"]'::jsonb
        then jsonb_build_object('values', config -> 'values')
      when alert_type = 'perspective' and config ? 'values'
        and jsonb_typeof(config -> 'values') = 'array'
        and (config -> 'values') <@ '["bullish","neutral","bearish"]'::jsonb
        then jsonb_build_object('values', config -> 'values')
      else '{}'::jsonb
    end
where alert_type in ('event', 'rating', 'perspective');

alter table public.watchlist_alerts
  drop constraint if exists watchlist_alerts_rule_shape_check;

alter table public.watchlist_alerts
  add constraint watchlist_alerts_rule_shape_check check (
    jsonb_typeof(config) = 'object'
    and (
      (
        alert_type in ('price', 'change_pct', 'volume_ratio', 'valuation')
        and operator is not null
        and threshold_numeric is not null
        and abs(threshold_numeric) <= 1000000000000000
        and (alert_type not in ('price', 'volume_ratio', 'valuation') or threshold_numeric >= 0)
      )
      or (
        alert_type in ('event', 'rating', 'perspective')
        and operator is null
        and threshold_numeric is null
      )
    )
    and (
      (alert_type in ('price', 'change_pct', 'volume_ratio') and config = '{}'::jsonb)
      or (
        alert_type = 'valuation'
        and config ? 'metric'
        and config - 'metric' = '{}'::jsonb
        and config ->> 'metric' in ('pe_ttm', 'pb')
      )
      or (
        alert_type = 'event'
        and config - 'kinds' = '{}'::jsonb
        and (not (config ? 'kinds') or (
          jsonb_typeof(config -> 'kinds') = 'array'
          and jsonb_array_length(config -> 'kinds') <= 20
          and (config -> 'kinds') <@ '["earnings_announce","earnings_guidance","dividend_ex_date","dividend_record","share_unlock"]'::jsonb
        ))
      )
      or (
        alert_type = 'rating'
        and config - 'values' = '{}'::jsonb
        and (not (config ? 'values') or (
          jsonb_typeof(config -> 'values') = 'array'
          and jsonb_array_length(config -> 'values') <= 20
          and (config -> 'values') <@ '["buy","hold","sell"]'::jsonb
        ))
      )
      or (
        alert_type = 'perspective'
        and config - 'values' = '{}'::jsonb
        and (not (config ? 'values') or (
          jsonb_typeof(config -> 'values') = 'array'
          and jsonb_array_length(config -> 'values') <= 20
          and (config -> 'values') <@ '["bullish","neutral","bearish"]'::jsonb
        ))
      )
    )
  );
