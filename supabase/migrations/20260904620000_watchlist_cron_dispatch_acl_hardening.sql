-- CREATE OR REPLACE FUNCTION preserves explicit legacy ACLs. Revoke every
-- public-facing role so scheduler RPCs remain service-role-only on upgrades.
revoke all on function public.claim_watchlist_cron_dispatch_slots(timestamptz, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.finish_watchlist_cron_dispatch_slot(timestamptz, uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function public.cleanup_watchlist_cron_dispatch_slots(integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_watchlist_cron_dispatch_health()
  from public, anon, authenticated;

grant execute on function public.claim_watchlist_cron_dispatch_slots(timestamptz, integer, integer, integer)
  to service_role;
grant execute on function public.finish_watchlist_cron_dispatch_slot(timestamptz, uuid, boolean, text)
  to service_role;
grant execute on function public.cleanup_watchlist_cron_dispatch_slots(integer, integer)
  to service_role;
grant execute on function public.get_watchlist_cron_dispatch_health()
  to service_role;

insert into public.watchlist_release_markers (marker)
values ('watchlist_cron_dispatch_acl_hardening')
on conflict (marker) do nothing;
