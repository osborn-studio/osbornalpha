begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(104);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'budget-one@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'budget-expired@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'budget-beijing@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'budget-overflow@example.test'),
  ('10000000-0000-0000-0000-000000000005', 'budget-incurred@example.test'),
  ('10000000-0000-0000-0000-000000000006', 'budget-stale-mark@example.test'),
  ('10000000-0000-0000-0000-000000000007', 'budget-stale-settle@example.test');

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

do $$
declare
  v_reservation_id uuid;
begin
  select reservation_id
  into v_reservation_id
  from budget_test_results
  where label = 'first reservation';
  perform public.mark_llm_budget_incurred(v_reservation_id);
end;
$$;

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
select lives_ok(
  format(
    'select * from public.settle_llm_budget(%L::uuid, 601)',
    (select reservation_id from budget_test_results where label = 'first reservation')
  ),
  'a settled reservation ignores an oversized retry'
);
select is(
  (
    select status
    from public.llm_cost_reservations
    where id = (
      select reservation_id
      from budget_test_results
      where label = 'first reservation'
    )
  ),
  'settled',
  'an oversized settled retry leaves terminal status unchanged'
);
select is(
  (
    select settled_micrormb
    from public.llm_cost_reservations
    where id = (
      select reservation_id
      from budget_test_results
      where label = 'first reservation'
    )
  ),
  550::bigint,
  'an oversized settled retry leaves actual cost unchanged'
);
select is(
  (
    select settled_at
    from public.llm_cost_reservations
    where id = (
      select reservation_id
      from budget_test_results
      where label = 'first reservation'
    )
  ),
  (select settled_at from budget_test_results where label = 'first settlement'),
  'an oversized settled retry leaves its timestamp unchanged'
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
select lives_ok(
  format(
    'select * from public.settle_llm_budget(%L::uuid, 101)',
    (select reservation_id from budget_test_results where label = 'release candidate')
  ),
  'a released reservation ignores an oversized settlement retry'
);
select is(
  (
    select status
    from public.llm_cost_reservations
    where id = (
      select reservation_id
      from budget_test_results
      where label = 'release candidate'
    )
  ),
  'released',
  'an oversized released retry leaves terminal status unchanged'
);
select is(
  (
    select settled_micrormb
    from public.llm_cost_reservations
    where id = (
      select reservation_id
      from budget_test_results
      where label = 'release candidate'
    )
  ),
  null::bigint,
  'an oversized released retry leaves actual cost unchanged'
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

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'over-settlement candidate', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000001',
  'copilot',
  'openai',
  'gpt-test',
  200,
  1000,
  300
);

do $$
declare
  v_reservation_id uuid;
begin
  select reservation_id
  into v_reservation_id
  from budget_test_results
  where label = 'over-settlement candidate';
  perform public.mark_llm_budget_incurred(v_reservation_id);
end;
$$;

select throws_ok(
  format(
    'select * from public.settle_llm_budget(%L::uuid, 201)',
    (
      select reservation_id
      from budget_test_results
      where label = 'over-settlement candidate'
    )
  ),
  '22023',
  'actual cost exceeds reserved cost',
  'settlement cannot exceed its reserved upper bound'
);
select is(
  (
    select status
    from public.llm_cost_reservations
    where id = (
      select reservation_id
      from budget_test_results
      where label = 'over-settlement candidate'
    )
  ),
  'incurred',
  'rejected over-settlement leaves the incurred reservation durable'
);
select is(
  (
    select settled_micrormb
    from public.llm_cost_reservations
    where id = (
      select reservation_id
      from budget_test_results
      where label = 'over-settlement candidate'
    )
  ),
  null::bigint,
  'rejected over-settlement leaves actual cost unchanged'
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
  settled_at
)
values
  (
    '10000000-0000-0000-0000-000000000004',
    'copilot',
    'openai',
    'gpt-test',
    9223372036854775807,
    9223372036854775807,
    'settled',
    now() + interval '1 hour',
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'copilot',
    'openai',
    'gpt-test',
    1,
    1,
    'settled',
    now() + interval '1 hour',
    now()
  );

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'aggregate overflow boundary',
  allowed,
  reservation_id,
  used_micrormb,
  limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000004',
  'copilot',
  'openai',
  'gpt-test',
  1,
  9223372036854775807,
  300
);

select is(
  (
    select allowed
    from budget_test_results
    where label = 'aggregate overflow boundary'
  ),
  false,
  'an aggregate above bigint max is denied without arithmetic overflow'
);
select is(
  (
    select used_micrormb
    from budget_test_results
    where label = 'aggregate overflow boundary'
  ),
  9223372036854775807::bigint,
  'reported usage saturates at bigint max'
);

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'incurred candidate', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000005',
  'copilot',
  'deepseek',
  'deepseek-v4-flash',
  600,
  1000,
  1
);

