-- WP-A9 / plan §5.7: multi-analyst schema (identity map only; the UI stays single-user).
-- Maps an external channel identity (e.g. a chat account) to an analyst id inside one owner's workspace.
create table if not exists public.research_analyst_identities (
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel     text not null check (channel ~ '^[a-z][a-z0-9_-]{0,31}$'),
  external_id text not null check (length(btrim(external_id)) between 1 and 200),
  analyst_id  uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, channel, external_id)
);
create index if not exists research_analyst_identities_analyst_idx on public.research_analyst_identities (user_id, analyst_id);
alter table public.research_analyst_identities enable row level security;
drop policy if exists "research_analyst_identities self select" on public.research_analyst_identities;
create policy "research_analyst_identities self select" on public.research_analyst_identities for select to authenticated using (auth.uid() = user_id);
drop policy if exists "research_analyst_identities self insert" on public.research_analyst_identities;
create policy "research_analyst_identities self insert" on public.research_analyst_identities for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "research_analyst_identities self delete" on public.research_analyst_identities;
create policy "research_analyst_identities self delete" on public.research_analyst_identities for delete to authenticated using (auth.uid() = user_id);
