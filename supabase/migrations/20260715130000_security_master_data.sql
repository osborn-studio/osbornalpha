-- Securities master data, guarded synchronization, and local-first search.
create extension if not exists pg_trgm;

alter table public.stocks_universe
  add column if not exists symbol text,
  add column if not exists name_en text,
  add column if not exists full_name text,
  add column if not exists exchange text,
  add column if not exists asset_type text not null default 'unknown',
  add column if not exists fund_subtype text,
  add column if not exists instrument_form text,
  add column if not exists currency text,
  add column if not exists country_code text,
  add column if not exists list_status text not null default 'listed',
  add column if not exists list_date date,
  add column if not exists delist_date date,
  add column if not exists source text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.stocks_universe
set symbol = split_part(ticker, '.', 1)
where symbol is null;

create or replace function public.derive_stock_universe_symbol()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.symbol := coalesce(nullif(trim(new.symbol), ''), split_part(new.ticker, '.', 1));
  return new;
end;
$$;

drop trigger if exists stocks_universe_derive_symbol on public.stocks_universe;
create trigger stocks_universe_derive_symbol
before insert or update of ticker, symbol on public.stocks_universe
for each row execute function public.derive_stock_universe_symbol();

alter table public.stocks_universe
  alter column symbol set not null;

alter table public.stocks_universe
  add constraint stocks_universe_asset_type_check
    check (asset_type in ('stock','etf','convertible_bond','fund','index','unknown')) not valid,
  add constraint stocks_universe_fund_subtype_check
    check (fund_subtype is null or fund_subtype in ('etf','lof','closed_end','reit','other_exchange_fund')) not valid,
  add constraint stocks_universe_instrument_form_check
    check (instrument_form is null or instrument_form in ('common_stock','adr','share_class','fund_unit','bond')) not valid,
  add constraint stocks_universe_list_status_check
    check (list_status in ('listed','paused','delisted','pending')) not valid;

alter table public.stocks_universe validate constraint stocks_universe_asset_type_check;
alter table public.stocks_universe validate constraint stocks_universe_fund_subtype_check;
alter table public.stocks_universe validate constraint stocks_universe_instrument_form_check;
alter table public.stocks_universe validate constraint stocks_universe_list_status_check;

create index if not exists stocks_universe_ticker_prefix_idx
  on public.stocks_universe (ticker text_pattern_ops);
create index if not exists stocks_universe_symbol_prefix_idx
  on public.stocks_universe (symbol text_pattern_ops);
create index if not exists stocks_universe_active_market_type_idx
  on public.stocks_universe (is_active, market, asset_type);
create index if not exists stocks_universe_name_trgm_idx
  on public.stocks_universe using gin (lower(name) gin_trgm_ops);
create index if not exists stocks_universe_name_en_trgm_idx
  on public.stocks_universe using gin (lower(name_en) gin_trgm_ops);
create index if not exists stocks_universe_pinyin_trgm_idx
  on public.stocks_universe using gin (lower(pinyin) gin_trgm_ops);

create table public.security_aliases (
  alias text not null,
  ticker text not null references public.stocks_universe(ticker) on delete cascade,
  alias_type text not null
    check (alias_type in ('symbol','vendor','former_symbol','name','pinyin')),
  source text not null,
  created_at timestamptz not null default now(),
  primary key (alias, ticker, alias_type)
);

create index security_aliases_alias_idx on public.security_aliases (alias text_pattern_ops);
create index security_aliases_ticker_idx on public.security_aliases (ticker);

create table public.security_universe_memberships (
  ticker text not null references public.stocks_universe(ticker) on delete cascade,
  universe text not null
    check (universe in ('a_stock','a_exchange_fund','a_cb','hk_main','sp500','nasdaq_top500','us_china')),
  rank integer check (rank is null or rank > 0),
  market_cap_usd numeric check (market_cap_usd is null or market_cap_usd >= 0),
  as_of_date date not null,
  is_active boolean not null default true,
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (ticker, universe)
);

create index security_memberships_scope_active_idx
  on public.security_universe_memberships (universe, is_active, rank);

