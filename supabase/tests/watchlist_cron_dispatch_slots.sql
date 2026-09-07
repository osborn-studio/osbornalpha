begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(45);

select has_table('public', 'watchlist_cron_dispatch_slots', 'cron dispatch slot ledger exists');
select is(
  has_table_privilege('authenticated', 'public.watchlist_cron_dispatch_slots', 'SELECT'),
  false,
  'authenticated users cannot inspect scheduler state'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.claim_watchlist_cron_dispatch_slots(timestamptz,integer,integer,integer)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot claim scheduler leases'
);
select is(
  has_function_privilege('authenticated', 'public.finish_watchlist_cron_dispatch_slot(timestamptz,uuid,boolean,text)', 'EXECUTE'),
  false,
  'authenticated users cannot finish scheduler leases'
);
select is(
  has_function_privilege('authenticated', 'public.cleanup_watchlist_cron_dispatch_slots(integer,integer)', 'EXECUTE'),
  false,
  'authenticated users cannot remove scheduler history'
);
select is(
  has_function_privilege('authenticated', 'public.get_watchlist_cron_dispatch_health()', 'EXECUTE'),
  false,
  'authenticated users cannot inspect scheduler health'
);
select is(
  has_function_privilege('anon', 'public.claim_watchlist_cron_dispatch_slots(timestamptz,integer,integer,integer)', 'EXECUTE'),
  false,
  'anonymous users cannot claim scheduler leases'
);
select is(
  has_function_privilege('anon', 'public.finish_watchlist_cron_dispatch_slot(timestamptz,uuid,boolean,text)', 'EXECUTE'),
  false,
  'anonymous users cannot finish scheduler leases'
);
select is(
  has_function_privilege('anon', 'public.cleanup_watchlist_cron_dispatch_slots(integer,integer)', 'EXECUTE'),
  false,
  'anonymous users cannot remove scheduler history'
);
select is(
  has_function_privilege('anon', 'public.get_watchlist_cron_dispatch_health()', 'EXECUTE'),
  false,
  'anonymous users cannot inspect scheduler health'
);
select is(
  has_function_privilege('service_role', 'public.claim_watchlist_cron_dispatch_slots(timestamptz,integer,integer,integer)', 'EXECUTE'),
  true,
  'service role can claim scheduler leases'
);
select is(
  has_function_privilege('service_role', 'public.finish_watchlist_cron_dispatch_slot(timestamptz,uuid,boolean,text)', 'EXECUTE'),
  true,
  'service role can finish scheduler leases'
);
select is(
  has_function_privilege('service_role', 'public.cleanup_watchlist_cron_dispatch_slots(integer,integer)', 'EXECUTE'),
  true,
  'service role can remove scheduler history'
);
select is(
  has_function_privilege('service_role', 'public.get_watchlist_cron_dispatch_health()', 'EXECUTE'),
  true,
  'service role can inspect scheduler health'
);
select is(
  has_function_privilege('anon', 'public.get_watchlist_cron_dispatch_acl_health()', 'EXECUTE'),
  false,
  'anonymous users cannot inspect scheduler ACL health'
);
select is(
  has_function_privilege('authenticated', 'public.get_watchlist_cron_dispatch_acl_health()', 'EXECUTE'),
  false,
  'authenticated users cannot inspect scheduler ACL health'
);
select is(
  has_function_privilege('service_role', 'public.get_watchlist_cron_dispatch_acl_health()', 'EXECUTE'),
  true,
  'service role can inspect scheduler ACL health'
);

select pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  'select public.get_watchlist_cron_dispatch_acl_health()',
  '42501',
  'permission denied for function get_watchlist_cron_dispatch_acl_health',
  'anonymous callers cannot execute scheduler ACL health'
);

reset role;
select pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  'select public.get_watchlist_cron_dispatch_acl_health()',
  '42501',
  'permission denied for function get_watchlist_cron_dispatch_acl_health',
  'authenticated callers cannot execute scheduler ACL health'
);

reset role;

select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

