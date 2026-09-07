begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(19);

insert into auth.users (id, email)
values
  ('70000000-0000-0000-0000-000000000001', 'watchlist-claim-owner@example.test'),
  ('70000000-0000-0000-0000-000000000002', 'watchlist-claim-other@example.test');

insert into public.watchlists (id, user_id, name)
values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Owner'),
  ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'Other');

insert into public.watchlist_items (
  id, watchlist_id, user_id, ticker, thesis, confidence, status, review_at
)
values
  (
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'AAPL', 'Durable owner thesis', 7, 'watching', now() - interval '1 day'
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    'AAPL', 'Other thesis', 5, 'watching', now()
  );

insert into public.perspectives (
  id, generation_id, user_id, ticker, persona, stance, confidence, summary, claims
)
values (
  '73000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'AAPL', 'buffett', 'bullish', 7, 'Owner perspective',
  '[{"id":"claim_1","kind":"risk","text":"The thesis fails below 150","evidenceIds":[],"invalidation":{"condition":"Price closes below 150","alertType":"price","operator":"lt","threshold":150,"config":{}}}]'::jsonb
);

select has_table('public', 'watchlist_alert_origins', 'claim alert origins exist');
select has_table('public', 'watchlist_review_reasons', 'review reasons exist');
select has_index(
  'public', 'watchlist_alert_origins', 'watchlist_alert_origins_claim_unique_idx',
  'a claim can own only one alert origin'
);
select is(
  has_table_privilege('authenticated', 'public.watchlist_alert_origins', 'INSERT'),
  false,
  'authenticated users cannot forge alert origins'
);
select is(
  has_table_privilege('authenticated', 'public.watchlist_review_reasons', 'INSERT'),
  false,
  'authenticated users cannot forge review reasons'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $sql$
    select public.create_watchlist_alert_draft_from_claim(
      '72000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      'claim_1',
      1440
    )
  $sql$,
  'an owner can create an alert draft from a Perspective claim'
);
select is(
  (select enabled from public.watchlist_alerts limit 1),
  false,
  'claim-derived alerts are always disabled drafts'
);
select is(
  (select count(*)::integer from public.watchlist_alert_origins where claim_id = 'claim_1'),
  1,
  'the claim origin is persisted separately from alert config'
);

reset role;
insert into public.watchlist_alerts (
  id, user_id, watchlist_item_id, alert_type, operator, threshold_numeric, config, enabled
)
values (
  '75000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'price', 'lt', 151, '{}'::jsonb, false
);
select throws_ok(
  $sql$
    insert into public.watchlist_alert_origins (
      alert_id, user_id, perspective_id, claim_id, claim_text, invalidation_text
    ) values (
      '75000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      'claim_1', 'Duplicate claim', 'Duplicate condition'
    )
  $sql$,
  '23505',
  'duplicate key value violates unique constraint "watchlist_alert_origins_claim_unique_idx"',
  'storage rejects a second alert origin for the same claim'
);

insert into public.watchlist_alert_events (
  user_id, alert_id, watchlist_item_id, ticker, alert_type, event_key,
  observed_value, threshold_numeric, payload
)
select
  origin.user_id, origin.alert_id, alert.watchlist_item_id, 'AAPL', 'price', 'claim-trigger-1',
  149, 150, '{"source":"metric-snapshot"}'::jsonb
from public.watchlist_alert_origins origin
join public.watchlist_alerts alert on alert.id = origin.alert_id
where origin.claim_id = 'claim_1';

select is(
  (select count(*)::integer from public.watchlist_review_reasons),
  1,
  'a claim-derived alert event enqueues one review reason'
);
select is(
  (select payload ->> 'claim_id' from public.watchlist_review_reasons limit 1),
  'claim_1',
  'the review reason retains claim provenance'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select is((select count(*)::integer from public.watchlist_alert_origins), 0, 'another user cannot read origins');
select is((select count(*)::integer from public.watchlist_review_reasons), 0, 'another user cannot read review reasons');
select throws_ok(
  $sql$
    select public.create_watchlist_alert_draft_from_claim(
      '72000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001',
      'claim_1',
      1440
    )
  $sql$,
  'P0002', 'watchlist_item_not_found',
  'another user cannot create a draft for the owner item'
);

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (
    select decision_version
    from public.act_watchlist_review(
      '72000000-0000-0000-0000-000000000001', 0, 'complete', null
    )
  ),
  1,
  'completing a review advances the decision version atomically'
);
select is(
  (select count(*)::integer from public.watchlist_review_reasons where resolved_at is null),
  0,
  'completing a review resolves its open reasons'
);
select is(
  (select thesis from public.watchlist_items where id = '72000000-0000-0000-0000-000000000001'),
  'Durable owner thesis',
  'review completion does not rewrite the investment thesis'
);
select is(
  (select confidence from public.watchlist_items where id = '72000000-0000-0000-0000-000000000001'),
  7::smallint,
  'review completion does not rewrite confidence'
);
select is(
  (select status from public.watchlist_items where id = '72000000-0000-0000-0000-000000000001'),
  'watching',
  'review completion does not rewrite decision status'
);

reset role;
select * from finish();
rollback;
