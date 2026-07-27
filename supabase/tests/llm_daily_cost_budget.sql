begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(32);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'budget-one@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'budget-expired@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'budget-beijing@example.test');

create temporary table budget_test_results (
  label text primary key,
  allowed boolean,
  reservation_id uuid,
  used_micrormb bigint,
  limit_micrormb bigint,
  status text,
  reserved_micrormb bigint,
  settled_micrormb bigint,
  settled_at timestamptz
);

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'first reservation', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000001',
  'copilot',
  'openai',
  'gpt-test',
  600,
  1000,
  300
);

select is(
  (select allowed from budget_test_results where label = 'first reservation'),
  true,
  'the first reservation is allowed'
);
select ok(
  (select reservation_id is not null from budget_test_results where label = 'first reservation'),
  'an allowed reservation returns its id'
);
select is(
  (select used_micrormb from budget_test_results where label = 'first reservation'),
  0::bigint,
  'the first reservation reports zero prior daily usage'
);
select is(
  (select limit_micrormb from budget_test_results where label = 'first reservation'),
  1000::bigint,
  'the reservation reports the enforced daily limit'
);

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'denied reservation', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000001',
  'copilot',
  'openai',
  'gpt-test',
  401,
  1000,
  300
);

select is(
  (select allowed from budget_test_results where label = 'denied reservation'),
  false,
  'a reservation that would exceed the limit is denied'
);
select is(
  (select reservation_id from budget_test_results where label = 'denied reservation'),
  null::uuid,
  'a denied reservation does not create an id'
);
select is(
  (select used_micrormb from budget_test_results where label = 'denied reservation'),
  600::bigint,
  'a denial reports current reserved daily usage'
);

insert into budget_test_results (
  label, reservation_id, status, reserved_micrormb, settled_micrormb, settled_at
)
select
  'first settlement',
  reservation_id,
  status,
  reserved_micrormb,
  settled_micrormb,
  settled_at
from public.settle_llm_budget(
  (select reservation_id from budget_test_results where label = 'first reservation'),
  550
);

select is(
  (select status from budget_test_results where label = 'first settlement'),
  'settled',
  'settling a reservation marks it settled'
);
select is(
  (select settled_micrormb from budget_test_results where label = 'first settlement'),
  550::bigint,
  'settling records the actual cost'
);

insert into budget_test_results (
  label, reservation_id, status, reserved_micrormb, settled_micrormb, settled_at
)
select
  'repeat settlement',
  reservation_id,
  status,
  reserved_micrormb,
  settled_micrormb,
  settled_at
from public.settle_llm_budget(
  (select reservation_id from budget_test_results where label = 'first reservation'),
  1
);

select is(
  (select status from budget_test_results where label = 'repeat settlement'),
  'settled',
  'settling an already-settled reservation remains settled'
);
select is(
  (select settled_micrormb from budget_test_results where label = 'repeat settlement'),
  550::bigint,
  'repeat settlement does not overwrite actual cost'
);
select is(
  (select settled_at from budget_test_results where label = 'repeat settlement'),
  (select settled_at from budget_test_results where label = 'first settlement'),
  'repeat settlement does not change its timestamp'
);

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'release candidate', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000001',
  'perspectives',
  'openai',
  'gpt-test',
  100,
  1000,
  300
);

insert into budget_test_results (
  label, reservation_id, status, reserved_micrormb, settled_micrormb, settled_at
)
select
  'first release',
  reservation_id,
  status,
  reserved_micrormb,
  settled_micrormb,
  settled_at
from public.release_llm_budget(
  (select reservation_id from budget_test_results where label = 'release candidate')
);

insert into budget_test_results (
  label, reservation_id, status, reserved_micrormb, settled_micrormb, settled_at
)
select
  'repeat release',
  reservation_id,
  status,
  reserved_micrormb,
  settled_micrormb,
  settled_at
from public.release_llm_budget(
  (select reservation_id from budget_test_results where label = 'release candidate')
);

select is(
  (select status from budget_test_results where label = 'first release'),
  'released',
  'releasing a reservation marks it released'
);
select is(
  (select status from budget_test_results where label = 'repeat release'),
  'released',
  'releasing an already-released reservation is idempotent'
);
select is(
  (select settled_micrormb from budget_test_results where label = 'repeat release'),
  null::bigint,
  'release does not fabricate a settled cost'
);

insert into public.llm_cost_reservations (
  user_id, feature, provider, model, reserved_micrormb, status, expires_at
)
values (
  '10000000-0000-0000-0000-000000000002',
  'brief_preview',
  'openai',
  'gpt-test',
  1000,
  'reserved',
  now() - interval '1 second'
);

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'after expiration', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000002',
  'brief_preview',
  'openai',
  'gpt-test',
  1000,
  1000,
  300
);

