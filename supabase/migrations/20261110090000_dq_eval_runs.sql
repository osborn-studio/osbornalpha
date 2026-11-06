-- supabase/migrations/20261110090000_dq_eval_runs.sql
-- F6 evaluation framework (spec 2026-11-04-evals-and-gold-sets-design.md §6.2, §0 R5-3/R5-4):
-- one row per evaluation run (dq_eval_runs) and the per-case non-pass results of public
-- official/dual_source runs (dq_eval_case_results, at most 100 per run; the report file keeps all).
-- Decimal comparison values are TEXT with format checks so they never round-trip through numeric.
-- Does not touch dq_reconciliations. Service-role only: RLS on with no policies, and privileges
-- revoked explicitly from public/anon/authenticated (same loop as 20261105090000_dq_foundation.sql).
-- Case rows are evidence: deleting a run that still has case rows is refused (on delete restrict).
-- Replayable: guarded create statements only.

create table if not exists public.dq_eval_runs (
  run_id                  uuid primary key,
  kind                    text not null check (kind in ('official_reconciliation','dual_source','replay_consistency','reference_regression','extraction_gold','judgment_calibration')),
  module                  text not null check (length(module) between 1 and 32),
  mode                    text not null check (mode in ('ci','report')),
  privileged              boolean not null default false,
  artifact_class          text not null check (artifact_class in ('public','restricted')),
  set_id                  text not null,
  set_version             integer not null check (set_version >= 1),
  set_sha256              text not null check (set_sha256 ~ '^[0-9a-f]{64}$'),
  evaluator_code_version  text not null check (evaluator_code_version ~ '^[0-9a-f]{40}$'),
  started_at              timestamptz not null,
  finished_at             timestamptz,
  status                  text not null check (status in ('running','passed','failed','incomplete','error')),
  summary                 jsonb not null default '{}',
  report_ref              text not null,
  report_sha256           text not null check (report_sha256 ~ '^[0-9a-f]{64}$'),
  triggered_by            text not null check (triggered_by in ('manual','script','ci')),
  constraint dq_eval_runs_summary_object check (jsonb_typeof(summary) = 'object'),
  constraint dq_eval_runs_finished_after_started check (finished_at is null or finished_at >= started_at),
  constraint dq_eval_runs_running_iff_unfinished check ((status = 'running') = (finished_at is null))
);
create index if not exists dq_eval_runs_module_kind_idx on public.dq_eval_runs(module, kind, started_at desc);

create table if not exists public.dq_eval_case_results (
  eval_run_id  uuid not null references public.dq_eval_runs(run_id) on delete restrict,
  case_id      text not null check (length(case_id) between 1 and 512),
  result       text not null check (result in ('fail','unit_mismatch','provenance_incomplete','missing','not_visible','read_error','unexplained_diff')),
  reason       text check (reason is null or length(reason) between 1 and 64),
  left_text    text check (left_text  is null or left_text  ~ '^-?[0-9]+(\.[0-9]+)?$'),
  right_text   text check (right_text is null or right_text ~ '^-?[0-9]+(\.[0-9]+)?$'),
  abs_diff     text check (abs_diff   is null or abs_diff   ~ '^[0-9]+(\.[0-9]+)?$'),
  rel_diff     text check (rel_diff   is null or rel_diff   ~ '^[0-9]+(\.[0-9]+)?$'),
  tolerance    text not null check (tolerance ~ '^[0-9]+(\.[0-9]+)?$'),
  detail       jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  primary key (eval_run_id, case_id),
  constraint dq_eval_case_results_detail_object check (jsonb_typeof(detail) = 'object')
);

do $$ declare t text; begin
  foreach t in array array['dq_eval_runs','dq_eval_case_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
