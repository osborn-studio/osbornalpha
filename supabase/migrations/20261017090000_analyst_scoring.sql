-- Analyst scoring layer (spec docs/superpowers/specs/2026-10-17-analyst-scoring-layer-design.md).
-- analyst_profiles: who made a call (humans and agents; one is_self row per owner).
-- recommendations: append-only calls; only withdrawn_at/withdraw_reason and the
--   one-shot fill_price/fill_date are ever updated (enforced by the API layer).
-- recommendation_scores: forward 5/20/60 results, same kernel as decision_reviews.
-- decisions.recommendation_id: the single research→analyst→portfolio link ("adopted").
-- All tables RLS own-rows-only, same pattern as 20260702090000_decision_layer.sql.

create table public.analyst_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  kind         text not null default 'human' check (kind in ('human','agent')),
  is_self      boolean not null default false,
  note         text,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create unique index analyst_profiles_user_name on public.analyst_profiles (user_id, lower(display_name)) where archived_at is null;
create unique index analyst_profiles_user_self on public.analyst_profiles (user_id) where is_self;

create table public.recommendations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- cascade (not restrict) so deleting an auth user can cascade through profiles.
  -- Profiles are never deleted by the API; they are archived.
  analyst_id      uuid not null references public.analyst_profiles(id) on delete cascade,
  ticker          text not null,
  market          text not null check (market in ('A','HK','US')),
  action          text not null check (action in ('buy','sell','trim','add','hold','pass')),
  reference_price numeric check (reference_price > 0),
  rationale       text,
  confidence      int check (confidence between 0 and 100),
  target_price    numeric,
  stop_loss       numeric,
  horizon         text check (horizon in ('short','mid','long')),
  thesis_ref      text,
  source_type     text not null default 'manual' check (source_type in ('manual','copilot','playbook','signal','import')),
  source_ref      jsonb,
  recommended_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  withdraw_reason text,
  fill_price      numeric check (fill_price > 0),
  fill_date       date
);
create index recommendations_user_analyst on public.recommendations (user_id, analyst_id, recommended_at desc);
create index recommendations_user_ticker  on public.recommendations (user_id, ticker, recommended_at desc);

create table public.recommendation_scores (
  recommendation_id  uuid primary key references public.recommendations(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  scored_at          timestamptz not null default now(),
  forward_5d_pct     numeric,
  forward_20d_pct    numeric,
  forward_60d_pct    numeric,
  hit                boolean,
  score              numeric,
  calibration_bucket text,
  last_close         numeric,
  last_close_date    date
);

alter table public.decisions add column recommendation_id uuid references public.recommendations(id) on delete set null;
create index decisions_recommendation on public.decisions (recommendation_id) where recommendation_id is not null;

do $$
declare t text;
begin
  foreach t in array array['analyst_profiles','recommendations','recommendation_scores']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t || ' own select', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t || ' own insert', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id)', t || ' own update', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t || ' own delete', t);
  end loop;
end $$;
