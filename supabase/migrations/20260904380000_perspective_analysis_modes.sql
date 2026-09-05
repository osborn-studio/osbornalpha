-- Make every generated perspective explicit about whether external evidence
-- was requested, actually available, and used as a required citation source.
alter table public.perspectives
  add column if not exists requested_analysis_mode text not null default 'auto',
  add column if not exists resolved_analysis_mode text not null default 'structured_only',
  add column if not exists evidence_status text not null default 'unavailable';

-- Preserve the strongest statement supported by legacy provenance. Historical
-- rows cannot distinguish complete from partial searches, so use partial.
update public.perspectives
set resolved_analysis_mode = case
      when evidence_result_count > 0 then 'evidence_backed'
      else 'structured_only'
    end,
    evidence_status = case
      when evidence_result_count > 0 then 'partial'
      else 'unavailable'
    end
where requested_analysis_mode = 'auto'
  and resolved_analysis_mode = 'structured_only'
  and evidence_status = 'unavailable';

alter table public.perspectives
  drop constraint if exists perspectives_requested_analysis_mode_check;
alter table public.perspectives
  add constraint perspectives_requested_analysis_mode_check
  check (requested_analysis_mode in ('auto', 'evidence_required', 'structured_only'));

alter table public.perspectives
  drop constraint if exists perspectives_resolved_analysis_mode_check;
alter table public.perspectives
  add constraint perspectives_resolved_analysis_mode_check
  check (resolved_analysis_mode in ('evidence_backed', 'structured_only'));

alter table public.perspectives
  drop constraint if exists perspectives_evidence_status_check;
alter table public.perspectives
  add constraint perspectives_evidence_status_check
  check (evidence_status in ('complete', 'partial', 'unavailable', 'error'));

insert into public.watchlist_release_markers (marker)
values ('perspective_analysis_modes')
on conflict (marker) do nothing;
