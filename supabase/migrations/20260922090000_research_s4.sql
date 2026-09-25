-- Additive S4. Apply only to an explicitly authorized database.
-- Runtime is a server-only, non-owner, non-BYPASSRLS role; no client DML grants.
do $$ begin
  if not exists (select from pg_roles where rolname = 'alpha_s4_runtime') then
    create role alpha_s4_runtime nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant usage on schema public, auth to alpha_s4_runtime;
grant execute on function auth.uid() to alpha_s4_runtime;
grant select on public.profiles, public.research_entities, public.research_theses,
  public.stocks_universe, public.security_aliases to alpha_s4_runtime;
grant select, insert on public.research_source_documents, public.research_audit_log to alpha_s4_runtime;
create unique index research_source_owner_id on public.research_source_documents(user_id,id);

-- Operator-only provisioning. Expiry/revocation is checked under an owner lock on
-- every read/display/decision, not just at import. Runtime cannot grant itself access.
create table public.research_s4_bindings (
  user_id uuid not null references auth.users(id),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  binding jsonb not null,
  revoked boolean not null default false,
  primary key(user_id,payload_hash),
  check (binding->>'localUserId' = user_id::text),
  check (binding->>'approvedPayloadHash' = payload_hash)
);
-- Operator revocation takes the same owner lock as runtime transactions.
-- SELECT FOR SHARE would require UPDATE privilege, which runtime must not have.
create function public.research_s4_binding_lock() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' and (new.user_id<>old.user_id or new.payload_hash<>old.payload_hash) then
    raise exception 'immutable_binding_identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.user_id,old.user_id)::text,0));
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger research_s4_binding_lock before insert or update or delete on public.research_s4_bindings
  for each row execute function public.research_s4_binding_lock();
create table public.research_s4_integrity (
 user_id uuid primary key references auth.users(id),
 failed_at timestamptz not null default clock_timestamp(),
 reason text not null check(reason='anchor_integrity_failed')
);
create table public.research_source_versions (
  user_id uuid not null references auth.users(id), id uuid not null,
  source_document_id uuid not null,
  version_identity text not null, source_key text not null,
  source_ref jsonb not null, source_version jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  primary key(user_id,id), unique(user_id,version_identity), unique(user_id,source_key),
  foreign key(user_id,source_document_id) references public.research_source_documents(user_id,id)
);
create table public.research_s4_candidates (
  user_id uuid not null references auth.users(id), id uuid not null,
  source_version_id uuid not null,
  external_candidate_id uuid not null, payload_hash text not null,
  imported jsonb not null, revision integer not null default 0 check(revision >= 0),
  status text not null default 'candidate' check(status in ('candidate','research','observe','adopt','reject','defer','refute')), last_observation_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,id), unique(user_id,payload_hash),
  foreign key(user_id,source_version_id) references public.research_source_versions(user_id,id),
  foreign key(user_id,payload_hash) references public.research_s4_bindings(user_id,payload_hash)
);
create table public.research_source_occurrences (
  user_id uuid not null, id uuid not null, source_version_id uuid not null,
  pack_id uuid not null, data jsonb not null,
  primary key(user_id,id), unique(user_id,source_version_id,pack_id),
  foreign key(user_id,source_version_id) references public.research_source_versions(user_id,id)
);
-- Immutable domain records. kind is explicit: queryable types, not overwritten JSON history.
create table public.research_s4_records (
  user_id uuid not null, id uuid not null, candidate_id uuid not null,
  kind text not null check(kind in ('InputSnapshot','JudgmentRun','Judgment','ChangeCard',
    'ThesisRevision','Decision','Observation','HumanLabel','ExposureEvent','AnchorReceipt','ControlEvent','Review')),
  payload jsonb not null, payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(user_id,id),
  foreign key(user_id,candidate_id) references public.research_s4_candidates(user_id,id)
);
create index research_s4_record_lookup on public.research_s4_records(user_id,candidate_id,kind,recorded_at);
create table public.research_s4_requests (
  user_id uuid not null, request_key text not null, request_hash text not null,
  response jsonb not null, primary key(user_id,request_key)
);
create table public.research_s4_observation_state (
  user_id uuid not null, observation_id uuid not null,
  status text not null default 'pending_start' check(status in ('pending_start','open','resolved','data_insufficient','cancelled')),
  anchor_status text not null default 'anchor_pending' check(anchor_status in ('anchor_pending','anchored','integrity_failed')),
  revision integer not null default 0,
  primary key(user_id,observation_id),
  foreign key(user_id,observation_id) references public.research_s4_records(user_id,id)
);
create table public.research_s4_outbox (
  sequence bigint generated always as identity primary key,
  user_id uuid not null, candidate_id uuid not null, record_id uuid not null,
  event jsonb not null, event_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  anchored_at timestamptz, receipt_hash text,
  foreign key(user_id,record_id) references public.research_s4_records(user_id,id),
  foreign key(user_id,candidate_id) references public.research_s4_candidates(user_id,id)
);
create index research_s4_outbox_pending on public.research_s4_outbox(user_id,sequence) where anchored_at is null;