create table public.security_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  scope text not null
    check (scope in ('a_stock','a_exchange_fund','a_cb','hk_main','sp500','nasdaq_top500','us_china')),
  status text not null default 'running'
    check (status in ('running','staged','success','rejected','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_as_of date,
  fetched_count integer not null default 0,
  accepted_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  deactivated_count integer not null default 0,
  error_code text,
  error_message text,
  checksum text,
  snapshot_path text
);

create index security_sync_runs_scope_started_idx
  on public.security_sync_runs (scope, started_at desc);
create index security_sync_runs_status_started_idx
  on public.security_sync_runs (status, started_at desc);

create table public.security_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  normalized_query text not null,
  proposed_ticker text not null,
  source text not null,
  normalized_payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','verified','promoted','rejected')),
  seen_count integer not null default 1 check (seen_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  review_reason text,
  unique (proposed_ticker, source)
);

create index security_discovery_status_seen_idx
  on public.security_discovery_candidates (status, last_seen_at desc);

create table public.security_sync_staging (
  run_id uuid not null references public.security_sync_runs(id) on delete cascade,
  record_kind text not null check (record_kind in ('security','alias','membership')),
  natural_key text not null,
  normalized_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, record_kind, natural_key)
);

create index security_sync_staging_created_idx
  on public.security_sync_staging (created_at);

create table public.security_resolve_rate_limits (
  subject_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);

alter table public.security_aliases enable row level security;
alter table public.security_universe_memberships enable row level security;
alter table public.security_sync_runs enable row level security;
alter table public.security_discovery_candidates enable row level security;
alter table public.security_sync_staging enable row level security;
alter table public.security_resolve_rate_limits enable row level security;

create policy "security aliases public read"
  on public.security_aliases for select using (true);
