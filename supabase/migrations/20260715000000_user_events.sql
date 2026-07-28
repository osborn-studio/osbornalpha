-- Minimal product analytics events for beta usage reporting.
-- Keeps payloads small and user-scoped when auth is available.

create table if not exists public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  session_id text,
  event_name text not null,
  path text,
  properties jsonb default '{}'::jsonb,
  user_agent text,
  referrer text,
  created_at timestamptz default now()
);

create index if not exists user_events_created_idx on public.user_events (created_at desc);
create index if not exists user_events_name_created_idx on public.user_events (event_name, created_at desc);
create index if not exists user_events_user_created_idx on public.user_events (user_id, created_at desc);
create index if not exists user_events_anonymous_created_idx on public.user_events (anonymous_id, created_at desc);

alter table public.user_events enable row level security;

drop policy if exists "user_events insert beta telemetry" on public.user_events;
create policy "user_events insert beta telemetry"
  on public.user_events for insert
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "user_events self read" on public.user_events;
create policy "user_events self read"
  on public.user_events for select
  using (auth.uid() = user_id);