insert into budget_test_results (
  label, reservation_id, status, reserved_micrormb, settled_micrormb, settled_at
)
select
  'first incurred mark',
  reservation_id,
  status,
  reserved_micrormb,
  settled_micrormb,
  settled_at
from public.mark_llm_budget_incurred(
  (select reservation_id from budget_test_results where label = 'incurred candidate')
);

select is(
  (select status from budget_test_results where label = 'first incurred mark'),
  'incurred',
  'marking a reservation records durable incurred state'
);
select is(
  (
    select status
    from public.mark_llm_budget_incurred(
      (select reservation_id from budget_test_results where label = 'incurred candidate')
    )
  ),
  'incurred',
  'marking incurred is idempotent'
);

update public.llm_cost_reservations
set expires_at = now() - interval '1 second'
where id = (select reservation_id from budget_test_results where label = 'incurred candidate');

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'after incurred expiration', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000005',
  'copilot',
  'deepseek',
  'deepseek-v4-flash',
  401,
  1000,
  300
);

select is(
  (select allowed from budget_test_results where label = 'after incurred expiration'),
  false,
  'incurred cost remains counted after reservation TTL'
);
select is(
  (select used_micrormb from budget_test_results where label = 'after incurred expiration'),
  600::bigint,
  'expired incurred cost reports its full reserved amount'
);
select is(
  (
    select status
    from public.release_llm_budget(
      (select reservation_id from budget_test_results where label = 'incurred candidate')
    )
  ),
  'incurred',
  'release never changes an incurred reservation'
);
select throws_ok(
  format(
    'select * from public.settle_llm_budget(%L::uuid, 601)',
    (select reservation_id from budget_test_results where label = 'incurred candidate')
  ),
  '22023',
  'actual cost exceeds reserved cost',
  'an incurred reservation rejects settlement above its cap'
);
select is(
  (
    select status
    from public.llm_cost_reservations
    where id = (select reservation_id from budget_test_results where label = 'incurred candidate')
  ),
  'incurred',
  'failed settlement leaves durable incurred state'
);
select is(
  (
    select allowed
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000005',
      'copilot',
      'deepseek',
      'deepseek-v4-flash',
      401,
      1000,
      300
    )
  ),
  false,
  'later budget checks continue to include failed incurred settlement'
);
select is(
  (
    select status
    from public.settle_llm_budget(
      (select reservation_id from budget_test_results where label = 'incurred candidate'),
      500
    )
  ),
  'settled',
  'incurred reservations settle to actual cost'
);
select is(
  (
    select settled_micrormb
    from public.llm_cost_reservations
    where id = (select reservation_id from budget_test_results where label = 'incurred candidate')
  ),
  500::bigint,
  'successful settlement reduces incurred reserve to actual cost'
);
select is(
  (
    select status
    from public.mark_llm_budget_incurred(
      (select reservation_id from budget_test_results where label = 'incurred candidate')
    )
  ),
  'settled',
  'marking a settled reservation preserves its terminal state'
);
select is(
  (
    select status
    from public.mark_llm_budget_incurred(
      (select reservation_id from budget_test_results where label = 'release candidate')
    )
  ),
  'released',
  'marking a released reservation preserves its terminal state'
);

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'stale mark candidate', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000006',
  'copilot',
  'deepseek',
  'deepseek-v4-flash',
  600,
  1000,
  300
);

update public.llm_cost_reservations
set expires_at = now() - interval '1 second'
where id = (select reservation_id from budget_test_results where label = 'stale mark candidate');

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'stale mark replacement', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000006',
  'copilot',
  'deepseek',
  'deepseek-v4-flash',
  1000,
  1000,
  300
);

select is(
  (select allowed from budget_test_results where label = 'stale mark replacement'),
  true,
  'an expired reservation can be replaced up to the full daily limit'
);
select throws_ok(
  format(
    'select * from public.mark_llm_budget_incurred(%L::uuid)',
    (select reservation_id from budget_test_results where label = 'stale mark candidate')
  ),
  '55000',
  'LLM cost reservation expired',
  'marking an expired reserved row is rejected'
);
select is(
  (
    select status
    from public.llm_cost_reservations
    where id = (select reservation_id from budget_test_results where label = 'stale mark candidate')
  ),
  'reserved',
  'a rejected stale mark never revives the expired reservation'
);
select is(
  (
    select allowed
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000006',
      'copilot',
      'deepseek',
      'deepseek-v4-flash',
      1,
      1000,
      300
    )
  ),
  false,
  'the replacement consumes the full daily limit after stale mark rejection'
);
select is(
  (
    select used_micrormb
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000006',
      'copilot',
      'deepseek',
      'deepseek-v4-flash',
      1,
      1000,
      300
    )
  ),
  1000::bigint,
  'counted daily cost remains the replacement amount after stale mark rejection'
);

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'stale settle candidate', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000007',
  'copilot',
  'deepseek',
  'deepseek-v4-flash',
  600,
  1000,
  300
);

