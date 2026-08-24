create table if not exists public.auth_email_probe_runs (
  id uuid primary key default gen_random_uuid(),
  recipient_hash text not null,
  domain text not null,
  probe_date date not null,
  signup_requested_at timestamptz,
  signup_delivery text not null default 'pending'
    check (signup_delivery in ('pending', 'delayed', 'delivered', 'failed')),
  signup_delivery_at timestamptz,
  recovery_requested_at timestamptz,
  recovery_delivery text not null default 'pending'
    check (recovery_delivery in ('pending', 'delayed', 'delivered', 'failed')),
  recovery_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipient_hash, probe_date)
);

alter table public.auth_email_probe_runs enable row level security;

create index if not exists auth_email_probe_runs_date_idx
  on public.auth_email_probe_runs (probe_date desc, domain);

create table if not exists public.resend_webhook_events (
  svix_id text not null,
  recipient_hash text not null,
  email_id text,
  event_type text not null,
  category text not null check (category in ('signup', 'recovery')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (svix_id, recipient_hash)
);

alter table public.resend_webhook_events enable row level security;

create index if not exists resend_webhook_events_recipient_idx
  on public.resend_webhook_events (recipient_hash, occurred_at desc);
