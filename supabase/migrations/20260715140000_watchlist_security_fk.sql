-- Preserve every historical watchlist item, then enforce canonical identity integrity.
insert into public.stocks_universe (
  ticker, symbol, name, pinyin, market, exchange, asset_type, fund_subtype,
  instrument_form, currency, country_code, list_status, is_active, source,
  source_updated_at, metadata
)
select distinct
  upper(trim(wi.ticker)) as ticker,
  split_part(upper(trim(wi.ticker)), '.', 1) as symbol,
  upper(trim(wi.ticker)) as name,
  null as pinyin,
  case
    when upper(trim(wi.ticker)) ~ '\.(SH|SZ|BJ)$' then 'A'::public.market_t
    when upper(trim(wi.ticker)) ~ '\.HK$' then 'HK'::public.market_t
    when upper(trim(wi.ticker)) ~ '\.T$' then 'JP'::public.market_t
    when upper(trim(wi.ticker)) ~ '\.(KS|KQ)$' then 'KR'::public.market_t
    when upper(trim(wi.ticker)) ~ '\.(TW|TWO)$' then 'TW'::public.market_t
    else 'US'::public.market_t
  end,
  case
    when upper(trim(wi.ticker)) ~ '\.SH$' then 'SSE'
    when upper(trim(wi.ticker)) ~ '\.SZ$' then 'SZSE'
    when upper(trim(wi.ticker)) ~ '\.BJ$' then 'BSE'
    when upper(trim(wi.ticker)) ~ '\.HK$' then 'HKEX'
    when upper(trim(wi.ticker)) ~ '\.T$' then 'TSE'
    when upper(trim(wi.ticker)) ~ '\.(KS|KQ)$' then 'KRX'
    when upper(trim(wi.ticker)) ~ '\.(TW|TWO)$' then 'TWSE'
    else null
  end,
  'unknown', null, null,
  case
    when upper(trim(wi.ticker)) ~ '\.(SH|SZ|BJ)$' then 'CNY'
    when upper(trim(wi.ticker)) ~ '\.HK$' then 'HKD'
    when upper(trim(wi.ticker)) ~ '\.T$' then 'JPY'
    when upper(trim(wi.ticker)) ~ '\.(KS|KQ)$' then 'KRW'
    when upper(trim(wi.ticker)) ~ '\.(TW|TWO)$' then 'TWD'
    else 'USD'
  end,
  case
    when upper(trim(wi.ticker)) ~ '\.(SH|SZ|BJ)$' then 'CN'
    when upper(trim(wi.ticker)) ~ '\.HK$' then 'HK'
    when upper(trim(wi.ticker)) ~ '\.T$' then 'JP'
    when upper(trim(wi.ticker)) ~ '\.(KS|KQ)$' then 'KR'
    when upper(trim(wi.ticker)) ~ '\.(TW|TWO)$' then 'TW'
    else 'US'
  end,
  'pending', false, 'legacy-watchlist', now(),
  jsonb_build_object('reason', 'historical_watchlist_backfill')
from public.watchlist_items wi
where nullif(trim(wi.ticker), '') is not null
  and not exists (
    select 1 from public.stocks_universe s
    where s.ticker = upper(trim(wi.ticker))
  )
on conflict (ticker) do nothing;

alter table public.watchlist_items
  add constraint watchlist_items_ticker_fkey
  foreign key (ticker) references public.stocks_universe(ticker)
  on delete restrict not valid;

alter table public.watchlist_items validate constraint watchlist_items_ticker_fkey;