select throws_ok(
  format(
    'select * from public.settle_llm_budget(%L::uuid, 500)',
    (select reservation_id from budget_test_results where label = 'stale settle candidate')
  ),
  '55000',
  'LLM cost reservation is not incurred',
  'a live reserved row cannot settle before provider spend is marked'
);
select is(
  (
    select status
    from public.llm_cost_reservations
    where id = (select reservation_id from budget_test_results where label = 'stale settle candidate')
  ),
  'reserved',
  'rejected live settlement leaves the reservation unchanged'
);

update public.llm_cost_reservations
set expires_at = now() - interval '1 second'
where id = (select reservation_id from budget_test_results where label = 'stale settle candidate');

insert into budget_test_results (
  label, allowed, reservation_id, used_micrormb, limit_micrormb
)
select
  'stale settle replacement', allowed, reservation_id, used_micrormb, limit_micrormb
from public.reserve_llm_daily_budget(
  '10000000-0000-0000-0000-000000000007',
  'copilot',
  'deepseek',
  'deepseek-v4-flash',
  1000,
  1000,
  300
);

select is(
  (select allowed from budget_test_results where label = 'stale settle replacement'),
  true,
  'an expired unsettled reservation can be replaced up to the full daily limit'
);
select throws_ok(
  format(
    'select * from public.settle_llm_budget(%L::uuid, 500)',
    (select reservation_id from budget_test_results where label = 'stale settle candidate')
  ),
  '55000',
  'LLM cost reservation is not incurred',
  'an expired reserved row cannot settle after replacement'
);
select is(
  (
    select status
    from public.llm_cost_reservations
    where id = (select reservation_id from budget_test_results where label = 'stale settle candidate')
  ),
  'reserved',
  'rejected stale settlement never revives the expired reservation'
);
select is(
  (
    select used_micrormb
    from public.reserve_llm_daily_budget(
      '10000000-0000-0000-0000-000000000007',
      'copilot',
      'deepseek',
      'deepseek-v4-flash',
      1,
      1000,
      300
    )
  ),
  1000::bigint,
  'counted daily cost remains the replacement amount after stale settlement rejection'
);

insert into public.llm_cost_reservations (
  id, user_id, feature, provider, model, reserved_micrormb, status, expires_at
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'copilot',
    'deepseek',
    'deepseek-v4-flash',
    1000,
    'incurred',
    now() + interval '5 minutes'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'perspectives',
    'deepseek',
    'deepseek-v4-flash',
    1000,
    'incurred',
    now() + interval '5 minutes'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'brief_preview',
    'deepseek',
    'deepseek-v4-flash',
    1000,
    'incurred',
    now() + interval '5 minutes'
  );

