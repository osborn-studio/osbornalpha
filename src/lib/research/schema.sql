-- Research OS schema v1 (SQLite / better-sqlite3).
-- Spec: docs/research-os/product-technical-spec.md §6 (data model draft),
-- SQLite-ized per docs/research-os/2026-07-04-phase1-skeleton.md T1:
--   * id TEXT PRIMARY KEY (app-level crypto.randomUUID())
--   * timestamps TEXT ISO-8601
--   * array/object fields stored as JSON TEXT (read/write via Json<T> helpers in db.ts)
--   * enum-ish fields enforced with CHECK constraints
--   * source_documents raw fields are immutable (trigger below) — sources may
--     never be rewritten by an LLM; only derived artifacts are allowed (§4.1).

create table if not exists entities (
  id          text primary key,
  type        text not null check (type in (
                'COMPANY','PERSON','PRODUCT','MODEL','REPOSITORY',
                'SUPPLY_CHAIN_NODE','EVENT','THEME')),
  name        text not null,
  aliases     text not null default '[]',   -- Json<string[]>
  ticker      text,                          -- listed companies only
  description text,
  metadata    text not null default '{}',   -- Json<Record<string, unknown>>
  created_at  text not null,
  updated_at  text not null
);
create unique index if not exists entities_type_name_idx
  on entities(type, lower(name));

create table if not exists entity_relations (
  id          text primary key,
  from_id     text not null references entities(id),
  to_id       text not null references entities(id),
  relation    text not null,                 -- e.g. SUPPLIES / COMPETES_WITH / OWNS
  description text,
  metadata    text not null default '{}',
  created_at  text not null
);

create table if not exists source_documents (
  id           text primary key,
  source_type  text not null check (source_type in (
                 'GITHUB_RADAR','MODEL_USAGE','EARNINGS_CALL','NEWS',
                 'FILING','NOTE','MANUAL')),
  title        text not null,
  url          text,
  author       text,
  published_at text,
  ingested_at  text not null,
  raw_text     text not null,               -- stored inline (single-user local tool)
  content_hash text not null,               -- sha256 hex of raw_text
  trust_level  text not null default 'MEDIUM'
                 check (trust_level in ('LOW','MEDIUM','HIGH')),
  entity_ids   text not null default '[]'   -- Json<string[]>
);
create unique index if not exists source_documents_hash_idx
  on source_documents(content_hash);

-- Immutability guard: the raw ingested content of a source can never be
-- rewritten (LLMs produce derived artifacts only). Mutable metadata
-- (title/trust_level/entity_ids/...) may still be updated.
create trigger if not exists source_documents_immutable
before update on source_documents
when new.raw_text <> old.raw_text
  or new.content_hash <> old.content_hash
  or new.source_type <> old.source_type
  or ifnull(new.url,'') <> ifnull(old.url,'')
begin
  select raise(abort, 'source raw fields are immutable');
end;

create table if not exists signals (
  id                    text primary key,
  title                 text not null,
  summary               text not null,
  signal_type           text not null check (signal_type in (
                          'DEVELOPER','MODEL_USAGE','PRODUCT','COMPANY',
                          'SUPPLY_CHAIN','POLICY')),
  direction             text not null check (direction in (
                          'POSITIVE','NEGATIVE','MIXED','UNKNOWN')),
  confidence            text not null check (confidence in ('LOW','MEDIUM','HIGH')),
  entity_ids            text not null default '[]',  -- Json<string[]>
  source_document_ids   text not null default '[]',  -- Json<string[]>
  affected_company_ids  text not null default '[]',  -- Json<string[]>
  research_questions    text not null default '[]',  -- Json<string[]>
  created_at            text not null
);

create table if not exists memos (
  id                       text primary key,
  title                    text not null,
  company_ids              text not null default '[]',  -- Json<string[]>
  theme_ids                text not null default '[]',  -- Json<string[]>
  one_line_conclusion      text not null default '',
  thesis                   text not null default '',
  supporting_evidence      text not null default '[]',  -- Json<EvidenceItem[]>
  counter_arguments        text not null default '[]',  -- Json<EvidenceItem[]>
  key_variables            text not null default '[]',  -- Json<string[]>
  invalidation_conditions  text not null default '[]',  -- Json<string[]>
  open_questions           text not null default '[]',  -- Json<string[]>
  confidence               text not null default 'LOW'
                             check (confidence in ('LOW','MEDIUM','HIGH')),
  axiom_check_results      text not null default '[]',  -- Json<AxiomCheckResult[]>
  provenance               text not null default '{}',  -- Json<MemoProvenance>
  status                   text not null default 'DRAFT'
                             check (status in ('DRAFT','REVIEWED','ARCHIVED')),
  created_at               text not null,
  updated_at               text not null
);

create table if not exists theses (
  id                       text primary key,
  title                    text not null,
  body                     text not null default '',
  company_ids              text not null default '[]',
  theme_ids                text not null default '[]',
  supporting_evidence_ids  text not null default '[]',
  invalidation_conditions  text not null default '[]',
  watch_metrics            text not null default '[]',
  status                   text not null default 'DRAFT'
                             check (status in ('DRAFT','ACTIVE','WATCH',
                                               'AT_RISK','INVALIDATED','CLOSED')),
  next_review_at           text,
  created_at               text not null,
  updated_at               text not null
);

create table if not exists thesis_events (
  id          text primary key,
  thesis_id   text not null references theses(id),
  event_type  text not null check (event_type in (
                'SUPPORT','WEAKEN','INVALIDATE','STATUS_CHANGE','NOTE')),
  detail      text not null default '',
  source_document_ids text not null default '[]',
  created_at  text not null
);

create table if not exists playbook_runs (
  id               text primary key,
  memo_id          text references memos(id),
  thesis_id        text references theses(id),
  proposed_action  text not null check (proposed_action in (
                     'WATCHLIST','PAPER_TRADE','RESEARCH_MORE',
                     'UPDATE_THESIS','CLOSE_THESIS')),
  rationale        text not null default '',
  risks            text not null default '[]',  -- Json<string[]>
  approval_status  text not null default 'NOT_REQUIRED'
                     check (approval_status in (
                       'NOT_REQUIRED','PENDING','APPROVED','REJECTED')),
  human_decision   text,
  review_at        text,
  created_at       text not null
);

create table if not exists axioms (
  id          text primary key,
  code        text not null,                -- e.g. AX001
  title       text not null,
  description text not null default '',
  severity    text not null default 'BLOCK'
                check (severity in ('BLOCK','WARN')),
  enabled     integer not null default 1,
  created_at  text not null
);
create unique index if not exists axioms_code_idx on axioms(code);

create table if not exists eval_cases (
  id               text primary key,
  title            text not null,
  as_of            text not null,           -- historical point in time
  visible_material text not null default '[]',  -- Json<string[]> source ids
  expected_output  text not null default '',
  outcome          text not null default '',    -- what actually happened
  rubric           text not null default '{}',  -- Json<Record<string, unknown>>
  created_at       text not null
);

create table if not exists eval_runs (
  id           text primary key,
  case_id      text not null references eval_cases(id),
  output       text not null default '',
  scores       text not null default '{}',  -- Json<Record<string, number>>
  failure_modes text not null default '[]', -- Json<string[]>
  created_at   text not null
);

create table if not exists audit_log (
  id         text primary key,
  action     text not null,                 -- e.g. source.ingest / memo.generate / memo.review
  actor      text not null default 'local-user',
  target_id  text,
  detail     text not null default '{}',    -- Json<Record<string, unknown>>
  created_at text not null
);
