-- Candidate release only. Preserve immutable history: reject malformed/duplicate
-- existing cancellations rather than deleting or rewriting them during migration.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
alter table public.research_s4_records add constraint research_s6_intent_cancel_shape
 check (
  not (kind='ControlEvent' and payload->>'type'='evaluation.intent_cancel')
  or (
   jsonb_typeof(payload->'idempotency_key')='string'
   and payload->>'idempotency_key' ~ '^[A-Za-z0-9._:-]{1,128}$'
   and jsonb_typeof(payload->'observation_ref')='string'
   and payload->>'observation_ref' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and jsonb_typeof(payload->'actor_ref')='string'
   and payload->>'actor_ref'=user_id::text
   and jsonb_typeof(payload->'actor_kind')='string'
   and payload->>'actor_kind' in ('human','agent')
  ) is true
 );
-- The evaluator's idempotency namespace is owner-global, not per observation.
create unique index research_s6_intent_cancel_owner_key
 on public.research_s4_records(user_id,(payload->>'idempotency_key'))
 where kind='ControlEvent' and payload->>'type'='evaluation.intent_cancel';
commit;
