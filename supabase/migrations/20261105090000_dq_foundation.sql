-- supabase/migrations/20261105090000_dq_foundation.sql
-- WP-F0 (data foundation spec §5.1): shared ingest receipts, quarantine, reconciliation
-- results and freshness registry for every dataset (macro, facts, securities, …).
-- Service-role only: RLS enabled with no policies; admin routes read through getAdminSupabase().
-- Replayable: guarded create statements.

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
  triggered_by  text not null default 'script' check (triggered_by in ('cron','manual','script'))
);
create index if not exists ingest_batches_dataset_started_idx on public.ingest_batches(dataset, started_at desc);

create table if not exists public.dq_quarantine (
  id           uuid primary key,
  dataset      text not null,
  table_name   text not null,
  natural_key  text not null,
  reason_code  text not null,
  detail       jsonb not null default '{}',
  payload      jsonb not null default '{}',
  batch_id     uuid not null references public.ingest_batches(batch_id) on delete cascade,
  status       text not null default 'open' check (status in ('open','resolved_accept','resolved_reject')),
  resolved_by  uuid,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists dq_quarantine_open_idx on public.dq_quarantine(dataset, created_at desc) where status = 'open';

create table if not exists public.dq_reconciliations (
  id           uuid primary key,
  dataset      text not null,
  left_source  text not null,
  right_source text not null,
  natural_key  text not null,
  left_value   numeric,
  right_value  numeric,
  abs_diff     numeric,
  rel_diff     numeric,
  tolerance    numeric not null,
  passed       boolean not null,
  batch_id     uuid references public.ingest_batches(batch_id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists dq_reconciliations_failed_idx on public.dq_reconciliations(dataset, created_at desc) where passed = false;

create table if not exists public.dq_freshness (
  dataset            text primary key,
  expected_cadence   text not null check (expected_cadence in ('daily','monthly','quarterly','event')),
  last_ok_at         timestamptz,
  last_attempt_at    timestamptz,
  consecutive_errors integer not null default 0 check (consecutive_errors >= 0),
  status             text not null check (status in ('fresh','stale','error','missing')),
  detail             jsonb not null default '{}',
  updated_at         timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['ingest_batches','dq_quarantine','dq_reconciliations','dq_freshness'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
