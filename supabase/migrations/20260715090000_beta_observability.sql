-- Complete beta telemetry context and persist sanitized Copilot run outcomes.
alter table public.user_events add column if not exists anonymous_id text;
alter table public.user_events add column if not exists user_agent text;
alter table public.user_events add column if not exists referrer text;

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text,
  method_id text not null,
  question text,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  content_md text,
  verdict jsonb,
  error_code text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.ai_runs enable row level security;

create index if not exists ai_runs_user_created_idx
  on public.ai_runs (user_id, created_at desc);
create index if not exists ai_runs_status_created_idx
  on public.ai_runs (status, created_at desc);
create index if not exists ai_runs_ticker_created_idx
  on public.ai_runs (ticker, created_at desc);

drop policy if exists "ai_runs own select" on public.ai_runs;
create policy "ai_runs own select"
  on public.ai_runs for select
  using (auth.uid() = user_id);

drop policy if exists "ai_runs own insert" on public.ai_runs;
create policy "ai_runs own insert"
  on public.ai_runs for insert
  with check (auth.uid() = user_id);

drop policy if exists "ai_runs own update" on public.ai_runs;
create policy "ai_runs own update"
  on public.ai_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
