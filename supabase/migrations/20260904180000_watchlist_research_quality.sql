-- Persist source quality and ranking provenance alongside the user-visible
-- research artifacts. Existing rows remain readable with conservative defaults.
alter table public.external_evidence
  add column if not exists quality_score double precision not null default 0,
  add column if not exists quality_flags text[] not null default '{}';

alter table public.news_items
  add column if not exists relevance_score numeric,
  add column if not exists quality_score numeric not null default 0,
  add column if not exists quality_flags text[] not null default '{}';

alter table public.broker_reports
  add column if not exists relevance_score numeric,
  add column if not exists quality_score numeric not null default 0,
  add column if not exists quality_flags text[] not null default '{}';

alter table public.external_evidence
  drop constraint if exists external_evidence_quality_score_check;
alter table public.external_evidence
  add constraint external_evidence_quality_score_check check (quality_score between 0 and 1);

alter table public.news_items
  drop constraint if exists news_items_quality_score_check;
alter table public.news_items
  add constraint news_items_quality_score_check check (quality_score between 0 and 1);

alter table public.broker_reports
  drop constraint if exists broker_reports_quality_score_check;
alter table public.broker_reports
  add constraint broker_reports_quality_score_check check (quality_score between 0 and 1);