select lives_ok(
  $sql$
    select *
    from public.settle_llm_budget(
      '20000000-0000-0000-0000-000000000001',
      550,
      100,
      40,
      60,
      25,
      'pricing-v1',
      7200000,
      false
    )
  $sql$,
  'the audited settlement RPC commits cost and usage'
);
select is(
  (select status from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  'settled',
  'the audited settlement marks the reservation settled'
);
select is(
  (select settled_micrormb from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  550::bigint,
  'the audited settlement stores actual cost'
);
select is(
  (select input_tokens from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  100::bigint,
  'the audited settlement stores input tokens'
);
select is(
  (select cache_hit_input_tokens from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  40::bigint,
  'the audited settlement stores cache-hit tokens'
);
select is(
  (select cache_miss_input_tokens from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  60::bigint,
  'the audited settlement stores cache-miss tokens'
);
select is(
  (select output_tokens from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  25::bigint,
  'the audited settlement stores output tokens'
);
select is(
  (select pricing_version from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  'pricing-v1',
  'the audited settlement stores the pricing version'
);
select is(
  (select usd_cny_micros from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  7200000::bigint,
  'the audited settlement stores the FX snapshot'
);
select is(
  (select usage_estimated from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000001'),
  false,
  'the audited settlement stores the estimation flag'
);

select throws_ok(
  $sql$
    select *
    from public.settle_llm_budget(
      '20000000-0000-0000-0000-000000000002',
      550,
      100,
      40,
      61,
      25,
      'pricing-v1',
      7200000,
      false
    )
  $sql$,
  '22023',
  'invalid normalized usage',
  'an invalid usage tuple rolls the audited settlement back'
);
select is(
  (select status from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000002'),
  'incurred',
  'a failed audited settlement leaves incurred status unchanged'
);
select is(
  (select input_tokens from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000002'),
  null::bigint,
  'a failed audited settlement writes no partial token state'
);

select lives_ok(
  $sql$
    select *
    from public.finalize_llm_budget_incurred(
      '20000000-0000-0000-0000-000000000003',
      1000000,
      0,
      1000000,
      9000,
      'pricing-v1',
      7200000,
      true
    )
  $sql$,
  'an incurred provider failure can be finalized conservatively'
);
select is(
  (select status from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000003'),
  'incurred',
  'conservative finalization preserves incurred cost state'
);
select is(
  (select input_tokens from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000003'),
  1000000::bigint,
  'conservative finalization stores the reviewed input ceiling'
);
select is(
  (select usage_estimated from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000003'),
  true,
  'conservative finalization identifies estimated usage'
);
select lives_ok(
  $sql$
    select *
    from public.finalize_llm_budget_incurred(
      '20000000-0000-0000-0000-000000000003',
      1,
      0,
      1,
      1,
      'different-pricing',
      1,
      true
    )
  $sql$,
  'conservative finalization is idempotent'
);
select is(
  (select output_tokens from public.llm_cost_reservations where id = '20000000-0000-0000-0000-000000000003'),
  9000::bigint,
  'a repeated conservative finalization does not overwrite its first audit'
);

select is(
  public.record_usage_event(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'copilot',
    'NVDA',
    'deepseek',
    'deepseek-v4-flash',
    100,
    40,
    60,
    25,
    550,
    'pricing-v1',
    7200000,
    false,
    false,
    'completed'
  ),
  true,
  'the first trusted aggregate audit is inserted'
);
select is(
  public.record_usage_event(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'copilot',
    'NVDA',
    'deepseek',
    'deepseek-v4-flash',
    100,
    40,
    60,
    25,
    550,
    'pricing-v1',
    7200000,
    false,
    false,
    'completed'
  ),
  false,
  'a retry with the same aggregate idempotency key is ignored'
);
select is(
  (
    select count(*)
    from public.usage_events
    where idempotency_key = '30000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'aggregate audit retries produce exactly one usage event'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.mark_llm_budget_incurred(uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot mark budget incurred'
);
select is(
  has_function_privilege(
    'service_role',
    'public.mark_llm_budget_incurred(uuid)',
    'EXECUTE'
  ),
  true,
  'service_role can mark budget incurred'
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
    'service_role',
    'public.settle_llm_budget(uuid,bigint)',
    'EXECUTE'
  ),
  false,
  'service_role cannot call the legacy unaudited settlement RPC'
);
select is(
  has_function_privilege(
    'service_role',
    'public.settle_llm_budget(uuid,bigint,bigint,bigint,bigint,bigint,text,bigint,boolean)',
    'EXECUTE'
  ),
  true,
  'service_role can call the audited settlement RPC'
);
select is(
  has_function_privilege(
    'service_role',
    'public.finalize_llm_budget_incurred(uuid,bigint,bigint,bigint,bigint,text,bigint,boolean)',
    'EXECUTE'
  ),
  true,
  'service_role can finalize conservative incurred usage'
);
select is(
  has_function_privilege(
    'service_role',
    'public.record_usage_event(uuid,uuid,text,text,text,text,bigint,bigint,bigint,bigint,bigint,text,bigint,boolean,boolean,text)',
    'EXECUTE'
  ),
  true,
  'service_role can write trusted aggregate usage'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.record_usage_event(uuid,uuid,text,text,text,text,bigint,bigint,bigint,bigint,bigint,text,bigint,boolean,boolean,text)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot invoke the trusted aggregate audit RPC'
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
select is(
  has_table_privilege('service_role', 'public.llm_cost_reservations', 'SELECT'),
  true,
  'service_role can inspect reservation state'
);
select is(
  has_table_privilege('service_role', 'public.llm_cost_reservations', 'INSERT'),
  false,
  'service_role cannot directly insert reservations'
);
select is(
  has_table_privilege('service_role', 'public.llm_cost_reservations', 'UPDATE'),
  false,
  'service_role cannot directly update reservations'
);
select is(
  has_table_privilege('service_role', 'public.llm_cost_reservations', 'DELETE'),
  false,
  'service_role cannot directly delete reservations'
);
select is(
  has_table_privilege('service_role', 'public.llm_cost_reservations', 'TRUNCATE'),
  false,
  'service_role cannot truncate reservations'
);
select is(
  has_table_privilege('service_role', 'public.llm_cost_reservations', 'REFERENCES'),
  false,
  'service_role cannot create references to reservations'
);
select is(
  has_table_privilege('service_role', 'public.llm_cost_reservations', 'TRIGGER'),
  false,
  'service_role cannot create reservation triggers'
);
select is(
  has_function_privilege(
    'service_role',
    'public.reserve_llm_daily_budget(uuid,text,text,text,bigint,bigint,integer)',
    'EXECUTE'
  ),
  true,
  'service_role can reserve budget through the RPC'
);

select * from finish();
rollback;
