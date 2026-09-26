-- WP-A8: weekly change cards (implementation plan 2026-09-22 §7.1.2, §7.5).
-- One card per (owner, week, thesis, kind). Cards cite source@version per
-- assertion; a card that fails the trading-advice axiom is kept as 'blocked'
-- for audit and never rendered as advice. Replayable.

create table if not exists public.research_cards (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  id             uuid        not null,
  week_of        date        not null,
  thesis_id      uuid        not null,
  kind           text        not null check (kind in ('evidence','counter')),
  title          text        not null,
  fields         jsonb       not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  assertions     jsonb       not null default '[]'::jsonb check (jsonb_typeof(assertions) = 'array'),
  evidence       jsonb       not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  generation     jsonb       not null default '{}'::jsonb check (jsonb_typeof(generation) = 'object'),
  axiom_results  jsonb       not null default '[]'::jsonb check (jsonb_typeof(axiom_results) = 'array'),
  status         text        not null default 'generated' check (status in ('generated','blocked')),
  created_at     timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, week_of, thesis_id, kind),
  foreign key (user_id, thesis_id) references public.research_theses (user_id, id) on delete cascade
);
create index if not exists research_cards_week_idx on public.research_cards (user_id, week_of desc, kind);

alter table public.research_cards enable row level security;
drop policy if exists "research_cards self select" on public.research_cards;
create policy "research_cards self select" on public.research_cards for select to authenticated using (auth.uid() = user_id);
drop policy if exists "research_cards self insert" on public.research_cards;
create policy "research_cards self insert" on public.research_cards for insert to authenticated with check (auth.uid() = user_id);
