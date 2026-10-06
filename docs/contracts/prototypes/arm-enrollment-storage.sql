-- ISOLATED TEST PROTOTYPE ONLY. Kept outside deployable migration chain.
-- Candidate-only additive storage. No command/runtime activation, source authority,
-- actor confirmation, canonical digest verification or complete history replay here.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
create table public.research_s6_arm_enrollments (
 user_id uuid not null,id uuid not null,candidate_id uuid not null,
 cohort jsonb not null,cohort_hash text not null check(cohort_hash ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(user_id,id),
 foreign key(user_id,candidate_id) references public.research_s4_candidates(user_id,id),
 check ((jsonb_typeof(cohort)='object' and cohort->>'protocol'='alpha-arm-plan/1.0'
  and jsonb_typeof(cohort->'owner_id')='string' and cohort->>'owner_id'=user_id::text
  and jsonb_typeof(cohort->'enrollment_id')='string' and cohort->>'enrollment_id'=id::text
  and jsonb_typeof(cohort->'candidate_id')='string' and cohort->>'candidate_id'=candidate_id::text
  and cohort ?& array['protocol','enrollment_id','owner_id','candidate_id','thesis_id','security_identity_hash','calendar_hash','evaluation_policy_hash','enrolled_at','confirmation_deadline','session_anchor','observation_ids']
  and cohort - array['protocol','enrollment_id','owner_id','candidate_id','thesis_id','security_identity_hash','calendar_hash','evaluation_policy_hash','enrolled_at','confirmation_deadline','session_anchor','observation_ids']='{}'::jsonb
  and jsonb_typeof(cohort->'thesis_id')='string' and cohort->>'thesis_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and jsonb_typeof(cohort->'security_identity_hash')='string' and cohort->>'security_identity_hash' ~ '^[0-9a-f]{64}$'
  and jsonb_typeof(cohort->'calendar_hash')='string' and cohort->>'calendar_hash' ~ '^[0-9a-f]{64}$'
  and jsonb_typeof(cohort->'evaluation_policy_hash')='string' and cohort->>'evaluation_policy_hash' ~ '^[0-9a-f]{64}$'
  and jsonb_typeof(cohort->'observation_ids')='object'
  and cohort->'observation_ids' ?& array['human_baseline','ai_candidate','collab']
  and (cohort->'observation_ids') - array['human_baseline','ai_candidate','collab']='{}'::jsonb
  and jsonb_typeof(cohort->'observation_ids'->'human_baseline')='string' and cohort->'observation_ids'->>'human_baseline' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and jsonb_typeof(cohort->'observation_ids'->'ai_candidate')='string' and cohort->'observation_ids'->>'ai_candidate' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and jsonb_typeof(cohort->'observation_ids'->'collab')='string' and cohort->'observation_ids'->>'collab' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and cohort->'observation_ids'->>'human_baseline'<>cohort->'observation_ids'->>'ai_candidate'
  and cohort->'observation_ids'->>'human_baseline'<>cohort->'observation_ids'->>'collab'
  and cohort->'observation_ids'->>'ai_candidate'<>cohort->'observation_ids'->>'collab'
  and case when jsonb_typeof(cohort->'enrolled_at')='string' and jsonb_typeof(cohort->'confirmation_deadline')='string' and jsonb_typeof(cohort->'session_anchor')='string'
   and cohort->>'enrolled_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
   and cohort->>'confirmation_deadline' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
   and cohort->>'session_anchor' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
   then to_char((cohort->>'enrolled_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=cohort->>'enrolled_at'
    and to_char((cohort->>'confirmation_deadline')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=cohort->>'confirmation_deadline'
    and to_char((cohort->>'session_anchor')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=cohort->>'session_anchor'
    and (cohort->>'confirmation_deadline')::timestamptz>recorded_at
    and (cohort->>'enrolled_at')::timestamptz<=recorded_at and recorded_at-(cohort->>'enrolled_at')::timestamptz<=interval '5 minutes'
    and (cohort->>'enrolled_at')::timestamptz<(cohort->>'confirmation_deadline')::timestamptz and (cohort->>'confirmation_deadline')::timestamptz<(cohort->>'session_anchor')::timestamptz
   else false end) is true)
);
create table public.research_s6_arm_events (
 user_id uuid not null,enrollment_id uuid not null,id uuid not null,
 sequence integer not null check(sequence=1),
 event_type text not null check(event_type='terminated'),
 previous_event_hash text, payload jsonb not null,
 payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
 request_key text not null check(request_key ~ '^[A-Za-z0-9:_-]{8,100}$'),
 request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(user_id,id),unique(user_id,enrollment_id),unique(user_id,request_key),
 foreign key(user_id,enrollment_id) references public.research_s6_arm_enrollments(user_id,id),
 check ((sequence=1 and previous_event_hash is null) or
  (sequence>1 and previous_event_hash is not null and previous_event_hash ~ '^[0-9a-f]{64}$')),
 check (jsonb_typeof(payload)='object'),
 check (event_type<>'terminated' or (
  jsonb_typeof(payload->'reason')='string' and payload->>'reason'='refusal'
  and jsonb_typeof(payload->'previous_state')='string' and payload->>'previous_state' in
   ('enrolled')
  and payload ?& array['reason','previous_state'] and payload-array['reason','previous_state']='{}'::jsonb) is true)
);
-- No defaults or inherited Supabase API table grants. Dedicated runtime only.
revoke all on public.research_s6_arm_enrollments,public.research_s6_arm_events from public,anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['research_s6_arm_enrollments','research_s6_arm_events'] loop
  execute format('create trigger %I before update or delete on public.%I for each row execute function public.research_s4_immutable()',t||'_immutable',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('create policy arm_owner on public.%I to alpha_s4_runtime using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function public.research_s4_immutable()',t||'_no_truncate',t);
  execute format('grant select on public.%I to alpha_s4_runtime',t);
 end loop;
end $$;
grant insert(user_id,id,candidate_id,cohort,cohort_hash) on public.research_s6_arm_enrollments to alpha_s4_runtime;
grant insert(user_id,enrollment_id,id,sequence,event_type,previous_event_hash,payload,payload_hash,request_key,request_hash) on public.research_s6_arm_events to alpha_s4_runtime;
-- Refused-before-exposure prototype only: forward events require a later typed
-- payload/append/replay protocol migration. Format-only hashes do not prove authority.
commit;
