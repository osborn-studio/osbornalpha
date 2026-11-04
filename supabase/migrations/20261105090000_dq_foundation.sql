-- supabase/migrations/20261105090000_dq_foundation.sql
-- WP-F0 (data foundation spec §5.1): shared ingest receipts, quarantine, reconciliation
-- results and freshness registry for every dataset (macro, facts, securities, …).
-- Service-role only: RLS enabled with no policies; admin routes read through getAdminSupabase().
-- Privileges are revoked explicitly: Supabase grants ALL on new public tables to anon/authenticated
-- by default, and RLS does not stop TRUNCATE (or TRIGGER/REFERENCES), so RLS alone is not enough.
-- Quarantine rows are evidence and must outlive receipt deletion (on delete restrict).
-- Replayable: guarded create statements; comment on is idempotent.

create table if not exists public.ingest_batches (
  batch_id      uuid primary key,
  producer      text not null check (length(producer) between 1 and 64),
  dataset       text not null check (length(dataset) between 1 and 64),
  status        text not null default 'running'
                check (status in ('running','success','partial','failed','rejected')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  counts        jsonb not null default '{}',
  errors        jsonb not null default '[]',
  tool_versions jsonb not null default '{}',
  code_version  text,
  triggered_by  text not null default 'script' check (triggered_by in ('cron','manual','script')),
  constraint ingest_batches_finished_after_started check (finished_at is null or finished_at >= started_at),
  constraint ingest_batches_running_iff_unfinished check ((status = 'running') = (finished_at is null)),
  constraint ingest_batches_counts_object check (jsonb_typeof(counts) = 'object'),
  constraint ingest_batches_errors_array check (jsonb_typeof(errors) = 'array'),
  constraint ingest_batches_tool_versions_object check (jsonb_typeof(tool_versions) = 'object')
);
create index if not exists ingest_batches_dataset_started_idx on public.ingest_batches(dataset, started_at desc);

create table if not exists public.dq_quarantine (
  id           uuid primary key,
  dataset      text not null check (length(dataset) between 1 and 64),
  table_name   text not null check (length(table_name) between 1 and 64),
  natural_key  text not null check (length(natural_key) between 1 and 512),
  reason_code  text not null check (length(reason_code) between 1 and 64),
  detail       jsonb not null default '{}',
  payload      jsonb not null default '{}',
  batch_id     uuid not null references public.ingest_batches(batch_id) on delete restrict,
  status       text not null default 'open' check (status in ('open','resolved_accept','resolved_reject')),
  resolved_by  uuid,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint dq_quarantine_detail_object check (jsonb_typeof(detail) = 'object'),
  constraint dq_quarantine_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint dq_quarantine_open_iff_unresolved check ((status = 'open') = (resolved_at is null)),
  constraint dq_quarantine_resolved_by_required check (status = 'open' or resolved_by is not null)
);
create index if not exists dq_quarantine_open_idx on public.dq_quarantine(dataset, created_at desc) where status = 'open';
create index if not exists dq_quarantine_batch_idx on public.dq_quarantine(batch_id);

create table if not exists public.dq_reconciliations (
  id           uuid primary key,
  dataset      text not null check (length(dataset) between 1 and 64),
  left_source  text not null,
  right_source text not null,
  natural_key  text not null,
  left_value   numeric,
  right_value  numeric,
  abs_diff     numeric check (abs_diff is null or abs_diff >= 0),
  rel_diff     numeric,
  tolerance    numeric not null check (tolerance >= 0),
  passed       boolean not null,
  batch_id     uuid references public.ingest_batches(batch_id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists dq_reconciliations_failed_idx on public.dq_reconciliations(dataset, created_at desc) where passed = false;
create index if not exists dq_reconciliations_batch_idx on public.dq_reconciliations(batch_id);
comment on column public.dq_reconciliations.tolerance is 'Relative tolerance: |left-right| <= tolerance * max(|left|,|right|,1)';

create table if not exists public.dq_freshness (
  dataset            text primary key check (length(dataset) between 1 and 64),
  expected_cadence   text not null check (expected_cadence in ('daily','monthly','quarterly','event')),
  last_ok_at         timestamptz,
  last_attempt_at    timestamptz,
  consecutive_errors integer not null default 0 check (consecutive_errors >= 0),
  status             text not null check (status in ('fresh','stale','error','missing')),
  detail             jsonb not null default '{}',
  updated_at         timestamptz not null default now(),
  constraint dq_freshness_detail_object check (jsonb_typeof(detail) = 'object'),
  constraint dq_freshness_ok_requires_last_ok check (status not in ('fresh','stale') or last_ok_at is not null)
);
comment on column public.dq_freshness.updated_at is 'Set by writers (recordAttempt); no trigger.';

do $$ declare t text; begin
  foreach t in array array['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
