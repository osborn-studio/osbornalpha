-- Persist the generation and evidence snapshot used by each AI perspective.
-- All fields are additive so existing rows remain readable with safe defaults.
alter table public.perspectives
  add column if not exists model_version text,
  add column if not exists prompt_version text,
  add column if not exists evidence_request_id uuid,
  add column if not exists evidence_fetched_at timestamptz,
  add column if not exists evidence_result_count integer not null default 0,
  add column if not exists evidence_coverage_ratio numeric not null default 0;

alter table public.perspectives
  drop constraint if exists perspectives_evidence_result_count_check;
alter table public.perspectives
  add constraint perspectives_evidence_result_count_check
  check (evidence_result_count >= 0);

alter table public.perspectives
  drop constraint if exists perspectives_evidence_coverage_ratio_check;
alter table public.perspectives
  add constraint perspectives_evidence_coverage_ratio_check
  check (evidence_coverage_ratio between 0 and 1);

-- The evidence audit ledger is best-effort and may be unavailable during a
-- provider incident. Keep this as a soft UUID link so perspective persistence
-- never fails solely because the audit row could not be written.

create index if not exists perspectives_evidence_request_idx
  on public.perspectives (evidence_request_id)
  where evidence_request_id is not null;
