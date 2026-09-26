-- WP-A7: thesis extension (implementation plan 2026-09-22 §5.3) and the §7.4
-- falsification rules that need schema: `supersedes` (a new thesis replacing an
-- INVALIDATED/CLOSED one) and `kill_condition_revisions` (wording fixes that keep
-- the original text). Replayable: add-if-not-exists, drop-then-add constraints.

alter table public.research_theses
  add column if not exists opportunity_type          text        not null default 'other',
  add column if not exists pillars                   jsonb       not null default '[]'::jsonb,
  add column if not exists catalysts                 jsonb       not null default '[]'::jsonb,
  add column if not exists horizon_weeks             integer[]   not null default '{4,13,26}',
  add column if not exists supersedes                uuid,
  add column if not exists kill_condition_revisions  jsonb       not null default '[]'::jsonb;

alter table public.research_theses drop constraint if exists research_theses_opportunity_type_check;
alter table public.research_theses add constraint research_theses_opportunity_type_check
  check (opportunity_type in ('B','C','other'));
alter table public.research_theses drop constraint if exists research_theses_pillars_array_check;
alter table public.research_theses add constraint research_theses_pillars_array_check
  check (jsonb_typeof(pillars) = 'array');
alter table public.research_theses drop constraint if exists research_theses_catalysts_array_check;
alter table public.research_theses add constraint research_theses_catalysts_array_check
  check (jsonb_typeof(catalysts) = 'array');
alter table public.research_theses drop constraint if exists research_theses_kill_condition_revisions_array_check;
alter table public.research_theses add constraint research_theses_kill_condition_revisions_array_check
  check (jsonb_typeof(kill_condition_revisions) = 'array');
alter table public.research_theses drop constraint if exists research_theses_horizon_weeks_check;
alter table public.research_theses add constraint research_theses_horizon_weeks_check
  check (cardinality(horizon_weeks) > 0 and 0 < all(horizon_weeks));
alter table public.research_theses drop constraint if exists research_theses_supersedes_not_self_check;
alter table public.research_theses add constraint research_theses_supersedes_not_self_check
  check (supersedes is null or supersedes <> id);

-- Owner-scoped self reference: a thesis can only supersede one of its owner's theses.
-- Deleting the old thesis detaches the successor instead of deleting it (column-list SET NULL, PostgreSQL ≥ 15,
-- so only `supersedes` is cleared and user_id stays).
create unique index if not exists research_theses_owner_id on public.research_theses (user_id, id);
alter table public.research_theses drop constraint if exists research_theses_supersedes_fkey;
alter table public.research_theses add constraint research_theses_supersedes_fkey
  foreign key (user_id, supersedes) references public.research_theses (user_id, id) on delete set null (supersedes);
create index if not exists research_theses_supersedes_idx on public.research_theses (user_id, supersedes) where supersedes is not null;

-- §7.4.4 event: the kill condition's wording was revised; the original stays in kill_condition_revisions.
alter table public.research_thesis_events drop constraint if exists research_thesis_events_kind_check;
alter table public.research_thesis_events add constraint research_thesis_events_kind_check
  check (kind in ('SUPPORT','WEAKEN','INVALIDATE','USER_ACTION','STATUS_CHANGE','KILL_CONDITION_REVISED','NOTE'));
