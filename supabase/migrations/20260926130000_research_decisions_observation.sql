-- WP-E4: link a ledger decision (which carries the arm) to the S4 observation it produced,
-- so market results can be reported per arm (plan §7.2 / §10.1 ③). Additive and replayable.
alter table public.research_decisions add column if not exists observation_id uuid;
alter table public.research_decisions drop constraint if exists research_decisions_observation_fkey;
alter table public.research_decisions add constraint research_decisions_observation_fkey
  foreign key (user_id, observation_id) references public.research_s4_observation_state (user_id, observation_id);
create index if not exists research_decisions_observation_idx on public.research_decisions (user_id, observation_id) where observation_id is not null;
