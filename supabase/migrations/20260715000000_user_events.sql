-- Product telemetry for beta usage analysis.
create table if not exists public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  event_name text not null,
  path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_events enable row level security;

create index if not exists user_events_created_idx on public.user_events (created_at desc);
create index if not exists user_events_user_created_idx on public.user_events (user_id, created_at desc);
create index if not exists user_events_name_created_idx on public.user_events (event_name, created_at desc);

drop policy if exists "user_events insert beta telemetry" on public.user_events;
create policy "user_events insert beta telemetry"
  on public.user_events
  for insert
  with check (auth.uid() is null or user_id is null or auth.uid() = user_id);

drop policy if exists "user_events self read" on public.user_events;
create policy "user_events self read"
  on public.user_events
  for select
  using (auth.uid() = user_id);
