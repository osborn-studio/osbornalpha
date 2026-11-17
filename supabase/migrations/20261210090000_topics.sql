-- supabase/migrations/20261210090000_topics.sql
-- Topic research (spec 2026-11-16 §4.2–§4.9): twelve tables, immutability triggers, five public views.
-- Trigger errors carry the code as the message prefix. Hosted `postgres` is not a superuser: no
-- `alter … owner`. Replayable: create table if not exists, create or replace, drop trigger if exists.

-- ---------------------------------------------------------------- 4.2 settings
create table if not exists public.topic_settings (
  id                     integer primary key,
  public_enabled         boolean not null default false,
  summary_public_enabled boolean not null default false,
  summary_provider_note  text,
  drift_checked_at       timestamptz,
  drift_cursor           jsonb,
  updated_by             uuid,
  updated_at             timestamptz not null default now(),
  constraint topic_settings_singleton check (id = 1),
  constraint topic_settings_note check (summary_provider_note is null or length(summary_provider_note) between 1 and 500),
  constraint topic_settings_summary_note check (not summary_public_enabled or summary_provider_note is not null)
);
insert into public.topic_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- 4.3 topics
create table if not exists public.topics (
  topic_id           uuid primary key default gen_random_uuid(),
  topic_slug         text not null,
  category           text not null,
  status             text not null default 'draft',
  current_version_id uuid,
  retired_at         timestamptz,
  retired_reason     text,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  constraint topics_slug_key unique (topic_slug),
  constraint topics_slug_shape check (topic_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(topic_slug) between 3 and 64),
  constraint topics_category check (category in ('macro','industry','company','cross_market','method')),
  constraint topics_status check (status in ('draft','published','unpublished','retired')),
  constraint topics_retired check ((status = 'retired') = (retired_at is not null) and (retired_at is null) = (retired_reason is null)),
  constraint topics_retired_reason check (retired_reason is null or retired_reason in ('error','licence','owner_request','privacy'))
);

-- ---------------------------------------------------------------- 4.6 source licences
create table if not exists public.topic_source_licences (
  licence_id    uuid primary key default gen_random_uuid(),
  source_title  text not null check (length(source_title) between 1 and 200),
  publisher     text not null check (length(publisher) between 1 and 200),
  source_url    text not null check (source_url ~ '^https://'),
  terms_url     text not null check (terms_url ~ '^https://'),
  terms_read_at date not null,
  terms_clause  text not null check (length(terms_clause) between 1 and 200),
  permits       jsonb not null check (jsonb_typeof(permits) = 'object'),
  status        text not null default 'pending' check (status in ('pending','approved','revoked')),
  decided_by    uuid not null,
  decided_at    timestamptz not null default now(),
  note          text
);

-- ---------------------------------------------------------------- 4.5 drafts
create table if not exists public.topic_drafts (
  draft_id   uuid primary key default gen_random_uuid(),
  topic_id   uuid not null unique references public.topics(topic_id) on delete restrict,
  revision   integer not null check (revision >= 1),
  body       jsonb not null,
  body_text  text not null,
  draft_hash text not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  constraint topic_drafts_hash check (draft_hash = encode(sha256(convert_to(body_text, 'UTF8')), 'hex')),
  constraint topic_drafts_body check (body = body_text::jsonb)
);

