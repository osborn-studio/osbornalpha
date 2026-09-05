create or replace function public.authorize_watchlist_research_refresh()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan jsonb;
  v_evidence_allowed boolean;
  v_date date := (now() at time zone 'Asia/Shanghai')::date;
  v_used integer;
begin
  if v_user_id is null then raise exception 'watchlist_auth_required'; end if;
  v_plan := public.consume_watchlist_research_quota();
  if not coalesce((v_plan ->> 'allowed')::boolean, false) then
    return v_plan || jsonb_build_object('reason', 'plan_limit');
  end if;

  v_evidence_allowed := public.consume_external_evidence_user_quota(30, 3600);
  if v_evidence_allowed then
    return v_plan || jsonb_build_object('reason', null);
  end if;

  if v_plan ->> 'plan' <> 'admin' then
    update public.watchlist_feature_usage
    set used = greatest(used - 1, 0), updated_at = now()
    where user_id = v_user_id and feature = 'research_refresh' and usage_date = v_date
    returning used into v_used;
    v_plan := jsonb_set(v_plan, '{used}', to_jsonb(coalesce(v_used, 0)));
  end if;
  return v_plan || jsonb_build_object('allowed', false, 'reason', 'rate_limit');
end;
$$;

revoke all on function public.authorize_watchlist_research_refresh() from public;
grant execute on function public.authorize_watchlist_research_refresh() to authenticated;

insert into public.watchlist_release_markers (marker)
values ('watchlist_atomic_research_quota')
on conflict (marker) do nothing;