create temporary table claimed_dispatch_slots on commit drop as
select * from public.claim_watchlist_cron_dispatch_slots('2026-09-05T12:37:00Z', 30, 8, 5);

select is((select count(*)::integer from claimed_dispatch_slots), 3, 'claim creates the bounded missed-slot window');
select is((select min(scheduled_for)::text from claimed_dispatch_slots), '2026-09-05 12:00:00+00', 'claim starts at the oldest missed slot');
select is((select count(*)::integer from claimed_dispatch_slots where status = 'running'), 3, 'claimed slots hold running leases');
select is((select min(attempt_count) from claimed_dispatch_slots), 1, 'the first claim records one attempt');

select ok(
  public.finish_watchlist_cron_dispatch_slot(
    '2026-09-05T12:00:00Z',
    (select lease_token from claimed_dispatch_slots where scheduled_for = '2026-09-05T12:00:00Z'),
    true,
    null
  ),
  'the lease owner can finish a slot'
);
select ok(
  public.finish_watchlist_cron_dispatch_slot(
    '2026-09-05T12:15:00Z',
    (select lease_token from claimed_dispatch_slots where scheduled_for = '2026-09-05T12:15:00Z'),
    false,
    'provider_unavailable'
  ),
  'the lease owner can leave a failed slot retryable'
);
select is(
  (select status from public.watchlist_cron_dispatch_slots where scheduled_for = '2026-09-05T12:15:00Z'),
  'failed',
  'failed slots remain eligible for another claim'
);
select is(
  (select count(*)::integer from public.claim_watchlist_cron_dispatch_slots('2026-09-05T12:37:00Z', 30, 8, 5)),
  1,
  'a retry claim excludes succeeded and actively leased slots'
);
select is(
  (select count(*)::integer from public.watchlist_release_markers where marker = 'watchlist_cron_dispatch_slots'),
  1,
  'the production release marker exists'
);
select has_function(
  'public',
  'get_watchlist_cron_dispatch_health',
  array[]::text[],
  'the scheduler exposes a service health projection'
);
select is(
  jsonb_typeof(public.get_watchlist_cron_dispatch_health()),
  'object',
  'the scheduler health projection is structured'
);
select is(
  (select count(*)::integer from public.watchlist_release_markers where marker = 'watchlist_cron_dispatch_acl_hardening'),
  1,
  'the scheduler ACL hardening release marker exists'
);
select has_function(
  'public',
  'get_watchlist_cron_dispatch_acl_health',
  array[]::text[],
  'the scheduler exposes a service-only ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'claim' ->> 'anon',
  'false',
  'anonymous users cannot claim scheduler slots in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'claim' ->> 'authenticated',
  'false',
  'authenticated users cannot claim scheduler slots in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'claim' ->> 'service_role',
  'true',
  'service role can claim scheduler slots in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'finish' ->> 'anon',
  'false',
  'anonymous users cannot finish scheduler slots in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'finish' ->> 'authenticated',
  'false',
  'authenticated users cannot finish scheduler slots in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'finish' ->> 'service_role',
  'true',
  'service role can finish scheduler slots in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'cleanup' ->> 'anon',
  'false',
  'anonymous users cannot clean scheduler history in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'cleanup' ->> 'authenticated',
  'false',
  'authenticated users cannot clean scheduler history in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'cleanup' ->> 'service_role',
  'true',
  'service role can clean scheduler history in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'health' ->> 'anon',
  'false',
  'anonymous users cannot inspect scheduler health in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'health' ->> 'authenticated',
  'false',
  'authenticated users cannot inspect scheduler health in the ACL health projection'
);
select is(
  public.get_watchlist_cron_dispatch_acl_health() -> 'health' ->> 'service_role',
  'true',
  'service role can inspect scheduler health in the ACL health projection'
);
select is(
  (select count(*)::integer from public.watchlist_release_markers where marker = 'watchlist_cron_dispatch_acl_health'),
  1,
  'the scheduler ACL health release marker exists'
);

reset role;
select * from finish();
rollback;
