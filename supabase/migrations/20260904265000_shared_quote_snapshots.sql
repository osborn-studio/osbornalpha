-- Cross-instance quote cache for serverless deployments. Only service-role
-- code may read or write snapshots; public clients continue through the
-- validated quote API contract. Numeric projections support complete-dataset
-- Watchlist sorting without reparsing JSON for every row.
create table if not exists public.market_quote_snapshots (
  ticker text primary key check (char_length(ticker) between 1 and 32),
  market text not null check (market in ('A', 'HK', 'US', 'JP', 'KR', 'TW')),
  quote jsonb not null check (jsonb_typeof(quote) = 'object'),
  source text not null,
  observed_at timestamptz not null,
  fetched_at timestamptz not null,
  valid_until timestamptz not null,
  stale_until timestamptz not null,
  price numeric,
  change_pct numeric,
  open_price numeric,
  high_price numeric,
  low_price numeric,
  previous_close numeric,
  volume numeric,
  amount numeric,
  market_cap numeric,
  pe_ttm numeric,
  pb numeric,
  turnover numeric,
  volume_ratio numeric,
  amplitude numeric,
  updated_at timestamptz not null default now(),
  check (valid_until >= fetched_at),
  check (stale_until >= valid_until)
);

create index if not exists market_quote_snapshots_freshness_idx
  on public.market_quote_snapshots (valid_until, stale_until, ticker);
create index if not exists market_quote_snapshots_price_idx
  on public.market_quote_snapshots (price, ticker);
create index if not exists market_quote_snapshots_change_idx
  on public.market_quote_snapshots (change_pct, ticker);
create index if not exists market_quote_snapshots_volume_idx
  on public.market_quote_snapshots (volume, ticker);

alter table public.market_quote_snapshots enable row level security;
revoke all on table public.market_quote_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.market_quote_snapshots to service_role;

insert into public.watchlist_release_markers (marker)
values ('shared_quote_snapshots')
on conflict (marker) do nothing;
