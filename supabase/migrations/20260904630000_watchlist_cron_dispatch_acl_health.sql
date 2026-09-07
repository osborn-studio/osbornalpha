-- Production schema checks use this service-only projection to prove that
-- scheduler RPC ACLs have not drifted after an upgrade.
create or replace function public.get_watchlist_cron_dispatch_acl_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required'; end if;
  return jsonb_build_object(
    'claim', jsonb_build_object(
      'anon', has_function_privilege('anon', 'public.claim_watchlist_cron_dispatch_slots(timestamptz,integer,integer,integer)', 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', 'public.claim_watchlist_cron_dispatch_slots(timestamptz,integer,integer,integer)', 'EXECUTE'),
      'service_role', has_function_privilege('service_role', 'public.claim_watchlist_cron_dispatch_slots(timestamptz,integer,integer,integer)', 'EXECUTE')
    ),
    'finish', jsonb_build_object(
      'anon', has_function_privilege('anon', 'public.finish_watchlist_cron_dispatch_slot(timestamptz,uuid,boolean,text)', 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', 'public.finish_watchlist_cron_dispatch_slot(timestamptz,uuid,boolean,text)', 'EXECUTE'),
      'service_role', has_function_privilege('service_role', 'public.finish_watchlist_cron_dispatch_slot(timestamptz,uuid,boolean,text)', 'EXECUTE')
    ),
    'cleanup', jsonb_build_object(
      'anon', has_function_privilege('anon', 'public.cleanup_watchlist_cron_dispatch_slots(integer,integer)', 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', 'public.cleanup_watchlist_cron_dispatch_slots(integer,integer)', 'EXECUTE'),
      'service_role', has_function_privilege('service_role', 'public.cleanup_watchlist_cron_dispatch_slots(integer,integer)', 'EXECUTE')
    ),
    'health', jsonb_build_object(
      'anon', has_function_privilege('anon', 'public.get_watchlist_cron_dispatch_health()', 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', 'public.get_watchlist_cron_dispatch_health()', 'EXECUTE'),
      'service_role', has_function_privilege('service_role', 'public.get_watchlist_cron_dispatch_health()', 'EXECUTE')
    )
  );
end;
$$;

revoke all on function public.get_watchlist_cron_dispatch_acl_health() from public, anon, authenticated;
grant execute on function public.get_watchlist_cron_dispatch_acl_health() to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_cron_dispatch_acl_health')
on conflict (marker) do nothing;
