-- Atomic plan limits for persistent Watchlist resources and research refreshes.
create table if not exists public.watchlist_feature_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('research_refresh')),
  usage_date date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, usage_date)
);

alter table public.watchlist_feature_usage enable row level security;
revoke all on public.watchlist_feature_usage from anon, authenticated;
grant all on public.watchlist_feature_usage to service_role;

create or replace function public.effective_watchlist_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when p.role = 'admin' then 'admin'
      when p.plan = 'pro' and (p.plan_expires_at is null or p.plan_expires_at > now()) then 'pro'
      else 'free'
    end
    from public.profiles p
    where p.id = p_user_id
  ), 'free');
$$;

revoke all on function public.effective_watchlist_plan(uuid) from public;

create or replace function public.enforce_watchlist_item_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := public.effective_watchlist_plan(new.user_id);
  v_limit integer;
begin
  if v_plan = 'admin' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 71201));
  if exists (
    select 1 from public.watchlist_items wi
    where wi.watchlist_id = new.watchlist_id and wi.ticker = new.ticker
  ) then return new; end if;
  v_limit := case when v_plan = 'pro' then 500 else 50 end;
  if (select count(*) from public.watchlist_items wi where wi.user_id = new.user_id) >= v_limit then
    raise exception using errcode = 'P0001', message = 'watchlist_item_plan_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_watchlist_item_capacity_before_insert on public.watchlist_items;
create trigger enforce_watchlist_item_capacity_before_insert
  before insert on public.watchlist_items
  for each row execute function public.enforce_watchlist_item_capacity();

create or replace function public.enforce_watchlist_alert_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := public.effective_watchlist_plan(new.user_id);
  v_limit integer;
  v_count integer;
begin
  if not new.enabled or (tg_op = 'UPDATE' and old.enabled) or v_plan = 'admin' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 71202));
  if tg_op = 'INSERT' and exists (
    select 1 from public.watchlist_alerts a
    where a.watchlist_item_id = new.watchlist_item_id
      and a.alert_type = new.alert_type
      and coalesce(a.operator, '') = coalesce(new.operator, '')
      and coalesce(a.threshold_numeric, '-999999999999999999'::numeric)
        = coalesce(new.threshold_numeric, '-999999999999999999'::numeric)
      and md5(a.config::text) = md5(new.config::text)
  ) then return new; end if;
  v_limit := case when v_plan = 'pro' then 100 else 10 end;
  select count(*) into v_count from public.watchlist_alerts a
  where a.user_id = new.user_id and a.enabled and (tg_op = 'INSERT' or a.id <> new.id);
  if v_count >= v_limit then
    raise exception using errcode = 'P0001', message = 'watchlist_alert_plan_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_watchlist_alert_capacity_before_write on public.watchlist_alerts;
create trigger enforce_watchlist_alert_capacity_before_write
  before insert or update of enabled on public.watchlist_alerts
  for each row execute function public.enforce_watchlist_alert_capacity();

revoke all on function public.enforce_watchlist_item_capacity() from public;
revoke all on function public.enforce_watchlist_alert_capacity() from public;

create or replace function public.consume_watchlist_research_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text;
  v_limit integer;
  v_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_used integer;
begin
  if v_user_id is null then raise exception 'watchlist_auth_required'; end if;
  v_plan := public.effective_watchlist_plan(v_user_id);
  if v_plan = 'admin' then return jsonb_build_object('allowed', true, 'used', 0, 'limit', -1, 'plan', v_plan); end if;
  v_limit := case when v_plan = 'pro' then 100 else 10 end;
  insert into public.watchlist_feature_usage (user_id, feature, usage_date, used)
  values (v_user_id, 'research_refresh', v_date, 0)
  on conflict (user_id, feature, usage_date) do nothing;
  select used into v_used from public.watchlist_feature_usage
  where user_id = v_user_id and feature = 'research_refresh' and usage_date = v_date
  for update;
  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit, 'plan', v_plan);
  end if;
  update public.watchlist_feature_usage
  set used = used + 1, updated_at = now()
  where user_id = v_user_id and feature = 'research_refresh' and usage_date = v_date
  returning used into v_used;
  return jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'plan', v_plan);
end;
$$;

revoke all on function public.consume_watchlist_research_quota() from public;
grant execute on function public.consume_watchlist_research_quota() to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_plan_limits')
on conflict (marker) do nothing;
