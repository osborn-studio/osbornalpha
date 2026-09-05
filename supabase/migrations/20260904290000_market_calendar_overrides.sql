create table if not exists public.market_calendar_overrides (
  market text not null check (market in ('A', 'HK', 'US', 'JP', 'KR', 'TW')),
  date_key date not null,
  kind text not null check (kind in ('closed', 'sessions')),
  name text not null,
  sessions jsonb not null default '[]'::jsonb check (jsonb_typeof(sessions) = 'array'),
  source text not null,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (market, date_key)
);

create index if not exists market_calendar_overrides_date_idx
  on public.market_calendar_overrides (date_key, market);
alter table public.market_calendar_overrides enable row level security;
revoke all on table public.market_calendar_overrides from anon, authenticated;
grant select, insert, update, delete on table public.market_calendar_overrides to service_role;

create or replace function public.replace_market_calendar_overrides(
  p_rows jsonb,
  p_source text,
  p_from date,
  p_to date,
  p_markets text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or nullif(trim(p_source), '') is null
    or p_from is null or p_to is null or p_from > p_to
    or p_markets is null or cardinality(p_markets) = 0
    or exists (select 1 from unnest(p_markets) market where market not in ('A', 'HK', 'US', 'JP', 'KR', 'TW')) then
    raise exception 'invalid_market_calendar_replacement';
  end if;
  delete from public.market_calendar_overrides existing
  where existing.market = any(p_markets)
    and existing.date_key between p_from and p_to
    and not exists (
      select 1 from jsonb_to_recordset(p_rows) as incoming(market text, date_key date)
      where incoming.market = existing.market and incoming.date_key = existing.date_key
    );
  insert into public.market_calendar_overrides (
    market, date_key, kind, name, sessions, source, source_updated_at, fetched_at
  )
  select row.market, row.date_key, row.kind, row.name, row.sessions,
    p_source, row.source_updated_at, row.fetched_at
  from jsonb_to_recordset(p_rows) as row(
    market text, date_key date, kind text, name text, sessions jsonb,
    source text, source_updated_at timestamptz, fetched_at timestamptz
  )
  where row.market = any(p_markets) and row.date_key between p_from and p_to
  on conflict (market, date_key) do update set
    kind = excluded.kind,
    name = excluded.name,
    sessions = excluded.sessions,
    source = excluded.source,
    source_updated_at = excluded.source_updated_at,
    fetched_at = excluded.fetched_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_market_calendar_overrides(jsonb, text, date, date, text[]) from public;
grant execute on function public.replace_market_calendar_overrides(jsonb, text, date, date, text[]) to service_role;

insert into public.watchlist_release_markers (marker)
values ('market_calendar_overrides')
on conflict (marker) do nothing;