create policy "active security memberships public read"
  on public.security_universe_memberships for select using (is_active);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('security-snapshots', 'security-snapshots', false, 52428800, array['application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.search_securities(
  p_query text,
  p_limit integer default 10
)
returns table (
  t text,
  n text,
  py text,
  m public.market_t,
  asset_type text,
  exchange text,
  list_status text,
  match_kind text,
  verification_status text,
  selectable boolean
)
language sql
stable
set search_path = public, extensions
as $$
  with params as (
    select lower(trim(coalesce(p_query, ''))) as q,
           greatest(1, least(coalesce(p_limit, 10), 30)) as result_limit
  ), direct_matches as (
    select s.*,
      case
        when lower(s.ticker) = p.q then 120
        when lower(s.symbol) = p.q then 115
        when lower(s.name) = p.q or lower(coalesce(s.name_en, '')) = p.q then 105
        when lower(s.ticker) like p.q || '%' then 90
        when lower(s.symbol) like p.q || '%' then 88
        when lower(s.name) like p.q || '%' or lower(coalesce(s.name_en, '')) like p.q || '%' then 80
        when lower(coalesce(s.pinyin, '')) like p.q || '%' then 75
        when lower(s.name) like '%' || p.q || '%' or lower(coalesce(s.name_en, '')) like '%' || p.q || '%' then 60
        when lower(coalesce(s.pinyin, '')) like '%' || p.q || '%' then 55
        else greatest(
          similarity(lower(s.name), p.q),
          similarity(lower(coalesce(s.name_en, '')), p.q),
          similarity(lower(coalesce(s.pinyin, '')), p.q)
        ) * 50
      end::numeric as score,
      case
        when lower(s.ticker) = p.q then 'exact'
        when lower(s.symbol) = p.q then 'exact_symbol'
        when lower(s.name) = p.q or lower(coalesce(s.name_en, '')) = p.q then 'exact_name'
        when lower(s.ticker) like p.q || '%' or lower(s.symbol) like p.q || '%' then 'prefix'
        when lower(s.name) like '%' || p.q || '%' or lower(coalesce(s.name_en, '')) like '%' || p.q || '%' then 'name'
        when lower(coalesce(s.pinyin, '')) like '%' || p.q || '%' then 'pinyin'
        else 'fuzzy'
      end as matched_by
    from public.stocks_universe s cross join params p
    where p.q <> ''
      and (s.is_active or lower(s.ticker) = p.q)
      and (
        lower(s.ticker) = p.q or lower(s.symbol) = p.q
        or lower(s.ticker) like p.q || '%' or lower(s.symbol) like p.q || '%'
        or lower(s.name) like '%' || p.q || '%'
        or lower(coalesce(s.name_en, '')) like '%' || p.q || '%'
        or lower(coalesce(s.pinyin, '')) like '%' || p.q || '%'
        or (length(p.q) >= 2 and greatest(
          similarity(lower(s.name), p.q),
          similarity(lower(coalesce(s.name_en, '')), p.q),
          similarity(lower(coalesce(s.pinyin, '')), p.q)
        ) >= 0.2)
      )
  ), alias_matches as (
    select s.*, 110::numeric as score, 'exact_alias'::text as matched_by
    from public.security_aliases a
    join public.stocks_universe s on s.ticker = a.ticker
    cross join params p
    where a.alias = p.q and (s.is_active or lower(s.ticker) = p.q)
  ), all_matches as (
    select * from direct_matches
    union all
    select * from alias_matches
  ), best as (
    select distinct on (ticker) *
    from all_matches
    order by ticker, score desc, matched_by
  )
  select
    b.ticker as t,
    b.name as n,
    coalesce(b.pinyin, '') as py,
    b.market as m,
    b.asset_type,
    b.exchange,
    b.list_status,
    b.matched_by as match_kind,
    case when b.source = 'legacy-watchlist' or b.list_status = 'pending'
      then 'pending' else 'verified' end as verification_status,
    (b.is_active and b.list_status = 'listed' and b.source is distinct from 'legacy-watchlist') as selectable
  from best b cross join params p
  order by b.score desc, b.ticker
  limit (select result_limit from params);
$$;

revoke execute on function public.search_securities(text, integer) from public;
grant execute on function public.search_securities(text, integer) to anon, authenticated, service_role;

create or replace function public.consume_security_resolve_quota(
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  if nullif(trim(p_subject_hash), '') is null or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.security_resolve_rate_limits(subject_hash, window_started_at, attempts)
  values (p_subject_hash, now(), 1)
  on conflict (subject_hash) do update
  set window_started_at = case
        when public.security_resolve_rate_limits.window_started_at
             <= now() - make_interval(secs => p_window_seconds)
          then now()
        else public.security_resolve_rate_limits.window_started_at
      end,
      attempts = case
        when public.security_resolve_rate_limits.window_started_at
             <= now() - make_interval(secs => p_window_seconds)
          then 1
        else public.security_resolve_rate_limits.attempts + 1
      end
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

revoke execute on function public.consume_security_resolve_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_security_resolve_quota(text, integer, integer) to service_role;

create or replace function public.promote_verified_security(
  p_security jsonb,
  p_aliases jsonb,
  p_memberships jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticker text := trim(p_security ->> 'ticker');
  v_market text := p_security ->> 'market';
  v_asset_type text := p_security ->> 'asset_type';
begin
  if nullif(v_ticker, '') is null
     or v_market not in ('A','HK','US')
     or v_asset_type not in ('stock','etf','convertible_bond','fund','index','unknown')
     or coalesce((p_security ->> 'is_active')::boolean, false) is not true
     or p_security ->> 'list_status' <> 'listed'
     or nullif(trim(p_security ->> 'source'), '') is null then
    raise exception 'invalid verified security payload';
  end if;

  if jsonb_typeof(coalesce(p_aliases, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_memberships, '[]'::jsonb)) <> 'array' then
    raise exception 'aliases and memberships must be arrays';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_memberships, '[]'::jsonb)) m
    where m ->> 'universe' not in ('a_stock','a_exchange_fund','a_cb','hk_main','sp500','nasdaq_top500','us_china')
  ) then
    raise exception 'unapproved security universe';
  end if;

  insert into public.stocks_universe (
    ticker, symbol, name, name_en, full_name, pinyin, market, exchange,
    asset_type, fund_subtype, instrument_form, currency, country_code,
    industry, list_status, list_date, delist_date, is_active, source,
    source_updated_at, metadata, updated_at
  ) values (
    v_ticker,
    p_security ->> 'symbol',
    p_security ->> 'name',
    nullif(p_security ->> 'name_en', ''),
    nullif(p_security ->> 'full_name', ''),
    nullif(p_security ->> 'pinyin', ''),
    v_market::public.market_t,
    p_security ->> 'exchange',
    v_asset_type,
    nullif(p_security ->> 'fund_subtype', ''),
    nullif(p_security ->> 'instrument_form', ''),
    p_security ->> 'currency',
    nullif(p_security ->> 'country_code', ''),
    nullif(p_security ->> 'industry', ''),
    p_security ->> 'list_status',
    nullif(p_security ->> 'list_date', '')::date,
    nullif(p_security ->> 'delist_date', '')::date,
    true,
    p_security ->> 'source',
    (p_security ->> 'source_updated_at')::timestamptz,
    coalesce(p_security -> 'metadata', '{}'::jsonb),
    now()
  )
  on conflict (ticker) do update set
    symbol = excluded.symbol,
    name = excluded.name,
    name_en = excluded.name_en,
    full_name = excluded.full_name,
    pinyin = excluded.pinyin,
    market = excluded.market,
    exchange = excluded.exchange,
    asset_type = excluded.asset_type,
    fund_subtype = excluded.fund_subtype,
    instrument_form = excluded.instrument_form,
    currency = excluded.currency,
    country_code = excluded.country_code,
    industry = excluded.industry,
    list_status = excluded.list_status,
    list_date = excluded.list_date,
    delist_date = excluded.delist_date,
    is_active = true,
    source = excluded.source,
    source_updated_at = excluded.source_updated_at,
    metadata = excluded.metadata,
    updated_at = now();

  insert into public.security_aliases(alias, ticker, alias_type, source)
  select lower(trim(a.alias)), v_ticker, a.alias_type, a.source
  from jsonb_to_recordset(coalesce(p_aliases, '[]'::jsonb))
    as a(alias text, alias_type text, source text)
  where nullif(trim(a.alias), '') is not null
    and a.alias_type in ('symbol','vendor','former_symbol','name','pinyin')
  on conflict (alias, ticker, alias_type) do update set source = excluded.source;

  insert into public.security_universe_memberships(
    ticker, universe, rank, market_cap_usd, as_of_date, is_active, source, updated_at
  )
  select
    v_ticker, m.universe, m.rank, m.market_cap_usd, m.as_of_date,
    true, m.source, now()
  from jsonb_to_recordset(coalesce(p_memberships, '[]'::jsonb))
    as m(universe text, rank integer, market_cap_usd numeric, as_of_date date, source text)
  on conflict (ticker, universe) do update set
    rank = excluded.rank,
    market_cap_usd = excluded.market_cap_usd,
    as_of_date = excluded.as_of_date,
    is_active = true,
    source = excluded.source,
    updated_at = now();

  return v_ticker;
