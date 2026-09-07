begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(12);

insert into auth.users (id, email)
values
  ('80000000-0000-0000-0000-000000000001', 'watchlist-bulk-owner@example.test'),
  ('80000000-0000-0000-0000-000000000002', 'watchlist-bulk-other@example.test');

select has_table('public', 'watchlist_bulk_workflow_runs', 'bulk workflow runs exist');
select is(
  has_table_privilege('authenticated', 'public.watchlist_bulk_workflow_runs', 'INSERT'),
  false,
  'authenticated users cannot forge run records'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  public.begin_watchlist_bulk_workflow(
    'request-owner-1', repeat('a', 64), 'research', 5
  ) ->> 'state',
  'acquired',
  'the first request acquires a lease'
);
select is(
  public.begin_watchlist_bulk_workflow(
    'request-owner-1', repeat('a', 64), 'research', 5
  ) ->> 'state',
  'in_progress',
  'a concurrent duplicate does not execute twice'
);
select ok(
  public.finish_watchlist_bulk_workflow(
    (select id from public.watchlist_bulk_workflow_runs where request_id = 'request-owner-1'),
    (select lease_token from public.watchlist_bulk_workflow_runs where request_id = 'request-owner-1'),
    '{"requestId":"request-owner-1","operation":"research","total":1,"succeeded":1,"unchanged":0,"conflicted":0,"failed":0,"results":[{"key":"AAPL","status":"succeeded"}]}'::jsonb
  ),
  'the lease owner can persist the terminal result'
);
select is(
  public.begin_watchlist_bulk_workflow(
    'request-owner-1', repeat('a', 64), 'research', 5
  ) ->> 'state',
  'replay',
  'a completed duplicate replays its result'
);
select is(
  public.begin_watchlist_bulk_workflow(
    'request-owner-1', repeat('b', 64), 'research', 5
  ) ->> 'state',
  'conflict',
  'a reused request id cannot change command content'
);
select is(
  (select count(*)::integer from public.watchlist_bulk_workflow_runs),
  1,
  'the owner can read the run record'
);
select throws_ok(
  'select public.cleanup_watchlist_bulk_workflow_runs(30, 1)',
  'P0001',
  'service_role_required',
  'authenticated callers cannot delete run history'
);

reset role;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.watchlist_bulk_workflow_runs),
  0,
  'another user cannot read the owner run record'
);

reset role;
select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok(
  'select public.cleanup_watchlist_bulk_workflow_runs(30, 0)',
  'service role can run bounded retention'
);
select is(
  (select count(*)::integer from public.watchlist_release_markers where marker = 'watchlist_bulk_workflow_runs'),
  1,
  'the production release marker exists'
);

reset role;
select * from finish();
rollback;
