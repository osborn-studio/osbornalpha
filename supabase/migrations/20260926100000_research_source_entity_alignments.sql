-- WP-A5: source ↔ entity alignment decisions (implementation plan 2026-09-22 §5.5).
-- One row per (owner, source, entity). status 'aligned' rows are merged into
-- research_source_documents.entity_ids by the aligner; 'ambiguous' rows wait for a
-- human or Jev; 'rejected' rows stop the rule from re-proposing the pair.
-- Replayable: create-if-not-exists, drop-then-create policies.

create table if not exists public.research_source_entity_alignments (
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   uuid not null,
  entity_id   uuid not null,
  method      text not null check (method in ('rule','collector','jev','human')),
  status      text not null check (status in ('aligned','ambiguous','rejected')),
  confidence  numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence    jsonb not null default '{}'::jsonb,
  decided_at  timestamptz not null default now(),
  decided_by  text not null default 'rule',
  primary key (user_id, source_id, entity_id),
  foreign key (user_id, source_id) references public.research_source_documents(user_id, id) on delete cascade,
  foreign key (user_id, entity_id) references public.research_entities(user_id, id) on delete cascade
);
create index if not exists research_source_entity_alignments_status_idx
  on public.research_source_entity_alignments (user_id, status, decided_at desc);

alter table public.research_source_entity_alignments enable row level security;
drop policy if exists "research_source_entity_alignments self select" on public.research_source_entity_alignments;
create policy "research_source_entity_alignments self select" on public.research_source_entity_alignments for select to authenticated using (auth.uid() = user_id);
drop policy if exists "research_source_entity_alignments self insert" on public.research_source_entity_alignments;
create policy "research_source_entity_alignments self insert" on public.research_source_entity_alignments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "research_source_entity_alignments self update" on public.research_source_entity_alignments;
create policy "research_source_entity_alignments self update" on public.research_source_entity_alignments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "research_source_entity_alignments self delete" on public.research_source_entity_alignments;
create policy "research_source_entity_alignments self delete" on public.research_source_entity_alignments for delete to authenticated using (auth.uid() = user_id);
