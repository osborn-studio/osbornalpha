-- Research OS → production Postgres (Phase 5). Mirrors the local SQLite schema
-- (v2) with: research_ table prefix (namespace isolation from the SaaS),
-- per-user scoping (user_id + self RLS), and the source-immutability trigger.
-- Arrays use jsonb (matching the SQLite JSON-text columns 1:1 so the service
-- layer keeps a single serialization shape).

-- ── entities ────────────────────────────────────────────────────────────────
create table public.research_entities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('COMPANY','PERSON','PRODUCT','MODEL','REPOSITORY','SUPPLY_CHAIN_NODE','EVENT','THEME')),
  name        text not null,
  aliases     jsonb not null default '[]',
  ticker      text,
  description text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index research_entities_user_type_name_idx on public.research_entities (user_id, type, lower(name));

create table public.research_entity_relations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  from_entity   uuid not null references public.research_entities(id) on delete cascade,
  to_entity     uuid not null references public.research_entities(id) on delete cascade,
  relation_type text not null,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- ── source documents (immutable raw material) ───────────────────────────────
create table public.research_source_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  source_type  text not null check (source_type in ('GITHUB_RADAR','MODEL_USAGE','EARNINGS_CALL','NEWS','FILING','NOTE','MANUAL')),
  title        text not null,
  url          text,
  author       text,
  published_at timestamptz,
  ingested_at  timestamptz not null default now(),
  raw_text     text not null,
  content_hash text not null,
  trust_level  text not null default 'MEDIUM' check (trust_level in ('LOW','MEDIUM','HIGH')),
  entity_ids   jsonb not null default '[]',
  metadata     jsonb not null default '{}'
);
create unique index research_sources_user_hash_idx on public.research_source_documents (user_id, content_hash);
create index research_sources_user_type_idx on public.research_source_documents (user_id, source_type, ingested_at desc);

create or replace function public.research_forbid_source_mutation() returns trigger as $$
begin
  if new.raw_text is distinct from old.raw_text
     or new.content_hash is distinct from old.content_hash
     or new.source_type is distinct from old.source_type
     or new.url is distinct from old.url then
    raise exception 'research source raw fields are immutable';
  end if;
  return new;
end; $$ language plpgsql;
create trigger research_sources_immutable before update on public.research_source_documents
  for each row execute function public.research_forbid_source_mutation();

-- ── signals (incl. local v2 columns) ────────────────────────────────────────
create table public.research_signals (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  title                 text not null,
  summary               text not null,
  signal_type           text not null check (signal_type in ('DEVELOPER','MODEL_USAGE','PRODUCT','COMPANY','SUPPLY_CHAIN','POLICY')),
  direction             text not null default 'UNKNOWN' check (direction in ('POSITIVE','NEGATIVE','MIXED','UNKNOWN')),
  confidence            text not null default 'LOW' check (confidence in ('LOW','MEDIUM','HIGH')),
  entity_ids            jsonb not null default '[]',
  source_document_ids   jsonb not null default '[]',
  affected_company_ids  jsonb not null default '[]',
  research_questions    jsonb not null default '[]',
  metadata              jsonb not null default '{}',
  llm_provenance        jsonb not null default '{}',
  created_at            timestamptz not null default now()
);
create index research_signals_user_created_idx on public.research_signals (user_id, created_at desc);

-- ── memos ───────────────────────────────────────────────────────────────────
create table public.research_memos (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  title                    text not null,
  company_ids              jsonb not null default '[]',
  theme_ids                jsonb not null default '[]',
  one_line_conclusion      text not null default '',
  thesis                   text not null default '',
  supporting_evidence      jsonb not null default '[]',
  counter_arguments        jsonb not null default '[]',
  key_variables            jsonb not null default '[]',
  invalidation_conditions  jsonb not null default '[]',
  open_questions           jsonb not null default '[]',
  related_impacts          jsonb not null default '[]',
  confidence               text not null default 'LOW' check (confidence in ('LOW','MEDIUM','HIGH')),
  axiom_check_results      jsonb not null default '[]',
  status                   text not null default 'DRAFT' check (status in ('DRAFT','REVIEWED','ARCHIVED')),
  llm_provenance           jsonb not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ── theses ──────────────────────────────────────────────────────────────────
create table public.research_theses (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  title                    text not null,
  body                     text not null default '',
  company_ids              jsonb not null default '[]',
  theme_ids                jsonb not null default '[]',
  supporting_evidence_ids  jsonb not null default '[]',
  invalidation_conditions  jsonb not null default '[]',
  watch_metrics            jsonb not null default '[]',
  status                   text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','WATCH','AT_RISK','INVALIDATED','CLOSED')),
  next_review_at           timestamptz,
  last_assessment          jsonb not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.research_thesis_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  thesis_id  uuid not null references public.research_theses(id) on delete cascade,
  kind       text not null check (kind in ('SUPPORT','WEAKEN','INVALIDATE','USER_ACTION','STATUS_CHANGE')),
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index research_thesis_events_thesis_idx on public.research_thesis_events (thesis_id, created_at desc);

-- ── playbook runs ───────────────────────────────────────────────────────────
create table public.research_playbook_runs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  memo_id          uuid references public.research_memos(id) on delete set null,
  thesis_id        uuid references public.research_theses(id) on delete set null,
  proposed_action  text not null check (proposed_action in ('WATCHLIST','PAPER_TRADE','RESEARCH_MORE','UPDATE_THESIS','CLOSE_THESIS')),
  rationale        text not null default '',
  risks            jsonb not null default '[]',
  axiom_results    jsonb not null default '[]',
  approval_status  text not null default 'NOT_REQUIRED' check (approval_status in ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')),
  human_decision   text,
  review_at        timestamptz,
  created_at       timestamptz not null default now()
);

-- ── axioms ──────────────────────────────────────────────────────────────────
create table public.research_axioms (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,
  title       text not null,
  description text not null default '',
  rule        jsonb not null default '{}',
  severity    text not null default 'WARN' check (severity in ('BLOCK','WARN')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index research_axioms_user_code_idx on public.research_axioms (user_id, code);

-- ── eval harness ────────────────────────────────────────────────────────────
create table public.research_eval_cases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  as_of_date       date not null,
  visible_material jsonb not null default '[]',
  expected         jsonb not null default '{}',
  rubric           jsonb not null default '{}',
  created_at       timestamptz not null default now()
);

create table public.research_eval_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  case_id         uuid not null references public.research_eval_cases(id) on delete cascade,
  agent_output    jsonb not null default '{}',
  scores          jsonb not null default '{}',
  total_score     numeric,
  failure_modes   jsonb not null default '[]',
  llm_provenance  jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

-- ── audit log ───────────────────────────────────────────────────────────────
create table public.research_audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  actor       text not null default 'user',
  action      text not null,
  object_type text not null,
  object_id   uuid,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index research_audit_object_idx on public.research_audit_log (user_id, object_type, object_id, created_at desc);

-- ── RLS: self read/write on every table ─────────────────────────────────────
do $$ declare t text;
begin
  foreach t in array array['research_entities','research_entity_relations','research_source_documents',
                           'research_signals','research_memos','research_theses','research_thesis_events',
                           'research_playbook_runs','research_axioms','research_eval_cases','research_eval_runs',
                           'research_audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s self select" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s self insert" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('create policy "%s self update" on public.%I for update using (auth.uid() = user_id)', t, t);
    execute format('create policy "%s self delete" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;
