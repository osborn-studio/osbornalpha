-- Extend metric alerts to snapshot liquidity and Watchlist peer percentiles.

alter table public.watchlist_alerts
  drop constraint if exists watchlist_alerts_rule_shape_check;

alter table public.watchlist_alerts
  add constraint watchlist_alerts_rule_shape_check check (
    jsonb_typeof(config) = 'object'
    and (
      (
        alert_type in ('price', 'change_pct', 'volume_ratio', 'valuation', 'metric')
        and operator is not null
        and threshold_numeric is not null
        and abs(threshold_numeric) <= 1000000000000000
        and (alert_type not in ('price', 'volume_ratio', 'valuation') or threshold_numeric >= 0)
        and (alert_type <> 'metric' or (
          (
            config ->> 'metric' not in (
              'annualized_volatility_pct', 'downside_volatility_pct', 'max_drawdown_pct',
              'rsi14', 'bollinger_position_pct', 'atr14_pct', 'average_traded_amount_20',
              'market_relative_strength_percentile', 'industry_pe_percentile',
              'industry_pb_percentile', 'market_liquidity_percentile'
            )
            or threshold_numeric >= 0
          )
          and (
            config ->> 'metric' not in (
              'max_drawdown_pct', 'rsi14', 'bollinger_position_pct',
              'market_relative_strength_percentile', 'industry_pe_percentile',
              'industry_pb_percentile', 'market_liquidity_percentile'
            )
            or threshold_numeric <= 100
          )
        ))
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
        alert_type = 'metric'
        and config ? 'metric'
        and config - 'metric' = '{}'::jsonb
        and config ->> 'metric' in (
          'annualized_volatility_pct', 'downside_volatility_pct', 'sharpe_ratio',
          'max_drawdown_pct', 'rsi14', 'ma20_distance_pct', 'ma50_distance_pct',
          'macd_histogram', 'bollinger_position_pct', 'atr14_pct',
          'average_traded_amount_20', 'market_relative_strength_percentile',
          'industry_pe_percentile', 'industry_pb_percentile',
          'market_liquidity_percentile'
        )
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

insert into public.watchlist_release_markers (marker)
values ('watchlist_peer_metric_alerts')
on conflict (marker) do nothing;
