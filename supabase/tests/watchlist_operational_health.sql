begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(5);

select has_function(
  'public',
  'get_watchlist_operational_health',
  array[]::text[],
  'the consolidated Watchlist health RPC exists'
);
select is(
  (select count(*)::integer from public.watchlist_release_markers where marker = 'watchlist_manual_research_job_health'),
  1,
  'the manual research health release marker exists'
);

select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  'select public.get_watchlist_operational_health()',
  'P0001',
  'watchlist_operational_health_service_role_required',
  'authenticated callers cannot read cross-user operational health'
);

reset role;
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok(
  'select public.get_watchlist_operational_health()',
  'service-role callers can load operational health'
);
select is(
  jsonb_typeof(public.get_watchlist_operational_health() -> 'manual_research_jobs'),
  'object',
  'the operational snapshot includes the manual research queue'
);

reset role;
select * from finish();
rollback;