-- ---------------------------------------------------------------- 4.7 promotions (no FK to research_*)
create table if not exists public.topic_promotions (
  promotion_id        uuid primary key default gen_random_uuid(),
  topic_id            uuid not null references public.topics(topic_id) on delete restrict,
  source_kind         text not null check (source_kind in ('research_thesis')),
  source_id           uuid not null,
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  copied              jsonb not null,
  stripped            jsonb not null,
  actor               uuid not null,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------- 4.8 summary, receipts, audit
create table if not exists public.topic_summary_runs (
  run_id            uuid primary key default gen_random_uuid(),
  topic_id          uuid not null references public.topics(topic_id) on delete restrict,
  draft_hash        text not null check (draft_hash ~ '^[0-9a-f]{64}$'),
  locale            text not null check (locale in ('zh','en')),
  request_id        uuid not null,
  payload_hash      text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  state             text not null check (state in ('running','accepted','rejected','failed','abandoned')),
  manifest          jsonb not null,
  raw_output        jsonb,
  validation        jsonb,
  finalize_payload  jsonb,
  finalized         boolean not null default false,
  usage_audit_key   text not null unique,
  prompt_version    text not null,
  validator_version text not null,
  provider          text,
  model             text,
  actor             uuid not null,
  claimed_at        timestamptz not null default now(),
  finished_at       timestamptz,
  constraint topic_summary_runs_request unique (actor, request_id),
  constraint topic_summary_runs_audit_key check (usage_audit_key = run_id::text)
);
create table if not exists public.topic_summaries (
  summary_id  uuid primary key default gen_random_uuid(),
  run_id      uuid not null unique references public.topic_summary_runs(run_id) on delete restrict,
  topic_id    uuid not null references public.topics(topic_id) on delete restrict,
  draft_hash  text not null check (draft_hash ~ '^[0-9a-f]{64}$'),
  locale      text not null check (locale in ('zh','en')),
  rendered    jsonb not null,
  status      text not null default 'generated' check (status in ('generated','approved','discarded')),
  approved_by uuid,
  approved_at timestamptz,
  constraint topic_summaries_approved check ((status = 'approved') = (approved_by is not null and approved_at is not null))
);
create unique index if not exists topic_summaries_one_approved on public.topic_summaries(topic_id, draft_hash, locale) where status = 'approved';
create table if not exists public.topic_disclosure_receipts (
  receipt_id   uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.topics(topic_id) on delete restrict,
  draft_hash   text not null check (draft_hash ~ '^[0-9a-f]{64}$'),
  checks       jsonb not null check (jsonb_typeof(checks) = 'array'),
  passed       boolean not null,
  code_version text not null,
  actor        uuid not null,
  created_at   timestamptz not null default now()
);
create table if not exists public.topic_audit_log (
  id         bigserial primary key,
  topic_id   uuid,
  actor      uuid not null,
  action     text not null check (action in ('create','draft_save','promote','disclosure_check','summary_run','summary_approve','preview','publish','unpublish','retire','licence_change','settings_change','replay_verify')),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 4.4 versions (X8: snapshot_text carries the canonical string)
create table if not exists public.topic_versions (
  version_id            uuid primary key default gen_random_uuid(),
  topic_id              uuid not null references public.topics(topic_id) on delete restrict,
  version_no            integer not null check (version_no >= 1),
  contract_version      text not null check (contract_version = 'evidence-ref/1'),
  cutoff                timestamptz not null,
  snapshot              jsonb not null,
  snapshot_text         text not null,
  snapshot_hash         text not null,
  summary_id            uuid references public.topic_summaries(summary_id) on delete restrict,
  disclosure_receipt_id uuid not null references public.topic_disclosure_receipts(receipt_id) on delete restrict,
  promotion_id          uuid references public.topic_promotions(promotion_id) on delete restrict,
  published_at          timestamptz not null default now(),
  published_by          uuid not null,
  supersedes_version_id uuid references public.topic_versions(version_id) on delete restrict,
  unpublished_at        timestamptz,
  unpublish_reason      text,
  constraint topic_versions_no unique (topic_id, version_no),
  constraint topic_versions_hash check (snapshot_hash = encode(sha256(convert_to(snapshot_text, 'UTF8')), 'hex')),
  constraint topic_versions_snapshot check (snapshot = snapshot_text::jsonb),
  constraint topic_versions_unpublish check ((unpublished_at is null) = (unpublish_reason is null)),
  constraint topic_versions_unpublish_reason check (unpublish_reason is null or unpublish_reason in ('error','licence','owner_request','privacy'))
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'topics_current_version_fk') then
    alter table public.topics add constraint topics_current_version_fk foreign key (current_version_id) references public.topic_versions(version_id) on delete restrict;
  end if;
end $$;
create table if not exists public.topic_version_evidence (
  version_id  uuid not null references public.topic_versions(version_id) on delete restrict,
  ordinal     integer not null check (ordinal >= 1),
  kind        text not null check (kind in ('macro_observation','industry_metric','financial_fact','document_citation','broker_report_meta','judgment')),
  ref         jsonb not null,
  ref_hash    text not null check (ref_hash ~ '^[0-9a-f]{64}$'),
  as_of       timestamptz not null,
  state       text not null check (state in ('ok','missing','withheld','not_served','unsupported','retracted')),
  digest      text check (digest is null or digest ~ '^[0-9a-f]{64}$'),
  section_key text not null,
  primary key (version_id, ordinal),
  constraint topic_version_evidence_ref unique (version_id, ref_hash),
  constraint topic_version_evidence_digest check ((state = 'ok') = (digest is not null))
);
create index if not exists topic_version_evidence_kind_idx on public.topic_version_evidence(kind, ref_hash);
create table if not exists public.topic_evidence_drift (
  version_id       uuid not null,
  ordinal          integer not null,
  checked_at       timestamptz not null,
  drift            text not null check (drift in ('unchanged','revised','newer_period','retracted','now_withheld','unverifiable')),
  current_identity jsonb,
  primary key (version_id, ordinal),
  foreign key (version_id, ordinal) references public.topic_version_evidence(version_id, ordinal) on delete restrict
);

-- ---------------------------------------------------------------- triggers
create or replace function public.topic_slug_immutable() returns trigger language plpgsql as $$
begin
  if new.topic_slug is distinct from old.topic_slug then raise exception 'slug_immutable'; end if;
  return new;
end $$;
drop trigger if exists topics_slug_immutable on public.topics;
create trigger topics_slug_immutable before update on public.topics for each row execute function public.topic_slug_immutable();

create or replace function public.topic_versions_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only:topic_versions'; end if;
  if old.unpublished_at is not null then raise exception 'append_only:topic_versions'; end if;
  if (to_jsonb(new) - 'unpublished_at' - 'unpublish_reason') is distinct from (to_jsonb(old) - 'unpublished_at' - 'unpublish_reason') then
    raise exception 'append_only:topic_versions';
  end if;
  return new;
end $$;
drop trigger if exists topic_versions_immutable on public.topic_versions;
create trigger topic_versions_immutable before update or delete on public.topic_versions for each row execute function public.topic_versions_immutable();

create or replace function public.topic_append_only() returns trigger language plpgsql as $$
begin raise exception 'append_only:%', tg_table_name; end $$;
do $$ declare t text; begin
  foreach t in array array['topic_version_evidence','topic_disclosure_receipts','topic_audit_log','topic_promotions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.topic_append_only()', t || '_append_only', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 4.9 public views (authenticated only; every view joins the switch)
create or replace view public.topics_open_v with (security_invoker = false, security_barrier = true) as
select true as open from public.topic_settings s where s.id = 1 and s.public_enabled;

create or replace view public.topics_public_v with (security_invoker = false, security_barrier = true) as
select t.topic_id, t.topic_slug, t.category, t.status, t.retired_reason,
       v.version_id as current_version_id, v.version_no, v.published_at, v.cutoff,
       v.snapshot -> 'topic' -> 'title' ->> 'zh' as title_zh, v.snapshot -> 'topic' -> 'title' ->> 'en' as title_en,
       v.snapshot -> 'topic' -> 'dek' ->> 'zh' as dek_zh, v.snapshot -> 'topic' -> 'dek' ->> 'en' as dek_en,
       v.snapshot -> 'counts' as evidence_counts, s.drift_checked_at
from public.topics t
join public.topic_settings s on s.id = 1
left join public.topic_versions v on v.version_id = t.current_version_id and v.unpublished_at is null
where s.public_enabled and t.status in ('published','unpublished','retired');

create or replace view public.topic_versions_public_v with (security_invoker = false, security_barrier = true) as
select v.version_id, v.topic_id, t.topic_slug, v.version_no, v.cutoff, v.published_at, v.supersedes_version_id,
       v.unpublished_at, v.unpublish_reason, v.snapshot_hash,
       case when v.unpublished_at is null then v.snapshot end as snapshot
from public.topic_versions v
join public.topics t on t.topic_id = v.topic_id
join public.topic_settings s on s.id = 1
where s.public_enabled;

create or replace view public.topic_evidence_drift_public_v with (security_invoker = false, security_barrier = true) as
select d.version_id, d.ordinal, d.checked_at, d.drift, d.current_identity
from public.topic_evidence_drift d
join public.topic_versions v on v.version_id = d.version_id and v.unpublished_at is null
join public.topic_settings s on s.id = 1
where s.public_enabled;

create or replace view public.topic_licence_status_public_v with (security_invoker = false, security_barrier = true) as
select l.licence_id, l.status
from public.topic_source_licences l
join public.topic_settings s on s.id = 1
where s.public_enabled;

-- ---------------------------------------------------------------- privileges
do $$ declare t text; begin
  foreach t in array array['topic_settings','topics','topic_versions','topic_version_evidence','topic_drafts','topic_source_licences',
    'topic_promotions','topic_summary_runs','topic_summaries','topic_disclosure_receipts','topic_audit_log','topic_evidence_drift'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to service_role', t);
  end loop;
  foreach t in array array['topics_open_v','topics_public_v','topic_versions_public_v','topic_evidence_drift_public_v','topic_licence_status_public_v'] loop
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to authenticated, service_role', t);
  end loop;
end $$;
revoke execute on function public.topic_slug_immutable(), public.topic_versions_immutable(), public.topic_append_only() from public, anon, authenticated, service_role;
