-- Candidate release only. Preserve immutable history: reject malformed/duplicate
-- existing fences rather than deleting or rewriting them during migration.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
alter table public.research_s4_records add constraint research_s6_intent_fence_shape
 check (
  not (kind='ControlEvent' and payload->>'type'='evaluation.intent_fence')
  or (
   jsonb_typeof(payload->'request_key')='string'
   and payload->>'request_key' ~ '^[A-Za-z0-9:_-]{8,100}$'
   and jsonb_typeof(payload->'observation_ref')='string'
   and payload->>'observation_ref' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and jsonb_typeof(payload->'actor_ref')='string'
   and payload->>'actor_ref'=user_id::text
   and jsonb_typeof(payload->'actor_kind')='string'
   and payload->>'actor_kind' in ('human','agent')
   and case when jsonb_typeof(payload->'previous_revision')='number'
    and jsonb_typeof(payload->'revision')='number'
    and payload->>'previous_revision' ~ '^[0-9]{1,10}$'
    and payload->>'revision' ~ '^[0-9]{1,10}$'
   then (payload->>'previous_revision')::bigint between 0 and 2147483646
    and (payload->>'revision')::bigint=(payload->>'previous_revision')::bigint+1
   else false end
  ) is true
 );
-- Recovery keys are owner-global, matching the prefixed S4 request namespace.
create unique index research_s6_intent_fence_owner_key
 on public.research_s4_records(user_id,(payload->>'request_key'))
 where kind='ControlEvent' and payload->>'type'='evaluation.intent_fence';
commit;
