-- WP-A3: judgment ledger (implementation plan 2026-09-22 §5.4/§5.5/§5.7).
-- Four append-only tables. Judgments are content-addressed derivations
-- (id computed in src/lib/research/s4/ledger.ts); decisions and outcomes are
-- human events bound to them. Replayable: guarded create statements.

create unique index if not exists research_theses_owner_id on public.research_theses(user_id,id);

create table if not exists public.research_judgments (
  user_id              uuid not null references auth.users(id) on delete cascade,
  id                   uuid not null,
  snapshot_id          text not null check (snapshot_id ~ '^[0-9a-f]{64}$'),
  snapshot             jsonb not null,
  source_id            uuid not null,
  thesis_id            uuid not null,
  run_id               uuid not null,
  question_set_version text not null check (length(btrim(question_set_version)) > 0),
  question_id          text not null check (length(btrim(question_id)) > 0),
  backend              text not null check (backend in ('rule','llm_deepseek','jev','jev_escalated','local_probe','human')),
  backend_model        text not null check (length(btrim(backend_model)) > 0),
  prompt_sha256        text check (prompt_sha256 is null or prompt_sha256 ~ '^[0-9a-f]{64}$'),
  input_token_count    integer check (input_token_count is null or input_token_count >= 0),
  distribution         jsonb not null,
  selected             text,
  confidence           numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  abstained            boolean not null,
  latency_ms           integer check (latency_ms is null or latency_ms >= 0),
  cost_micros          bigint check (cost_micros is null or cost_micros >= 0),
  created_at           timestamptz not null,
  primary key (user_id,id),
  foreign key (user_id,source_id) references public.research_source_documents(user_id,id),
  foreign key (user_id,thesis_id) references public.research_theses(user_id,id)
);
create index if not exists research_judgments_thesis_idx on public.research_judgments(user_id,thesis_id,created_at,id);
create index if not exists research_judgments_run_idx on public.research_judgments(user_id,run_id);

create table if not exists public.research_labels (
  user_id     uuid not null references auth.users(id) on delete cascade,
  id          uuid not null,
  judgment_id uuid not null,
  label       text not null check (length(btrim(label)) > 0),
  labeler     text not null check (length(btrim(labeler)) > 0),
  labeled_at  timestamptz not null,
  primary key (user_id,id),
  foreign key (user_id,judgment_id) references public.research_judgments(user_id,id)
);
create index if not exists research_labels_judgment_idx on public.research_labels(user_id,judgment_id);

create table if not exists public.research_decisions (
  user_id            uuid not null references auth.users(id) on delete cascade,
  id                 uuid not null,
  thesis_id          uuid not null,
  week_of            date not null,
  arm                text not null check (arm in ('human_baseline','ai_candidate','collab','averaged')),
  action             text not null check (action in ('adopt','shadow','reject','extend','invalidate')),
  reason             text not null check (length(btrim(reason)) > 0),
  cited_judgment_ids uuid[] not null default '{}',
  card_id            text,
  time_spent_minutes integer check (time_spent_minutes is null or time_spent_minutes >= 0),
  frozen_at          timestamptz,
  workspace          text not null default 'personal' check (workspace = 'personal' or workspace ~ '^team:[A-Za-z0-9_-]{1,64}$'),
  analyst_id         uuid,
  created_at         timestamptz not null,
  primary key (user_id,id),
  foreign key (user_id,thesis_id) references public.research_theses(user_id,id),
  -- The human baseline is frozen before any card is shown (§7.2).
  constraint research_decisions_baseline_frozen check (arm <> 'human_baseline' or frozen_at is not null)
);
create index if not exists research_decisions_thesis_week_idx on public.research_decisions(user_id,thesis_id,week_of);

create table if not exists public.research_outcomes (
  user_id        uuid not null references auth.users(id) on delete cascade,
  id             uuid not null,
  decision_id    uuid not null,
  window_weeks   integer not null check (window_weeks > 0),
  evaluation_id  text,
  pillar_results jsonb not null default '{}',
  price_result   jsonb not null default '{}',
  judged_by      text not null check (length(btrim(judged_by)) > 0),
  judged_at      timestamptz not null,
  primary key (user_id,id),
  foreign key (user_id,decision_id) references public.research_decisions(user_id,id)
);
create index if not exists research_outcomes_decision_idx on public.research_outcomes(user_id,decision_id);

-- Append-only + owner-scoped access, mirroring the S4 hardening loop. The
-- runtime role gets select/insert only; authenticated owners may read and
-- insert through PostgREST but never update or delete.
do $$ declare t text; begin
  foreach t in array array['research_judgments','research_labels','research_decisions','research_outcomes'] loop
    execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.research_s4_immutable()',t||'_immutable',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('drop policy if exists s4_owner on public.%I',t);
    execute format('create policy s4_owner on public.%I to alpha_s4_runtime using (user_id = auth.uid()) with check (user_id = auth.uid())',t);
    execute format('drop policy if exists "%s self select" on public.%I',t,t);
    execute format('create policy "%s self select" on public.%I for select to authenticated using (auth.uid() = user_id)',t,t);
    execute format('drop policy if exists "%s self insert" on public.%I',t,t);
    execute format('create policy "%s self insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)',t,t);
    execute format('grant select, insert on public.%I to alpha_s4_runtime',t);
  end loop;
end $$;
