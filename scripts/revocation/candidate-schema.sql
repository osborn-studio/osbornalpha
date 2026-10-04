-- Isolated acceptance schema, deliberately NOT an automatic production migration.
create schema research_revocation_candidate;
revoke all on schema research_revocation_candidate from public;
create table research_revocation_candidate.feed (
 feed_id uuid primary key, local_owner uuid not null references auth.users(id),
 upstream_user uuid not null, workspace_id uuid,
 cursor bigint not null default 0 check(cursor>=0), latest_seq bigint not null default 0 check(latest_seq>=cursor),
 published_at timestamptz, last_page_hash text check(last_page_hash ~ '^[0-9a-f]{64}$'),
 unique(feed_id,local_owner)
);
create table research_revocation_candidate.inbox (
 feed_id uuid not null references research_revocation_candidate.feed(feed_id),
 sequence bigint not null check(sequence>0), revocation_id uuid not null, event jsonb not null,
 primary key(feed_id,sequence),unique(feed_id,revocation_id)
);
create table research_revocation_candidate.binding_map (
 feed_id uuid not null, local_owner uuid not null, source_id uuid not null, grant_id uuid not null,
 grant_version integer not null check(grant_version>0), payload_hash text not null,
 primary key(feed_id,source_id,grant_id,grant_version,payload_hash),
 foreign key(feed_id,local_owner) references research_revocation_candidate.feed(feed_id,local_owner),
 foreign key(local_owner,payload_hash) references public.research_s4_bindings(user_id,payload_hash)
);
revoke all on all tables in schema research_revocation_candidate from public;
-- Registration must not resurrect a grant version already recorded in the inbox.
create function research_revocation_candidate.guard_mapping() returns trigger language plpgsql set search_path='' as $$
begin
 if pg_catalog.current_setting('transaction_isolation')<>'read committed' then raise exception 'unsupported_revocation_isolation'; end if;
 if tg_op='UPDATE' then raise exception 'immutable_revocation_mapping'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.local_owner::text,0));
 if exists(select 1 from research_revocation_candidate.inbox i where i.feed_id=new.feed_id
  and i.event->>'source_id'=new.source_id::text and i.event->>'grant_id'=new.grant_id::text
  and (i.event->>'grant_version')::integer=new.grant_version) then raise exception 'grant_version_revoked'; end if;
 return new;
end $$;
create trigger guard_mapping before insert or update on research_revocation_candidate.binding_map
 for each row execute function research_revocation_candidate.guard_mapping();
