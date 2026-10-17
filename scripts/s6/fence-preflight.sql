-- Read-only authorized operator preflight; keep real row identities local.
begin read only;
-- Refuse a filtered RLS view: zero rows must mean globally clean.
set local row_security=off;
set local lock_timeout='2s';
set local statement_timeout='30s';
with inspected as (
 select user_id,id,count(*) over(partition by user_id,payload->>'request_key') as key_count,
 (   jsonb_typeof(payload->'request_key')='string'
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
   else false end) is true as valid_shape
 from public.research_s4_records
 where kind='ControlEvent' and payload->>'type'='evaluation.intent_fence'
)
select user_id,id,not valid_shape as invalid_shape,key_count>1 as duplicate_key
from inspected where not valid_shape or key_count>1 order by user_id,id;
select pg_total_relation_size('public.research_s4_records') as table_and_indexes_bytes;
select i.indisvalid,i.indisready from pg_index i
where i.indexrelid=to_regclass('public.research_s6_intent_fence_owner_key');
rollback;