end;
$$;

revoke execute on function public.promote_verified_security(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.promote_verified_security(jsonb, jsonb, jsonb) to service_role;

create or replace function public.commit_security_sync(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text;
  v_status text;
  v_accepted integer;
  v_inserted integer;
  v_deactivated integer;
begin
  select scope, status into v_scope, v_status
  from public.security_sync_runs
  where id = p_run_id
  for update;

  if v_status is null then raise exception 'sync run not found'; end if;
  if v_status <> 'staged' then raise exception 'sync run is not staged'; end if;

  select count(*) into v_accepted
  from public.security_sync_staging
  where run_id = p_run_id and record_kind = 'security';
  if v_accepted = 0 then raise exception 'staged run has no securities'; end if;

  select count(*) into v_inserted
  from public.security_sync_staging st
  where st.run_id = p_run_id and st.record_kind = 'security'
    and not exists (
      select 1 from public.stocks_universe s
      where s.ticker = st.normalized_payload ->> 'ticker'
    );

  insert into public.stocks_universe (
    ticker, symbol, name, name_en, full_name, pinyin, market, exchange,
    asset_type, fund_subtype, instrument_form, currency, country_code,
    industry, list_status, list_date, delist_date, is_active, source,
    source_updated_at, metadata, updated_at
  )
  select
    p ->> 'ticker', p ->> 'symbol', p ->> 'name', nullif(p ->> 'name_en', ''),
    nullif(p ->> 'full_name', ''), nullif(p ->> 'pinyin', ''),
    (p ->> 'market')::public.market_t, p ->> 'exchange', p ->> 'asset_type',
    nullif(p ->> 'fund_subtype', ''), nullif(p ->> 'instrument_form', ''),
    p ->> 'currency', nullif(p ->> 'country_code', ''), nullif(p ->> 'industry', ''),
    p ->> 'list_status', nullif(p ->> 'list_date', '')::date,
    nullif(p ->> 'delist_date', '')::date, (p ->> 'is_active')::boolean,
    p ->> 'source', (p ->> 'source_updated_at')::timestamptz,
    coalesce(p -> 'metadata', '{}'::jsonb), now()
  from (
    select normalized_payload as p
    from public.security_sync_staging
    where run_id = p_run_id and record_kind = 'security'
  ) rows
  on conflict (ticker) do update set
    symbol = excluded.symbol, name = excluded.name, name_en = excluded.name_en,
    full_name = excluded.full_name, pinyin = excluded.pinyin, market = excluded.market,
    exchange = excluded.exchange, asset_type = excluded.asset_type,
    fund_subtype = excluded.fund_subtype, instrument_form = excluded.instrument_form,
    currency = excluded.currency, country_code = excluded.country_code,
    industry = excluded.industry, list_status = excluded.list_status,
    list_date = excluded.list_date, delist_date = excluded.delist_date,
    is_active = excluded.is_active, source = excluded.source,
    source_updated_at = excluded.source_updated_at, metadata = excluded.metadata,
    updated_at = now();

  insert into public.security_aliases(alias, ticker, alias_type, source)
  select lower(trim(p ->> 'alias')), p ->> 'ticker', p ->> 'alias_type', p ->> 'source'
  from (
    select normalized_payload as p
    from public.security_sync_staging
    where run_id = p_run_id and record_kind = 'alias'
  ) rows
  on conflict (alias, ticker, alias_type) do update set source = excluded.source;

  select count(*) into v_deactivated
  from public.security_universe_memberships m
  where m.universe = v_scope and m.is_active
    and not exists (
      select 1 from public.security_sync_staging st
      where st.run_id = p_run_id and st.record_kind = 'membership'
        and st.normalized_payload ->> 'ticker' = m.ticker
        and st.normalized_payload ->> 'universe' = m.universe
    );

  update public.security_universe_memberships m
  set is_active = false, updated_at = now()
  where m.universe = v_scope and m.is_active
    and not exists (
      select 1 from public.security_sync_staging st
      where st.run_id = p_run_id and st.record_kind = 'membership'
        and st.normalized_payload ->> 'ticker' = m.ticker
        and st.normalized_payload ->> 'universe' = m.universe
    );

  insert into public.security_universe_memberships(
    ticker, universe, rank, market_cap_usd, as_of_date, is_active, source, updated_at
  )
  select
    p ->> 'ticker', p ->> 'universe', nullif(p ->> 'rank', '')::integer,
    nullif(p ->> 'market_cap_usd', '')::numeric, (p ->> 'as_of_date')::date,
    (p ->> 'is_active')::boolean, p ->> 'source', now()
  from (
    select normalized_payload as p
    from public.security_sync_staging
    where run_id = p_run_id and record_kind = 'membership'
  ) rows
  on conflict (ticker, universe) do update set
    rank = excluded.rank, market_cap_usd = excluded.market_cap_usd,
    as_of_date = excluded.as_of_date, is_active = excluded.is_active,
    source = excluded.source, updated_at = now();

  update public.security_sync_runs
  set status = 'success', completed_at = now(), accepted_count = v_accepted,
      inserted_count = v_inserted, updated_count = v_accepted - v_inserted,
      deactivated_count = v_deactivated, error_code = null, error_message = null
  where id = p_run_id;

  delete from public.security_sync_staging where run_id = p_run_id;
end;
$$;

revoke execute on function public.commit_security_sync(uuid) from public, anon, authenticated;
grant execute on function public.commit_security_sync(uuid) to service_role;