create function public.research_s4_immutable() returns trigger language plpgsql as $$
begin raise exception 'immutable_record' using errcode='23514'; end $$;
do $$ declare t text; begin
  foreach t in array array['research_source_versions','research_source_occurrences','research_s4_records','research_s4_requests'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.research_s4_immutable()',t||'_immutable',t);
  end loop;
  foreach t in array array['research_s4_bindings','research_source_versions','research_source_occurrences',
    'research_s4_integrity','research_s4_candidates','research_s4_records','research_s4_requests','research_s4_observation_state','research_s4_outbox'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('create policy s4_owner on public.%I to alpha_s4_runtime using (user_id = auth.uid()) with check (user_id = auth.uid())',t);
    execute format('grant select on public.%I to alpha_s4_runtime',t);
    if t <> 'research_s4_bindings' then execute format('grant insert on public.%I to alpha_s4_runtime',t); end if;
  end loop;
end $$;
grant update(revision,status,last_observation_id) on public.research_s4_candidates to alpha_s4_runtime;
grant update(status,anchor_status,revision) on public.research_s4_observation_state to alpha_s4_runtime;
grant update(anchored_at,receipt_hash) on public.research_s4_outbox to alpha_s4_runtime;
grant usage,select on sequence public.research_s4_outbox_sequence_seq to alpha_s4_runtime;

-- Controlled copies never enter legacy clients or external-model pipelines.
create function public.research_s4_source_id(p_owner uuid,p_hash text) returns uuid
language sql security definer set search_path=public,pg_temp as $$
 select id from public.research_source_documents where user_id=p_owner and p_owner=auth.uid() and content_hash=p_hash
$$;
revoke all on function public.research_s4_source_id(uuid,text) from public;
grant execute on function public.research_s4_source_id(uuid,text) to alpha_s4_runtime;
create function public.research_s4_source_visible(p_owner uuid,p_source uuid) returns boolean
language sql security definer set search_path=public,pg_temp as $$
 select p_owner=auth.uid() and exists(
 select 1 from public.research_source_versions v
 join public.research_s4_candidates c on c.user_id=v.user_id and c.source_version_id=v.id
 join public.research_s4_bindings b on b.user_id=c.user_id and b.payload_hash=c.payload_hash
 where v.user_id=p_owner and v.source_document_id=p_source and not b.revoked
 and b.binding->>'revoked'='false'
 and b.binding->'trustedConfig'->'rights'=c.imported->'rights'
 and b.binding->'trustedConfig'->'grant'=c.imported->'grant'
 and (b.binding->'trustedConfig'->'rights'->>'valid_until')::timestamptz>clock_timestamp()
 and (b.binding->'trustedConfig'->'grant'->>'valid_until')::timestamptz>clock_timestamp())
$$;
revoke all on function public.research_s4_source_visible(uuid,uuid) from public;
grant execute on function public.research_s4_source_visible(uuid,uuid) to alpha_s4_runtime,authenticated,anon;
create policy s4_controlled_copy on public.research_source_documents as restrictive for select
 using (metadata->>'s4_controlled_copy' is distinct from 'true' or
 (pg_has_role(current_user,'alpha_s4_runtime','member') and public.research_s4_source_visible(user_id,id)));
create function public.research_s4_copy_marker() returns trigger language plpgsql as $$
begin
 if old.metadata->>'s4_controlled_copy'='true' and new.metadata->>'s4_controlled_copy' is distinct from 'true' then
 raise exception 'immutable_controlled_copy'; end if;
 return new;
end $$;
create trigger research_s4_copy_marker before update on public.research_source_documents
 for each row execute function public.research_s4_copy_marker();

create function public.research_s4_ack_guard() returns trigger language plpgsql as $$
begin
 if old.anchored_at is not null and (new.anchored_at is distinct from old.anchored_at or new.receipt_hash is distinct from old.receipt_hash) then
 raise exception 'immutable_anchor_ack'; end if;
 if (new.anchored_at is null) <> (new.receipt_hash is null) then raise exception 'invalid_anchor_ack'; end if;
 return new;
end $$;
create trigger research_s4_ack_guard before update on public.research_s4_outbox
 for each row execute function public.research_s4_ack_guard();
