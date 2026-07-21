create table if not exists public.service_alert_runs (
  id uuid primary key default gen_random_uuid(),
  check_name text not null check (check_name in ('ai_daily', 'quote_15m', 'auth_email_daily')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null check (status in ('healthy', 'alerting', 'error')),
  metrics jsonb not null default '{}'::jsonb,
  violations jsonb not null default '[]'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (check_name, window_start)
);

alter table public.service_alert_runs enable row level security;

create index if not exists service_alert_runs_check_created_idx
  on public.service_alert_runs (check_name, created_at desc);
