begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(10);

insert into auth.users (id, email)
values ('81000000-0000-0000-0000-000000000001', 'watchlist-rate-limit@example.test');

select has_table('public', 'watchlist_api_rate_limits', 'Watchlist API rate counters exist');
select is(
  has_table_privilege('authenticated', 'public.watchlist_api_rate_limits', 'INSERT'),
  false,
  'authenticated users cannot forge rate counters'
);
select is(
  has_function_privilege('authenticated', 'public.consume_watchlist_api_rate_limit(text)', 'EXECUTE'),
  true,
  'authenticated routes can consume their own fixed action limit'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.consume_watchlist_api_rate_limit('invented')$$,
  'P0001',
  'invalid_watchlist_rate_limit_action',
  'unknown actions cannot choose their own limits'
);
select is(
  (public.consume_watchlist_api_rate_limit('import') ->> 'allowed')::boolean,
  true,
  'the first import request is allowed'
);
do $$
begin
  for i in 1..5 loop
    perform public.consume_watchlist_api_rate_limit('import');
  end loop;
end;
$$;
select is(
  (public.consume_watchlist_api_rate_limit('import') ->> 'allowed')::boolean,
  false,
  'requests beyond the fixed import burst are denied'
);
select ok(
  (public.consume_watchlist_api_rate_limit('import') ->> 'retryAfterSeconds')::integer > 0,
  'denied requests return a positive retry delay'
);
select throws_ok(
  'select count(*) from public.watchlist_api_rate_limits',
  '42501',
  'permission denied for table watchlist_api_rate_limits',
  'authenticated users cannot read private counters'
);
select throws_ok(
  'select public.cleanup_watchlist_api_rate_limits(7, 0)',
  'P0001',
  'service_role_required',
  'authenticated users cannot remove rate counters'
);

reset role;
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is(
  (select count(*)::integer from public.watchlist_release_markers where marker = 'watchlist_api_rate_limits'),
  1,
  'the production release marker exists'
);

reset role;
select * from finish();
rollback;
