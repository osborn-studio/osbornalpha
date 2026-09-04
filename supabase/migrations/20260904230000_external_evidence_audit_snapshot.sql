-- Make evidence runs self-describing without persisting user query text.
-- Query-plan entries contain only scope, bounds, and a one-way SHA-256 hash.
alter table public.external_evidence_runs
  add column if not exists audit_version integer not null default 1,
  add column if not exists query_plan jsonb not null default '[]'::jsonb,
  add column if not exists result_citation_ids text[] not null default '{}',
  add column if not exists result_set_hash text not null default '';

alter table public.external_evidence_runs
  drop constraint if exists external_evidence_runs_audit_version_check;
alter table public.external_evidence_runs
  add constraint external_evidence_runs_audit_version_check
  check (audit_version >= 1);

alter table public.external_evidence_runs
  drop constraint if exists external_evidence_runs_query_plan_check;
alter table public.external_evidence_runs
  add constraint external_evidence_runs_query_plan_check
  check (jsonb_typeof(query_plan) = 'array');

alter table public.external_evidence_runs
  drop constraint if exists external_evidence_runs_result_set_hash_check;
alter table public.external_evidence_runs
  add constraint external_evidence_runs_result_set_hash_check
  check (result_set_hash = '' or result_set_hash ~ '^[0-9a-f]{64}$');

insert into public.watchlist_release_markers (marker)
values ('external_evidence_audit_snapshot')
on conflict (marker) do nothing;