select is(
  (select allowed from budget_test_results where label = 'after expiration'),
  true,
  'an expired reservation is excluded from the daily budget'
);
select is(
  (select used_micrormb from budget_test_results where label = 'after expiration'),
  0::bigint,
  'expired reservations do not contribute to reported usage'
);

insert into public.llm_cost_reservations (
  user_id,
  feature,
  provider,
  model,
  reserved_micrormb,
  settled_micrormb,
  status,
  expires_at,
  created_at,
  settled_at
)
values
  (
    '10000000-0000-0000-0000-000000000003',
    'copilot',
    'openai',
    'gpt-test',
    900,
    900,
    'settled',
    now() + interval '1 hour',
    (date_trunc('day', now() at time zone 'Asia/Shanghai')
      at time zone 'Asia/Shanghai') - interval '1 microsecond',
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'copilot',
    'openai',
    'gpt-test',
    100,
    100,
    'settled',
    now() + interval '1 hour',
    date_trunc('day', now() at time zone 'Asia/Shanghai')
      at time zone 'Asia/Shanghai',
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'copilot',
    'openai',
    'gpt-test',
    200,
    null,
    'reserved',
    now() + interval '1 hour',
    date_trunc('day', now() at time zone 'Asia/Shanghai')
      at time zone 'Asia/Shanghai',
    null
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'copilot',
    'openai',
    'gpt-test',
    900,
    900,
    'settled',
    now() + interval '1 hour',
    (date_trunc('day', now() at time zone 'Asia/Shanghai') + interval '1 day')
      at time zone 'Asia/Shanghai',
    now()
  );

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'beijing current day', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000003',
  'copilot',
  'openai',
  'gpt-test',
  700,
  1000,
  300
);

select is(
  (select allowed from budget_test_results where label = 'beijing current day'),
  true,
  'the Beijing day includes its start and excludes adjacent-day rows'
);
select is(
  (select used_micrormb from budget_test_results where label = 'beijing current day'),
  300::bigint,
  'the Beijing current-day usage sums settled actual and active reservations'
);
select is(
  (
    select allowed
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000003',
      'copilot',
      'openai',
      'gpt-test',
      1,
      1000,
      300
    )
  ),
  false,
  'the exact Beijing-day limit cannot be exceeded'
);

select is(
  (
    select allowed
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000003',
      'copilot',
      'openai',
      'gpt-test',
      9223372036854775807,
      9223372036854775807,
      300
    )
  ),
  false,
  'budget comparison does not overflow bigint arithmetic'
);

select throws_ok(
  $$
    select *
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000001',
      'not-a-feature',
      'openai',
      'gpt-test',
      1,
      1000,
      300
    )
  $$,
  '22023',
  'invalid LLM feature',
  'invalid features are rejected'
);
select throws_ok(
  $$
    select *
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000001',
      'copilot',
      ' ',
      'gpt-test',
      1,
      1000,
      300
    )
  $$,
  '22023',
  'provider and model are required',
  'blank providers are rejected'
);
select throws_ok(
  $$
    select *
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000001',
      'copilot',
      'openai',
      'gpt-test',
      0,
      1000,
      300
    )
  $$,
  '22023',
  'requested cost must be positive',
  'zero-cost reservations are rejected'
);
select throws_ok(
  $$
    select *
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000001',
      'copilot',
      'openai',
      'gpt-test',
      1,
      0,
      300
    )
  $$,
  '22023',
  'daily limit must be positive',
  'zero daily limits are rejected'
);
select throws_ok(
  $$
    select *
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000001',
      'copilot',
      'openai',
      'gpt-test',
      1,
      1000,
      0
    )
  $$,
  '22023',
  'TTL must be between 1 and 86400 seconds',
  'non-positive reservation TTLs are rejected'
);
select throws_ok(
  format(
    'select * from public.settle_llm_budget(%L::uuid, -1)',
    (select reservation_id from budget_test_results where label = 'first reservation')
  ),
  '22023',
  'actual cost must be non-negative',
  'negative settlement costs are rejected'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.reserve_llm_daily_budget(uuid,text,text,text,bigint,bigint,integer)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot reserve budget'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.settle_llm_budget(uuid,bigint)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot settle budget'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.release_llm_budget(uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot release budget'
);
select is(
  has_table_privilege('authenticated', 'public.llm_cost_reservations', 'SELECT'),
  false,
  'authenticated cannot directly read reservations'
);
select is(
  has_table_privilege('authenticated', 'public.llm_cost_reservations', 'INSERT'),
  false,
  'authenticated cannot directly insert reservations'
);

select * from finish();
rollback;
