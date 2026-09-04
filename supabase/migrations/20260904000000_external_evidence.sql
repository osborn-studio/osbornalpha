-- Shared external-evidence cache and search audit ledger. These tables are
-- service-role only: browser clients receive no RLS policies.

create table if not exists public.external_evidence (
  citation_id text primary key,
  canonical_url text not null unique,
  title text not null,
  domain text not null,
  snippet text not null default '',
  source_type text not null check (source_type in ('news','filing','broker','company','industry','macro','social')),
  published_at timestamptz,
  fetched_at timestamptz not null,
  provider text,
  trust_score double precision not null check (trust_score between 0 and 1),
  relevance_score double precision not null check (relevance_score between 0 and 1),
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_evidence_runs (
  request_id uuid primary key,
  request_hash text not null,
  ticker text,
  scopes text[] not null default '{}',
  provider text,
  status text not null check (status in ('complete','partial','unavailable','error')),
  query_count integer not null default 0 check (query_count >= 0),
  result_count integer not null default 0 check (result_count >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  estimated_cost_microusd bigint check (estimated_cost_microusd >= 0),
  warnings text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.external_evidence_tickers (
  ticker text not null,
  citation_id text not null references public.external_evidence(citation_id) on delete cascade,
  request_id uuid not null references public.external_evidence_runs(request_id) on delete cascade,
  expires_at timestamptz not null,
  primary key (ticker, citation_id, request_id)
);

create index if not exists external_evidence_published_idx on public.external_evidence (published_at desc);
create index if not exists external_evidence_tickers_lookup_idx on public.external_evidence_tickers (ticker, expires_at desc);
create index if not exists external_evidence_runs_created_idx on public.external_evidence_runs (created_at desc);

alter table public.external_evidence enable row level security;
alter table public.external_evidence_runs enable row level security;
alter table public.external_evidence_tickers enable row level security;

revoke all on public.external_evidence from anon, authenticated;
revoke all on public.external_evidence_runs from anon, authenticated;
revoke all on public.external_evidence_tickers from anon, authenticated;
grant all on public.external_evidence to service_role;
grant all on public.external_evidence_runs to service_role;
grant all on public.external_evidence_tickers to service_role;
