-- V3 decision layer: decisions → trades → positions → decision_reviews attribution
-- chain, plus artifacts (skill outputs). Every table is RLS-scoped to its owner.
-- positions is derived state: recomputed from trades by src/lib/portfolio/positions.ts.

create table public.decisions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  ticker       text not null,
  market       text not null check (market in ('A','HK','US')),
  action       text not null check (action in ('buy','sell','trim','add','hold','pass')),
  thesis       text,
  confidence   int check (confidence between 0 and 100),
  entry_low    numeric,
  entry_high   numeric,
  target_price numeric,
  stop_loss    numeric,
  horizon      text check (horizon in ('short','mid','long')),
  source_type  text not null default 'manual'
               check (source_type in ('manual','copilot','signal','radar','skill')),
  source_ref   jsonb,
  status       text not null default 'open'
               check (status in ('open','executed','expired','cancelled')),
  decided_at   timestamptz not null default now(),
  expires_at   timestamptz
);
create index decisions_user_ticker on public.decisions (user_id, ticker, decided_at desc);

create table public.trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  decision_id uuid references public.decisions(id) on delete set null,
  ticker      text not null,
  direction   text not null check (direction in ('buy','sell')),
  price       numeric not null check (price > 0),
  quantity    numeric not null check (quantity > 0),
  fee         numeric not null default 0 check (fee >= 0),
  currency    text not null default 'CNY',
  executed_at timestamptz not null default now(),
  note        text
);
create index trades_user_ticker on public.trades (user_id, ticker, executed_at);
create index trades_decision on public.trades (decision_id);

create table public.positions (
  user_id      uuid not null references auth.users(id) on delete cascade,
  ticker       text not null,
  shares       numeric not null default 0 check (shares >= 0),
  avg_cost     numeric not null default 0,
  realized_pnl numeric not null default 0,
  currency     text not null default 'CNY',
  opened_at    timestamptz not null,
  closed_at    timestamptz,
  primary key (user_id, ticker)
);

create table public.decision_reviews (
  id                 uuid primary key default gen_random_uuid(),
  decision_id        uuid not null references public.decisions(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  scored_at          timestamptz not null default now(),
  forward_5d_pct     numeric,
  forward_20d_pct    numeric,
  forward_60d_pct    numeric,
  hit                boolean,
  score              numeric,
  calibration_bucket text
);
create unique index decision_reviews_decision on public.decision_reviews (decision_id);

create table public.artifacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  skill_id   text not null,
  ticker     text,
  title      text not null,
  content_md text not null,
  params     jsonb,
  created_at timestamptz not null default now()
);
create index artifacts_user_skill on public.artifacts (user_id, skill_id, created_at desc);

-- RLS: own-rows-only for all four verbs, mirroring llm_settings conventions.
do $$
declare t text;
begin
  foreach t in array array['decisions','trades','positions','decision_reviews','artifacts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || ' own select', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || ' own insert', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id)', t || ' own update', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || ' own delete', t);
  end loop;
end $$;
