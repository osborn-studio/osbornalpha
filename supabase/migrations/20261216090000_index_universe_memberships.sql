alter table public.security_universe_memberships
  drop constraint security_universe_memberships_universe_check,
  add constraint security_universe_memberships_universe_check
    check (universe in ('a_stock','a_exchange_fund','a_cb','hk_main','sp500','nasdaq_top500','us_china','csi300','star50'));

create or replace function public.apply_index_membership(
  p_universe text, p_as_of date, p_source text, p_tickers text[], p_dry_run boolean default false
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_min integer;
  v_max integer;
  v_tickers text[];
  v_known text[];
  v_unknown text[];
  v_kept integer;
  v_deactivated integer;
begin
  case p_universe
    when 'csi300' then v_min := 250; v_max := 350;
    when 'star50' then v_min := 40; v_max := 60;
    else raise exception using errcode = '22023', message = 'invalid_index_universe';
  end case;

  v_tickers := array(select distinct t from pg_catalog.unnest(p_tickers) t order by t);
  if p_as_of is null or p_source is null or p_source !~ '[^[:space:]]' or p_dry_run is null
     or pg_catalog.cardinality(v_tickers) not between v_min and v_max
     or exists (select 1 from pg_catalog.unnest(v_tickers) t where t is null or t !~ '^\d{6}\.(SH|SZ|BJ)$') then
    raise exception using errcode = '22023', message = 'invalid_index_snapshot';
  end if;

  -- Serialize snapshots before checking their dates, including concurrent first-time loads.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.apply_index_membership:' || p_universe, 0));
  if exists (select 1 from public.security_universe_memberships
             where universe = p_universe and as_of_date > p_as_of) then
    raise exception using errcode = '22023', message = 'stale_index_snapshot';
  end if;

  if p_dry_run then
    v_known := array(select ticker from public.stocks_universe where ticker = any(v_tickers));
  else
    -- Hold each known FK target until the upsert finishes. A concurrent deletion cannot invalidate the plan.
    v_known := array(select ticker from public.stocks_universe where ticker = any(v_tickers) order by ticker for key share);
  end if;
  v_unknown := array(select t from pg_catalog.unnest(v_tickers) t where t <> all(v_known) order by t);
  select pg_catalog.count(*) filter (where ticker = any(v_known)), pg_catalog.count(*) filter (where ticker <> all(v_tickers))
    into v_kept, v_deactivated
    from public.security_universe_memberships where universe = p_universe and is_active;

  if not p_dry_run then
    insert into public.security_universe_memberships(ticker, universe, as_of_date, source, is_active, rank, market_cap_usd, updated_at)
    select t, p_universe, p_as_of, p_source, true, null, null, pg_catalog.now() from pg_catalog.unnest(v_known) t
    on conflict (ticker, universe) do update
    set is_active = true, as_of_date = excluded.as_of_date, source = excluded.source,
        rank = null, market_cap_usd = null, updated_at = excluded.updated_at;

    update public.security_universe_memberships
    set is_active = false, as_of_date = p_as_of, source = p_source, updated_at = pg_catalog.now()
    where universe = p_universe and is_active and ticker <> all(v_tickers);
  end if;

  return pg_catalog.jsonb_build_object('universe', p_universe, 'as_of', p_as_of, 'fetched', pg_catalog.cardinality(v_tickers),
    'activated', pg_catalog.cardinality(v_known) - v_kept, 'kept', v_kept, 'deactivated', v_deactivated,
    'unknown', pg_catalog.cardinality(v_unknown), 'unknown_tickers', v_unknown, 'dry_run', p_dry_run);
end;
$$;

revoke all on function public.apply_index_membership(text,date,text,text[],boolean) from public, anon, authenticated;
grant execute on function public.apply_index_membership(text,date,text,text[],boolean) to service_role;

drop function if exists public.apply_csi300_membership(date,text,text[],boolean);
